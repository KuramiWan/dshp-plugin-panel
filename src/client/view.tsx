/**
 * 插件面板共享视图：三区布局——
 * 「全局激活（user-dsh 层，进程级自动可见：停用 / 打 tag）」
 * 「可用池（用户自管内容：启用 / 引入 / 打 tag / 详情）」
 * 「本会话已引入（移除）」。
 * 分组统一用技能 frontmatter `tags`，三池共享：全局激活 / 可用池 / 会话引入
 * 都按 tags 折叠展示（无 tags 归「未分组」）；tag 编辑写 SKILL.md，技能移到
 * 任何一层 tag 都跟着。启用/停用 = 目录在全局层与可用池间移动（不复制不删除）。
 * 数据走 HTTP 客户端（api.ts，相对路径 fetch）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PluginPanelLocaleDict } from './locale.ts'
import type { PluginPanelClient } from './api.ts'
import type { PanelNotice } from './notice.ts'

export interface PluginPanelBrowseEntry {
  name: string
  description: string
  introduced: boolean
  tags: readonly string[]
}

export interface PluginPanelIntroducedSkill {
  name: string
  description?: string
  tags?: readonly string[]
}

export interface PluginPanelGlobalEntry {
  name: string
  description: string
  tags: readonly string[]
}

export interface PluginPanelViewProps {
  sessionId: string
  client: PluginPanelClient | undefined
  t: (key: keyof PluginPanelLocaleDict) => string
}

/** 条目统一视图：面板里三区都转成它来分组/展示。 */
interface SkillItem {
  name: string
  description: string
  tags: readonly string[]
  /** 额外标记（全局激活 / 已引入）。 */
  badge?: 'global' | 'introduced'
}

export function PluginPanelView(props: PluginPanelViewProps) {
  const { sessionId, client, t } = props
  const [entries, setEntries] = useState<PluginPanelBrowseEntry[] | null>(null)
  const [globals, setGlobals] = useState<PluginPanelGlobalEntry[] | null>(null)
  const [introduced, setIntroduced] = useState<PluginPanelIntroducedSkill[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<PanelNotice>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  /** 打 tag 行：name → 当前 tags 文本。 */
  const [tagFor, setTagFor] = useState<string | null>(null)
  const [tagText, setTagText] = useState('')

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

  /** 三区合并为 SkillItem[]（可用池条目为主，附 introduced 标记）。 */
  const poolItems: SkillItem[] = useMemo(() => visible.map(e => ({
    name: e.name,
    description: e.description,
    tags: e.tags,
    ...(e.introduced ? { badge: 'introduced' as const } : {}),
  })), [visible])
  const globalItems: SkillItem[] = useMemo(() => globalsList.map(g => ({
    name: g.name,
    description: g.description,
    tags: g.tags,
    badge: 'global' as const,
  })), [globalsList])
  const introducedItems: SkillItem[] = useMemo(() => introducedList.map(s => ({
    name: s.name,
    description: s.description ?? '',
    tags: s.tags ?? [],
    badge: 'introduced' as const,
  })), [introducedList])

  /**
   * 按 tags 分组（跨池统一）：一个技能有多个 tag 出现在多个组；无 tag 归「未分组」。
   * 返回 [tagKey, items][]，tagKey 为空串 = 未分组。
   */
  const groupByTags = (items: readonly SkillItem[]): Array<[string, SkillItem[]]> => {
    const map = new Map<string, SkillItem[]>()
    for (const item of items) {
      const keys = item.tags.length === 0 ? [''] : [...item.tags]
      for (const key of keys) {
        const list = map.get(key)
        if (list === undefined) map.set(key, [item])
        else if (!list.some(x => x.name === item.name)) list.push(item)
      }
    }
    const groups = [...map.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
    for (const [, list] of groups) list.sort((a, b) => a.name.localeCompare(b.name))
    return groups
  }

  const groupedPool = useMemo(() => groupByTags(poolItems), [poolItems, query])
  const groupedGlobal = useMemo(() => groupByTags(globalItems), [globalItems])
  const groupedIntroduced = useMemo(() => groupByTags(introducedItems), [introducedItems])

  /** 首屏默认收起所有 tag 组（首份数据到达时一次性把全部键加入 collapsed）。
   *  ref guard：避免搜索 query 变化重拉数据时覆盖用户的展开/收起选择。 */
  const defaultCollapsedApplied = useRef(false)
  useEffect(() => {
    if (defaultCollapsedApplied.current) return
    const allKeys: string[] = []
    for (const [group] of groupedPool) allKeys.push(`pool:${group === '' ? 'ungrouped' : group}`)
    for (const [group] of groupedGlobal) allKeys.push(`global:${group === '' ? 'ungrouped' : group}`)
    for (const [group] of groupedIntroduced) allKeys.push(`introduced:${group === '' ? 'ungrouped' : group}`)
    if (allKeys.length === 0) return
    setCollapsed(new Set(allKeys))
    defaultCollapsedApplied.current = true
  }, [groupedPool, groupedGlobal, groupedIntroduced])

  const toggleGroup = (key: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openTag = (item: SkillItem): void => {
    setTagFor(item.name)
    setTagText(item.tags.join(', '))
  }

  const closeTag = (): void => {
    setTagFor(null)
  }

  /** 统一执行面板写操作：busy 守卫 + 成功/失败提示 + 刷新。onOk 在 result.ok 时返回成功文案；afterOk 为可选成功副作用。 */
  const runAction = <T extends { ok: boolean; reason?: string }>(
    action: () => Promise<T>,
    onOk: (result: Extract<T, { ok: true }>) => string,
    afterOk?: () => void,
  ): void => {
    if (busy || client === undefined) return
    setBusy(true)
    void action().then((result) => {
      setBusy(false)
      if (result.ok) {
        setNotice({ kind: 'ok', text: onOk(result as Extract<T, { ok: true }>) })
        afterOk?.()
      } else {
        setNotice({ kind: 'error', text: `${t('notice.failed')}: ${result.reason ?? ''}` })
      }
      refresh()
    }).catch(() => {
      setBusy(false)
      setNotice({ kind: 'error', text: t('notice.failed') })
    })
  }

  const runSetTags = (name: string): void => {
    const tags = tagText.split(',').map(s => s.trim()).filter(s => s !== '')
    runAction(
      () => client!.setTags({ sessionId, name, tags }),
      () => `${t('notice.tagged')}: ${name}`,
      closeTag,
    )
  }

  const runIntroduce = (name: string): void => {
    runAction(() => client!.introduce({ sessionId, name }), (result) => {
      const persist = result.persisted ? t('notice.persisted') : ''
      return result.alreadyIntroduced
        ? t('notice.already')
        : t('notice.introduced') + persist + (result.shadowed ? t('notice.shadow') : '')
    })
  }

  const runRemove = (name: string): void => {
    runAction(() => client!.removeSkill({ sessionId, name }), () => t('notice.removed'))
  }

  /** 启用：可用池 → 全局激活池。 */
  const runActivate = (name: string): void => {
    runAction(() => client!.globalActivate({ sessionId, name }), (result) => `${t('notice.activated')}: ${result.name}`)
  }

  /** 停用：全局激活池 → 可用池。 */
  const runDeactivate = (name: string): void => {
    runAction(() => client!.globalDeactivate({ sessionId, name }), (result) => `${t('notice.deactivated')}: ${result.name}`)
  }

  const renderTagRow = (item: SkillItem): ReactNode => {
    if (tagFor !== item.name) return null
    return (
      <div className="dshp-move">
        <span className="dshp-detail-label">{t('tag.edit.label')}：</span>
        <input
          className="dshp-input dshp-move-new"
          placeholder={t('tag.edit.placeholder')}
          value={tagText}
          onChange={event => setTagText(event.target.value)}
        />
        <button className="dshp-btn dshp-btn-primary" disabled={busy} onClick={() => runSetTags(item.name)}>{t('action.apply')}</button>
        <button className="dshp-btn" onClick={closeTag}>{t('action.cancel')}</button>
      </div>
    )
  }

  /** 渲染一组（分组折叠 + 条目）。scope 用于隔离折叠状态：不同作用域的同名分组各自独立开关。 */
  const renderGroup = (scope: string, groups: Array<[string, SkillItem[]]>, actions: (item: SkillItem) => ReactNode): ReactNode => {
    if (groups.length === 0) return null
    return (
      <div className="dshp-list">
        {groups.map(([group, list]) => {
          const key = `${scope}:${group === '' ? 'ungrouped' : group}`
          const isCollapsed = collapsed.has(key)
          return (
            <div className="dshp-group" key={key}>
              <button className="dshp-group-head" onClick={() => toggleGroup(key)}>
                <span className="dshp-group-caret">{isCollapsed ? '▸' : '▾'}</span>
                <span className="dshp-group-name">{group === '' ? t('group.ungrouped') : group}</span>
                <span className="dshp-group-count">（{list.length}）</span>
              </button>
              {!isCollapsed && list.map(item => (
                <div className="dshp-item" key={item.name}>
                  <div className="dshp-item-head">
                    <span className="dshp-name">{item.name}</span>
                    {item.badge === 'global' && <span className="dshp-tag dshp-tag-intro">{t('global.active')}</span>}
                    {item.badge === 'introduced' && <span className="dshp-tag dshp-tag-intro">{t('state.introduced')}</span>}
                    <span className="dshp-actions">
                      {actions(item)}
                      <button className="dshp-btn" onClick={() => (tagFor === item.name ? closeTag() : openTag(item))}>
                        {tagFor === item.name ? t('action.cancel') : t('action.tag')}
                      </button>
                    </span>
                  </div>
                  <div className="dshp-desc">{item.description}</div>
                  {renderTagRow(item)}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
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
          ) : globalItems.length === 0 ? (
            <div className="dshp-empty">{t('global.empty')}</div>
          ) : (
            renderGroup('global', groupedGlobal, item => (
              <button className="dshp-btn dshp-btn-danger" onClick={() => runDeactivate(item.name)}>{t('action.deactivate')}</button>
            ))
          )}

          <div className="dshp-section-title">{t('pool.title')}</div>
          {busy && entries === null ? (
            <div className="dshp-empty">{t('loading')}</div>
          ) : poolItems.length === 0 ? (
            <div className="dshp-empty">{query.trim().length > 0 ? t('list.empty') : t('pool.empty')}</div>
          ) : (
            renderGroup('pool', groupedPool, item => (
              <>
                {item.badge === 'introduced'
                  ? null
                  : <button className="dshp-btn dshp-btn-primary" onClick={() => runIntroduce(item.name)}>{t('action.introduce')}</button>}
                <button className="dshp-btn" onClick={() => runActivate(item.name)}>{t('action.activate')}</button>
              </>
            ))
          )}

          <div className="dshp-section-title">{t('introduced.title')}</div>
          {busy && introduced === null ? (
            <div className="dshp-empty">{t('loading')}</div>
          ) : introducedItems.length === 0 ? (
            <div className="dshp-empty">{t('introduced.empty')}</div>
          ) : (
            renderGroup('introduced', groupedIntroduced, item => (
              <button className="dshp-btn dshp-btn-danger" onClick={() => runRemove(item.name)}>{t('action.remove')}</button>
            ))
          )}
        </>
      )}
    </div>
  )
}

