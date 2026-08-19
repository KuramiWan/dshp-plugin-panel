/**
 * 技能面板共享视图：三区布局——
 * 「全局激活（user-dsh 层，进程级自动可见：停用 / 详情）」+
 * 「可用池（用户自管内容：启用 / 引入 / 分组 / 详情）」+「本会话已引入（移除）」。
 * 全局激活池 = ~/.dsh/skills（DSH skill-filesystem 扫描，所有会话自动可见）；
 * 可用池 = local/ 按分组折叠展示（local/<group>/<skill>/ 归组，顶层归「未分组」）。
 * 启用/停用 = 在两区之间移动目录（不复制、不删除内容）；分组只影响展示。
 * 数据走 HTTP 客户端（api.ts，相对路径 fetch）。
 */
import { useEffect, useMemo, useState } from 'react'
import type { SkillPanelLocaleDict } from './locale.ts'
import type { SkillPanelClient } from './api.ts'

export interface SkillPanelBrowseEntry {
  name: string
  description: string
  introduced: boolean
  group?: string
}

export interface SkillPanelIntroducedSkill {
  name: string
  description?: string
}

export interface SkillPanelGlobalEntry {
  name: string
  description: string
}

export interface SkillPanelViewProps {
  sessionId: string
  client: SkillPanelClient | undefined
  t: (key: keyof SkillPanelLocaleDict) => string
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

/** 展示分组键：有分组用其名，无分组用空串（渲染为「未分组」）。 */
function groupKey(entry: SkillPanelBrowseEntry): string {
  return entry.group ?? ''
}

export function SkillPanelView(props: SkillPanelViewProps) {
  const { sessionId, client, t } = props
  const [entries, setEntries] = useState<SkillPanelBrowseEntry[] | null>(null)
  const [globals, setGlobals] = useState<SkillPanelGlobalEntry[] | null>(null)
  const [introduced, setIntroduced] = useState<SkillPanelIntroducedSkill[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [openDetail, setOpenDetail] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ whenToUse?: string; content: string } | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [moveFor, setMoveFor] = useState<string | null>(null)
  const [moveGroup, setMoveGroup] = useState('')
  const [moveNew, setMoveNew] = useState('')
  const [moveIsNew, setMoveIsNew] = useState(false)

  const refresh = (): void => {
    if (client === undefined) return
    setBusy(true)
    setError(false)
    void Promise.all([
      client.browse({
        sessionId,
        ...(query.trim().length === 0 ? {} : { query: query.trim() }),
        limit: 200,
      }).then(r => setEntries([...(r.entries ?? [])])),
      client.globalList({ sessionId }).then(r => setGlobals([...(r.entries ?? [])])),
      client.list({ sessionId }).then(r => setIntroduced([...(r.skills ?? [])])),
    ]).then(() => {
      setBusy(false)
    }).catch(() => {
      setError(true)
      setBusy(false)
    })
  }

  useEffect(() => {
    refresh()
  }, [sessionId, query])

  const visible = useMemo(() => entries ?? [], [entries])
  const globalsList = useMemo(() => globals ?? [], [globals])
  const introducedList = useMemo(() => introduced ?? [], [introduced])

  /** 按分组键排序后的 [group, entries[]] 列表（组间按组名，组内按技能名）。 */
  const grouped = useMemo(() => {
    const map = new Map<string, SkillPanelBrowseEntry[]>()
    for (const entry of visible) {
      const key = groupKey(entry)
      const list = map.get(key)
      if (list === undefined) map.set(key, [entry])
      else list.push(entry)
    }
    const groups = [...map.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
    for (const [, list] of groups) list.sort((a, b) => a.name.localeCompare(b.name))
    return groups
  }, [visible])

  const toggleGroup = (key: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** 已有分组名（去重、含未分组以外的全部命名组）。 */
  const existingGroups = useMemo(() => {
    const set = new Set<string>()
    for (const entry of visible) {
      if (entry.group !== undefined && entry.group !== '') set.add(entry.group)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [visible])

  const openMove = (entry: SkillPanelBrowseEntry): void => {
    setMoveFor(entry.name)
    setMoveGroup(entry.group ?? '')
    setMoveNew('')
    setMoveIsNew(false)
  }

  const closeMove = (): void => {
    setMoveFor(null)
    setMoveIsNew(false)
  }

  const runMove = (name: string): void => {
    if (busy || client === undefined) return
    // 新建模式：以输入框内容为目标分组（空 = 未命名，拒绝）；否则用下拉选择。
    const target = moveIsNew ? moveNew.trim() : moveGroup
    if (moveIsNew && target === '') {
      setNotice({ kind: 'error', text: t('group.move.needName') })
      return
    }
    setBusy(true)
    void client.moveSkill({ sessionId, name, ...(target === '' ? {} : { group: target }) }).then((result) => {
      setBusy(false)
      if (result.ok) {
        setNotice({ kind: 'ok', text: target === '' ? t('notice.moved.out') : `${t('notice.moved')}: ${result.group ?? target}` })
        closeMove()
      } else {
        setNotice({ kind: 'error', text: `${t('notice.failed')}: ${result.reason}` })
      }
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('notice.failed') })
    })
  }

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

  /** 启用：可用池 → 全局激活池。 */
  const runActivate = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.globalActivate({ sessionId, name }).then((result) => {
      setBusy(false)
      setNotice(result.ok ? { kind: 'ok', text: `${t('notice.activated')}: ${result.name}` } : { kind: 'error', text: `${t('notice.failed')}: ${result.reason}` })
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('notice.failed') })
    })
  }

  /** 停用：全局激活池 → 可用池。 */
  const runDeactivate = (name: string): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void client.globalDeactivate({ sessionId, name }).then((result) => {
      setBusy(false)
      setNotice(result.ok ? { kind: 'ok', text: `${t('notice.deactivated')}: ${result.name}` } : { kind: 'error', text: `${t('notice.failed')}: ${result.reason}` })
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
      </div>
      {notice !== null && (
        <div className={notice.kind === 'ok' ? 'dshp-notice' : 'dshp-notice dshp-notice-error'}>{notice.text}</div>
      )}
      {error ? (
        <div className="dshp-empty">
          {t('error')}
          <button className="dshp-btn" onClick={refresh}>{t('retry')}</button>
        </div>
      ) : (
        <>
          <div className="dshp-section-title">{t('global.title')}</div>
          {busy && globals === null ? (
            <div className="dshp-empty">{t('loading')}</div>
          ) : globalsList.length === 0 ? (
            <div className="dshp-empty">{t('global.empty')}</div>
          ) : (
            <div className="dshp-list">
              {globalsList.map(g => (
                <div className="dshp-item" key={g.name}>
                  <div className="dshp-item-head">
                    <span className="dshp-name">{g.name}</span>
                    <span className="dshp-tag dshp-tag-intro">{t('global.active')}</span>
                    <span className="dshp-actions">
                      <button className="dshp-btn dshp-btn-danger" onClick={() => runDeactivate(g.name)}>{t('action.deactivate')}</button>
                    </span>
                  </div>
                  <div className="dshp-desc">{g.description}</div>
                </div>
              ))}
            </div>
          )}

          <div className="dshp-section-title">{t('pool.title')}</div>
          {busy && entries === null ? (
            <div className="dshp-empty">{t('loading')}</div>
          ) : visible.length === 0 ? (
            <div className="dshp-empty">{query.trim().length > 0 ? t('list.empty') : t('pool.empty')}</div>
          ) : (
            <div className="dshp-list">
              {grouped.map(([group, list]) => {
                const key = group === '' ? 'ungrouped' : group
                const isCollapsed = collapsed.has(key)
                return (
                  <div className="dshp-group" key={key}>
                    <button className="dshp-group-head" onClick={() => toggleGroup(key)}>
                      <span className="dshp-group-caret">{isCollapsed ? '▸' : '▾'}</span>
                      <span className="dshp-group-name">{group === '' ? t('group.ungrouped') : group}</span>
                      <span className="dshp-group-count">（{list.length}）</span>
                    </button>
                    {!isCollapsed && list.map(entry => (
                      <div className="dshp-item" key={entry.name}>
                        <div className="dshp-item-head">
                          <span className="dshp-name">{entry.name}</span>
                          {entry.introduced && <span className="dshp-tag dshp-tag-intro">{t('state.introduced')}</span>}
                          <span className="dshp-actions">
                            {entry.introduced
                              ? null
                              : <button className="dshp-btn dshp-btn-primary" onClick={() => runIntroduce(entry.name)}>{t('action.introduce')}</button>}
                            <button className="dshp-btn" onClick={() => runActivate(entry.name)}>{t('action.activate')}</button>
                            <button className="dshp-btn" onClick={() => toggleDetail(entry.name)}>
                              {openDetail === entry.name ? t('action.collapse') : t('action.detail')}
                            </button>
                            <button className="dshp-btn" onClick={() => (moveFor === entry.name ? closeMove() : openMove(entry))}>
                              {moveFor === entry.name ? t('action.cancel') : t('action.group')}
                            </button>
                          </span>
                        </div>
                        <div className="dshp-desc">{entry.description}</div>
                        {moveFor === entry.name && (
                          <div className="dshp-move">
                            <span className="dshp-detail-label">{t('group.move.label')}：</span>
                            <select
                              className="dshp-select"
                              value={moveIsNew ? '__new__' : moveGroup}
                              onChange={event => {
                                const value = event.target.value
                                if (value === '__new__') {
                                  setMoveIsNew(true)
                                  setMoveNew('')
                                } else {
                                  setMoveIsNew(false)
                                  setMoveNew('')
                                  setMoveGroup(value)
                                }
                              }}
                            >
                              <option value="">{t('group.move.none')}</option>
                              {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                              <option value="__new__">{t('group.move.new')}</option>
                            </select>
                            {moveIsNew && (
                              <input
                                className="dshp-input dshp-move-new"
                                placeholder={t('group.move.newPlaceholder')}
                                value={moveNew}
                                onChange={event => setMoveNew(event.target.value)}
                              />
                            )}
                            <button className="dshp-btn dshp-btn-primary" disabled={busy} onClick={() => runMove(entry.name)}>{t('action.apply')}</button>
                          </div>
                        )}
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
                )
              })}
            </div>
          )}

          <div className="dshp-section-title">{t('introduced.title')}</div>
          {busy && introduced === null ? (
            <div className="dshp-empty">{t('loading')}</div>
          ) : introducedList.length === 0 ? (
            <div className="dshp-empty">{t('introduced.empty')}</div>
          ) : (
            <div className="dshp-list">
              {introducedList.map(skill => (
                <div className="dshp-item" key={skill.name}>
                  <div className="dshp-item-head">
                    <span className="dshp-name">{skill.name}</span>
                    <span className="dshp-actions">
                      <button className="dshp-btn dshp-btn-danger" onClick={() => runRemove(skill.name)}>{t('action.remove')}</button>
                    </span>
                  </div>
                  {skill.description !== undefined && <div className="dshp-desc">{skill.description}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
