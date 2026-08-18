/**
 * DSHP 会话级 Skill 的斜杠命令（人类直接调用，不经模型）：与 session_skill_* 模型工具、
 * 技能面板共享 actions.ts 核心逻辑（幂等、会话隔离、影子覆盖）。注册到 ctx.commands，
 * dsh web 输入框 `/` 菜单经 commands remote 自动发现。注册包 ctx.effect：随插件实例生命周期回收。
 * 池 = 用户自管的唯一内容源（local/）：无订阅/生态概念，全量可引入。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-skill'
import { browsePool, filterBrowse, introduceSkill, removeSkill, type PoolBrowseEntry } from './actions.ts'
import type { SessionSkillStore } from './handles.ts'

export interface SessionSkillCommandConfig {
  /** 池根目录；默认 ~/.dsh/.skill-pool */
  readonly poolRoot: string
  /** 会话引入句柄存储（插件实例共享）。 */
  readonly store: SessionSkillStore
}

function renderBrowse(items: readonly PoolBrowseEntry[]): string {
  if (items.length === 0) return '📚 技能池：无技能（把含 SKILL.md 的目录放进 ~/.dsh/.skill-pool/local/ 即加入管理）'
  const lines = items.map((item) => {
    const state = item.introduced ? ' [已引入]' : ''
    return '  - ' + item.name + state + ': ' + item.description
  })
  return '📚 技能池（' + items.length + ' 条）：\n' + lines.join('\n')
}

/** /skill-browse [query] —— 池浏览。 */
function handlerBrowse(poolRoot: string, store: SessionSkillStore, invocation: CommandInvocation): CommandResult {
  const query = invocation.rawInput.trim()
  const items = filterBrowse(browsePool(poolRoot, invocation.agent, store), { query: query.length === 0 ? undefined : query })
  return { kind: 'success', text: renderBrowse(items.slice(0, 50)) }
}

/** /skill-search <query> —— 关键词搜索。 */
function handlerSearch(poolRoot: string, store: SessionSkillStore, invocation: CommandInvocation): CommandResult {
  const query = invocation.rawInput.trim()
  if (query.length === 0) {
    return { kind: 'error', text: '❌ 用法错误：/skill-search <关键词>' }
  }
  const items = filterBrowse(browsePool(poolRoot, invocation.agent, store), { query })
  if (items.length === 0) return { kind: 'success', text: '🔍 未找到与 "' + query + '" 匹配的技能' }
  return { kind: 'success', text: '🔍 搜索结果（' + items.length + ' 条）：\n' + renderBrowse(items.slice(0, 20)) }
}

/** /skill-list —— 当前会话已引入清单。 */
async function handlerList(ctx: Context, store: SessionSkillStore, invocation: CommandInvocation): Promise<CommandResult> {
  const agent = invocation.agent
  const names = store.names(agent)
  if (names.length === 0) return { kind: 'success', text: '📋 当前会话已引入技能：0 个' }
  const view = await ctx.skills.list({ scope: agent })
  const lines = names.map((name) => {
    const match = view.find(skill => skill.name === name)
    return '  - ' + name + (match?.description === undefined ? '' : ': ' + match.description)
  })
  return { kind: 'success', text: '📋 当前会话已引入技能（' + names.length + ' 个）：\n' + lines.join('\n') }
}

/** /skill-introduce <name> —— 从池引入到当前会话（会话引入集持久，宿主重启后自动恢复；同名影子覆盖本会话）。 */
async function handlerIntroduce(
  ctx: Context,
  poolRoot: string,
  store: SessionSkillStore,
  invocation: CommandInvocation,
): Promise<CommandResult> {
  const agent = invocation.agent
  const name = invocation.rawInput.trim()
  if (name.length === 0) return { kind: 'error', text: '❌ 用法错误：/skill-introduce <技能名>' }
  const result = await introduceSkill(ctx, poolRoot, store, agent, name)
  if (!result.ok) return { kind: 'error', text: '❌ ' + result.reason }
  if (result.alreadyIntroduced) return { kind: 'success', text: '✅ "' + result.name + '" 已在本会话引入（幂等，无需重复）' }
  const persist = result.persisted ? '（会话引入集已记录，重启后自动恢复）' : ''
  const shadow = result.shadowed ? '（影子覆盖：本会话使用引入版，其余会话不受影响）' : ''
  return { kind: 'success', text: '✅ 已引入 "' + result.name + '" 到当前会话' + persist + shadow }
}

/** /skill-remove <name> —— 从当前会话移除（幂等，未引入时报错；池文件与全局技能不受影响）。 */
function handlerRemove(store: SessionSkillStore, invocation: CommandInvocation): CommandResult {
  const agent = invocation.agent
  const name = invocation.rawInput.trim()
  if (name.length === 0) return { kind: 'error', text: '❌ 用法错误：/skill-remove <技能名>' }
  const result = removeSkill(store, agent, name)
  if (!result.ok) return { kind: 'error', text: '❌ ' + result.reason }
  return { kind: 'success', text: '🗑 已从当前会话移除 "' + result.name + '"' }
}

/** 注册五个 /skill-* 斜杠命令（全局，经 ctx.commands 供所有会话的 `/` 菜单发现）。 */
export function applySessionSkillCommands(ctx: Context, config: SessionSkillCommandConfig): void {
  const poolRoot = config.poolRoot
  const store = config.store

  ctx.effect(() => ctx.commands.register({
    name: 'skill-browse',
    description: 'list skills in the user-managed pool (local/); optional keyword query',
    input: { hint: '[<query>]' },
    handler: invocation => handlerBrowse(poolRoot, store, invocation),
  }))
  ctx.effect(() => ctx.commands.register({
    name: 'skill-search',
    description: 'search the user-managed pool (local/) for a skill by keyword in name or description',
    input: { hint: '<query>' },
    handler: invocation => handlerSearch(poolRoot, store, invocation),
  }))
  ctx.effect(() => ctx.commands.register({
    name: 'skill-list',
    description: 'list skills introduced into this session (introduce-set persisted, restored on resume)',
    handler: invocation => handlerList(ctx, store, invocation),
  }))
  ctx.effect(() => ctx.commands.register({
    name: 'skill-introduce',
    description: 'introduce a pool skill into this session (introduce-set persisted, restored on resume)',
    input: { hint: '<name>' },
    handler: invocation => handlerIntroduce(ctx, poolRoot, store, invocation),
  }))
  ctx.effect(() => ctx.commands.register({
    name: 'skill-remove',
    description: 'remove a skill introduced into this session (pool file and global skills untouched)',
    input: { hint: '<name>' },
    handler: invocation => handlerRemove(store, invocation),
  }))
}
