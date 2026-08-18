/**
 * 技能面板 Remote 边界载荷类型（typert 生成严格 schema 的输入）。
 * 必须从非 root 的类型子路径（./types）导出——生成器约束，见 commands 包同款组织。
 * 全部保持简单可序列化；readonly 由生成器转 z.readonly()。
 */

export interface SkillPanelBrowseEntry {
  readonly name: string
  readonly description: string
  readonly introduced: boolean
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
