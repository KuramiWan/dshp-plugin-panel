/**
 * 技能面板 Remote 边界载荷类型（typert 生成严格 schema 的输入）。
 * 必须从非 root 的类型子路径（./types）导出——生成器约束，见 commands 包同款组织。
 * 全部保持简单可序列化；readonly 由生成器转 z.readonly()。
 */

export interface SkillPanelBrowseEntry {
  readonly name: string
  readonly origin: 'local' | 'ecosystem'
  readonly source?: string
  readonly description: string
  readonly available: boolean
  readonly introduced: boolean
  /** 不可引入的前置原因（未订阅 / 生态来源未确认），供面板置灰展示；可引入时为 undefined。 */
  readonly blockReason?: string
}

export interface SkillPanelBrowseRequest {
  readonly sessionId: string
  readonly origin?: 'local' | 'ecosystem'
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
    readonly origin: 'local' | 'ecosystem'
    readonly source?: string
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
    readonly origin: string
    readonly shadowed: boolean
    readonly alreadyIntroduced: boolean
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
