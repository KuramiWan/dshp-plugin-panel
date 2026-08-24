/** 面板共享的提示条状态：成功/失败文案，或空（无提示）。view.tsx 与 plugin-view.tsx 共用。 */
export type PanelNotice = { kind: 'ok' | 'error'; text: string } | null
