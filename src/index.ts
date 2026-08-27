/**
 * DSHP 会话级 Skill 控制插件（ADR-0007：命令 + 工具 + 面板三入口）：
 * - 5 个 session_skill_* 模型工具（模型自主调用）+ 5 个 /skill-* 斜杠命令（人类直接调用）；
 * - SkillPanelService（webServer HTTP 路由，5 方法）供浏览器面板消费——三面共享同一
 *   SessionSkillStore（按 agent+name 跟踪 disposer，幂等语义）与 pool.ts 只读层；
 * - 会话引入集持久化：引入/移除落盘 <poolRoot>/.session-skills/<sessionId>.json，
 *   宿主重启后订阅 agent/session-start（source==='resume'）自动重放（§3.2）；
 * - 注册走插件 ctx（ctx.effect / ctx.plugin），随插件实例生命周期回收——避免重复注册。
 * 数据源：池目录（默认 ~/.dsh/.skill-pool，用户自管的唯一内容源）。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, SessionStartSource } from '@deepseek-ai/dsh-agent'
import { applySessionSkillTools } from './tools.ts'
import { applySessionSkillCommands } from './commands.ts'
import { applySessionMcpTools } from './mcp-tools.ts'
import { SkillPanelService } from './skill-panel-service.ts'
import { SessionMcpManager } from './mcp-manager.ts'
import { PluginManager } from './plugin-manager.ts'
import { resolvePoolRoot } from './pool.ts'
import { profileDirFromBaseUrl } from './home.ts'
import { SessionSkillStore } from './handles.ts'
import { replaySession } from './actions.ts'
import { installPanelLogging } from './logger.ts'

export type {
  SkillPanelBrowseEntry,
  SkillPanelBrowseRequest,
  SkillPanelBrowseResult,
  SkillPanelIntroducedSkill,
  SkillPanelListRequest,
  SkillPanelListResult,
  SkillPanelDetailRequest,
  SkillPanelDetailResult,
  SkillPanelIntroduceRequest,
  SkillPanelIntroduceResult,
  SkillPanelRemoveRequest,
  SkillPanelRemoveResult,
  SkillPanelMcpEntry,
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
  SkillPanelMcpDiscovered,
  SkillPanelMcpDiscoverRequest,
  SkillPanelMcpDiscoverResult,
  SkillPanelMcpSelectRequest,
  SkillPanelMcpSelectResult,
  SkillPanelMcpCheckRequest,
  SkillPanelMcpCheckResult,
  SkillPanelPluginEntry,
  SkillPanelPluginSource,
  SkillPanelPluginListRequest,
  SkillPanelPluginListResult,
  SkillPanelPluginToggleRequest,
  SkillPanelPluginToggleResult,
  SkillPanelPluginInstallRequest,
  SkillPanelPluginInstallResult,
  SkillPanelPluginPromoteRequest,
  SkillPanelPluginPromoteResult,
} from './types.ts'

export interface SkillControlConfig {
  /** 池根目录；默认 ~/.dsh/.skill-pool */
  readonly poolRoot?: string
  /** 插件管理的活动 profile 目录；默认自动探测（引用本面板的 profile，退回 web）。 */
  readonly profileDir?: string
}

/** 纯 host 插件（服务/RPC + 工具 + 命令）：挂载后为所有会话提供三面管理入口，操作维度仍按会话。 */
export class SkillControlPlugin {
  static inject = ['agents', 'tools', 'skills', 'commands']

  // schemastery fork：object 字段默认即可选（.required() 才必填），故 poolRoot 不必写 optional
  static Config: z<SkillControlConfig> = z.object({
    poolRoot: z.string(),
    profileDir: z.string(),
  })

  private store!: SessionSkillStore
  private mcp!: SessionMcpManager
  private plugins!: PluginManager

  constructor(ctx: Context, config: SkillControlConfig = {}) {
    // 日志系统：在插件 init 前注册 exporter（控制台 + JSON Lines 文件 + 缓冲），
    // 使后续所有命名 logger（skill-panel/pool/store/mcp/plugin-manager）统一走结构化管道。
    installPanelLogging(ctx)
    try {
      this.init(ctx, config)
    } catch (error) {
      // 初始化失败不抛错：让 fiber 保持 active，避免一个插件 bug 阻塞整个 DSH 启动。
      // 失败时插件静默降级（不注册工具/命令/面板），DSH 其余部分照常运行。
      ctx.logger('skill-panel').error('[dshp-skill-panel] initialization failed; plugin disabled:', error)
    }
  }

  private init(ctx: Context, config: SkillControlConfig): void {
    const poolRoot = resolvePoolRoot(config.poolRoot)
    // 面板所在 profile：显式 config.profileDir > ctx.baseUrl 派生（dsh boot 官方注入）> undefined。
    // 两个管理器共享同一 profileDir，mcp 的 select/removeTemplate 才能处理 profile patch（M7）。
    const profileDir = config.profileDir ?? profileDirFromBaseUrl((ctx as unknown as { baseUrl?: unknown })?.baseUrl)
    this.store = new SessionSkillStore(poolRoot, ctx.logger('store'))
    this.mcp = new SessionMcpManager(ctx, poolRoot, profileDir)
    this.plugins = new PluginManager(ctx, this.mcp, profileDir)
    applySessionSkillTools(ctx, { poolRoot, store: this.store })
    applySessionSkillCommands(ctx, { poolRoot, store: this.store })
    applySessionMcpTools(ctx, { manager: this.mcp })
    // 会话引入集重放（§3.2）：resume 的唯一一等信号是 agent/session-start.source==='resume'，
    // 事件同步触发于 publish、携带新 Agent；fire-and-forget 异步重放，store 幂等。
    ctx.effect(() => ctx.on('agent/session-start', (payload: { agent: Agent; source: SessionStartSource }) => {
      if (payload.source !== 'resume') return
      void replaySession(ctx, poolRoot, this.store, payload.agent)
    }), 'skill-panel: session introduce-set replay')
    ctx.plugin(SkillPanelService, { poolRoot, store: this.store, mcp: this.mcp, plugins: this.plugins })
    ctx.logger('skill-panel').info(`initialized: poolRoot=${poolRoot} profileDir=${this.plugins.profileDirPath}`)
  }
}

export default SkillControlPlugin
