/**
 * 面板「插件」页签（ADR-0008）：宿主组合层（进程级）管理 + MCP 折叠并入。
 * - 插件盘点：registry 所有组合行（core / patch / mcp），标注来源、运行状态、是否可启停。
 * - 用户插件启停：写活动 profile 的 cordis.patch.yml insert 行 → 热挂载免重启；
 *   核心与面板自身只读，禁止停。
 * - 新增用户插件：id + 包名表单（写一条 insert 行）。
 * - MCP 折叠：下方嵌入 SkillPanelMcpView（发现 / 白名单 / 会话级连接 / 检查），
 *   MCP 桥接行在插件列表里是带连接状态的普通插件行。
 * 数据走 HTTP 客户端（api.ts）。
 */
import { useEffect, useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import type { SkillPanelClient } from './api.ts'
import type { SkillPanelPluginEntry } from '../types.ts'
import { SkillPanelMcpView } from './mcp-view.tsx'

export interface SkillPanelPluginViewProps {
  sessionId: string
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

const SOURCE_LABEL = {
  core: 'plugin.source.core',
  patch: 'plugin.source.patch',
  mcp: 'plugin.source.mcp',
} as const

const STATE_LABEL = {
  active: 'plugin.state.active',
  stopped: 'plugin.state.stopped',
  failed: 'plugin.state.failed',
  loading: 'plugin.state.loading',
  pending: 'plugin.state.pending',
  disposed: 'plugin.state.disposed',
  unloading: 'plugin.state.unloading',
} as const

function stateKey(state: number): keyof typeof STATE_LABEL {
  if (state === 2) return 'active'
  if (state === 3) return 'failed'
  if (state === 1) return 'loading'
  if (state === 0) return 'pending'
  if (state === 4) return 'disposed'
  if (state === 5) return 'unloading'
  return 'stopped' // -1 或未知 → 停用
}

export function SkillPanelPluginView(props: SkillPanelPluginViewProps) {
  const { sessionId, client, t } = props
  const [plugins, setPlugins] = useState<SkillPanelPluginEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [installId, setInstallId] = useState('')
  const [installName, setInstallName] = useState('')
  const [coreOpen, setCoreOpen] = useState(false)

  const refresh = (): void => {
    if (client === undefined) return
    setBusy(true)
    setError(false)
    void client.pluginList({ sessionId }).then(r => {
      setPlugins([...(r.plugins ?? [])])
    }).catch(() => setError(true)).finally(() => setBusy(false))
  }

  useEffect(() => {
    refresh()
  }, [sessionId])

  const runToggle = (entry: SkillPanelPluginEntry, enabled: boolean): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.pluginToggle({ sessionId, id: entry.id, enabled }).then(r => {
      setBusy(false)
      if (r.ok) {
        setNotice({ kind: 'ok', text: `${enabled ? t('plugin.notice.enabled') : t('plugin.notice.disabled')}: ${r.id}` })
      } else {
        setNotice({ kind: 'error', text: `${t('notice.failed')}: ${r.reason}` })
      }
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('notice.failed')}: ${String(e)}` }) })
  }

  const runInstall = (): void => {
    if (busy || client === undefined) return
    if (installId.trim() === '' || installName.trim() === '') return
    setBusy(true)
    void client.pluginInstall({ sessionId, id: installId.trim(), name: installName.trim() }).then(r => {
      setBusy(false)
      if (r.ok) {
        setNotice({ kind: 'ok', text: `${t('plugin.notice.installed')}: ${r.id}` })
        setInstallOpen(false)
        setInstallId('')
        setInstallName('')
      } else {
        setNotice({ kind: 'error', text: `${t('notice.failed')}: ${r.reason}` })
      }
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('notice.failed')}: ${String(e)}` }) })
  }

  if (error) {
    return (
      <div className="dshp-root">
        <div className="dshp-empty">{t('error')} <button className="dshp-btn" onClick={refresh}>{t('retry')}</button></div>
      </div>
    )
  }

  if (busy && plugins === null) {
    return <div className="dshp-root"><div className="dshp-empty">{t('plugin.loading')}</div></div>
  }

  const list = plugins ?? []
  // 内核插件（source==='core'）单独摘出，不进管理列表，折叠成只读摘要。
  const core = list.filter(p => p.source === 'core')
  const managed = list.filter(p => p.source !== 'core')

  return (
    <div className="dshp-root">
      {notice !== null && (
        <div className={notice.kind === 'ok' ? 'dshp-notice' : 'dshp-notice dshp-notice-error'}>{notice.text}</div>
      )}

      <div className="dshp-tips">{t('plugin.tips')}</div>

      <div className="dshp-section-title">
        {t('plugin.inventory.title')}
        <span className="dshp-actions" style={{ marginLeft: 'auto' }}>
          <button className="dshp-btn" onClick={() => setInstallOpen(o => !o)}>{t('plugin.action.install')}</button>
        </span>
      </div>

      {installOpen && (
        <div className="dshp-move">
          <input
            className="dshp-input dshp-move-new"
            placeholder={t('plugin.install.id')}
            value={installId}
            onChange={event => setInstallId(event.target.value)}
          />
          <input
            className="dshp-input dshp-move-new"
            placeholder={t('plugin.install.name')}
            value={installName}
            onChange={event => setInstallName(event.target.value)}
          />
          <button className="dshp-btn dshp-btn-primary" disabled={busy || installId.trim() === '' || installName.trim() === ''} onClick={runInstall}>
            {t('plugin.action.install.confirm')}
          </button>
        </div>
      )}

      {managed.length === 0 ? (
        <div className="dshp-empty">{t('plugin.inventory.empty')}</div>
      ) : (
        <div className="dshp-list">
          {managed.map(p => {
            const sKey = stateKey(p.state)
            return (
              <div className="dshp-item" key={`${p.id}:${p.state}`}>
                <div className="dshp-item-head">
                  <span className="dshp-name">{p.id}</span>
                  <span className="dshp-tag">{t(SOURCE_LABEL[p.source])}</span>
                  <span className={sKey === 'active' ? 'dshp-tag dshp-tag-intro' : sKey === 'failed' ? 'dshp-tag dshp-tag-error' : 'dshp-tag'}>
                    {t(STATE_LABEL[sKey])}
                  </span>
                  {p.packageName !== undefined && <span className="dshp-tag">{p.packageName}</span>}
                  {p.protected && <span className="dshp-tag dshp-tag-eco">{t('plugin.badge.protected')}</span>}
                  {p.mcp !== undefined && (
                    <span className={p.mcp.connected ? 'dshp-tag dshp-tag-intro' : 'dshp-tag'}>
                      {p.mcp.connected ? t('plugin.mcp.connected') : t('plugin.mcp.available')}
                    </span>
                  )}
                  <span className="dshp-actions">
                    {p.manageable && (p.active
                      ? <button className="dshp-btn dshp-btn-danger" onClick={() => runToggle(p, false)} disabled={busy}>{t('plugin.action.disable')}</button>
                      : <button className="dshp-btn dshp-btn-primary" onClick={() => runToggle(p, true)} disabled={busy}>{t('plugin.action.enable')}</button>)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button className="dshp-group-head" onClick={() => setCoreOpen(o => !o)}>
        <span className="dshp-group-caret">{coreOpen ? '▾' : '▸'}</span>
        <span className="dshp-group-name">{t('plugin.core.title')}</span>
        <span className="dshp-group-count">（{core.length}）</span>
      </button>
      {coreOpen && (
        <div className="dshp-list">
          {core.map(p => {
            const sKey = stateKey(p.state)
            return (
              <div className="dshp-item" key={`core:${p.id}`}>
                <div className="dshp-item-head">
                  <span className="dshp-name">{p.id}</span>
                  <span className={sKey === 'active' ? 'dshp-tag dshp-tag-intro' : 'dshp-tag'}>{t(STATE_LABEL[sKey])}</span>
                  {p.packageName !== undefined && <span className="dshp-tag">{p.packageName}</span>}
                  <span className="dshp-tag dshp-tag-eco">{t('plugin.badge.protected')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="dshp-section-title">{t('plugin.mcp.title')}</div>
      <SkillPanelMcpView sessionId={sessionId} client={client} t={t} />
    </div>
  )
}
