/**
 * DSHP skill 三入口（模型工具 / 斜杠命令 / 面板 Remote）共享的核心动作（ADR-0007「三面同源」）。
 * 把 browse / introduce / remove / setTags 的业务逻辑收敛到一处，避免 skills/commands/service 各自手写漂移。
 * 各表面（tools.ts / commands.ts / skill-panel-service.ts）只负责把统一结果格式化为自身形状。
 * 池 = 用户自管的唯一内容源（local/，放文件=加入管理）：无订阅/生态/信任概念，全量可引入。
 * 分组（2026-08-19）：统一用技能 frontmatter `tags`，三池（全局激活 / 可用池 / 会话引入）共享。
 * 引入 = 纯会话注册：把池内技能注册进当前会话运行时（agent scope），不改动任何磁盘文件；
 * 会话引入集由 SessionSkillStore 持久化（宿主重启后按会话恢复，见 handles.ts replay）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  defaultGlobalSkillsRoot,
  findPoolEntry,
  isValidSkillName,
  isValidTagName,
  listGlobalEntries,
  listPoolEntries,
  readSkillContent,
  setSkillTags as writeSkillTags,
} from './pool.ts'
import type { SessionSkillStore } from './handles.ts'

/** 池浏览条目（命令/工具/面板共用）。 */
export interface PoolBrowseEntry {
  readonly name: string
  readonly description: string
  readonly introduced: boolean
  /** frontmatter tags（跨池共享分组维度）。 */
  readonly tags: readonly string[]
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

/** 生成池浏览条目列表（local 全量），标记 introduced 与 tags。 */
export function browsePool(poolRoot: string, agent: Agent, store: SessionSkillStore): PoolBrowseEntry[] {
  const introduced = new Set(store.names(agent))
  return listPoolEntries(poolRoot).map((entry) => ({
    name: entry.name,
    description: entry.description,
    introduced: introduced.has(entry.name),
    tags: entry.tags,
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

/** 按首个 tag 分组（无 tag 归 ungroupedKey）；tools/commands 渲染共用。 */
export function groupByFirstTag<T extends { readonly tags: readonly string[] }>(items: readonly T[], ungroupedKey: string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.tags.length === 0 ? ungroupedKey : item.tags[0]
    const list = groups.get(key)
    if (list === undefined) groups.set(key, [item])
    else list.push(item)
  }
  return groups
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
  ctx.logger('skill-panel').info(`introduced "${name}" session=${agent.session?.id ?? agent.id} shadowed=${shadowed}`)
  return { ok: true, name, shadowed, alreadyIntroduced: false, persisted: true }
}

/** 从当前会话移除（幂等；未引入时报错）。 */
export function removeSkill(store: SessionSkillStore, agent: Agent, name: string): RemoveResult {
  const dispose = store.disposer(agent, name)
  if (dispose === undefined) return { ok: false, reason: `"${name}" 未在本会话引入` }
  dispose()
  store.drop(agent, name)
  store.logger?.info(`removed "${name}" session=${agent.session?.id ?? agent.id}`)
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
      ctx.logger('skill-panel').warn(`replay "${name}" for session "${id}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type SetTagsResult =
  | { readonly ok: true; readonly name: string; readonly tags: readonly string[] }
  | { readonly ok: false; readonly reason: string }

/**
 * 打 tag（2026-08-19，跨池共享分组）：写技能 SKILL.md frontmatter 的 `tags` 字段。
 * 技能在池 local/ 或全局层（~/.dsh/skills）均可——先查可用池，未找到再查全局激活池；
 * 只改 tags 行，其余内容逐字保留。
 * 分组是技能自身元数据，移动到任何一层 tag 都跟着——三池（全局激活/可用池/会话引入）共享。
 */
export function setSkillTags(poolRoot: string, name: string, tags: readonly string[]): SetTagsResult {
  if (!isValidSkillName(name)) return { ok: false, reason: `非法技能名 "${name}"` }
  for (const tag of tags) {
    if (!isValidTagName(tag)) return { ok: false, reason: `非法 tag "${tag}"` }
  }
  const poolEntry = findPoolEntry(poolRoot, name)
  const directory = poolEntry?.directory
    ?? listGlobalEntries(defaultGlobalSkillsRoot()).find(e => e.name === name)?.directory
  if (directory === undefined) return { ok: false, reason: `未找到 "${name}"（可用池与全局激活池均无）` }
  const result = writeSkillTags(directory, tags)
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, name, tags }
}

// ---- 全局激活池（user-dsh 层，进程级自动可见）与可用池（local/）之间的流转 ----

export type GlobalActivateResult =
  | { readonly ok: true; readonly name: string; readonly target: 'global' | 'pool' }
  | { readonly ok: false; readonly reason: string }

/**
 * 启用：把池内技能（可用池）移动到 user-dsh 全局层（~/.dsh/skills/<name>），
 * 使其进程级自动可见（全局激活池）。只移动目录（rename），不复制。
 * 已在全局同名 → 拒绝（避免覆盖官方/现有内容）；目标为 global。
 */
export function activateGlobal(poolRoot: string, name: string, env: NodeJS.ProcessEnv = process.env): GlobalActivateResult {
  if (!isValidSkillName(name)) return { ok: false, reason: `非法技能名 "${name}"` }
  const entry = findPoolEntry(poolRoot, name)
  if (entry === undefined) return { ok: false, reason: `可用池中未找到 "${name}"` }
  const globalRoot = defaultGlobalSkillsRoot(env)
  const target = join(globalRoot, name)
  if (existsSync(target)) return { ok: false, reason: `全局已存在 "${name}"（停用/删除后重试）` }
  try {
    mkdirSync(globalRoot, { recursive: true })
    renameSync(entry.directory, target)
  } catch (error) {
    return { ok: false, reason: `启用失败：${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: true, name, target: 'global' }
}

/**
 * 停用：把 user-dsh 全局层技能（全局激活池）移动到池 local/ 顶层（可用池），
 * 使其不再进程级自动可见。只移动目录（rename），不复制、不删除内容。
 * 池内同名 → 拒绝；目标为 pool。
 */
export function deactivateGlobal(poolRoot: string, name: string, env: NodeJS.ProcessEnv = process.env): GlobalActivateResult {
  if (!isValidSkillName(name)) return { ok: false, reason: `非法技能名 "${name}"` }
  const globalRoot = defaultGlobalSkillsRoot(env)
  const globalEntry = listGlobalEntries(globalRoot).find(e => e.name === name)
  if (globalEntry === undefined) return { ok: false, reason: `全局激活池中未找到 "${name}"` }
  const localRoot = join(poolRoot, 'local')
  const target = join(localRoot, name)
  if (existsSync(target)) return { ok: false, reason: `可用池已存在 "${name}"（启用/删除后重试）` }
  try {
    mkdirSync(localRoot, { recursive: true })
    renameSync(globalEntry.directory, target)
  } catch (error) {
    return { ok: false, reason: `停用失败：${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: true, name, target: 'pool' }
}
