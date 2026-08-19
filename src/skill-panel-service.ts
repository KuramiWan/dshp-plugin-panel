/**
 * SkillPanelService —— 面板的 host 侧 HTTP 服务（发布方案一：webServer 路由 + fetch）。
 *
 * 5 个方法全部转发共享核心（actions.ts + pool.ts 只读层 + SessionSkillStore 会话句柄），
 * 与 session_skill_* 模型工具、/skill-* 斜杠命令三面同源（ADR-0007「三面同源」），不新增业务语义：
 * - browse / list / detail / globalList 为只读；
 * - introduce / remove / setTags / activate / deactivate 与命令/工具同一代码路径（幂等、会话隔离）。
 *
 * 通道：DSH 自带 webServer（同进程 HTTP，client 用相对路径 fetch）。
 * 端点：POST /skill-panel/<method>，body 为 JSON 载荷，响应为 JSON。
 * 方法：browse / list / detail / introduce / removeSkill / setTags / globalList /
 *       globalActivate / globalDeactivate + mcp*。
 *
 * 与 monorepo 解耦：本服务不依赖 typert 生成器/桩，仅用 node:http 与 DSH 的
 * webServer 服务，可脱离 monorepo 独立构建（发布 npm / 独立安装的前提）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { findPoolEntry, readSkillContent, defaultGlobalSkillsRoot, listGlobalEntries } from './pool.ts'
import {
  browsePool,
  introduceSkill,
  removeSkill,
  setSkillTags,
  activateGlobal,
  deactivateGlobal,
  filterBrowse,
} from './actions.ts'
import type { SessionSkillStore } from './handles.ts'
import type { SessionMcpManager, McpServerTemplate } from './mcp-manager.ts'
import type {
  SkillPanelBrowseEntry,
  SkillPanelBrowseRequest,
  SkillPanelBrowseResult,
  SkillPanelDetailRequest,
  SkillPanelDetailResult,
  SkillPanelIntroduceRequest,
  SkillPanelIntroduceResult,
  SkillPanelListRequest,
  SkillPanelListResult,
  SkillPanelRemoveRequest,
  SkillPanelRemoveResult,
  SkillPanelSetTagsRequest,
  SkillPanelSetTagsResult,
  SkillPanelGlobalListRequest,
  SkillPanelGlobalListResult,
  SkillPanelGlobalActivateRequest,
  SkillPanelGlobalActivateResult,
  SkillPanelMcpListRequest,
  SkillPanelMcpListResult,
  SkillPanelMcpConnectRequest,
  SkillPanelMcpConnectResult,
  SkillPanelMcpDisconnectRequest,
  SkillPanelMcpDisconnectResult,
  SkillPanelMcpWhitelistRequest,
  SkillPanelMcpWhitelistResult,
  SkillPanelMcpUpsertRequest,
  SkillPanelMcpUpsertResult,
  SkillPanelMcpRemoveRequest,
  SkillPanelMcpRemoveResult,
  SkillPanelMcpDiscoverRequest,
  SkillPanelMcpDiscoverResult,
  SkillPanelMcpSelectRequest,
  SkillPanelMcpSelectResult,
  SkillPanelMcpCheckRequest,
  SkillPanelMcpCheckResult,
} from './types.ts'

export interface SkillPanelServiceOptions {
  /** 池根目录；默认 ~/.dsh/.skill-pool */
  readonly poolRoot: string
  /** 会话引入句柄存储（插件实例共享）。 */
  readonly store: SessionSkillStore
  /** 会话级临时 MCP 管理器。 */
  readonly mcp: SessionMcpManager
}

/** 面板 host 服务：只读为主；写操作与命令/工具同路径。 */
export class SkillPanelService {
  // webServer 是 host 侧就绪较晚的服务：放进 inject 让 Cordis 等它就绪后再构造本服务，
  // 保证 /skill-panel 路由必然注册。切勿改成可选 ctx.get('webServer') + 空则 return ——
  // 那会让路由在首帧静默跳过，/skill-panel/<method> 命中 frontend-static 回退而 405。
  static inject = ['agents', 'skills', 'webServer']

  private readonly ctx: Context
  private readonly poolRoot: string
  private readonly store: SessionSkillStore
  private readonly mcp: SessionMcpManager

  constructor(ctx: Context, options: SkillPanelServiceOptions) {
    this.ctx = ctx
    this.poolRoot = options.poolRoot
    this.store = options.store
    this.mcp = options.mcp

    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/skill-panel',
      handler: (req: IncomingMessage, res: ServerResponse) => void this.dispatch(req, res),
    }), 'skill-panel: /skill-panel router')
  }

  private agentOf(sessionId: string): Agent {
    const agent = this.ctx.agents.get(sessionId as SessionId)
    if (agent === undefined) {
      throw new Error(`skillPanel: session "${sessionId}" is not a live agent`)
    }
    return agent
  }

  /** 路由分发：POST /skill-panel/<method>，body 为 JSON 载荷。 */
  private async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method !== 'POST') {
        this.send(res, 405, { ok: false, reason: 'method not allowed, use POST' })
        return
      }
      const url = req.url ?? '/skill-panel/'
      const method = this.pathMethod(url)
      if (method === undefined) {
        this.send(res, 404, { ok: false, reason: 'unknown endpoint' })
        return
      }
      // 读取并解析 JSON body
      const body = await this.readBody(req)
      const payload = body.length === 0 ? {} : JSON.parse(body) as Record<string, unknown>
      let result: unknown
      switch (method) {
        case 'browse':
          result = this.browse(payload as unknown as SkillPanelBrowseRequest)
          break
        case 'list':
          result = await this.list(payload as unknown as SkillPanelListRequest)
          break
        case 'detail':
          result = this.detail(payload as unknown as SkillPanelDetailRequest)
          break
        case 'introduce':
          result = await this.introduce(payload as unknown as SkillPanelIntroduceRequest)
          break
        case 'removeSkill':
          result = this.removeSkill(payload as unknown as SkillPanelRemoveRequest)
          break
        case 'setTags':
          result = this.setTags(payload as unknown as SkillPanelSetTagsRequest)
          break
        case 'globalList':
          result = this.globalList(payload as unknown as SkillPanelGlobalListRequest)
          break
        case 'globalActivate':
          result = this.globalActivate(payload as unknown as SkillPanelGlobalActivateRequest)
          break
        case 'globalDeactivate':
          result = this.globalDeactivate(payload as unknown as SkillPanelGlobalActivateRequest)
          break
        case 'mcpList':
          result = this.mcpList(payload as unknown as SkillPanelMcpListRequest)
          break
        case 'mcpConnect':
          result = await this.mcpConnect(payload as unknown as SkillPanelMcpConnectRequest)
          break
        case 'mcpDisconnect':
          result = this.mcpDisconnect(payload as unknown as SkillPanelMcpDisconnectRequest)
          break
        case 'mcpWhitelist':
          result = this.mcpWhitelist(payload as unknown as SkillPanelMcpWhitelistRequest)
          break
        case 'mcpUpsert':
          result = this.mcpUpsert(payload as unknown as SkillPanelMcpUpsertRequest)
          break
        case 'mcpRemove':
          result = this.mcpRemove(payload as unknown as SkillPanelMcpRemoveRequest)
          break
        case 'mcpDiscover':
          result = this.mcpDiscover(payload as unknown as SkillPanelMcpDiscoverRequest)
          break
        case 'mcpSelect':
          result = this.mcpSelect(payload as unknown as SkillPanelMcpSelectRequest)
          break
        case 'mcpCheck':
          result = await this.mcpCheck(payload as unknown as SkillPanelMcpCheckRequest)
          break
        default:
          this.send(res, 404, { ok: false, reason: `unknown method "${method}"` })
          return
      }
      this.send(res, 200, result as object)
    } catch (error) {
      this.send(res, 400, { ok: false, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  private pathMethod(rawUrl: string): string | undefined {
    // /skill-panel/browse -> browse
    const m = rawUrl.match(/^\/skill-panel\/([a-zA-Z_]+)\/?$/)
    return m === null ? undefined : m[1]
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => { chunks.push(chunk as Buffer) })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  private send(res: ServerResponse, status: number, data: object): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  /** 池浏览（local 全量），支持关键词过滤。 */
  browse(request: SkillPanelBrowseRequest): SkillPanelBrowseResult {
    const agent = this.agentOf(request.sessionId)
    const items = filterBrowse(browsePool(this.poolRoot, agent, this.store), {
      query: request.query,
    })
    const limit = typeof request.limit === 'number' ? Math.max(1, Math.floor(request.limit)) : 100
    return { entries: items.slice(0, limit) as SkillPanelBrowseEntry[] }
  }

  /** 当前会话已引入清单（含 tags 视图：从池/全局 SKILL.md 读取）。 */
  async list(request: SkillPanelListRequest): Promise<SkillPanelListResult> {
    const agent = this.agentOf(request.sessionId)
    const names = this.store.names(agent)
    if (names.length === 0) return { skills: [] }
    const view = await this.ctx.skills.list({ scope: agent })
    return {
      skills: names.map((name) => {
        const match = view.find(skill => skill.name === name)
        const pool = findPoolEntry(this.poolRoot, name)
        const tags = pool !== undefined ? pool.tags : this.globalTagsOf(name)
        return {
          name,
          ...(match?.description === undefined ? {} : { description: match.description }),
          ...(tags.length === 0 ? {} : { tags }),
        }
      }),
    }
  }

  /** 从 user-dsh 全局层读某技能 tags（会话引入可能来自全局层）。 */
  private globalTagsOf(name: string): readonly string[] {
    const entry = listGlobalEntries(defaultGlobalSkillsRoot()).find(e => e.name === name)
    return entry?.tags ?? []
  }

  /** 单个技能的完整定义（名称/说明/适用场景/正文）。 */
  detail(request: SkillPanelDetailRequest): SkillPanelDetailResult {
    const entry = findPoolEntry(this.poolRoot, request.name)
    if (entry === undefined) return { ok: false, reason: `池中未找到 "${request.name}"` }
    const def = readSkillContent(entry)
    if (def === undefined) return { ok: false, reason: `"${request.name}" 在池中不可读` }
    return {
      ok: true,
      name: def.name,
      description: def.description,
      ...(def.whenToUse === undefined ? {} : { whenToUse: def.whenToUse }),
      content: def.content,
    }
  }

  /** 从池引入到当前会话（幂等；纯会话注册，会话引入集已记录；同名影子覆盖仅本会话）。 */
  async introduce(request: SkillPanelIntroduceRequest): Promise<SkillPanelIntroduceResult> {
    const agent = this.agentOf(request.sessionId)
    const result = await introduceSkill(this.ctx, this.poolRoot, this.store, agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return {
      ok: true,
      name: result.name,
      shadowed: result.shadowed,
      alreadyIntroduced: result.alreadyIntroduced,
      persisted: result.persisted,
    }
  }

  /** 从当前会话移除（幂等；未引入时报错）。方法名避开 RemoteNamespaceService 保留名（remove 冲突）。 */
  removeSkill(request: SkillPanelRemoveRequest): SkillPanelRemoveResult {
    const agent = this.agentOf(request.sessionId)
    const result = removeSkill(this.store, agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name }
  }

  /** 打 tag（跨池共享分组）：写技能 SKILL.md frontmatter 的 tags 字段（整体替换）。 */
  setTags(request: SkillPanelSetTagsRequest): SkillPanelSetTagsResult {
    this.agentOf(request.sessionId)
    const result = setSkillTags(this.poolRoot, request.name, request.tags)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name, tags: result.tags }
  }

  /** 全局激活池（user-dsh 层）清单：进程级自动可见的技能（含 tags）。 */
  globalList(request: SkillPanelGlobalListRequest): SkillPanelGlobalListResult {
    this.agentOf(request.sessionId)
    const root = defaultGlobalSkillsRoot()
    return { entries: listGlobalEntries(root).map(e => ({ name: e.name, description: e.description, tags: e.tags })) }
  }

  /** 启用：可用池 → 全局激活池（user-dsh 层，进程级自动可见）。 */
  globalActivate(request: SkillPanelGlobalActivateRequest): SkillPanelGlobalActivateResult {
    this.agentOf(request.sessionId)
    const result = activateGlobal(this.poolRoot, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name, target: 'global' }
  }

  /** 停用：全局激活池 → 可用池 local/（不再进程级自动可见，内容保留）。 */
  globalDeactivate(request: SkillPanelGlobalActivateRequest): SkillPanelGlobalActivateResult {
    this.agentOf(request.sessionId)
    const result = deactivateGlobal(this.poolRoot, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name, target: 'pool' }
  }

  /** 会话 MCP：当前会话已连 server + 白名单候选视图。 */
  mcpList(request: SkillPanelMcpListRequest): SkillPanelMcpListResult {
    const agent = this.agentOf(request.sessionId)
    return { entries: this.mcp.views(agent) }
  }

  /** 会话 MCP：从白名单连一个 server 到当前会话（幂等）。 */
  async mcpConnect(request: SkillPanelMcpConnectRequest): Promise<SkillPanelMcpConnectResult> {
    const agent = this.agentOf(request.sessionId)
    const result = await this.mcp.connect(agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name, alreadyConnected: result.alreadyConnected }
  }

  /** 会话 MCP：断开当前会话的一个 server（幂等）。 */
  mcpDisconnect(request: SkillPanelMcpDisconnectRequest): SkillPanelMcpDisconnectResult {
    const agent = this.agentOf(request.sessionId)
    const result = this.mcp.disconnect(agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name }
  }

  /** 会话 MCP：白名单全文（候选模板，非会话维度；不透出 env/headers 等敏感字段）。 */
  mcpWhitelist(_request: SkillPanelMcpWhitelistRequest): SkillPanelMcpWhitelistResult {
    const servers = this.mcp.whitelist().map(s => ({
      name: s.name,
      ...(s.description === undefined ? {} : { description: s.description }),
      transport: s.transport,
      ...(s.command === undefined ? {} : { command: s.command }),
      ...(s.args === undefined ? {} : { args: s.args }),
      ...(s.url === undefined ? {} : { url: s.url }),
    }))
    return { servers }
  }

  /** 会话 MCP：新增/覆盖一条白名单候选（8b）。 */
  mcpUpsert(request: SkillPanelMcpUpsertRequest): SkillPanelMcpUpsertResult {
    const result = this.mcp.upsertTemplate(request.server as McpServerTemplate)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true }
  }

  /** 会话 MCP：删除一条白名单候选（8b）。 */
  mcpRemove(request: SkillPanelMcpRemoveRequest): SkillPanelMcpRemoveResult {
    const result = this.mcp.removeTemplate(request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true }
  }

  /** 发现：从 DSH 组合枚举已配置的 MCP 插件（不创建/配置，只读发现）。 */
  mcpDiscover(request: SkillPanelMcpDiscoverRequest): SkillPanelMcpDiscoverResult {
    this.agentOf(request.sessionId)
    return { entries: this.mcp.discover() }
  }

  /** 管理范围：把发现的某个已配置 MCP 加入白名单（服务端整体复制配置，含 secrets，不回显）。 */
  mcpSelect(request: SkillPanelMcpSelectRequest): SkillPanelMcpSelectResult {
    this.agentOf(request.sessionId)
    const result = this.mcp.select(request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, entry: result.entry }
  }

  /** 兼容检查：真连一次该 server + 拉工具清单 + 断开，报工具数与列出的原因。 */
  async mcpCheck(request: SkillPanelMcpCheckRequest): Promise<SkillPanelMcpCheckResult> {
    const agent = this.agentOf(request.sessionId)
    const result = await this.mcp.check(agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, serverName: result.serverName, toolCount: result.toolCount }
  }
}
