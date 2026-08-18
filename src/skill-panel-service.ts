/**
 * SkillPanelService —— 面板的 host 侧 HTTP 服务（发布方案一：webServer 路由 + fetch）。
 *
 * 5 个方法全部转发共享核心（actions.ts + pool.ts 只读层 + SessionSkillStore 会话句柄），
 * 与 session_skill_* 模型工具、/skill-* 斜杠命令三面同源（ADR-0007「三面同源」），不新增业务语义：
 * - browse / list / detail 为只读；
 * - introduce / remove 与命令/工具同一代码路径（幂等、会话隔离、影子覆盖提示）。
 *
 * 通道：DSH 自带 webServer（同进程 HTTP，client 用相对路径 fetch）。
 * 端点：POST /skill-panel/<method>，body 为 JSON 载荷，响应为 JSON。
 * 方法：browse / list / detail / introduce / removeSkill。
 *
 * 与 monorepo 解耦：本服务不依赖 typert 生成器/桩，仅用 node:http 与 DSH 的
 * webServer 服务，可脱离 monorepo 独立构建（发布 npm / 独立安装的前提）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { findPoolEntry, readSkillContent } from './pool.ts'
import { browsePool, introduceSkill, removeSkill, filterBrowse } from './actions.ts'
import type { SessionSkillStore } from './handles.ts'
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
} from './types.ts'

export interface SkillPanelServiceOptions {
  /** 池根目录；默认 ~/.dsh/.skill-pool */
  readonly poolRoot: string
  /** 会话引入句柄存储（插件实例共享）。 */
  readonly store: SessionSkillStore
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

  constructor(ctx: Context, options: SkillPanelServiceOptions) {
    this.ctx = ctx
    this.poolRoot = options.poolRoot
    this.store = options.store

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
      req.on('data', chunk => { chunks.push(chunk as Buffer) })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  private send(res: ServerResponse, status: number, data: object): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  /** 池浏览（本地 + 已订阅生态 + 未订阅目录），支持来源过滤与关键词。 */
  browse(request: SkillPanelBrowseRequest): SkillPanelBrowseResult {
    const agent = this.agentOf(request.sessionId)
    const items = filterBrowse(browsePool(this.poolRoot, agent, this.store), {
      origin: request.origin,
      query: request.query,
    })
    const limit = typeof request.limit === 'number' ? Math.max(1, Math.floor(request.limit)) : 100
    return { entries: items.slice(0, limit) as SkillPanelBrowseEntry[] }
  }

  /** 当前会话已引入清单。 */
  async list(request: SkillPanelListRequest): Promise<SkillPanelListResult> {
    const agent = this.agentOf(request.sessionId)
    const names = this.store.names(agent)
    if (names.length === 0) return { skills: [] }
    const view = await this.ctx.skills.list({ scope: agent })
    return {
      skills: names.map(name => {
        const match = view.find(skill => skill.name === name)
        return { name, ...(match?.description === undefined ? {} : { description: match.description }) }
      }),
    }
  }

  /** 单个技能的完整定义（名称/来源/说明/适用场景/正文）。 */
  detail(request: SkillPanelDetailRequest): SkillPanelDetailResult {
    const entry = findPoolEntry(this.poolRoot, request.name)
    if (entry === undefined) return { ok: false, reason: `池中未找到 "${request.name}"` }
    const def = readSkillContent(entry)
    if (def === undefined) return { ok: false, reason: `"${request.name}" 在池中不可读` }
    return {
      ok: true,
      name: def.name,
      origin: entry.origin,
      ...(entry.source === undefined ? {} : { source: entry.source }),
      description: def.description,
      ...(def.whenToUse === undefined ? {} : { whenToUse: def.whenToUse }),
      content: def.content,
    }
  }

  /** 从池引入到当前会话（幂等；同名影子覆盖仅本会话）。 */
  async introduce(request: SkillPanelIntroduceRequest): Promise<SkillPanelIntroduceResult> {
    const agent = this.agentOf(request.sessionId)
    const result = await introduceSkill(this.ctx, this.poolRoot, this.store, agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return {
      ok: true,
      name: result.name,
      origin: result.origin,
      shadowed: result.shadowed,
      alreadyIntroduced: result.alreadyIntroduced,
    }
  }

  /** 从当前会话移除（幂等；未引入时报错）。方法名避开 RemoteNamespaceService 保留名（remove 冲突）。 */
  removeSkill(request: SkillPanelRemoveRequest): SkillPanelRemoveResult {
    const agent = this.agentOf(request.sessionId)
    const result = removeSkill(this.store, agent, request.name)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, name: result.name }
  }
}
