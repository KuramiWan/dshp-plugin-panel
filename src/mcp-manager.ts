/**
 * 会话级临时 MCP 管理核心（DSHP dshp-skill-panel 扩展）。
 *
 * 设计（Q3a/Q5a/Q6a/Q8b/Q9 定稿）：
 * - 范围：会话级。连接挂到发起 agent 的 `agent.ctx`（Agent-scoped context），
 *   mcp-client 在 agent.ctx 下 `ctx.get('tools').register()` 自动落进该 agent 的
 *   scope layer → 该 server 的 tools 只对该 agent 可见（dsh-tools 官方 "register
 *   through that agent's agent.ctx" 契约）。
 * - 配置：白名单（6a）。模型不能填任意 command/url，只能从白名单候选按名连接。
 * - 白名单可编辑（8b）：一份 JSON 文件（poolRoot 旁 .mcp-whitelist.json），
 *   面板/管理端点可增删候选；候选本身仍是受控的（不放任意 command 的编辑自由度上限）。
 * - serverName：mcp-client 的 serverName 全进程去重（activeServerNames 弱表）。
 *   同一白名单 server 被不同 agent 同时连接会产生冲突，故每个 (agent, whitelistName)
 *   派生出唯一 serverName（短哈希），保证全局唯一且模型可见名字稳定。
 * - 清理（9）：连接以 effect/disposer 挂在 agent.ctx，agent 销毁时 agent.ctx 展开
 *   自动断开并注销；同时本管理器显式持有 disposer 供主动断开与插件 stop 时清理。
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { apply as mcpApply, inject as mcpInject, Config as McpConfig } from '@deepseek-ai/dsh-mcp-client'
import type { Context } from '@deepseek-ai/cordis'

/** 白名单一条候选 server（6a：模型只能按 name 连这里登记的 server）。 */
export interface McpServerTemplate {
  /** 稳定标识，也是模型/面板使用的名字。 */
  name: string
  /** 人可读说明。 */
  description?: string
  transport: 'stdio' | 'streamable-http'
  /** stdio：启动命令。 */
  command?: string
  /** stdio：参数（直传、无 shell 插值）。 */
  args?: string[]
  /** stdio：附加环境变量。 */
  env?: Record<string, string>
  /** streamable-http：端点 URL。 */
  url?: string
  /** streamable-http：附加请求头。 */
  headers?: Record<string, string>
}

/** 面板可见的候选项（脱敏，不透出 secrets）。 */
export interface McpServerTemplateView {
  name: string
  description?: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  /** 是否已连接（供 UI 展示）。 */
  connected: boolean
}

/**
 * 从 DSH 组合（cordis.registry）发现的一个已配置 MCP 插件（mcp-client 行）。
 * 只读视图：env/headers 不透出值（secrets），仅揭示是否存在；配置本身由用户/DSH 维护。
 */
export interface McpDiscoveredView {
  /** serverName（mcp-client 的工具 namespace，也是稳定标识）。 */
  name: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  /** 该 server 是否带 env（stdio）/ headers（http）——只揭示存在性，不回显值。 */
  hasSecrets: boolean
  /** 该 mcp-client 插件是否已在组合中全局启用（fiber ACTIVE）。 */
  globallyActive: boolean
  /** 是否已在我们的管理白名单中。 */
  managed: boolean
}

/** 一个活跃连接（每个 (agent, whitelistName) 一个）。 */
interface Connection {
  /** 按 agent 派生的唯一 serverName。 */
  serverName: string
  /** 断开连接并注销 tools 的 disposer。 */
  dispose: () => void
}

const WHITELIST_FILE = '.mcp-whitelist.json'

/** serverName 合法字符段（与 mcp-client SERVER_NAME_PATTERN 对齐）。 */
const SERVER_NAME_PREFIX = 'dshp'

/**
 * 会话级临时 MCP 管理器（插件实例共享一份）。
 * 白名单读写文件；连接跟踪用 WeakMap（Agent 被回收即释放，不泄漏跨会话）。
 */
export class SessionMcpManager {
  private readonly context: Context
  /** 白名单存储目录（poolRoot）。 */
  private readonly root: string
  private readonly whitelistFile: string
  /** agent → (whitelistName → Connection)。 */
  private readonly connections = new WeakMap<Agent, Map<string, Connection>>()
  /** 每个白名单名当前被多少 agent 连接（便于 removeTemplate 检查，WeakMap 不可枚举）。 */
  private readonly usedCount = new Map<string, number>()
  /**
   * 本管理器在会话里创建的派生 serverName（`dshp-<name>-<hash>`）。
   * convention registry 是全进程共享、按插件函数为 key 的，会话实例与全局行同用一个
   * mcp-client Runtime（fibers 合并）；discover() 借此把"我们自己刚连的会话实例"排除，
   * 只露出"组合里已配置的 MCP"，避免出现 dshp-chrome-devtools-xxxx 这类派生噪点。
   */
  private readonly ownedServerNames = new Set<string>()

  /** 缓存白名单（上次读取）；写时同步磁盘。 */
  private cached: McpServerTemplate[]

  constructor(ctx: Context, root: string) {
    this.context = ctx
    this.root = root
    this.whitelistFile = join(root, WHITELIST_FILE)
    this.cached = this.readFile()
  }

  // ---- 白名单（8b：运行时可读可编辑） ----

  private readFile(): McpServerTemplate[] {
    if (!existsSync(this.whitelistFile)) return []
    try {
      const text = readFileSync(this.whitelistFile, 'utf8').replace(/^\uFEFF/, '')
      const data = JSON.parse(text) as { servers?: McpServerTemplate[] }
      const servers = Array.isArray(data?.servers) ? data.servers : []
      return servers.filter(s => typeof s?.name === 'string' && s.name !== '')
    } catch {
      return []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.whitelistFile), { recursive: true })
    writeFileSync(this.whitelistFile, JSON.stringify({ servers: this.cached }, null, 2), 'utf8')
  }

  /** 当前白名单候选。 */
  whitelist(): McpServerTemplate[] {
    return this.cached.map(s => ({ ...s }))
  }

  /** 面板视图：白名单候选 + 各候选的会话内连接状态（按 agent）。 */
  views(agent: Agent): McpServerTemplateView[] {
    const connected = this.mapOf(agent)
    return this.cached.map(template => ({
      name: template.name,
      ...(template.description === undefined ? {} : { description: template.description }),
      transport: template.transport,
      ...(template.command === undefined ? {} : { command: template.command }),
      ...(template.args === undefined ? {} : { args: [...template.args] }),
      ...(template.url === undefined ? {} : { url: template.url }),
      connected: connected.has(template.name),
    }))
  }

  /**
   * 从 ordis.registry 拍平所有已加载插件 Fiber（含 mcp-client）。registry 是
   * Map<unknown, { fibers }>，Fiber 携带 name/state/config。
   */
  private registryFibers(): { name?: unknown; state?: number; config?: unknown }[] {
    const registry = this.context.registry as unknown as Map<unknown, { fibers?: { name?: unknown; state?: number; config?: unknown }[] }>
    const out: { name?: unknown; state?: number; config?: unknown }[] = []
    for (const runtime of registry.values()) {
      for (const fiber of runtime.fibers ?? []) out.push(fiber)
    }
    return out
  }

  /**
   * mcp-client 插件配置签名：`serverName`（string）+ `transport`（stdio/streamable-http）。
   * Cordis `fiber.name` 是插件显示名/行 id（如 `mcp-chrome-devtools`），不是包名，
   * 故不能按包名过滤，须按该配置形状识别"这是一个 mcp-client 桥接的 server"。
   */
  private isMcpClientConfig(config: unknown): config is { serverName: string; transport: 'stdio' | 'streamable-http' } {
    const c = config as Record<string, unknown> | undefined
    return typeof c?.serverName === 'string' && c.serverName !== ''
      && (c.transport === 'stdio' || c.transport === 'streamable-http')
  }

  /**
   * 从 DSH 组合(cordis.registry)枚举的 mcp-client 插件原始模板（含 env/headers secrets）。
   * 内部仅在本类使用；对外只暴露脱敏视图（discover）与"按名选择复制"（select）。
   */
  private discoveredTemplates(): McpServerTemplate[] {
    const out: McpServerTemplate[] = []
    for (const fiber of this.registryFibers()) {
      if (!this.isMcpClientConfig(fiber.config)) continue
      const cfg = fiber.config as { serverName: string; transport: 'stdio' | 'streamable-http'; command?: string; args?: unknown; url?: string; env?: unknown; headers?: unknown }
      if (typeof cfg.command === 'string') out.push({ name: cfg.serverName, transport: cfg.transport, command: cfg.command })
      else if (typeof cfg.url === 'string') out.push({ name: cfg.serverName, transport: cfg.transport, url: cfg.url })
      else out.push({ name: cfg.serverName, transport: cfg.transport })
    }
    // 补全 args / env / headers 到已建模板（保持原读取逻辑的完备性）。
    const byName = new Map<string, McpServerTemplate>()
    for (const fiber of this.registryFibers()) {
      if (!this.isMcpClientConfig(fiber.config)) continue
      const cfg = fiber.config as { serverName: string; transport: 'stdio' | 'streamable-http'; command?: string; args?: unknown; url?: string; env?: unknown; headers?: unknown }
      const base = byName.get(cfg.serverName) ?? { name: cfg.serverName, transport: cfg.transport }
      if (typeof cfg.command === 'string') base.command = cfg.command
      if (typeof cfg.url === 'string') base.url = cfg.url
      if (Array.isArray(cfg.args)) base.args = cfg.args.filter(a => typeof a === 'string') as string[]
      if (cfg.env !== undefined && typeof cfg.env === 'object') base.env = { ...(cfg.env as Record<string, string>) }
      if (cfg.headers !== undefined && typeof cfg.headers === 'object') base.headers = { ...(cfg.headers as Record<string, string>) }
      byName.set(cfg.serverName, base)
    }
    return [...byName.values()]
  }

  /**
   * 发现（发现与兼容）：从 DSH 组合(cordis.registry)枚举已配置的 mcp-client 插件。
   * 本插件不创建/配置，只读其配置以呈现"已配置好的 MCP"；用户再把其中想管理的
   * 加入白名单（管理范围）。env/headers 只揭示存在性，不透出值。
   */
  discover(): McpDiscoveredView[] {
    const managed = new Set(this.cached.map(s => s.name))
    const actives = new Set<string>()
    for (const fiber of this.registryFibers()) {
      if (this.isMcpClientConfig(fiber.config) && fiber.state === 2) {
        actives.add(fiber.config.serverName)
      }
    }
    return this.discoveredTemplates()
      .filter(t => !this.ownedServerNames.has(t.name))
      .map(t => ({
        name: t.name,
        transport: t.transport,
        ...(t.command === undefined ? {} : { command: t.command }),
        ...(t.args === undefined ? {} : { args: [...t.args] }),
        ...(t.url === undefined ? {} : { url: t.url }),
        hasSecrets: (t.env !== undefined && Object.keys(t.env).length > 0)
          || (t.headers !== undefined && Object.keys(t.headers).length > 0),
        globallyActive: actives.has(t.name),
        managed: managed.has(t.name),
      }))
  }

  /**
   * 用户选择（管理范围）：把组合里发现的某个已配置 MCP 复制进白名单（含 env/headers
   * secrets，不向客户端回显）。返回其脱敏视图供刷新。
   */
  select(name: string): { ok: true; entry: McpDiscoveredView } | { ok: false; reason: string } {
    const template = this.discoveredTemplates().find(t => t.name === name)
    if (template === undefined) return { ok: false, reason: `组合中未发现已配置的 MCP "${name}"` }
    const saved = this.upsertTemplate(template)
    if (!saved.ok) return { ok: false, reason: saved.reason }
    const hasSecrets = (template.env !== undefined && Object.keys(template.env).length > 0)
      || (template.headers !== undefined && Object.keys(template.headers).length > 0)
    const managed = new Set(this.cached.map(s => s.name))
    return {
      ok: true,
      entry: {
        name: template.name,
        transport: template.transport,
        ...(template.command === undefined ? {} : { command: template.command }),
        ...(template.args === undefined ? {} : { args: [...template.args] }),
        ...(template.url === undefined ? {} : { url: template.url }),
        hasSecrets,
        globallyActive: false,
        managed: managed.has(template.name),
      },
    }
  }

  /** 新增或整体替换一条候选（name 相同则覆盖）。 */
  upsertTemplate(template: McpServerTemplate): { ok: true } | { ok: false; reason: string } {
    if (typeof template.name !== 'string' || template.name.trim() === '' || !/^[A-Za-z0-9_-]{1,64}$/.test(template.name)) {
      return { ok: false, reason: 'name must be 1-64 chars of [A-Za-z0-9_-]' }
    }
    if (template.transport === 'stdio') {
      if (typeof template.command !== 'string' || template.command === '') {
        return { ok: false, reason: 'stdio template requires a command' }
      }
    } else if (template.transport === 'streamable-http') {
      if (typeof template.url !== 'string' || template.url === '') {
        return { ok: false, reason: 'streamable-http template requires a url' }
      }
    } else {
      return { ok: false, reason: 'unknown transport' }
    }
    const normalized: McpServerTemplate = {
      name: template.name,
      ...(template.description === undefined ? {} : { description: template.description }),
      transport: template.transport,
      ...(template.transport === 'stdio'
        ? {
          command: template.command as string,
          ...(template.args === undefined ? {} : { args: [...template.args] }),
          ...(template.env === undefined ? {} : { env: { ...template.env } }),
        }
        : {
          url: template.url as string,
          ...(template.headers === undefined ? {} : { headers: { ...template.headers } }),
        }),
    }
    const idx = this.cached.findIndex(s => s.name === template.name)
    if (idx >= 0) this.cached[idx] = normalized
    else this.cached.push(normalized)
    this.persist()
    return { ok: true }
  }

  /** 删除一条候选；若已有 agent 连着它，先拒绝（避免悬空）。 */
  removeTemplate(name: string): { ok: true } | { ok: false; reason: string } {
    if ((this.usedCount.get(name) ?? 0) > 0) return { ok: false, reason: `"${name}" is currently connected; disconnect first` }
    const idx = this.cached.findIndex(s => s.name === name)
    if (idx < 0) return { ok: false, reason: `whitelist has no "${name}"` }
    this.cached.splice(idx, 1)
    this.persist()
    return { ok: true }
  }

  // ---- 连接（5a：会话级隔离） ----

  private mapOf(agent: Agent): Map<string, Connection> {
    let map = this.connections.get(agent)
    if (map === undefined) {
      map = new Map()
      this.connections.set(agent, map)
    }
    return map
  }

  private bumpUse(name: string, delta: number): void {
    const next = (this.usedCount.get(name) ?? 0) + delta
    if (next <= 0) this.usedCount.delete(name)
    else this.usedCount.set(name, next)
  }

  /** 派生唯一 serverName：前缀 + agent 标识哈希 + 白名单名哈希（≤32，合法字符）。 */
  private deriveServerName(agent: Agent, whitelistName: string): string {
    const agentKey = (agent.session?.id ?? String(agent)) as string
    const hash = createHash('sha1')
      .update(`${agentKey}\0${whitelistName}`)
      .digest('hex')
      .slice(0, 20)
    const base = `${SERVER_NAME_PREFIX}-${whitelistName}`
    // 截断到 32 字符内，保留稳定性。
    return `${base}-${hash}`.slice(0, 32)
  }

  /** 某 agent 当前已连的白名单名。 */
  connectedNames(agent: Agent): string[] {
    return [...this.mapOf(agent).keys()]
  }

  /** 连接一个白名单候选到发起 agent 的会话（幂等；已连则返回现状）。 */
  async connect(
    agent: Agent,
    name: string,
    _signal?: AbortSignal,
  ): Promise<{ ok: true; name: string; serverName: string; alreadyConnected: boolean } | { ok: false; reason: string }> {
    const template = this.cached.find(s => s.name === name)
    if (template === undefined) return { ok: false, reason: `whitelist has no "${name}"` }
    const map = this.mapOf(agent)
    const existing = map.get(name)
    if (existing !== undefined) {
      return { ok: true, name, serverName: existing.serverName, alreadyConnected: true }
    }

    const serverName = this.deriveServerName(agent, name)
    const config = this.toMcpConfig(template, serverName)
    // 标记为"我们创建的会话实例"，discover() 据此把它从"已配置 MCP"里排除。
    this.ownedServerNames.add(serverName)

    // 挂到 agent.ctx：mcp-client 的 ctx.get('tools') 落进该 agent scope。
    // apply 是 async（连接+首次工具发现），its Promise 需 await 以等待就绪，
    // 但 Cordis 以 fiber 方式挂载，公认可同步触发；这里通过 fiber 拿到宿主后
    // 再等其连接收敛（mcp-client 内部 effect-scoped，dispose 会断开）。
    const fiber = agent.ctx.plugin(
      { name: mcpApply.name, inject: mcpInject, apply: mcpApply } as
      { name: string; inject: string[]; apply: (ctx: Context, cfg: unknown) => Promise<void> },
      config,
    )

    // 主动断开/清理：dispose fiber → mcp-client connection effect 展开 → 断开+注销 tools。
    const dispose = () => { void fiber.dispose() }
    map.set(name, { serverName, dispose })
    this.bumpUse(name, 1)

    // 会话结束自动清理由 agent.ctx 负责；此处仅在 agent 级显式断开时调用 dispose。
    return { ok: true, name, serverName, alreadyConnected: false }
  }

  /** 断开某 agent 的一个会话 MCP（幂等）。 */
  disconnect(agent: Agent, name: string): { ok: true; name: string } | { ok: false; reason: string } {
    const map = this.mapOf(agent)
    const conn = map.get(name)
    if (conn === undefined) return { ok: false, reason: `"${name}" is not connected in this session` }
    conn.dispose()
    map.delete(name)
    this.ownedServerNames.delete(conn.serverName)
    this.bumpUse(name, -1)
    return { ok: true, name }
  }

  /** 断开某 agent 所有会话 MCP（会话结束/插件 stop 时调用）。 */
  disconnectAll(agent: Agent): void {
    const map = this.connections.get(agent)
    if (map === undefined) return
    for (const [name, conn] of map) {
      conn.dispose()
      this.ownedServerNames.delete(conn.serverName)
      this.bumpUse(name, -1)
    }
    map.clear()
  }

  /**
   * 兼容检查（发现与兼容）：真实连一次该 server，拉工具清单，报工具数；随后自动断开。
   * 把 mcp-client 默认 failOnStartupError:false 会"静默进重试、无工具也不报错"的坑显式化。
   */
  async check(agent: Agent, name: string): Promise<{ ok: true; serverName: string; toolCount: number } | { ok: false; reason: string }> {
    const template = this.cached.find(s => s.name === name)
    if (template === undefined) return { ok: false, reason: `白名单没有 "${name}"` }
    const conn = await this.connect(agent, name)
    if (!conn.ok) return { ok: false, reason: conn.reason }
    // 等 mcp-client 异步完成首轮工具发现。
    await new Promise(resolve => setTimeout(resolve, 1500))
    let toolCount = 0
    try {
      const tools = (agent.ctx.get as (k: string) => unknown).call(agent.ctx, 'tools') as { schemas?: (scope?: unknown) => { name?: string }[] } | undefined
      const prefix = `mcp__${conn.serverName}__`
      const schemas = tools?.schemas?.() ?? []
      toolCount = schemas.filter(s => typeof s?.name === 'string' && s.name.startsWith(prefix)).length
    } catch {
      toolCount = 0
    }
    this.disconnect(agent, name)
    return { ok: true, serverName: conn.serverName, toolCount }
  }

  /** 白名单模板 → mcp-client Config。 */
  private toMcpConfig(template: McpServerTemplate, serverName: string): unknown {
    if (template.transport === 'stdio') {
      // McpConfig 是 schemastery union；运行时 DSH 校验。这里构造字面量。
      return {
        transport: 'stdio',
        serverName,
        command: template.command as string,
        args: template.args ?? [],
        env: template.env ?? {},
        cwd: '',
        toolCallTimeoutMs: 60_000,
        failOnStartupError: false,
      }
    }
    return {
      transport: 'streamable-http',
      serverName,
      url: template.url as string,
      headers: template.headers ?? {},
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    }
  }
}

// 引用 McpConfig 类型以防未使用告警（类型仅用于文档化），运行时校验由 DSH 做。
void McpConfig
