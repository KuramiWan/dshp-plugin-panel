/**
 * DSHP skill 三入口（模型工具 / 斜杠命令 / 面板 Remote）共享的核心动作（ADR-0007「三面同源」）。
 * 把 browse / introduce / remove 的业务逻辑收敛到一处，避免 skills/commands/service 各自手写漂移。
 * 各表面（tools.ts / commands.ts / skill-panel-service.ts）只负责把统一结果格式化为自身形状。
 * 池 = 用户自管的唯一内容源（local/，放文件=加入管理）：无订阅/生态/信任概念，全量可引入。
 * 引入 = 纯会话注册：把池内技能注册进当前会话运行时（agent scope），不改动任何磁盘文件；
 * 会话引入集由 SessionSkillStore 持久化（宿主重启后按会话恢复，见 handles.ts replay）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  findPoolEntry,
  isValidSkillName,
  isValidGroupName,
  listPoolEntries,
  readSkillContent,
} from './pool.ts'
import type { SessionSkillStore } from './handles.ts'

/** 池浏览条目（命令/工具/面板共用）。 */
export interface PoolBrowseEntry {
  readonly name: string
  readonly description: string
  readonly introduced: boolean
  /** 分组名（local/<group>/<skill>/ 时存在）；无分组技能省略。 */
  readonly group?: string
}

/**
 * 统一结果：成功 / 幂等已引入 / 失败。各表面据此渲染自身的成功与报错形状。
 * persisted：会话引入集是否已记录（落盘 .session-skills/<sessionId>.json，宿主重启后按会话恢复）。
 */
export type IntroduceResult =
  | {
    readonly ok: true
    readonly name: string
    readonly shadowed: boolean
    readonly alreadyIntroduced: boolean
    readonly persisted: boolean
  }
  | { readonly ok: false; readonly reason: string }

export type RemoveResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string }

/** 生成池浏览条目列表（local 全量），标记 introduced 与分组。 */
export function browsePool(poolRoot: string, agent: Agent, store: SessionSkillStore): PoolBrowseEntry[] {
  const introduced = new Set(store.names(agent))
  return listPoolEntries(poolRoot).map((entry) => ({
    name: entry.name,
    description: entry.description,
    introduced: introduced.has(entry.name),
    ...(entry.group === undefined ? {} : { group: entry.group }),
  }))
}

/** 关键词过滤（命令与工具共用）。 */
export function filterBrowse(
  items: PoolBrowseEntry[],
  opts: { query?: string | undefined } = {},
): PoolBrowseEntry[] {
  if (opts.query === undefined) return items
  const q = opts.query.toLowerCase()
  return items.filter(item => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
}

/**
 * 从池引入 skill 到当前会话（幂等；同名影子覆盖仅本会话）。
 * 纯会话注册：不复制任何磁盘文件；注册资源目录指回池内原目录。
 * 统一校验序列：名称 → 幂等 → 存在 → 可读 → 注册 → 记录会话引入集。
 */
export async function introduceSkill(
  ctx: Context, poolRoot: string, store: SessionSkillStore, agent: Agent, name: string,
): Promise<IntroduceResult> {
  if (!isValidSkillName(name)) return { ok: false, reason: `非法技能名 "${name}"` }
  if (store.disposer(agent, name) !== undefined) {
    return { ok: true, name, shadowed: false, alreadyIntroduced: true, persisted: true }
  }
  const entry = findPoolEntry(poolRoot, name)
  if (entry === undefined) return { ok: false, reason: `池中未找到 "${name}"` }
  const def = readSkillContent(entry)
  if (def === undefined) return { ok: false, reason: `"${name}" 在池中不可读` }

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
    resourceBase: { kind: 'directory', path: def.directory },
  })
  store.track(agent, name, dispose)
  return { ok: true, name, shadowed, alreadyIntroduced: false, persisted: true }
}

/** 从当前会话移除（幂等；未引入时报错）。 */
export function removeSkill(store: SessionSkillStore, agent: Agent, name: string): RemoveResult {
  const dispose = store.disposer(agent, name)
  if (dispose === undefined) return { ok: false, reason: `"${name}" 未在本会话引入` }
  dispose()
  store.drop(agent, name)
  return { ok: true, name }
}

/**
 * 宿主重启后的会话重放（§3.2）：把某会话落盘的引入名集重新注册进新 Agent 的会话层。
 * 复用引入动作的完整校验/注册/跟踪路径（同名/已引入则幂等跳过）；fire-and-forget 调用。
 */
export async function replaySession(ctx: Context, poolRoot: string, store: SessionSkillStore, agent: Agent): Promise<void> {
  const id = agent.session?.id ?? agent.id
  const names = store.readPersisted(id)
  if (names.length === 0) return
  for (const name of names) {
    try {
      await introduceSkill(ctx, poolRoot, store, agent, name)
    } catch (error) {
      console.warn(`[skill-panel] replay "${name}" for session "${id}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type MoveSkillResult =
  | { readonly ok: true; readonly name: string; readonly group?: string }
  | { readonly ok: false; readonly reason: string }

/**
 * 分组移动（2026-08-19，用户 UI 自管分组）：把池内技能目录移到 `local/<group>/<name>`。
 * group 省略/空 = 移到顶层 `local/<name>`（移出分组）。只移动目录（rename），不复制文件；
 * 分组只影响池结构，已引入会话的注册不受影响（引入集按 name 记录，重启重放自动用新路径）。
 */
export function moveSkill(poolRoot: string, name: string, group?: string): MoveSkillResult {
  if (!isValidSkillName(name)) return { ok: false, reason: `非法技能名 "${name}"` }
  if (group !== undefined && group !== '' && !isValidGroupName(group)) {
    return { ok: false, reason: `非法分组名 "${group}"` }
  }
  const entry = findPoolEntry(poolRoot, name)
  if (entry === undefined) return { ok: false, reason: `池中未找到 "${name}"` }
  const localRoot = join(poolRoot, 'local')
  const current = entry.directory
  const targetDir = group === undefined || group === '' ? localRoot : join(localRoot, group)
  const target = join(targetDir, name)
  if (current === target) {
    return { ok: true, name, ...(group === undefined || group === '' ? {} : { group }) }
  }
  if (existsSync(target)) return { ok: false, reason: `目标已存在 "${target}"` }
  try {
    mkdirSync(targetDir, { recursive: true })
    renameSync(current, target)
  } catch (error) {
    return { ok: false, reason: `移动失败：${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: true, name, ...(group === undefined || group === '' ? {} : { group }) }
}
