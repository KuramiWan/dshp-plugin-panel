/**
 * session_skill_* 模型工具（DSHP 规范源）：浏览/搜索/列表/引入/移除。
 * 业务逻辑收敛在 actions.ts；本文件只做 shape 与表面文案。
 * 引入/移除走 agent-scope（exec.agent）：exec.agent.ctx.get('skills') → 会话实例层。
 * 句柄跟踪由注入的 SessionSkillStore 提供（与 /skill-* 斜杠命令、面板共享，幂等）。
 * 注册包 ctx.effect：随插件实例生命周期回收。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-skill'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { browsePool, filterBrowse, introduceSkill, removeSkill, type PoolBrowseEntry } from './actions.ts'
import type { SessionSkillStore } from './handles.ts'

export interface SessionSkillConfig {
  /** 池根目录；默认 ~/.dsh/.skill-pool */
  readonly poolRoot: string
  /** 会话引入句柄存储（插件实例共享）。 */
  readonly store: SessionSkillStore
}

function renderBrowse(items: PoolBrowseEntry[]): string {
  if (items.length === 0) return 'no skills in pool'
  const lines = items.map((item) => {
    const tag = item.origin === 'local' ? 'local' : 'ecosystem:' + (item.source ?? '?')
    const state = item.introduced ? ' [introduced]' : item.blockReason !== undefined ? ' [blocked]' : ''
    return '- ' + item.name + ' (' + tag + ')' + state + ': ' + item.description
  })
  return lines.join('\n')
}

export function applySessionSkillTools(ctx: Context, config: SessionSkillConfig): void {
  const poolRoot = config.poolRoot
  const store = config.store

  const agentOf = (exec: { agent?: Agent }): Agent => {
    if (exec.agent === undefined) throw new Error('session_skill tools require a calling agent')
    return exec.agent
  }

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_skill_browse',
    description: 'List skills available to introduce into this session from the local pool and subscribed ecosystem sources. Use this before session_skill_introduce to see what is available; unsubscribed ecosystem skills show as not subscribed.',
    parameters: {
      origin: { type: 'string', enum: ['local', 'ecosystem'], description: 'Filter by origin.' },
      query: { type: 'string', description: 'Optional keyword filter on name/description (case-insensitive).' },
      limit: { type: 'number', description: 'Maximum results (default 50).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: { type: 'array', items: { type: 'json' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderBrowse((value as unknown as { entries: PoolBrowseEntry[] }).entries) }],
    },
    execute: async (args, exec) => {
      const agent = agentOf(exec)
      const items = filterBrowse(browsePool(poolRoot, agent, store), { origin: args.origin, query: args.query })
      const limit = typeof args.limit === 'number' ? Math.max(1, Math.floor(args.limit)) : 50
      return { entries: items.slice(0, limit) as unknown as JsonValue[] }
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_skill_search',
    description: 'Search the pool (local + subscribed ecosystem + ecosystem catalog) for a skill by keyword in name or description.',
    parameters: {
      query: { type: 'string', required: true, description: 'Keyword to search for (case-insensitive).' },
      limit: { type: 'number', description: 'Maximum results (default 20).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: { type: 'array', items: { type: 'json' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderBrowse((value as unknown as { entries: PoolBrowseEntry[] }).entries) }],
    },
    execute: async (args, exec) => {
      const agent = agentOf(exec)
      const items = filterBrowse(browsePool(poolRoot, agent, store), { query: args.query })
      const limit = typeof args.limit === 'number' ? Math.max(1, Math.floor(args.limit)) : 20
      return { entries: items.slice(0, limit) as unknown as JsonValue[] }
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_skill_list',
    description: 'List the skills currently introduced into THIS session by session_skill_introduce. Introduced skills vanish when the session ends.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skills: { type: 'array', items: { type: 'json' } },
        },
      },
      render: (_args, value) => {
        const skills = (value as { skills: Array<{ name: string; description: string }> }).skills
        if (skills.length === 0) return [{ type: 'text', text: 'no skills introduced in this session' }]
        return [{ type: 'text', text: skills.map(s => '- ' + s.name + ': ' + s.description).join('\n') }]
      },
    },
    execute: async (_args, exec) => {
      const agent = agentOf(exec)
      const names = store.names(agent)
      if (names.length === 0) return { skills: [] }
      const view = await ctx.skills.list({ scope: agent })
      return {
        skills: names.map((name) => {
          const match = view.find(skill => skill.name === name)
          return { name, ...(match?.description === undefined ? {} : { description: match.description }) }
        }),
      }
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_skill_introduce',
    description: 'Introduce a skill from the pool into THIS session: it appears in this session skill catalog and can be loaded with the skill tool. Introducing also PERSISTS the skill to ~/.dsh/skills/<name> so it survives host restarts (available to all sessions afterwards). If the name already exists globally or in a preset, this session uses the introduced version (shadow override).',
    parameters: {
      name: { type: 'string', required: true, description: 'Skill name from session_skill_browse.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          introduced: { type: 'boolean', required: true },
          name: { type: 'string', required: true },
          origin: { type: 'string', required: true },
          shadowed: { type: 'boolean' },
          alreadyIntroduced: { type: 'boolean' },
          persisted: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => {
        const v = value as {
          introduced: boolean
          name: string
          origin: string
          shadowed?: boolean
          alreadyIntroduced?: boolean
          persisted?: boolean
        }
        if (v.alreadyIntroduced) return [{ type: 'text', text: 'skill "' + v.name + '" is already introduced in this session' }]
        const persist = v.persisted === true ? ' and persisted to ~/.dsh/skills (survives host restarts)' : ' (persistence skipped)'
        const shadow = v.shadowed ? ' (shadows a same-name skill from another layer for this session only)' : ''
        return [{ type: 'text', text: 'introduced "' + v.name + '" (' + v.origin + ') into this session' + persist + shadow }]
      },
    },
    execute: async (args, exec) => {
      const agent = agentOf(exec)
      const result = await introduceSkill(ctx, poolRoot, store, agent, args.name)
      if (!result.ok) throw new Error(result.reason)
      return {
        introduced: true,
        name: result.name,
        origin: result.origin,
        ...(result.shadowed ? { shadowed: true } : {}),
        ...(result.alreadyIntroduced ? { alreadyIntroduced: true } : {}),
        persisted: result.persisted,
      }
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_skill_remove',
    description: 'Remove a skill introduced into THIS session by session_skill_introduce: its catalog entry disappears on the next step. The pool file is untouched; other sessions are unaffected. A persisted copy in ~/.dsh/skills (if any) stays — remove only unloads this session.',
    parameters: {
      name: { type: 'string', required: true, description: 'Skill name from session_skill_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          removed: { type: 'boolean', required: true },
          name: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        const v = value as { removed: boolean; name: string }
        return [{ type: 'text', text: 'removed "' + v.name + '" from this session' }]
      },
    },
    execute: async (args, exec) => {
      const agent = agentOf(exec)
      const result = removeSkill(store, agent, args.name)
      if (!result.ok) throw new Error(result.reason)
      return { removed: true, name: result.name }
    },
  })))
}
