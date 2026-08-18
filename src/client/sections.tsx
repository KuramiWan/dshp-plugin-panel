/** 设置页「技能面板」节（settings.section，ADR-0007）：全功能管理页，作用于当前会话。 */
import type { SkillPanelLocaleDict } from './locale.ts'
import { SkillPanelView } from './view.tsx'
import type { SkillPanelClient } from './api.ts'

export interface SkillPanelSettingsSectionProps {
  /** 标准 props：会话列表快照选择器（SessionListState.current 为当前会话）。 */
  useSessions?: (selector: (state: { current?: string }) => string | undefined) => string | undefined
  close?: () => void
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

export function SkillPanelSettingsSection(props: SkillPanelSettingsSectionProps) {
  const { useSessions, client, t } = props
  // useSessions 可能未作为 prop 传入（settings.section 标准 props 未必全被 owner 传下）：
  // 防御性取当前会话，缺失则显示提示而非渲染崩溃。
  const sessionId = typeof useSessions === 'function' ? useSessions(state => state.current) : undefined
  return (
    <div className="dshp-page">
      <div className="dshp-title">{t('page.title')}</div>
      <div className="dshp-subtitle">{t('page.subtitle')}</div>
      {sessionId === undefined
        ? <div className="dshp-empty">{t('no.session')}</div>
        : <SkillPanelView sessionId={sessionId} client={client} t={t} />}
    </div>
  )
}
