/**
 * 面板 MCP 页签（发现与兼容；会话级临时 MCP 管理）。
 * 本插件不创建/配置 MCP：只【发现】DSH 组合里已配置好的 MCP，用户【选择】把哪些
 * 加入我们的管理白名单，然后对已管理的做【会话级连接/断开】与【兼容检查】。
 * - 发现：从 cordis registry 枚举 mcp-client 插件（脱敏，env/headers 只揭示存在性）。
 * - 选择：把某个已配置 MCP 复制进白名单（服务端含 secrets，不经前端）。
 * - 管理：连接（agent.ctx，仅本会话可见）/ 断开 / 检查（真连一次数工具）。
 * 数据走 HTTP 客户端（api.ts），无任何 authoring 表单。
 */
import { useEffect, useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import type { SkillPanelClient } from './api.ts'
import type { SkillPanelMcpDiscovered, SkillPanelMcpEntry } from '../types.ts'

export interface SkillPanelMcpViewProps {
  sessionId: string
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

/** stdio = 沙箱外受信代码，连接/检查前需显式确认（信任闸）。 */
function confirmStdio(transport: 'stdio' | 'streamable-http', t: (key: keyof SkillPanelLocaleDict) => string): boolean {
  if (transport !== 'stdio') return true
  return window.confirm(t('mcp.trust.stdio'))
}

export function SkillPanelMcpView(props: SkillPanelMcpViewProps) {
  const { sessionId, client, t } = props
  const [discovered, setDiscovered] = useState<SkillPanelMcpDiscovered[] | null>(null)
  const [managed, setManaged] = useState<SkillPanelMcpEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const refresh = (): void => {
    if (client === undefined) return
    setBusy(true)
    setError(false)
    void Promise.all([
      client.mcpDiscover({ sessionId }).then(r => setDiscovered([...(r.entries ?? [])])),
      client.mcpList({ sessionId }).then(r => setManaged([...(r.entries ?? [])])),
    ]).catch(() => setError(true)).finally(() => setBusy(false))
  }

  useEffect(() => {
    refresh()
  }, [sessionId])

  const runSelect = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpSelect({ sessionId, name }).then((r) => {
      setBusy(false)
      if (r.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.selected')}: ${r.entry.name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  const runConnect = (name: string, transport: 'stdio' | 'streamable-http'): void => {
    if (busy || client === undefined) return
    if (!confirmStdio(transport, t)) return
    setBusy(true)
    void client.mcpConnect({ sessionId, name }).then((r) => {
      setBusy(false)
      if (r.ok) setNotice({ kind: 'ok', text: r.alreadyConnected ? `${t('mcp.state.connected')}: ${name}` : `${t('mcp.notice.connected')}: ${name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  const runDisconnect = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpDisconnect({ sessionId, name }).then((r) => {
      setBusy(false)
      if (r.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.disconnected')}: ${name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  const runRemove = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpRemove({ sessionId, name }).then((r) => {
      setBusy(false)
      if (r.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.removed')}: ${name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
    }).catch((e) => { setBusy(false); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  const runCheck = (name: string, transport: 'stdio' | 'streamable-http'): void => {
    if (busy || checking !== null || client === undefined) return
    if (!confirmStdio(transport, t)) return
    setChecking(name)
    void client.mcpCheck({ sessionId, name }).then((r) => {
      setChecking(null)
      if (r.ok) setNotice({ kind: 'ok', text: `${t('mcp.check.ok')} ${r.toolCount}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${r.reason}` })
      refresh()
    }).catch((e) => { setChecking(null); setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${String(e)}` }) })
  }

  if (error) {
    return (
      <div className="dshp-root">
        <div className="dshp-empty">{t('error')} <button className="dshp-btn" onClick={refresh}>{t('retry')}</button></div>
      </div>
    )
  }

  if (busy && discovered === null && managed === null) {
    return <div className="dshp-root"><div className="dshp-empty">{t('mcp.loading')}</div></div>
  }

  const disc = discovered ?? []
  const man = managed ?? []

  return (
    <div className="dshp-root">
      {notice !== null && (
        <div className={notice.kind === 'ok' ? 'dshp-notice' : 'dshp-notice dshp-notice-error'}>{notice.text}</div>
      )}

      <div className="dshp-tips">{t('mcp.tips')}</div>

      <div className="dshp-section-title">{t('mcp.discover.title')}</div>
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
                    : <button className="dshp-btn dshp-btn-primary" onClick={() => runSelect(d.name)}>{t('mcp.action.manage')}</button>}
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

      <div className="dshp-section-title">{t('mcp.managed.title')}</div>
      {man.length === 0 ? (
        <div className="dshp-empty">{t('mcp.empty')}</div>
      ) : (
        <div className="dshp-list">
          {man.map(e => (
            <div className="dshp-item" key={e.name}>
              <div className="dshp-item-head">
                <span className="dshp-name">{e.name}</span>
                <span className={e.connected ? 'dshp-tag dshp-tag-intro' : 'dshp-tag'}>
                  {e.connected ? t('mcp.state.connected') : t('mcp.state.available')}
                </span>
                <span className="dshp-tag dshp-tag-eco">{e.transport === 'stdio' ? t('mcp.transport.stdio') : t('mcp.transport.http')}</span>
                <span className="dshp-actions">
                  {e.connected
                    ? <button className="dshp-btn dshp-btn-danger" onClick={() => runDisconnect(e.name)}>{t('mcp.action.disconnect')}</button>
                    : <button className="dshp-btn dshp-btn-primary" onClick={() => runConnect(e.name, e.transport)} disabled={busy}>{t('mcp.action.connect')}</button>}
                  <button className="dshp-btn" onClick={() => runCheck(e.name, e.transport)} disabled={checking !== null}>
                    {checking === e.name ? t('mcp.check.running') : t('mcp.action.check')}
                  </button>
                  <button className="dshp-btn dshp-btn-danger" onClick={() => runRemove(e.name)}>{t('mcp.action.remove')}</button>
                </span>
              </div>
              <div className="dshp-desc">
                {e.transport === 'stdio' ? (e.command ?? '') : (e.url ?? '')}
                {e.args !== undefined && e.args.length > 0 ? ` ${JSON.stringify(e.args)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
