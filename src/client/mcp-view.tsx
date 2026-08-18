/**
 * 面板 MCP 页签（7b 入口；会话级临时 MCP，5a/6a/8b/9）。
 * - 列出白名单候选（含当前会话连接状态）；
 * - 连接/断开（作用于当前会话，tools 会话隔离）；
 * - 编辑白名单（8b：新增/覆盖/删除候选，不放任意 command 的编辑自由上限之外）。
 * 数据走 HTTP 客户端（api.ts）。
 */
import { useEffect, useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import type { SkillPanelClient } from './api.ts'
import type { SkillPanelMcpEntry } from '../types.ts'

export interface SkillPanelMcpViewProps {
  sessionId: string
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

interface EditForm {
  name: string
  description: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  url: string
  connected: boolean
}

const EMPTY_FORM: EditForm = {
  name: '',
  description: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  connected: false,
}

function toForm(entry: SkillPanelMcpEntry): EditForm {
  return {
    name: entry.name,
    description: entry.description ?? '',
    transport: entry.transport,
    command: entry.command ?? '',
    args: entry.args === undefined ? '' : JSON.stringify(entry.args),
    url: entry.url ?? '',
    connected: entry.connected === true,
  }
}

export function SkillPanelMcpView(props: SkillPanelMcpViewProps) {
  const { sessionId, client, t } = props
  const [entries, setEntries] = useState<SkillPanelMcpEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [editing, setEditing] = useState<EditForm | null>(null)

  const refresh = (): void => {
    if (client === undefined) return
    setBusy(true)
    setError(false)
    void client.mcpList({ sessionId }).then(result => {
      setEntries([...(result.entries ?? [])])
      setBusy(false)
    }).catch(() => {
      setError(true)
      setBusy(false)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const visible = entries ?? []

  const runConnect = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpConnect({ sessionId, name }).then(result => {
      setBusy(false)
      if (result.ok) setNotice({ kind: 'ok', text: result.alreadyConnected ? `${t('mcp.state.connected')}: ${name}` : `${t('mcp.notice.connected')}: ${name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${result.reason}` })
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('mcp.notice.failed') })
    })
  }

  const runDisconnect = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpDisconnect({ sessionId, name }).then(result => {
      setBusy(false)
      if (result.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.disconnected')}: ${name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${result.reason}` })
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('mcp.notice.failed') })
    })
  }

  const runSave = (): void => {
    if (editing === null || client === undefined) return
    let args: string[] | undefined
    if (editing.args.trim().length > 0) {
      try {
        const parsed = JSON.parse(editing.args)
        if (!Array.isArray(parsed) || parsed.some(a => typeof a !== 'string')) {
          setNotice({ kind: 'error', text: t('mcp.form.args') })
          return
        }
        args = parsed as string[]
      } catch {
        setNotice({ kind: 'error', text: t('mcp.form.args') })
        return
      }
    }
    const server: SkillPanelMcpEntry = {
      name: editing.name,
      ...(editing.description.trim().length === 0 ? {} : { description: editing.description.trim() }),
      transport: editing.transport,
      ...(editing.transport === 'stdio'
        ? { command: editing.command, ...(args === undefined ? {} : { args }) }
        : { url: editing.url }),
      connected: false,
    }
    setBusy(true)
    void client.mcpUpsert({ sessionId, server }).then(result => {
      setBusy(false)
      if (result.ok) {
        setNotice({ kind: 'ok', text: t('mcp.notice.saved') })
        setEditing(null)
      } else {
        setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${result.reason}` })
      }
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('mcp.notice.failed') })
    })
  }

  const runRemove = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.mcpRemove({ sessionId, name }).then(result => {
      setBusy(false)
      if (result.ok) setNotice({ kind: 'ok', text: `${t('mcp.notice.removed')}: ${name}` })
      else setNotice({ kind: 'error', text: `${t('mcp.notice.failed')}: ${result.reason}` })
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('mcp.notice.failed') })
    })
  }

  return (
    <div className="dshp-root">
      <div className="dshp-subtitle">{t('mcp.subtitle')}</div>
      {notice !== null && (
        <div className={notice.kind === 'ok' ? 'dshp-notice' : 'dshp-notice dshp-notice-error'}>{notice.text}</div>
      )}
      {error ? (
        <div className="dshp-empty">
          {t('error')}
          <button className="dshp-btn" onClick={refresh}>{t('retry')}</button>
        </div>
      ) : busy && entries === null ? (
        <div className="dshp-empty">{t('mcp.loading')}</div>
      ) : visible.length === 0 ? (
        <div className="dshp-empty">{t('mcp.empty')}</div>
      ) : (
        <div className="dshp-list">
          {visible.map(entry => (
            <div className="dshp-item" key={entry.name}>
              <div className="dshp-item-head">
                <span className="dshp-name">{entry.name}</span>
                <span className={entry.connected ? 'dshp-tag dshp-tag-intro' : 'dshp-tag'}>
                  {entry.connected ? t('mcp.state.connected') : t('mcp.state.available')}
                </span>
                <span className="dshp-tag dshp-tag-eco">
                  {entry.transport === 'stdio' ? t('mcp.transport.stdio') : t('mcp.transport.http')}
                </span>
                <span className="dshp-actions">
                  {entry.connected
                    ? <button className="dshp-btn dshp-btn-danger" onClick={() => runDisconnect(entry.name)}>{t('mcp.action.disconnect')}</button>
                    : <button className="dshp-btn dshp-btn-primary" onClick={() => runConnect(entry.name)}>{t('mcp.action.connect')}</button>}
                  <button className="dshp-btn" onClick={() => setEditing(toForm(entry))}>{t('mcp.action.add')}</button>
                  <button className="dshp-btn dshp-btn-danger" onClick={() => runRemove(entry.name)}>{t('mcp.action.remove')}</button>
                </span>
              </div>
              {entry.description !== undefined && <div className="dshp-desc">{entry.description}</div>}
              <div className="dshp-desc">
                {entry.transport === 'stdio'
                  ? (entry.command ?? '')
                  : (entry.url ?? '')}
                {entry.args !== undefined && entry.args.length > 0 ? ` ${JSON.stringify(entry.args)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <div className="dshp-form">
          <div className="dshp-form-title">{t('mcp.action.add')}</div>
          <label className="dshp-field">
            <span>{t('mcp.form.name')}</span>
            <input className="dshp-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label className="dshp-field">
            <span>{t('mcp.form.description')}</span>
            <input className="dshp-input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </label>
          <label className="dshp-field">
            <span>{t('mcp.form.transport')}</span>
            <select className="dshp-select" value={editing.transport} onChange={(e) => setEditing({ ...editing, transport: e.target.value as 'stdio' | 'streamable-http' })}>
              <option value="stdio">{t('mcp.transport.stdio')}</option>
              <option value="streamable-http">{t('mcp.transport.http')}</option>
            </select>
          </label>
          {editing.transport === 'stdio' ? (
            <>
              <label className="dshp-field">
                <span>{t('mcp.form.command')}</span>
                <input className="dshp-input" value={editing.command} onChange={(e) => setEditing({ ...editing, command: e.target.value })} />
              </label>
              <label className="dshp-field">
                <span>{t('mcp.form.args')}</span>
                <input className="dshp-input" value={editing.args} onChange={(e) => setEditing({ ...editing, args: e.target.value })} />
              </label>
            </>
          ) : (
            <label className="dshp-field">
              <span>{t('mcp.form.url')}</span>
              <input className="dshp-input" value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />
            </label>
          )}
          <div className="dshp-actions">
            <button className="dshp-btn dshp-btn-primary" onClick={runSave}>{t('mcp.action.save')}</button>
            <button className="dshp-btn" onClick={() => setEditing(null)}>{t('mcp.action.cancel')}</button>
          </div>
        </div>
      )}

      {editing === null && (
        <button className="dshp-btn dshp-btn-primary" onClick={() => setEditing(EMPTY_FORM)}>{t('mcp.action.add')}</button>
      )}
    </div>
  )
}
