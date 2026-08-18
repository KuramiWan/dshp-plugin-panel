/**
 * session_mcp_* 模型工具（DSHP dshp-skill-panel 扩展；会话级临时 MCP 管理，7a 入口）。
 * - session_mcp_list：当前会话已连 server + 白名单候选（含可用与已连标记）。
 * - session_mcp_connect <name>：从白名单连一个 server 到当前会话（5a 隔离，tools 只对发起 agent 可见）。
 * - session_mcp_disconnect <name>：断开当前会话的一个 server（幂等）。
 * 逻辑收敛在 SessionMcpManager；本文件只做 shape 与表面文案。
 * 注册包 ctx.effect：随插件实例生命周期回收。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SessionMcpManager } from './mcp-manager.ts'

export interface SessionMcpConfig {
  readonly manager: SessionMcpManager
}

export function applySessionMcpTools(ctx: Context, config: SessionMcpConfig): void {
  const manager = config.manager

  const agentOf = (exec: { agent?: Agent }): Agent => {
    if (exec.agent === undefined) throw new Error('session_mcp tools require a calling agent')
    return exec.agent
  }

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_mcp_list',
    description: 'List the session-scoped MCP servers available from the whitelist and which are currently connected in THIS session. Use this before session_mcp_connect to see connectable servers; only whitelisted servers can be connected.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          servers: { type: 'array', items: { type: 'json' } },
        },
      },
      render: (_args, value) => {
        const servers = (value as { servers: Array<{ name: string; transport: string; connected: boolean }> }).servers
        if (servers.length === 0) return [{ type: 'text', text: 'no MCP servers in whitelist' }]
        const lines = servers.map(s => {
          const state = s.connected ? ' [connected]' : ' [available]'
          return '- ' + s.name + ' (' + s.transport + ')' + state
        })
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    execute: async (_args, exec) => {
      const agent = agentOf(exec)
      const connected = new Set(manager.connectedNames(agent))
      const servers = manager.whitelist().map(s => ({
        name: s.name,
        transport: s.transport,
        ...(s.description === undefined ? {} : { description: s.description }),
        connected: connected.has(s.name),
      }))
      return { servers: servers as unknown as JsonValue[] }
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_mcp_connect',
    description: 'Connect a whitelisted MCP server into THIS session. Its tools become available only to this session (session-scoped); they vanish when the session ends or you disconnect. Only servers listed by session_mcp_list can be connected.',
    parameters: {
      name: { type: 'string', required: true, description: 'Whitelisted server name from session_mcp_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          connected: { type: 'boolean', required: true },
          name: { type: 'string', required: true },
          alreadyConnected: { type: 'boolean' },
        },
      },
      render: (_args, value) => {
        const v = value as { connected: boolean; name: string; alreadyConnected?: boolean }
        if (v.alreadyConnected) return [{ type: 'text', text: 'MCP server "' + v.name + '" is already connected in this session' }]
        return [{ type: 'text', text: 'connected MCP server "' + v.name + '" into this session' }]
      },
    },
    execute: async (args, exec) => {
      const agent = agentOf(exec)
      const result = await manager.connect(agent, args.name, exec.signal)
      if (!result.ok) throw new Error(result.reason)
      return {
        connected: true,
        name: result.name,
        ...(result.alreadyConnected ? { alreadyConnected: true } : {}),
      }
    },
  })))

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'session_mcp_disconnect',
    description: 'Disconnect a session-scoped MCP server from THIS session. Its tools are unregistered and no longer visible; other sessions are unaffected.',
    parameters: {
      name: { type: 'string', required: true, description: 'Server name from session_mcp_list (must be connected).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          disconnected: { type: 'boolean', required: true },
          name: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        const v = value as { disconnected: boolean; name: string }
        return [{ type: 'text', text: 'disconnected MCP server "' + v.name + '" from this session' }]
      },
    },
    execute: async (args, exec) => {
      const agent = agentOf(exec)
      const result = manager.disconnect(agent, args.name)
      if (!result.ok) throw new Error(result.reason)
      return { disconnected: true, name: result.name }
    },
  })))
}
