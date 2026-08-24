/**
 * 技能面板 Remote 边界载荷类型（typert 生成严格 schema 的输入）。
 * 必须从非 root 的类型子路径（./types）导出——生成器约束，见 commands 包同款组织。
 * 全部保持简单可序列化；readonly 由生成器转 z.readonly()。
 */

export interface SkillPanelBrowseEntry {
  readonly name: string
  readonly description: string
  readonly introduced: boolean
  /** frontmatter tags（跨池共享分组维度）。 */
  readonly tags: readonly string[]
}

export interface SkillPanelBrowseRequest {
  readonly sessionId: string
  readonly query?: string
  readonly limit?: number
}

export interface SkillPanelBrowseResult {
  readonly entries: readonly SkillPanelBrowseEntry[]
}

export interface SkillPanelIntroducedSkill {
  readonly name: string
  readonly description?: string
  /** 会话引入的 tag 视图（从池/全局的 SKILL.md 读取；无则空数组）。 */
  readonly tags?: readonly string[]
}

export interface SkillPanelListRequest {
  readonly sessionId: string
}

export interface SkillPanelListResult {
  readonly skills: readonly SkillPanelIntroducedSkill[]
}

export interface SkillPanelDetailRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelDetailResult =
  | {
    readonly ok: true
    readonly name: string
    readonly description: string
    readonly whenToUse?: string
    readonly content: string
  }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelIntroduceRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelIntroduceResult =
  | {
    readonly ok: true
    readonly name: string
    readonly shadowed: boolean
    readonly alreadyIntroduced: boolean
    /** 会话引入集是否已记录（落盘 .session-skills/<sessionId>.json，重启后按会话恢复）。 */
    readonly persisted: boolean
  }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelRemoveRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelRemoveResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelSetTagsRequest {
  readonly sessionId: string
  readonly name: string
  /** 完整 tags 列表（整体替换）；空数组 = 清除分组。 */
  readonly tags: readonly string[]
}

export type SkillPanelSetTagsResult =
  | { readonly ok: true; readonly name: string; readonly tags: readonly string[] }
  | { readonly ok: false; readonly reason: string }

// ---- 全局激活池（user-dsh 层，进程级自动可见）管理 ----

/** 全局激活池条目视图。 */
export interface SkillPanelGlobalEntry {
  readonly name: string
  readonly description: string
  /** frontmatter tags（跨池共享分组维度）。 */
  readonly tags: readonly string[]
}

export interface SkillPanelGlobalListRequest {
  readonly sessionId: string
}

export interface SkillPanelGlobalListResult {
  readonly entries: readonly SkillPanelGlobalEntry[]
}

export interface SkillPanelGlobalActivateRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelGlobalActivateResult =
  | { readonly ok: true; readonly name: string; readonly target: 'global' | 'pool' }
  | { readonly ok: false; readonly reason: string }

// ---- 面板 MCP 管理边界载荷（会话级临时 MCP，7b 面板入口） ----

export interface SkillPanelMcpEntry {
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

export interface SkillPanelMcpListRequest {
  readonly sessionId: string
}

export interface SkillPanelMcpListResult {
  readonly entries: readonly SkillPanelMcpEntry[]
}

export interface SkillPanelMcpConnectRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelMcpConnectResult =
  | { readonly ok: true; readonly name: string; readonly alreadyConnected: boolean }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelMcpDisconnectRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelMcpDisconnectResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelMcpWhitelistRequest {
  readonly sessionId: string
}

export interface SkillPanelMcpWhitelistResult {
  readonly servers: readonly SkillPanelMcpEntry[]
}

export interface SkillPanelMcpUpsertRequest {
  readonly sessionId: string
  readonly server: SkillPanelMcpEntry
}

export type SkillPanelMcpUpsertResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelMcpRemoveRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelMcpRemoveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

// ---- 发现与兼容（管理"已配置好的 MCP"，不创建/配置） ----

/** 从 DSH 组合发现的、已配置好的 MCP 服务器（脱敏视图）。 */
export interface SkillPanelMcpDiscovered {
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

export interface SkillPanelMcpDiscoverRequest {
  readonly sessionId: string
}

export interface SkillPanelMcpDiscoverResult {
  readonly entries: readonly SkillPanelMcpDiscovered[]
}

export interface SkillPanelMcpSelectRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelMcpSelectResult =
  | { readonly ok: true; readonly entry: SkillPanelMcpDiscovered }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelMcpCheckRequest {
  readonly sessionId: string
  readonly name: string
}

export type SkillPanelMcpCheckResult =
  | { readonly ok: true; readonly toolCount: number; readonly serverName: string }
  | { readonly ok: false; readonly reason: string }

// ---- 插件页签（宿主组合层，ADR-0008；MCP 折叠并入） ----

/** 组合行来源：core（bundle / host 核心）| patch（活动 profile 用户插件行）| mcp（mcp-client 桥接）。 */
export type SkillPanelPluginSource = 'core' | 'patch' | 'bundle' | 'mcp'

/** 插件页签里的单个组合行视图。 */
export interface SkillPanelPluginEntry {
  readonly id: string
  readonly source: SkillPanelPluginSource
  /** FiberState 数值；-1 = 已停用（记录在状态文件、不在 registry）。 */
  readonly state: number
  readonly active: boolean
  readonly protected: boolean
  readonly manageable: boolean
  readonly isSelf: boolean
  readonly packageName?: string
  /** 已提升为热插拔、但尚未重启（bundle 层仍冻结在运行树里，重启后生效）。 */
  readonly pendingRestart?: boolean
  /** mcp 桥接行信息。 */
  readonly mcp?: {
    readonly serverName: string
    readonly transport: 'stdio' | 'streamable-http'
    readonly connected: boolean
  }
}

export interface SkillPanelPluginListRequest {
  readonly sessionId: string
}

export interface SkillPanelPluginListResult {
  readonly plugins: readonly SkillPanelPluginEntry[]
}

export interface SkillPanelPluginToggleRequest {
  readonly sessionId: string
  readonly id: string
  /** true = 启用（重建 insert 行）；false = 停用（移除 insert 行）。 */
  readonly enabled: boolean
}

export type SkillPanelPluginToggleResult =
  | { readonly ok: true; readonly id: string; readonly enabled: boolean }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelPluginInstallRequest {
  readonly sessionId: string
  readonly id: string
  readonly name: string
}

export type SkillPanelPluginInstallResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string }

export interface SkillPanelPluginPromoteRequest {
  readonly sessionId: string
  readonly id: string
}

export type SkillPanelPluginPromoteResult =
  | { readonly ok: true; readonly id: string; readonly restartRequired: true }
  | { readonly ok: false; readonly reason: string }

// ---- 调试 / 枚举（ADR-0010 卡点打通）：列出宿主当前 live sessions ----

/** 单个 live agent/session 的视图。 */
export interface SkillPanelSessionEntry {
  /** agent/session 共享身份（= agent.id = session.id，供其它方法作 sessionId）。 */
  readonly sessionId: string
  /** AgentStatus：'idle' | 'running'。 */
  readonly status: string
  /** 是否顶层 agent（非子代理）。 */
  readonly root: boolean
}

export interface SkillPanelSessionsRequest {
  /** 可选：仅返回此 id 对应的条目（用于确认某会话是否 live）。 */
  readonly sessionId?: string
}

export interface SkillPanelSessionsResult {
  readonly sessions: readonly SkillPanelSessionEntry[]
}

