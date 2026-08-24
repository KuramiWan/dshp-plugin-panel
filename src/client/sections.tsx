/** 设置页「技能面板」节（settings.section，ADR-0007）：全功能管理页，作用于当前会话。
 *  ADR-0008：页签从「技能 / MCP」变为「技能 / 插件」——MCP 折叠进插件页签。 */
import { useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import { SkillPanelView } from './view.tsx'
import { SkillPanelPluginView } from './plugin-view.tsx'
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
  const [tab, setTab] = useState<'skills' | 'plugins'>('skills')
  // useSessions 可能未作为 prop 传入（settings.section 标准 props 未必全被 owner 传下）：
  // 防御性取当前会话，缺失则显示提示而非渲染崩溃。
  const sessionId = typeof useSessions === 'function' ? useSessions(state => state.current) : undefined
  return (
    <div className="dshp-page">
      <div className="dshp-title">{t('page.title')}</div>
      <div className="dshp-subtitle">{tab === 'skills' ? t('page.subtitle') : t('plugin.subtitle')}</div>
      <div className="dshp-tabs">
        <button
          className={tab === 'skills' ? 'dshp-tab dshp-tab-active' : 'dshp-tab'}
          onClick={() => setTab('skills')}
        >
          {t('nav')}
        </button>
        <button
          className={tab === 'plugins' ? 'dshp-tab dshp-tab-active' : 'dshp-tab'}
          onClick={() => setTab('plugins')}
        >
          {t('plugin.nav')}
        </button>
      </div>
      {sessionId === undefined
        ? <div className="dshp-empty">{t('no.session')}</div>
        : tab === 'skills'
          ? <SkillPanelView sessionId={sessionId} client={client} t={t} />
          : <SkillPanelPluginView sessionId={sessionId} client={client} t={t} />}
    </div>
  )
}
