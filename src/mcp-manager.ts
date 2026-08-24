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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { apply as mcpApply, inject as mcpInject, type Config as McpConfig } from '@deepseek-ai/dsh-mcp-client'
import type { Context } from '@deepseek-ai/cordis'
import { defaultDshHome } from './home.ts'
import { atomicWriteFileSync, readTextFileSync } from './fs.ts'
import { isMcpClientConfig, registryFibers } from './registry.ts'

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
/** 已禁用全局 MCP 的原始行 sidecar（select 时存、deselect 时取回）。 */
const DISABLED_FILE = '.mcp-disabled.json'

/** home 级 patch 的一行（mcp-client 桥接行，含完整 config）。 */
interface HomePatchRow {
  id?: unknown
  name?: unknown
  config?: unknown
}

/** home 级 patch 的顶层选项（一个 `- ...` 项）。 */
interface HomePatchOption {
  insert?: HomePatchRow[]
  [key: string]: unknown
}

/** serverName 合法字符段（与 mcp-client SERVER_NAME_PATTERN 对齐）。 */
const SERVER_NAME_PREFIX = 'dshp'

/**
 * 会话级临时 MCP 管理器（插件实例共享一份）。
 * 白名单读写文件；连接跟踪用 WeakMap（Agent 被回收即释放，不泄漏跨会话）。
 */
export class SessionMcpManager {
  private readonly context: Context
  /** 白名单存储目录（poolRoot）。 */
  private readonly whitelistFile: string
  /** 已禁用全局 MCP 原始行 sidecar（poolRoot）。 */
  private readonly disabledFile: string
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
    this.whitelistFile = join(root, WHITELIST_FILE)
    this.disabledFile = join(root, DISABLED_FILE)
    this.cached = this.readFile()
  }

  // ---- 白名单（8b：运行时可读可编辑） ----

  private readFile(): McpServerTemplate[] {
    if (!existsSync(this.whitelistFile)) return []
    const text = readTextFileSync(this.whitelistFile)
    if (text === undefined) return []
    try {
      const data = JSON.parse(text) as { servers?: McpServerTemplate[] }
      const servers = Array.isArray(data?.servers) ? data.servers : []
      return servers.filter(s => typeof s?.name === 'string' && s.name !== '')
    } catch {
      return []
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.whitelistFile), { recursive: true })
    atomicWriteFileSync(this.whitelistFile, JSON.stringify({ servers: this.cached }, null, 2))
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
   * 从 DSH 组合(cordis.registry)枚举的 mcp-client 插件原始模板（含 env/headers secrets）。
   * 内部仅在本类使用；对外只暴露脱敏视图（discover）与"按名选择复制"（select）。
   */
  private discoveredTemplates(): McpServerTemplate[] {
    const byName = new Map<string, McpServerTemplate>()
    for (const fiber of registryFibers(this.context)) {
      if (!isMcpClientConfig(fiber.config)) continue
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
    for (const fiber of registryFibers(this.context)) {
      if (isMcpClientConfig(fiber.config) && fiber.state === 2) {
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
    // 先禁用全局（移到会话级），再入白名单；白名单失败则回滚恢复全局。
    const disabled = this.disableGlobalMcp(name)
    if (!disabled.ok) return { ok: false, reason: disabled.reason }
    const saved = this.upsertTemplate(template)
    if (!saved.ok) {
      // M4 修复：回滚 restore 的结果不能静默丢弃——disableGlobalMcp 已把该行从 home
      // patch 移除，若 restore 也失败，全局 MCP 会永久丢失且调用者无感知。记录日志并在
      // reason 中体现，让用户能察觉并手动处理。
      const restored = this.restoreGlobalMcp(name)
      if (!restored.ok) {
        this.context.logger('mcp').error(`select "${name}" rollback restore global failed: ${restored.reason}`)
        return { ok: false, reason: `${saved.reason}（且回滚恢复全局失败：${restored.reason}）` }
      }
      return { ok: false, reason: saved.reason }
    }
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
    // deselect 对称：恢复全局连接。
    const restored = this.restoreGlobalMcp(name)
    if (!restored.ok) {
      this.context.logger('mcp').error(`restore global MCP "${name}" failed: ${restored.reason}`)
    }
    return { ok: true }
  }

  // ---- 全局 MCP 启停（home 级 patch，select/deselect 对称） ----

  /** home 级 patch 路径（$DSH_HOME/cordis.patch.yml，跨 profile 共享）。 */
  private homePatchFile(): string {
    return join(defaultDshHome(), 'cordis.patch.yml')
  }

  /** 读 home 级 patch 为顶层选项数组（非法/空 → 空数组）。 */
  private readHomePatchOptions(): HomePatchOption[] {
    const file = this.homePatchFile()
    if (!existsSync(file)) return []
    const text = readTextFileSync(file)
    if (text === undefined) return []
    try {
      const parsed = parseYaml(text) as unknown
      if (Array.isArray(parsed)) return parsed as HomePatchOption[]
      return []
    } catch {
      return []
    }
  }

  /** 写回 home 级 patch：备份 + 解析校验 + 原子写。 */
  private writeHomePatchOptions(options: HomePatchOption[]): { ok: true } | { ok: false; reason: string } {
    const file = this.homePatchFile()
    let nextText: string
    try {
      nextText = stringifyYaml(options, { noRefs: true, lineWidth: 120 })
    } catch (error) {
      return { ok: false, reason: `serialize home patch failed: ${error instanceof Error ? error.message : String(error)}` }
    }
    try {
      const reparsed = parseYaml(nextText)
      if (!Array.isArray(reparsed)) return { ok: false, reason: 'generated home patch is not a top-level array' }
    } catch (error) {
      return { ok: false, reason: `generated home patch failed to parse: ${error instanceof Error ? error.message : String(error)}` }
    }
    try {
      if (existsSync(file)) writeFileSync(file + '.bak', readTextFileSync(file) ?? '', 'utf8')
      atomicWriteFileSync(file, nextText)
    } catch (error) {
      return { ok: false, reason: `write home patch failed: ${error instanceof Error ? error.message : String(error)}` }
    }
    return { ok: true }
  }

  /**
   * 读已禁用全局 MCP 的原始行（sidecar，供恢复）。
   * 返回值为「每 serverName 一组行」（M6 修复：支持同名多行）。旧版 sidecar 存单行
   * 对象，这里归一化为数组以兼容旧文件。
   */
  private readDisabledRows(): Record<string, HomePatchRow[]> {
    if (!existsSync(this.disabledFile)) return {}
    const text = readTextFileSync(this.disabledFile)
    if (text === undefined) return {}
    try {
      const data = JSON.parse(text) as Record<string, unknown>
      if (typeof data !== 'object' || data === null) return {}
      const out: Record<string, HomePatchRow[]> = {}
      for (const [name, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          out[name] = val.filter((r): r is HomePatchRow => r !== null && typeof r === 'object')
        } else if (val !== null && typeof val === 'object') {
          out[name] = [val as HomePatchRow] // 旧格式：单行对象
        }
      }
      return out
    } catch {
      return {}
    }
  }

  /** 写已禁用全局 MCP 的原始行（sidecar）。 */
  private writeDisabledRows(rows: Record<string, HomePatchRow[]>): void {
    try {
      mkdirSync(dirname(this.disabledFile), { recursive: true })
      atomicWriteFileSync(this.disabledFile, JSON.stringify(rows, null, 2))
    } catch {
      // sidecar 写失败不阻断（只是恢复全局时可能缺原始行）。
    }
  }

  /** 禁用全局 MCP：从 home 级 patch 移除该 serverName 的全部行，原始行存 sidecar。 */
  private disableGlobalMcp(serverName: string): { ok: true } | { ok: false; reason: string } {
    const options = this.readHomePatchOptions()
    // M6 修复：收集所有匹配行（可能有同名多行），恢复时全部还原，避免只存最后一行导致其它行丢失。
    const removed: HomePatchRow[] = []
    const next: HomePatchOption[] = options.map(opt => {
      if (opt === null || typeof opt !== 'object' || !Array.isArray(opt.insert)) return opt
      const insert = opt.insert.filter(row => {
        const cfg = (row as { config?: unknown })?.config as { serverName?: unknown } | undefined
        const isTarget = typeof cfg?.serverName === 'string' && cfg.serverName === serverName
        if (isTarget) removed.push(row)
        return !isTarget
      })
      return { ...opt, insert }
    })
    if (removed.length === 0) return { ok: true } // 无全局行，no-op
    const result = this.writeHomePatchOptions(next)
    if (!result.ok) return { ok: false, reason: result.reason }
    const disabled = this.readDisabledRows()
    disabled[serverName] = removed
    this.writeDisabledRows(disabled)
    return { ok: true }
  }

  /** 恢复全局 MCP：从 sidecar 取全部原始行，加回 home 级 patch。 */
  private restoreGlobalMcp(serverName: string): { ok: true } | { ok: false; reason: string } {
    const disabled = this.readDisabledRows()
    const rows = disabled[serverName]
    if (rows === undefined || rows.length === 0) return { ok: true } // 无 sidecar 记录，no-op
    const options = this.readHomePatchOptions()
    // M5 修复：'已存在'须扫所有 insert 块；M6 修复：对每行各自判断，缺失的才补回。
    const existsInAnyBlock = (row: HomePatchRow): boolean => {
      const cfg = (row as { config?: unknown })?.config as { serverName?: unknown } | undefined
      const rowServer = typeof cfg?.serverName === 'string' ? cfg.serverName : undefined
      return options.some(opt => {
        if (opt === null || typeof opt !== 'object' || !Array.isArray(opt.insert)) return false
        return opt.insert.some(r => {
          const rcfg = (r as { config?: unknown })?.config as { serverName?: unknown } | undefined
          return typeof rcfg?.serverName === 'string' && rowServer !== undefined && rcfg.serverName === rowServer
        })
      })
    }
    // 逐行判断：已存在（同名）则跳过，缺失的收集待追加。
    const toAdd = rows.filter(r => !existsInAnyBlock(r))
    if (toAdd.length > 0) {
      let insertOpt = options.find(opt => opt !== null && typeof opt === 'object' && Array.isArray(opt.insert))
      if (insertOpt === undefined) {
        insertOpt = { insert: [] }
        options.push(insertOpt)
      }
      const insert = insertOpt.insert as HomePatchRow[]
      insert.push(...toAdd)
      const result = this.writeHomePatchOptions(options)
      if (!result.ok) return { ok: false, reason: result.reason }
    }
    delete disabled[serverName]
    this.writeDisabledRows(disabled)
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
  /**
   * 派生唯一 serverName（H2 修复）：前缀 + 白名单名前缀（可读）+ agent+名完整 hash。
   * 唯一性完全由 hash 承担；名字仅作可读前缀并截断，保证 hash 的 20 字符完整保留，
   * 否则 32 字符上限会在长名时把 hash 整体截掉，导致不同 agent 连同一 server 时
   * serverName 相同、连接被静默去重/顶掉。
   */
  private deriveServerName(agent: Agent, whitelistName: string): string {
    const agentKey = (agent.session?.id ?? String(agent)) as string
    const hash = createHash('sha1')
      .update(`${agentKey}\0${whitelistName}`)
      .digest('hex')
      .slice(0, 20)
    // 前缀 `dshp-`(5) + `-`(1) + 名片段(5) + `-`(1) + hash(20) = 32，正好 ≤32 上限。
    // hash 是唯一性来源，20 位完整保留；名字片段仅可读前缀，不影响区分不同 agent。
    const namePart = whitelistName.slice(0, 5)
    return `${SERVER_NAME_PREFIX}-${namePart}-${hash}`
  }

  /** 某 agent 当前已连的白名单名。 */
  connectedNames(agent: Agent): string[] {
    return [...this.mapOf(agent).keys()]
  }

  /** 连接一个白名单候选到发起 agent 的会话（幂等；已连则返回现状）。 */
  async connect(
    agent: Agent,
    name: string,
    signal?: AbortSignal,
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
    // apply 是 async（连接+首次工具发现）；failOnStartupError=true 时连接失败会 reject。
    // fiber.await() 等待启动收敛并重抛启动错误，据此把失败回传给调用方（不再静默吞掉）。
    let fiber: { await: () => Promise<unknown>; dispose: () => void }
    try {
      fiber = agent.ctx.plugin(
        { name: mcpApply.name, inject: mcpInject, apply: mcpApply } as
        { name: string; inject: string[]; apply: (ctx: Context, cfg: unknown) => Promise<void> },
        config,
      )
    } catch (error) {
      // M3 修复：agent.ctx.plugin() 可能同步 throw（mcp-client 初始化失败）。此时
      // 前面已 add 的 ownedServerNames 若不清会永久污染 discover()，且调用方会收到
      // 未处理异常而非 { ok:false }。同步清理并返回失败，与异步失败路径一致。
      this.ownedServerNames.delete(serverName)
      return { ok: false, reason: `连接 "${name}" 失败：${error instanceof Error ? error.message : String(error)}` }
    }

    try {
      await this.awaitWithSignal(fiber.await(), signal)
    } catch (error) {
      // 连接失败/被取消：清理派生名与 fiber，不记录连接、不计数。
      this.ownedServerNames.delete(serverName)
      void fiber.dispose()
      return { ok: false, reason: `连接 "${name}" 失败：${error instanceof Error ? error.message : String(error)}` }
    }

    // 主动断开/清理：dispose fiber → mcp-client connection effect 展开 → 断开+注销 tools。
    const dispose = () => { void fiber.dispose() }
    map.set(name, { serverName, dispose })
    this.bumpUse(name, 1)

    // H3 修复：会话结束（agent.ctx 展开）时自动清理，保证 usedCount 递减。
    // 此前会话结束靠 agent.ctx dispose fiber，但 manager 没有钩子递减 usedCount，
    // 导致任何曾连接的 server 计数永久 +1，removeTemplate 永远拒绝删除。
    // 幂等：仅当该连接仍在 map 中（未被显式 disconnect）时才清理，避免重复递减。
    // ctx.effect(execute) 的 execute 在注册时立即跑（建立副作用），返回的 disposer
    // 在 ctx 展开（会话结束）时执行——清理逻辑放 disposer 里。
    agent.ctx.effect(() => () => {
      const conn = this.mapOf(agent).get(name)
      if (conn === undefined || conn.serverName !== serverName) return
      conn.dispose()
      this.mapOf(agent).delete(name)
      this.ownedServerNames.delete(serverName)
      this.bumpUse(name, -1)
    })

    return { ok: true, name, serverName, alreadyConnected: false }
  }

  /** 等待 fiber 启动收敛；支持 AbortSignal 提前中止（工具被取消时不留下半连接）。 */
  private async awaitWithSignal(promise: Promise<unknown>, signal?: AbortSignal): Promise<void> {
    if (signal === undefined) {
      await promise
      return
    }
    // 先给 promise 挂上处理，再处理 abort：避免 signal 已中止时 fiber 的拒绝成为未处理拒绝。
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new Error('aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then(
        () => { signal.removeEventListener('abort', onAbort); resolve() },
        (error: unknown) => { signal.removeEventListener('abort', onAbort); reject(error) },
      )
      if (signal.aborted) onAbort()
    })
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
   * 兼容检查（发现与兼容）：数**全局实例**（模型实际使用的那个）在 host 工具注册表里
   * 已注册的工具数。不再另起会话实例——那会与全局实例抢连接、且并非模型所用，导致误报 0 工具。
   */
  async check(_agent: Agent, name: string): Promise<{ ok: true; serverName: string; toolCount: number } | { ok: false; reason: string }> {
    const template = this.cached.find(s => s.name === name)
    if (template === undefined) return { ok: false, reason: `白名单没有 "${name}"` }
    // 选中条目 name == 全局 serverName；数 host 工具注册表里 mcp__<serverName>__ 前缀的工具。
    const toolCount = this.countGlobalTools(template.name)
    return { ok: true, serverName: template.name, toolCount }
  }

  /** 数全局实例已注册的工具数（mcp__<serverName>__ 前缀，host 工具注册表）。 */
  private countGlobalTools(serverName: string): number {
    try {
      const tools = (this.context.get as (k: string) => unknown).call(this.context, 'tools') as { schemas?: (scope?: unknown) => { name?: string }[] } | undefined
      const prefix = `mcp__${serverName}__`
      const schemas = tools?.schemas?.() ?? []
      return schemas.filter(s => typeof s?.name === 'string' && s.name.startsWith(prefix)).length
    } catch {
      return 0
    }
  }

  /** 白名单模板 → mcp-client Config。failOnStartupError=true：连接失败会 reject，由 connect() 回传。 */
  private toMcpConfig(template: McpServerTemplate, serverName: string): McpConfig {
    if (template.transport === 'stdio') {
      return {
        transport: 'stdio',
        serverName,
        command: template.command as string,
        args: template.args ?? [],
        env: template.env ?? {},
        cwd: '',
        toolCallTimeoutMs: 60_000,
        failOnStartupError: true,
      }
    }
    return {
      transport: 'streamable-http',
      serverName,
      url: template.url as string,
      headers: template.headers ?? {},
      toolCallTimeoutMs: 60_000,
      failOnStartupError: true,
    }
  }
}
