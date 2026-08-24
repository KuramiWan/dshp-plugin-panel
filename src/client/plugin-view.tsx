/**
 * 面板「插件」页签（ADR-0008）：宿主组合层（进程级）管理，MCP 视同插件统一管理。
 * - 插件盘点：registry 组合行（core / patch / bundle）+ 白名单（会话 MCP），标注来源、运行状态、是否可启停。
 * - 统一启停：patch 行写 cordis.patch.yml（热）；bundle 行写 dsh.profile.bundles（冷，需重启）；
 *   mcp 行连接/断开会话（会话级）。核心与面板自身只读，禁止停。
 * - 新增插件：id + 包名表单（写一条 insert 行）。
 * - 新增 MCP：发现 DSH 已配置的 MCP，选中即加入管理（进白名单，成为会话 MCP 行）。
 * - MCP 行额外动作：检查（真连一次数工具）、删除（移出白名单、恢复全局）。
 * 数据走 HTTP 客户端（api.ts）。
 */
import { useEffect, useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import type { SkillPanelClient } from './api.ts'
import type { SkillPanelPluginEntry, SkillPanelMcpDiscovered } from '../types.ts'

export interface SkillPanelPluginViewProps {
  sessionId: string
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

const SOURCE_LABEL = {
  core: 'plugin.source.core',
  patch: 'plugin.source.patch',
  bundle: 'plugin.source.bundle',
  mcp: 'plugin.source.mcp',
} as const

/** 用户可见状态收敛为 3 个：运行中 / 已停用 / 异常。 */
const STATE_LABEL = {
  active: 'plugin.state.active',
  stopped: 'plugin.state.stopped',
  failed: 'plugin.state.failed',
} as const

function stateKey(state: number): keyof typeof STATE_LABEL {
  if (state === 2) return 'active'
  if (state === 3) return 'failed'
  return 'stopped' // 加载中/待挂载/已回收/卸载中/未知 → 归入「已停用」过渡态
}

/** stdio = 沙箱外受信代码，连接/检查前需显式确认（信任闸）。 */
function confirmStdio(transport: 'stdio' | 'streamable-http', t: (key: keyof SkillPanelLocaleDict) => string): boolean {
  if (transport !== 'stdio') return true
  return window.confirm(t('mcp.trust.stdio'))
}

export function SkillPanelPluginView(props: SkillPanelPluginViewProps) {
  const { sessionId, client, t } = props
  const [plugins, setPlugins] = useState<SkillPanelPluginEntry[] | null>(null)
  const [discovered, setDiscovered] = useState<SkillPanelMcpDiscovered[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [installId, setInstallId] = useState('')
  const [installName, setInstallName] = useState('')
  const [mcpOpen, setMcpOpen] = useState(false)
  const [coreOpen, setCoreOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [query, setQuery] = useState('')

  const refresh = (): void => {
    if (client === undefined) return
    setBusy(true)
    setError(false)
    void client.pluginList({ sessionId }).then(r => {
      setPlugins([...(r.plugins ?? [])])
    }).catch(() => setError(true)).finally(() => setBusy(false))
  }

  const refreshDiscover = (): void => {
    if (client === undefined) return
    void client.mcpDiscover({ sessionId }).then(r => {
      setDiscovered([...(r.entries ?? [])])
    }).catch(() => { /* 发现失败不阻断主列表 */ })
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

  const runPromote = (entry: SkillPanelPluginEntry): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.pluginPromote({ sessionId, id: entry.id }).then(r => {
      setBusy(false)
      if (r.ok) {
        setNotice({ kind: 'ok', text: `${t('plugin.notice.promoted')}: ${r.id}` })
      } else {
        setNotice({ kind: 'error', text: `${t('notice.failed')}: ${r.reason}` })
      }
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('notice.failed')}: ${String(e)}` }) })
  }

  const runSelectMcp = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpSelect({ sessionId, name }).then((r) => {
      setBusy(false)
      if (r.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.selected')}: ${r.entry.name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
      refreshDiscover()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  const runCheck = (entry: SkillPanelPluginEntry): void => {
    if (busy || checking !== null || client === undefined) return
    if (entry.mcp !== undefined && !confirmStdio(entry.mcp.transport, t)) return
    setChecking(entry.id)
    void client.mcpCheck({ sessionId, name: entry.id }).then((r) => {
      setChecking(null)
      if (r.ok) {
        if (r.toolCount > 0) setNotice({ kind: 'ok', text: `${t('mcp.check.ok')} ${r.toolCount}` })
        else setNotice({ kind: 'error', text: t('mcp.check.zero') })
      } else {
        setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      }
      refresh()
    }).catch((e) => { setChecking(null); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  const runRemoveMcp = (entry: SkillPanelPluginEntry): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpRemove({ sessionId, name: entry.id }).then((r) => {
      setBusy(false)
      if (r.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.removed')}: ${entry.id}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
      refreshDiscover()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
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
  // 搜索过滤（按 id / 包名）。
  const q = query.trim().toLowerCase()
  const visibleManaged = q === ''
    ? managed
    : managed.filter(p => p.id.toLowerCase().includes(q) || (p.packageName ?? '').toLowerCase().includes(q))
  const disc = discovered ?? []

  return (
    <div className="dshp-root">
      {notice !== null && (
        <div className={notice.kind === 'ok' ? 'dshp-notice' : 'dshp-notice dshp-notice-error'}>{notice.text}</div>
      )}

      <div className="dshp-toolbar">
        <input
          className="dshp-search"
          placeholder={t('plugin.search.placeholder')}
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <button className="dshp-btn dshp-help" title={t('plugin.help')} onClick={() => setHelpOpen(o => !o)}>
          {helpOpen ? '×' : '?'}
        </button>
      </div>
      {helpOpen && <div className="dshp-tips">{t('plugin.tips')}</div>}

      <div className="dshp-section-title">
        {t('plugin.inventory.title')}
        <span className="dshp-actions" style={{ marginLeft: 'auto' }}>
          <button className="dshp-btn" onClick={() => setInstallOpen(o => !o)}>{t('plugin.action.install')}</button>
          <button className="dshp-btn" onClick={() => { setMcpOpen(o => !o); if (!mcpOpen) refreshDiscover() }}>{t('plugin.action.addMcp')}</button>
        </span>
      </div>

      {installOpen && (
        <div className="dshp-form">
          <div className="dshp-form-title">{t('plugin.install.title')}</div>
          <div className="dshp-field">
            <input
              className="dshp-input"
              placeholder={t('plugin.install.id')}
              value={installId}
              onChange={event => setInstallId(event.target.value)}
            />
          </div>
          <div className="dshp-field">
            <input
              className="dshp-input"
              placeholder={t('plugin.install.name')}
              value={installName}
              onChange={event => setInstallName(event.target.value)}
            />
          </div>
          <div className="dshp-actions">
            <button className="dshp-btn dshp-btn-primary" disabled={busy || installId.trim() === '' || installName.trim() === ''} onClick={runInstall}>
              {t('plugin.action.install.confirm')}
            </button>
            <button className="dshp-btn" onClick={() => setInstallOpen(false)}>{t('action.cancel')}</button>
          </div>
        </div>
      )}

      {mcpOpen && (
        <div className="dshp-form">
          <div className="dshp-form-title">{t('plugin.mcp.add.title')}</div>
          <div className="dshp-tips">{t('plugin.mcp.add.hint')}</div>
          {disc.length === 0 ? (
            <div className="dshp-empty">{t('mcp.discover.empty')}</div>
          ) : (
            <div className="dshp-list">
              {disc.map(d => (
                <div className="dshp-item" key={d.name}>
                  <div className="dshp-item-head">
                    <span className="dshp-name">{d.name}</span>
                    <span className="dshp-tag">{d.transport === 'stdio' ? t('mcp.transport.stdio') : t('mcp.transport.http')}</span>
                    {d.hasSecrets && <span className="dshp-tag">{t('mcp.badge.secrets')}</span>}
                    {d.globallyActive && <span className="dshp-tag dshp-tag-eco">{t('mcp.badge.global')}</span>}
                    {d.managed && <span className="dshp-tag dshp-tag-intro">{t('mcp.state.managed')}</span>}
                    <span className="dshp-actions">
                      {d.managed
                        ? null
                        : <button className="dshp-btn dshp-btn-primary" onClick={() => runSelectMcp(d.name)} disabled={busy}>{t('mcp.action.manage')}</button>}
                    </span>
                  </div>
                  <div className="dshp-desc">
                    {d.transport === 'stdio' ? (d.command ?? '') : (d.url ?? '')}
                    {d.args !== undefined && d.args.length > 0 ? ` ${JSON.stringify(d.args)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {visibleManaged.length === 0 ? (
        <div className="dshp-empty">{q !== '' ? t('list.empty') : t('plugin.inventory.empty')}</div>
      ) : (
        <div className="dshp-list">
          {visibleManaged.map(p => {
            const sKey = stateKey(p.state)
            return (
              <div className="dshp-item" key={`${p.id}:${p.state}`}>
                <div className="dshp-item-head">
                  <span className="dshp-name">{p.id}</span>
                  <span className={sKey === 'active' ? 'dshp-tag dshp-tag-intro' : sKey === 'failed' ? 'dshp-tag dshp-tag-error' : 'dshp-tag'}>
                    {t(STATE_LABEL[sKey])}
                  </span>
                  <span className="dshp-actions">
                    {p.pendingRestart ? (
                      <span className="dshp-tag dshp-tag-eco">{t('plugin.badge.restart')}</span>
                    ) : p.manageable ? (
                      <>
                        {p.source === 'bundle' && p.active && (
                          <button className="dshp-btn" onClick={() => runPromote(p)} disabled={busy}>{t('plugin.action.promote')}</button>
                        )}
                        {p.active
                          ? <button className="dshp-btn dshp-btn-danger" onClick={() => runToggle(p, false)} disabled={busy}>{t('plugin.action.disable')}</button>
                          : <button className="dshp-btn dshp-btn-primary" onClick={() => runToggle(p, true)} disabled={busy}>{t('plugin.action.enable')}</button>}
                        {p.source === 'mcp' && (
                          <>
                            <button className="dshp-btn" onClick={() => runCheck(p)} disabled={checking !== null}>
                              {checking === p.id ? t('mcp.check.running') : t('mcp.action.check')}
                            </button>
                            <button className="dshp-btn dshp-btn-danger" onClick={() => runRemoveMcp(p)} disabled={busy}>{t('mcp.action.remove')}</button>
                          </>
                        )}
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="dshp-item-meta">
                  <span className="dshp-tag">{t(SOURCE_LABEL[p.source])}</span>
                  {p.mcp !== undefined ? (
                    <>
                      <span className="dshp-tag dshp-tag-eco">{p.mcp.serverName}</span>
                      <span className="dshp-tag">{p.mcp.transport === 'stdio' ? t('mcp.transport.stdio') : t('mcp.transport.http')}</span>
                      <span className={p.mcp.connected ? 'dshp-tag dshp-tag-intro' : 'dshp-tag'}>
                        {p.mcp.connected ? t('plugin.mcp.connected') : t('plugin.mcp.available')}
                      </span>
                    </>
                  ) : (
                    p.packageName !== undefined && <span className="dshp-tag">{p.packageName}</span>
                  )}
                  {p.protected && <span className="dshp-tag dshp-tag-eco">{t('plugin.badge.protected')}</span>}
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
    </div>
  )
}
