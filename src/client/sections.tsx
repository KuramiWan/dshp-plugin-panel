/** 设置页「插件面板」节（settings.section，ADR-0007）：全功能管理页，作用于当前会话。
 *  ADR-0008：页签从「技能 / MCP」变为「技能 / 插件」——MCP 折叠进插件页签。 */
import { useState } from 'react'
import type { PluginPanelLocaleDict } from './locale.ts'
import { PluginPanelView } from './view.tsx'
import { PluginPanelPluginView } from './plugin-view.tsx'
import type { PluginPanelClient } from './api.ts'

export interface PluginPanelSettingsSectionProps {
  /** 标准 props：会话列表快照选择器（SessionListState.current 为当前会话）。 */
  useSessions?: (selector: (state: { current?: string }) => string | undefined) => string | undefined
  close?: () => void
  client: PluginPanelClient | undefined
  t: (key: keyof PluginPanelLocaleDict) => string
}

export function PluginPanelSettingsSection(props: PluginPanelSettingsSectionProps) {
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
          {t('tab.skills')}
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
          ? <PluginPanelView sessionId={sessionId} client={client} t={t} />
          : <PluginPanelPluginView sessionId={sessionId} client={client} t={t} />}
    </div>
  )
}
