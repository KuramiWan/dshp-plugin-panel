/**
 * DSHP skill 三入口（模型工具 / 斜杠命令 / 面板 Remote）共享的核心动作（ADR-0007「三面同源」）。
 * 把 browse / introduce / remove 的业务逻辑收敛到一处，避免 skills/commands/service 各自手写漂移。
 * 各表面（tools.ts / commands.ts / skill-panel-service.ts）只负责把统一结果格式化为自身形状。
 * 引入即持久化：introduce 除注册进会话运行时，还会把技能目录复制到 user-dsh 层
 * （~/.dsh/skills/<name>/，skill-filesystem 启动时自动扫描），宿主重启后依然可用。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  defaultUserSkillsRoot,
  findPoolEntry,
  isValidSkillName,
  listPoolEntries,
  listUnsubscribedCatalogEntries,
  readSkillContent,
} from './pool.ts'
import type { SessionSkillStore } from './handles.ts'

/** 池浏览条目（含面板前置置灰原因；命令/工具取用其子集）。 */
export interface PoolBrowseEntry {
  readonly name: string
  readonly origin: 'local' | 'ecosystem'
  readonly source?: string
  readonly description: string
  readonly available: boolean
  readonly introduced: boolean
  /** 未订阅 / 生态来源未确认（面板置灰原因；命令/工具以其渲染前置提示）。 */
  readonly blockReason?: string
}

/**
 * 统一结果：成功 / 幂等已引入 / 失败。各表面据此渲染自身的成功与报错形状。
 * persisted：引入即持久化 —— 是否已把技能复制到 user-dsh 层（~/.dsh/skills/<name>/）。
 */
export type IntroduceResult =
  | {
    readonly ok: true
    readonly name: string
    readonly origin: 'local' | 'ecosystem'
    readonly shadowed: boolean
    readonly alreadyIntroduced: boolean
    readonly persisted: boolean
  }
  | { readonly ok: false; readonly reason: string }

export type RemoveResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string }

/** 生成池浏览条目列表（本地 + 已订阅生态 + 未订阅目录），标记 introduced 与 blockReason。 */
export function browsePool(poolRoot: string, agent: Agent, store: SessionSkillStore): PoolBrowseEntry[] {
  const introduced = new Set(store.names(agent))
  return [...listPoolEntries(poolRoot), ...listUnsubscribedCatalogEntries(poolRoot)].map((entry) => {
    const blockReason = !entry.available
      ? '未订阅'
      : entry.origin === 'ecosystem' && !entry.trusted
        ? '生态来源未确认'
        : undefined
    return {
      name: entry.name,
      origin: entry.origin,
      ...(entry.source === undefined ? {} : { source: entry.source }),
      description: entry.description,
      available: entry.available,
      introduced: introduced.has(entry.name),
      ...(blockReason === undefined ? {} : { blockReason }),
    }
  })
}

/** 关键词/来源过滤（命令与工具共用）。 */
export function filterBrowse(
  items: PoolBrowseEntry[],
  opts: { origin?: 'local' | 'ecosystem' | undefined; query?: string | undefined } = {},
): PoolBrowseEntry[] {
  let result = items
  if (opts.origin !== undefined) result = result.filter(item => item.origin === opts.origin)
  if (opts.query !== undefined) {
    const q = opts.query.toLowerCase()
    result = result.filter(item => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
  }
  return result
}

/**
 * 从池引入 skill 到当前会话（幂等；同名影子覆盖仅本会话）。
 * 引入即持久化：除注册进会话运行时，还会把技能目录复制到 user-dsh 层
 * （~/.dsh/skills/<name>/，skill-filesystem 启动时自动扫描），宿主重启后依然可用。
 * 统一校验序列：名称 → 幂等 → 存在 → 订阅 → 信任 → 可读 → 持久化 → 注册。
 */
export async function introduceSkill(
  ctx: Context, poolRoot: string, store: SessionSkillStore, agent: Agent, name: string,
): Promise<IntroduceResult> {
  if (!isValidSkillName(name)) return { ok: false, reason: `非法技能名 "${name}"` }
  if (store.disposer(agent, name) !== undefined) {
    return { ok: true, name, origin: 'local', shadowed: false, alreadyIntroduced: true, persisted: existsSync(join(defaultUserSkillsRoot(), name)) }
  }
  const entry = findPoolEntry(poolRoot, name)
  if (entry === undefined) return { ok: false, reason: `池中未找到 "${name}"` }
  if (!entry.available) return { ok: false, reason: '该技能尚未订阅（先运行生态目录构建脚本订阅到本地池）' }
  if (entry.origin === 'ecosystem' && !entry.trusted) {
    return { ok: false, reason: '生态来源未确认（重新订阅以记录信任）' }
  }
  const def = readSkillContent(entry)
  if (def === undefined) return { ok: false, reason: `"${name}" 在池中不可读` }

  // 引入即持久化：复制到 user-dsh 层。目标已存在（用户自有或上次引入）则保留现盘内容，
  // 不覆盖用户可能的本地编辑；持久化失败视为整次引入失败，避免"看似成功实则未持久化"。
  const userRoot = defaultUserSkillsRoot()
  const target = join(userRoot, name)
  if (!existsSync(target)) {
    try {
      mkdirSync(userRoot, { recursive: true })
      cpSync(entry.directory, target, { recursive: true })
    } catch (error) {
      return { ok: false, reason: `持久化到 ${target} 失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  const skills = agent.ctx.get('skills')
  if (skills === undefined) return { ok: false, reason: 'skills 服务不可用' }
  const view = await ctx.skills.list({ scope: agent })
  const shadowed = view.some(skill => skill.name === name)
  const dispose = skills.register({
    name: def.name,
    description: def.description,
    ...(def.whenToUse === undefined ? {} : { whenToUse: def.whenToUse }),
    invocation: { modelInvocable: def.modelInvocable, userInvocable: def.userInvocable },
    source: 'dshp-session-skill',
    content: def.content,
    resourceBase: { kind: 'directory', path: target },
  })
  store.track(agent, name, dispose)
  return { ok: true, name, origin: entry.origin, shadowed, alreadyIntroduced: false, persisted: true }
}

/** 从当前会话移除（幂等；未引入时报错）。 */
export function removeSkill(store: SessionSkillStore, agent: Agent, name: string): RemoveResult {
  const dispose = store.disposer(agent, name)
  if (dispose === undefined) return { ok: false, reason: `"${name}" 未在本会话引入` }
  dispose()
  store.drop(agent, name)
  return { ok: true, name }
}
