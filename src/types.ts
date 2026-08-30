/**
 * 插件面板 Remote 边界载荷类型（typert 生成严格 schema 的输入）。
 * 必须从非 root 的类型子路径（./types）导出——生成器约束，见 commands 包同款组织。
 * 全部保持简单可序列化；readonly 由生成器转 z.readonly()。
 */

export interface PluginPanelBrowseEntry {
  readonly name: string
  readonly description: string
  readonly introduced: boolean
  /** frontmatter tags（跨池共享分组维度）。 */
  readonly tags: readonly string[]
}

export interface PluginPanelBrowseRequest {
  readonly sessionId: string
  readonly query?: string
  readonly limit?: number
}

export interface PluginPanelBrowseResult {
  readonly entries: readonly PluginPanelBrowseEntry[]
}

export interface PluginPanelIntroducedSkill {
  readonly name: string
  readonly description?: string
  /** 会话引入的 tag 视图（从池/全局的 SKILL.md 读取；无则空数组）。 */
  readonly tags?: readonly string[]
}

export interface PluginPanelListRequest {
  readonly sessionId: string
}

export interface PluginPanelListResult {
  readonly skills: readonly PluginPanelIntroducedSkill[]
}

export interface PluginPanelDetailRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelDetailResult =
  | {
    readonly ok: true
    readonly name: string
    readonly description: string
    readonly whenToUse?: string
    readonly content: string
  }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelIntroduceRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelIntroduceResult =
  | {
    readonly ok: true
    readonly name: string
    readonly shadowed: boolean
    readonly alreadyIntroduced: boolean
    /** 会话引入集是否已记录（落盘 .session-skills/<sessionId>.json，重启后按会话恢复）。 */
    readonly persisted: boolean
  }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelRemoveRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelRemoveResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelSetTagsRequest {
  readonly sessionId: string
  readonly name: string
  /** 完整 tags 列表（整体替换）；空数组 = 清除分组。 */
  readonly tags: readonly string[]
}

export type PluginPanelSetTagsResult =
  | { readonly ok: true; readonly name: string; readonly tags: readonly string[] }
  | { readonly ok: false; readonly reason: string }

// ---- 全局激活池（user-dsh 层，进程级自动可见）管理 ----

/** 全局激活池条目视图。 */
export interface PluginPanelGlobalEntry {
  readonly name: string
  readonly description: string
  /** frontmatter tags（跨池共享分组维度）。 */
  readonly tags: readonly string[]
}

export interface PluginPanelGlobalListRequest {
  readonly sessionId: string
}

export interface PluginPanelGlobalListResult {
  readonly entries: readonly PluginPanelGlobalEntry[]
}

export interface PluginPanelGlobalActivateRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelGlobalActivateResult =
  | { readonly ok: true; readonly name: string; readonly target: 'global' | 'pool' }
  | { readonly ok: false; readonly reason: string }

// ---- 面板 MCP 管理边界载荷（会话级临时 MCP，7b 面板入口） ----

export interface PluginPanelMcpEntry {
  readonly name: string
  readonly description?: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  /** stdio：附加环境变量（写不读回，面板不回显 secret）。 */
  readonly env?: Readonly<Record<string, string>>
  /** streamable-http：附加请求头（写不读回，面板不回显 secret）。 */
  readonly headers?: Readonly<Record<string, string>>
  readonly url?: string
  /** 会话视图标记；白名单视图（模板列表）无此语义，可省略。 */
  readonly connected?: boolean
}

export interface PluginPanelMcpListRequest {
  readonly sessionId: string
}

export interface PluginPanelMcpListResult {
  readonly entries: readonly PluginPanelMcpEntry[]
}

export interface PluginPanelMcpConnectRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelMcpConnectResult =
  | { readonly ok: true; readonly name: string; readonly alreadyConnected: boolean }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelMcpDisconnectRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelMcpDisconnectResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelMcpWhitelistRequest {
  readonly sessionId: string
}

export interface PluginPanelMcpWhitelistResult {
  readonly servers: readonly PluginPanelMcpEntry[]
}

export interface PluginPanelMcpUpsertRequest {
  readonly sessionId: string
  readonly server: PluginPanelMcpEntry
}

export type PluginPanelMcpUpsertResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelMcpRemoveRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelMcpRemoveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

// ---- 发现与兼容（管理"已配置好的 MCP"，不创建/配置） ----

/** 从 DSH 组合发现的、已配置好的 MCP 服务器（脱敏视图）。 */
export interface PluginPanelMcpDiscovered {
  readonly name: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  /** 是否带 env/headers —— 只揭示存在性，不回显值。 */
  readonly hasSecrets: boolean
  /** 该 mcp-client 插件是否已在组合中全局启用。 */
  readonly globallyActive: boolean
  /** 是否已在我们的管理白名单中。 */
  readonly managed: boolean
}

export interface PluginPanelMcpDiscoverRequest {
  readonly sessionId: string
}

export interface PluginPanelMcpDiscoverResult {
  readonly entries: readonly PluginPanelMcpDiscovered[]
}

export interface PluginPanelMcpSelectRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelMcpSelectResult =
  | { readonly ok: true; readonly entry: PluginPanelMcpDiscovered }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelMcpCheckRequest {
  readonly sessionId: string
  readonly name: string
}

export type PluginPanelMcpCheckResult =
  | { readonly ok: true; readonly toolCount: number; readonly serverName: string }
  | { readonly ok: false; readonly reason: string }

// ---- 插件页签（宿主组合层，ADR-0008；MCP 折叠并入） ----

/** 组合行来源：core（bundle / host 核心）| patch（活动 profile 用户插件行）| mcp（mcp-client 桥接）。 */
export type PluginPanelPluginSource = 'core' | 'patch' | 'bundle' | 'mcp'

/** 插件页签里的单个组合行视图。 */
export interface PluginPanelPluginEntry {
  readonly id: string
  readonly source: PluginPanelPluginSource
  /** FiberState 数值；-1 = 已停用（记录在状态文件、不在 registry）。 */
  readonly state: number
  readonly active: boolean
  readonly protected: boolean
  readonly manageable: boolean
  readonly isSelf: boolean
  readonly packageName?: string
  /** 已迁移挂载方式、但尚未重启（promote：bundle 已摘、待重启写 patch 行；demote：patch 已摘、bundle 已加回待重启）。 */
  readonly pendingRestart?: boolean
  /** mcp 桥接行信息。 */
  readonly mcp?: {
    readonly serverName: string
    readonly transport: 'stdio' | 'streamable-http'
    readonly connected: boolean
  }
}

export interface PluginPanelPluginListRequest {
  readonly sessionId: string
}

export interface PluginPanelPluginListResult {
  readonly plugins: readonly PluginPanelPluginEntry[]
}

export interface PluginPanelPluginToggleRequest {
  readonly sessionId: string
  readonly id: string
  /** true = 启用（重建 insert 行）；false = 停用（移除 insert 行）。 */
  readonly enabled: boolean
}

export type PluginPanelPluginToggleResult =
  | { readonly ok: true; readonly id: string; readonly enabled: boolean }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelPluginInstallRequest {
  readonly sessionId: string
  readonly id: string
  readonly name: string
}

export type PluginPanelPluginInstallResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelPluginPromoteRequest {
  readonly sessionId: string
  readonly id: string
}

export type PluginPanelPluginPromoteResult =
  | { readonly ok: true; readonly id: string; readonly restartRequired: true }
  | { readonly ok: false; readonly reason: string }

export interface PluginPanelPluginDemoteRequest {
  readonly sessionId: string
  readonly id: string
}

export type PluginPanelPluginDemoteResult =
  | { readonly ok: true; readonly id: string; readonly restartRequired: true }
  | { readonly ok: false; readonly reason: string }

// ---- 调试 / 枚举（ADR-0010 卡点打通）：列出宿主当前 live sessions ----

/** 单个 live agent/session 的视图。 */
export interface PluginPanelSessionEntry {
  /** agent/session 共享身份（= agent.id = session.id，供其它方法作 sessionId）。 */
  readonly sessionId: string
  /** AgentStatus：'idle' | 'running'。 */
  readonly status: string
  /** 是否顶层 agent（非子代理）。 */
  readonly root: boolean
}

export interface PluginPanelSessionsRequest {
  /** 可选：仅返回此 id 对应的条目（用于确认某会话是否 live）。 */
  readonly sessionId?: string
}

export interface PluginPanelSessionsResult {
  readonly sessions: readonly PluginPanelSessionEntry[]
}

