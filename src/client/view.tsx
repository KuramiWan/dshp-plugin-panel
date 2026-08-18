/**
 * 技能面板共享视图：池浏览/搜索 + 当前会话引入/移除（Q9 前置置灰 + 悬停原因 + 影子覆盖标注）。
 * 被设置节复用（会话头 popover 已移除）；数据走 HTTP 客户端（api.ts，相对路径 fetch）。
 */
import { useEffect, useMemo, useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import type { SkillPanelClient } from './api.ts'

export interface SkillPanelBrowseEntry {
  name: string
  origin: 'local' | 'ecosystem'
  source?: string
  description: string
  available: boolean
  introduced: boolean
  blockReason?: string
}

export interface SkillPanelViewProps {
  sessionId: string
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

export function SkillPanelView(props: SkillPanelViewProps) {
  const { sessionId, client, t } = props
  const [entries, setEntries] = useState<SkillPanelBrowseEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState<'all' | 'local' | 'ecosystem'>('all')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [openDetail, setOpenDetail] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ whenToUse?: string; content: string } | null>(null)

  const refresh = (): void => {
    if (client === undefined) return
    setBusy(true)
    setError(false)
    void client.browse({
      sessionId,
      ...(origin === 'all' ? {} : { origin }),
      ...(query.trim().length === 0 ? {} : { query: query.trim() }),
      limit: 200,
    }).then((result) => {
      setEntries(result.entries ?? [])
      setBusy(false)
    }).catch(() => {
      setError(true)
      setBusy(false)
    })
  }

  useEffect(() => {
    refresh()
  }, [sessionId, origin, query])

  const visible = useMemo(() => entries ?? [], [entries])

  const runIntroduce = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.introduce({ sessionId, name }).then((result) => {
      setBusy(false)
      if (result.ok) {
        const persist = result.persisted ? t('notice.persisted') : ''
        setNotice({
          kind: 'ok',
          text: result.alreadyIntroduced
            ? t('notice.already')
            : t('notice.introduced') + persist + (result.shadowed ? t('notice.shadow') : ''),
        })
      } else {
        setNotice({ kind: 'error', text: `${t('notice.failed')}: ${result.reason}` })
      }
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('notice.failed') })
    })
  }

  const runRemove = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.removeSkill({ sessionId, name }).then((result) => {
      setBusy(false)
      setNotice(result.ok ? { kind: 'ok', text: t('notice.removed') } : { kind: 'error', text: `${t('notice.failed')}: ${result.reason}` })
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('notice.failed') })
    })
  }

  const toggleDetail = (name: string): void => {
    if (client === undefined) return
    if (openDetail === name) {
      setOpenDetail(null)
      setDetail(null)
      return
    }
    setOpenDetail(name)
    setDetail(null)
    void client.detail({ sessionId, name }).then((result) => {
      if (result.ok) setDetail({ whenToUse: result.whenToUse, content: result.content })
      else setDetail({ content: result.reason ?? '' })
    }).catch(() => setDetail({ content: t('error') }))
  }

  return (
    <div className="dshp-root">
      <div className="dshp-toolbar">
        <input
          className="dshp-search"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <select className="dshp-select" value={origin} onChange={event => setOrigin(event.target.value as 'all' | 'local' | 'ecosystem')}>
          <option value="all">{t('origin.all')}</option>
          <option value="local">{t('origin.local')}</option>
          <option value="ecosystem">{t('origin.ecosystem')}</option>
        </select>
      </div>
      {notice !== null && (
        <div className={notice.kind === 'ok' ? 'dshp-notice' : 'dshp-notice dshp-notice-error'}>{notice.text}</div>
      )}
      {error ? (
        <div className="dshp-empty">
          {t('error')}
          <button className="dshp-btn" onClick={refresh}>{t('retry')}</button>
        </div>
      ) : busy && entries === null ? (
        <div className="dshp-empty">{t('loading')}</div>
      ) : visible.length === 0 ? (
        <div className="dshp-empty">{query.trim().length > 0 ? t('list.empty') : t('pool.empty')}</div>
      ) : (
        <div className="dshp-list">
          {visible.map(entry => (
            <div className="dshp-item" key={entry.name}>
              <div className="dshp-item-head">
                <span className="dshp-name">{entry.name}</span>
                <span className={entry.origin === 'local' ? 'dshp-tag' : 'dshp-tag dshp-tag-eco'}>
                  {entry.origin === 'local' ? t('origin.local') : (entry.source ?? t('origin.ecosystem'))}
                </span>
                {entry.introduced && <span className="dshp-tag dshp-tag-intro">{t('state.introduced')}</span>}
                <span className="dshp-actions">
                  {entry.introduced
                    ? <button className="dshp-btn dshp-btn-danger" onClick={() => runRemove(entry.name)}>{t('action.remove')}</button>
                    : <button
                      className="dshp-btn dshp-btn-primary"
                      disabled={!entry.available || entry.blockReason !== undefined}
                      title={entry.blockReason}
                      onClick={() => runIntroduce(entry.name)}
                    >
                      {t('action.introduce')}
                    </button>}
                  <button className="dshp-btn" onClick={() => toggleDetail(entry.name)}>
                    {openDetail === entry.name ? t('action.collapse') : t('action.detail')}
                  </button>
                </span>
              </div>
              <div className="dshp-desc">{entry.description}</div>
              {entry.blockReason !== undefined && <div className="dshp-reason">⛔ {entry.blockReason}</div>}
              {openDetail === entry.name && (
                <div className="dshp-detail">
                  {detail === null ? t('loading') : (
                    <>
                      {detail.whenToUse !== undefined && detail.whenToUse.length > 0 && (
                        <div><span className="dshp-detail-label">{t('detail.when')}：</span>{detail.whenToUse}</div>
                      )}
                      <div><span className="dshp-detail-label">{t('detail.content')}：</span>{detail.content}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
