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
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PluginPanelLocaleDict } from './locale.ts'
import type { PluginPanelClient } from './api.ts'
import type { PluginPanelPluginEntry, PluginPanelPluginSource, PluginPanelMcpDiscovered, PluginPanelUpdateCheck } from '../types.ts'
import type { PanelNotice } from './notice.ts'

export interface PluginPanelPluginViewProps {
  sessionId: string
  client: PluginPanelClient | undefined
  t: (key: keyof PluginPanelLocaleDict) => string
}

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
function confirmStdio(transport: 'stdio' | 'streamable-http', t: (key: keyof PluginPanelLocaleDict) => string): boolean {
  if (transport !== 'stdio') return true
  return window.confirm(t('mcp.trust.stdio'))
}

/** patch 行停用 = 改 cordis.patch.yml + 触发热重载，可能影响宿主。弹窗二次确认。 */
function confirmPatchDisable(t: (key: keyof PluginPanelLocaleDict) => string): boolean {
  return window.confirm(t('plugin.confirm.disablePatch'))
}

export function PluginPanelPluginView(props: PluginPanelPluginViewProps) {
  const { sessionId, client, t } = props
  const [plugins, setPlugins] = useState<PluginPanelPluginEntry[] | null>(null)
  const [discovered, setDiscovered] = useState<PluginPanelMcpDiscovered[] | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [notice, setNotice] = useState<PanelNotice>(null)
  const [installOpen, setInstallOpen] = useState(false)
  const [installId, setInstallId] = useState('')
  const [installName, setInstallName] = useState('')
  const [mcpOpen, setMcpOpen] = useState(false)
  const [coreOpen, setCoreOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** 顶栏「添加 ▾」下拉开关。单一态，菜单里点条目展开对应 form/mcp 列表。 */
  const [addOpen, setAddOpen] = useState(false)
  const addWrapRef = useRef<HTMLDivElement | null>(null)
  /** 检查更新结果（自身 + 受管行）。null = 尚未检查/检查失败。 */
  const [updates, setUpdates] = useState<PluginPanelUpdateCheck[] | null>(null)
  /** 正在应用的包名（单个/全部）。 */
  const [updating, setUpdating] = useState<string | null>(null)

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
    // 打开面板即自动检查一次（Q3A：自动检查失败静默）。client 缺失/失败不打扰。
    if (client !== undefined) {
      void client.checkUpdates({ sessionId }).then(r => {
        setUpdates([...(r.checks ?? [])])
      }).catch(() => { /* 自动失败静默 */ })
    }
  }, [sessionId])

  /** 点击添加下拉外部时关闭菜单。 */
  useEffect(() => {
    if (!addOpen) return
    const onDown = (e: MouseEvent): void => {
      const wrap = addWrapRef.current
      if (wrap === null || !wrap.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addOpen])

  // 折叠态：patch / bundle / mcp 默认展开；core 默认收起（沿用现状）。
  // 这三个 useState 必须在所有 early return 之前声明，保持 hooks 顺序稳定。
  const [patchOpen, setPatchOpen] = useState(true)
  const [bundleOpen, setBundleOpen] = useState(true)
  const [mcpOpenSec, setMcpOpenSec] = useState(true)

  /** 统一执行面板写操作：busy 守卫 + 成功/失败提示 + 刷新。onOk 返回成功文案；afterOk 为成功副作用；failText 覆盖失败前缀（MCP 用 mcp.notice.failed）。 */
  const runAction = <T extends { ok: boolean; reason?: string }>(
    action: () => Promise<T>,
    onOk: (result: Extract<T, { ok: true }>) => string,
    opts?: { afterOk?: () => void; failText?: string },
  ): void => {
    const failText = opts?.failText ?? t('notice.failed')
    if (busy || client === undefined) return
    setBusy(true)
    void action().then((result) => {
      setBusy(false)
      if (result.ok) {
        setNotice({ kind: 'ok', text: onOk(result as Extract<T, { ok: true }>) })
        opts?.afterOk?.()
      } else {
        setNotice({ kind: 'error', text: `${failText}: ${result.reason ?? ''}` })
      }
      refresh()
    }).catch((e) => {
      setBusy(false)
      setNotice({ kind: 'error', text: `${failText}: ${String(e)}` })
    })
  }

  const runToggle = (entry: PluginPanelPluginEntry, enabled: boolean): void => {
    // patch 停用 = 写 cordis.patch.yml + 触发热重载，写坏会中断宿主。弹窗确认。
    // bundle / mcp 不弹：bundle 已「需重启」红标 + 不走热重载；mcp 走 stdio 信任闸。
    if (!enabled && entry.source === 'patch' && !confirmPatchDisable(t)) return
    runAction(
      () => client!.pluginToggle({ sessionId, id: entry.id, enabled }),
      (r) => `${enabled ? t('plugin.notice.enabled') : t('plugin.notice.disabled')}: ${r.id}`,
    )
  }

  const runInstall = (): void => {
    if (installId.trim() === '' || installName.trim() === '') return
    runAction(
      () => client!.pluginInstall({ sessionId, id: installId.trim(), name: installName.trim() }),
      (r) => `${t('plugin.notice.installed')}: ${r.id}`,
      {
        afterOk: () => {
          setInstallOpen(false)
          setInstallId('')
          setInstallName('')
        },
      },
    )
  }

  /** 简单插值：把模板里的 {key} 替换为传入值。 */
  const fmt = (template: string, vars: Record<string, string>): string =>
    template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => vars[key] ?? '')

  const runCheckUpdates = (manual: boolean): void => {
    if (busy || updating !== null || client === undefined) return
    setBusy(true)
    void client.checkUpdates({ sessionId }).then(r => {
      setUpdates([...(r.checks ?? [])])
      if (manual) {
        const updatable = (r.checks ?? []).filter(x => x.updatable)
        setNotice(updatable.length === 0
          ? { kind: 'ok', text: t('plugin.update.none') }
          : { kind: 'ok', text: t('plugin.update.available') + ': ' + updatable.map(x => x.packageName).join(', ') })
      }
    }).catch((e) => {
      if (manual) setNotice({ kind: 'error', text: t('plugin.update.checkFailed') + ': ' + String(e) })
      // 自动检查失败静默（Q16a）
    }).finally(() => setBusy(false))
  }

  /** 应用单个更新：跨 major 先确认；range 内直接确认。 */
  const runUpdate = (check: PluginPanelUpdateCheck): void => {
    if (busy || updating !== null || client === undefined || !check.updatable) return
    if (check.specKind !== 'range') return
    if (check.major && !window.confirm(fmt(t('plugin.update.major.confirm'), { cur: check.current ?? '', new: check.latest ?? '' }))) return
    if (!window.confirm(fmt(t('plugin.update.confirm'), { name: check.packageName, version: check.latest ?? '' }))) return
    setUpdating(check.packageName)
    void client.pluginUpdate({ sessionId, name: check.packageName, latest: check.major }).then((r) => {
      setUpdating(null)
      if (r.ok) {
        setNotice({ kind: 'ok', text: fmt(t('plugin.update.restart'), { version: r.version }) })
        // 更新后重查，让自身/行版本立即反映（磁盘新版本；host 重启后生效）。
        void client.checkUpdates({ sessionId }).then(rr => setUpdates([...(rr.checks ?? [])])).catch(() => {})
      } else {
        setNotice({ kind: 'error', text: t('plugin.update.failed') + ': ' + r.reason })
      }
    }).catch((e) => {
      setUpdating(null)
      setNotice({ kind: 'error', text: t('plugin.update.failed') + ': ' + String(e) })
    })
  }

  /** 全部更新：仅更新「有新版且非跨 major」的行（跨 major 留待单行确认）。 */
  const runUpdateAll = (): void => {
    if (busy || updating !== null || client === undefined) return
    const targets = (updates ?? []).filter(x => x.updatable && x.specKind === 'range' && !x.major)
    if (targets.length === 0) {
      setNotice({ kind: 'error', text: t('plugin.update.none') })
      return
    }
    if (!window.confirm(fmt(t('plugin.update.confirm'), { name: targets.map(x => x.packageName).join(', '), version: targets.map(x => x.latest ?? '').join(', ') }))) return
    const names = targets.map(x => x.packageName)
    setUpdating('__all__')
    // 逐个串行执行（host 端 updating 守卫一次只放行一个，避免并发互相拒绝）。
    void (async () => {
      const failed: string[] = []
      for (const name of names) {
        try {
          const rr = await client!.pluginUpdate({ sessionId, name, latest: false })
          if (!rr.ok) failed.push((rr as { reason?: string }).reason ?? name)
        } catch (e) {
          failed.push(String(e))
        }
      }
      setUpdating(null)
      if (failed.length === 0) {
        setNotice({ kind: 'ok', text: t('plugin.update.restartAll') })
      } else {
        setNotice({ kind: 'error', text: t('plugin.update.failed') + ': ' + failed.join('; ') })
      }
      try {
        const rr = await client!.checkUpdates({ sessionId })
        setUpdates([...(rr.checks ?? [])])
      } catch { /* 重查失败不打扰 */ }
    })()
  }

  const runPromote = (entry: PluginPanelPluginEntry): void => {
    runAction(() => client!.pluginPromote({ sessionId, id: entry.id }), (r) => `${t('plugin.notice.promoted')}: ${r.id}`)
  }

  const runDemote = (entry: PluginPanelPluginEntry): void => {
    runAction(() => client!.pluginDemote({ sessionId, id: entry.id }), (r) => `${t('plugin.notice.demoted')}: ${r.id}`)
  }

  const runSelectMcp = (name: string): void => {
    runAction(
      () => client!.mcpSelect({ sessionId, name }),
      (r) => `${t('mcp.notice.selected')}: ${r.entry.name}`,
      { afterOk: refreshDiscover, failText: t('mcp.notice.failed') },
    )
  }

  const runCheck = (entry: PluginPanelPluginEntry): void => {
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

  const runRemoveMcp = (entry: PluginPanelPluginEntry): void => {
    runAction(
      () => client!.mcpRemove({ sessionId, name: entry.id }),
      () => `${t('mcp.notice.removed')}: ${entry.id}`,
      { afterOk: refreshDiscover, failText: t('mcp.notice.failed') },
    )
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
  // 物理分组：按 source 分桶，搜索在桶内过滤。
  const q = query.trim().toLowerCase()
  const matches = (p: PluginPanelPluginEntry): boolean =>
    q === '' || p.id.toLowerCase().includes(q) || (p.packageName ?? '').toLowerCase().includes(q)
  const buckets: Record<Exclude<PluginPanelPluginSource, 'core'>, PluginPanelPluginEntry[]> = {
    patch: list.filter(p => p.source === 'patch' && matches(p)),
    bundle: list.filter(p => p.source === 'bundle' && matches(p)),
    mcp: list.filter(p => p.source === 'mcp' && matches(p)),
  }
  // 搜索时若指定来源则过滤；否则只显示匹配项所在的桶。
  const visibleCore = list.filter(p => p.source === 'core' && matches(p))
  const disc = discovered ?? []

  /** 渲染单行：name + 状态 + 操作置顶（head），来源/包名/MCP/保护标记放底部 meta 行。 */
  const renderItem = (p: PluginPanelPluginEntry, key: string): ReactNode => {
    const sKey = stateKey(p.state)
    const headTag = sKey === 'active' ? 'dshp-tag dshp-tag-intro' : sKey === 'failed' ? 'dshp-tag dshp-tag-error' : 'dshp-tag'
    return (
      <div className="dshp-item-body" key={key}>
        <div className="dshp-item-line">
          <span className="dshp-name">{p.id}</span>
          <span className={headTag}>{t(STATE_LABEL[sKey])}</span>
          <span className="dshp-actions">
            {p.pendingRestart ? (
              <span className="dshp-tag dshp-tag-eco">{t('plugin.badge.restart')}</span>
            ) : p.manageable ? (
              <>
                {p.source === 'bundle' && p.active && (
                  <button className="dshp-btn" onClick={() => runPromote(p)} disabled={busy}>{t('plugin.action.promote')}</button>
                )}
                {p.source === 'patch' && p.active && (
                  <button className="dshp-btn" onClick={() => runDemote(p)} disabled={busy}>{t('plugin.action.demote')}</button>
                )}
                {p.active
                  ? <button className="dshp-btn dshp-btn-danger" onClick={() => runToggle(p, false)} disabled={busy}>{t('plugin.action.disable')}</button>
                  : <button className="dshp-btn dshp-btn-primary" onClick={() => runToggle(p, true)} disabled={busy}>{t('plugin.action.enable')}</button>}
                {p.source !== 'mcp' && (() => {
                  const up = (updates ?? []).find(u => u.packageName === p.packageName && u.updatable)
                  if (up === undefined) return null
                  return (
                    <button className="dshp-btn dshp-btn-primary" onClick={() => runUpdate(up)} disabled={busy || updating !== null}>
                      {updating === up.packageName ? t('plugin.update.updating') : t('plugin.update.action') + (up.latest !== undefined ? ' ' + up.latest : '')}
                    </button>
                  )
                })()}
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
        <div className="dshp-item-line dshp-item-line-meta">
          <span className="dshp-tag">{t(SOURCE_LABEL[p.source])}</span>
          {p.source === 'bundle' && (
            <span className="dshp-tag dshp-tag-intro" title={t('plugin.section.bundle.hint')}>{t('plugin.badge.restart')}</span>
          )}
          {p.mcp !== undefined ? (
            <>
              <span className="dshp-tag dshp-tag-eco">{p.mcp.serverName}</span>
              <span className="dshp-tag">{p.mcp.transport === 'stdio' ? t('mcp.transport.stdio') : t('mcp.transport.http')}</span>
              <span className={p.mcp.connected ? 'dshp-tag dshp-tag-intro' : 'dshp-tag'}>
                {p.mcp.connected ? t('plugin.mcp.connected') : t('plugin.mcp.available')}
              </span>
            </>
          ) : (
            <>
              {p.packageName !== undefined && <span className="dshp-tag">{p.packageName}</span>}
              {p.packageName !== undefined && (() => {
                const up = (updates ?? []).find(u => u.packageName === p.packageName)
                if (up === undefined) return null
                return (
                  <>
                    {up.current !== undefined && <span className="dshp-tag dshp-tag-eco">{up.current}</span>}
                    {up.specKind === 'non-range' && up.updatable === false && up.latest !== undefined && (
                      <span className="dshp-tag" title={up.specKind === 'non-range' ? t('plugin.update.nonNpm') : undefined}>{t('plugin.update.nonNpm')}</span>
                    )}
                  </>
                )
              })()}
            </>
          )}
          {p.protected && <span className="dshp-tag dshp-tag-eco">{t('plugin.badge.protected')}</span>}
        </div>
      </div>
    )
  }

  /** 渲染一个可折叠来源 section：标题（带计数） + hint + 内容（行 / 空态）。 */
  const renderSection = (
    source: Exclude<PluginPanelPluginSource, 'core'>,
    sectionKey: 'patch' | 'bundle' | 'mcp',
    open: boolean,
    setOpen: (next: boolean) => void,
    emptyText: string,
  ): ReactNode => {
    const items = buckets[source]
    const headId = `dshp-plugin-section-${sectionKey}-head`
    return (
      <div className={`dshp-plugin-section dshp-plugin-section-${sectionKey}`}>
        <button
          className="dshp-plugin-section-head"
          aria-expanded={open}
          aria-controls={headId}
          onClick={() => setOpen(!open)}
        >
          <span className="dshp-plugin-section-caret">{open ? '▾' : '▸'}</span>
          <span className="dshp-plugin-section-name">{t(`plugin.section.${sectionKey}`)}</span>
          <span className="dshp-plugin-section-count">（{items.length}）</span>
        </button>
        {open && (
          <>
            <div className="dshp-plugin-section-hint">{t(`plugin.section.${sectionKey}.hint`)}</div>
            <div className="dshp-list" id={headId}>
              {items.length === 0
                ? <div className="dshp-empty">{emptyText}</div>
                : items.map(p => renderItem(p, `${sectionKey}:${p.id}:${p.state}`))}
            </div>
          </>
        )}
      </div>
    )
  }

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
        <div className="dshp-add-wrap" ref={addWrapRef}>
          <button className="dshp-btn" onClick={() => setAddOpen(o => !o)} disabled={busy}>
            {t('plugin.action.add')} ▾
          </button>
          {addOpen && (
            <div className="dshp-add-menu" role="menu">
              <button
                onClick={() => { setAddOpen(false); setInstallOpen(true); setMcpOpen(false) }}
                disabled={busy}
              >
                {t('plugin.action.add.menu.plugin')}
              </button>
              <button
                onClick={() => { setAddOpen(false); setMcpOpen(true); setInstallOpen(false); refreshDiscover() }}
                disabled={busy}
              >
                {t('plugin.action.add.menu.mcp')}
              </button>
            </div>
          )}
        </div>
        <button className="dshp-btn dshp-help" title={t('plugin.help')} onClick={() => setHelpOpen(o => !o)}>
          {helpOpen ? '×' : '?'}
        </button>
      </div>
      {helpOpen && <div className="dshp-tips">{t('plugin.tips')}</div>}

      {/* 版本 + 检查更新 / 全部更新（自身与受管共用一套 outdated 检查） */}
      <div className="dshp-updatebar">
        {(() => {
          const self = (updates ?? []).find(u => u.packageName === '@super_camel/dsh-plugin-panel')
          const anyUpdatable = (updates ?? []).some(u => u.updatable)
          return (
            <>
              <span className="dshp-tag dshp-tag-eco">{t('plugin.version')}: {self?.current ?? '—'}</span>
              {self !== undefined && self.updatable && (
                <span className="dshp-tag dshp-tag-error">{self.latest !== undefined ? t('plugin.update.available') + ' ' + self.latest : t('plugin.update.available')}</span>
              )}
              {anyUpdatable && (
                <button className="dshp-btn" onClick={runUpdateAll} disabled={busy || updating !== null}>
                  {updating === '__all__' ? t('plugin.update.updating') : t('plugin.update.all')}
                </button>
              )}
              <button className="dshp-btn" onClick={() => runCheckUpdates(true)} disabled={busy || updating !== null}>
                {busy && updates === null ? t('plugin.update.checking') : t('plugin.update.check')}
              </button>
            </>
          )
        })()}
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

      {renderSection('patch', 'patch', patchOpen, setPatchOpen, q !== '' ? t('list.empty') : t('plugin.inventory.empty'))}
      {renderSection('bundle', 'bundle', bundleOpen, setBundleOpen, q !== '' ? t('list.empty') : t('plugin.inventory.empty'))}
      {renderSection('mcp', 'mcp', mcpOpenSec, setMcpOpenSec, t('mcp.empty'))}

      <div className="dshp-plugin-section dshp-plugin-section-core">
        <button
          className="dshp-plugin-section-head"
          aria-expanded={coreOpen}
          onClick={() => setCoreOpen(o => !o)}
        >
          <span className="dshp-plugin-section-caret">{coreOpen ? '▾' : '▸'}</span>
          <span className="dshp-plugin-section-name">{t('plugin.core.title')}</span>
          <span className="dshp-plugin-section-count">（{visibleCore.length}）</span>
        </button>
        {coreOpen && (
          <div className="dshp-list">
            {visibleCore.length === 0
              ? <div className="dshp-empty">{q !== '' ? t('list.empty') : t('plugin.inventory.empty')}</div>
              : visibleCore.map(p => renderItem(p, `core:${p.id}`))}
          </div>
        )}
      </div>
    </div>
  )
}