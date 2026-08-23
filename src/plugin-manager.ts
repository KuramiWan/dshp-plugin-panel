/**
 * 插件管理核心（ADR-0008）：宿主组合层（进程级）管理，并入 MCP。
 *
 * 领域模型：插件 = 宿主组合层的总概念——所有组合行（DSH 核心 / 用户插件 / MCP 桥接）。
 * skill 与 MCP 是插件的能力子类；本页签管理进程级组合行，技能页签管理会话级文档能力。
 *
 * 范围（进程级，热挂载）：
 * - 盘点：从 `ctx.registry` 拍平所有已加载 Fiber（与 mcp-manager 同款遍历），结合活动
 *   profile 的 `cordis.patch.yml`，标注来源（core / patch / mcp）与运行状态（FiberState）。
 * - 启停：写活动 profile 的 `cordis.patch.yml` `- insert:` 行 → DSH 对该文件设 watcher
 *   （`watchUserPatches`），改即实时重组、免重启（profile-boot.ts 的 composeLive 热路径）。
 * - 保护：核心内置（bundle / host 服务）只读不可停；**禁止停面板自身**；写前备份 + 校验
 *   YAML + 原子写 + 失败回滚（热重载写坏会中断宿主）。
 * - MCP 折叠：MCP 桥接行在插件页里是带会话连接动作的普通插件行；会话级连接/断开/白名单/
 *   检查复用 SessionMcpManager（本类只做组合行盘点与 patch 行启停，不复制其逻辑）。
 *
 * 写保护约定：
 * - 只改活动 profile 的 `cordis.patch.yml`（当前只管 web profile，ADR-0008 Consequences）。
 * - 备份到 `<profileDir>/.dshp-cordis.patch.yml.bak`（固定一份，覆盖式），写坏可手工还原。
 * - 写前用 js-yaml 解析校验新内容必须是「顶层数组、可含 insert 块」，失败则不落盘。
 * - 原子写：先写临时文件再 rename 覆盖，避免半截文件被 watcher 读到。
 *
 * 状态文件：`<profileDir>/.dshp-plugins.json`，记录面板管理过的用户插件行规格
 * （{id,name}），使「停用后再启用」能跨会话还原（与 mcp-manager 白名单文件同模式）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionMcpManager } from './mcp-manager.ts'

/** 面板自身包名与行 id（禁止停）。 */
export const PANEL_PACKAGE = '@super_camel/dsh-skill-panel'
export const PANEL_ROW_ID = 'dshp-skill-panel'

/** FiberState 中文标签（Cordis：PENDING=0 LOADING=1 ACTIVE=2 FAILED=3 DISPOSED=4 UNLOADING=5）。 */
export const FIBER_LABELS = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'] as const

/** 组合行来源：core（bundle / host 核心）| patch（活动 profile 用户插件行）| mcp（mcp-client 桥接）。 */
export type PluginSource = 'core' | 'patch' | 'mcp'

/** 面板可见的单个组合行视图。 */
export interface PluginFiberView {
  /** 行 id（fiber.name）。 */
  id: string
  source: PluginSource
  /** FiberState 数值。 */
  state: number
  /** FiberState 中文标签。 */
  stateLabel: string
  /** 是否 ACTIVE（state === 2）。 */
  active: boolean
  /** 是否禁止操作（core 或面板自身）。 */
  protected: boolean
  /** 是否可启停（patch 行、非面板自身）。 */
  manageable: boolean
  /** 是否面板自身行。 */
  isSelf: boolean
  /** 行包名（patch 行有；mcp 行为 mcp-client 包；core 行可能缺）。 */
  packageName?: string
  /** mcp 桥接信息（source==='mcp' 时）。 */
  mcp?: { serverName: string; transport: 'stdio' | 'streamable-http'; connected: boolean }
}

/** 记录在面板状态文件里的用户插件行规格（id → packageName）。 */
export interface UserPluginSpec {
  id: string
  name: string
}

/** patch 行（cordis.patch.yml `- insert:` 下的条目）。 */
interface PatchRow {
  id?: unknown
  name?: unknown
  config?: unknown
}

/** 顶层 patch 选项（一个 `- ...` 项）；可能是 insert 块或其它形式。 */
interface PatchOption {
  insert?: PatchRow[]
  [key: string]: unknown
}

export type PluginToggleResult =
  | { ok: true; id: string; enabled: boolean }
  | { ok: false; reason: string }

export type PluginInstallResult =
  | { ok: true; id: string }
  | { ok: false; reason: string }

/** 活动 profile 解析失败时退回的默认 profile 名（ADR：当前只管 web profile）。 */
const DEFAULT_PROFILE = 'web'

/**
 * 解析活动 profile 目录：优先「其 cordis.patch.yml 引用了本面板包」的那个 profile
 * （即正在挂载本插件、且面板要管理的组合所在），否则退回 web。
 */
function resolveProfileDir(): string {
  const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '.', '.dsh')
  const profilesDir = join(home, 'profiles')
  if (existsSync(profilesDir)) {
    for (const name of readdirSync(profilesDir)) {
      const patch = join(profilesDir, name, 'cordis.patch.yml')
      if (!existsSync(patch)) continue
      try {
        if (readFileSync(patch, 'utf8').includes(PANEL_PACKAGE)) return join(profilesDir, name)
      } catch {
        // 读取失败（权限/损坏）则跳过，继续找下一个。
      }
    }
  }
  return join(profilesDir, DEFAULT_PROFILE)
}

export class PluginManager {
  private readonly ctx: Context
  private readonly profileDir: string
  private readonly patchFile: string
  private readonly stateFile: string
  private readonly mcp: SessionMcpManager

  constructor(ctx: Context, mcp: SessionMcpManager, profileDir?: string) {
    this.ctx = ctx
    this.profileDir = profileDir ?? resolveProfileDir()
    this.patchFile = join(this.profileDir, 'cordis.patch.yml')
    this.stateFile = join(this.profileDir, '.dshp-plugins.json')
    this.mcp = mcp
  }

  // ---- 组合盘点 ----

  private registryFibers(): { name?: unknown; state?: number; config?: unknown }[] {
    const registry = this.ctx.registry as unknown as Map<unknown, { fibers?: { name?: unknown; state?: number; config?: unknown }[] }>
    const out: { name?: unknown; state?: number; config?: unknown }[] = []
    for (const runtime of registry.values()) {
      for (const fiber of runtime.fibers ?? []) out.push(fiber)
    }
    return out
  }

  /** mcp-client 桥接识别：config 带 serverName + transport。 */
  private isMcpClientConfig(config: unknown): config is { serverName: string; transport: 'stdio' | 'streamable-http' } {
    const c = config as Record<string, unknown> | undefined
    return typeof c?.serverName === 'string' && c.serverName !== ''
      && (c.transport === 'stdio' || c.transport === 'streamable-http')
  }

  /** 面板自身 fiber 的 runtime 名（fiber.name 是插件类名，如 SkillControlPlugin）。 */
  private selfFiberName(): string | undefined {
    const name = (this.ctx.fiber as unknown as { name?: unknown })?.name
    return typeof name === 'string' && name !== '' ? name : undefined
  }

  /** 面板自身 patch 行的 id（fiber.entry.id，如 dshp-skill-panel）。 */
  private selfRowId(): string | undefined {
    const id = (this.ctx.fiber as unknown as { entry?: { id?: unknown } })?.entry?.id
    return typeof id === 'string' && id !== '' ? id : undefined
  }

  /** 面板自身的所有身份标识（fiber 名 / 行 id / 包名），用于 isSelf 与去重。 */
  private selfNames(): Set<string> {
    const names = new Set<string>([PANEL_ROW_ID, PANEL_PACKAGE])
    const fiberName = this.selfFiberName()
    if (fiberName !== undefined) names.add(fiberName)
    const rowId = this.selfRowId()
    if (rowId !== undefined) names.add(rowId)
    return names
  }

  private isSelf(id: string): boolean {
    return this.selfNames().has(id)
  }

  /**
   * 盘点：registry 所有 Fiber + 活动 profile patch 行规格 + 状态文件里已停用的用户插件
   * 规格，合并为面板视图。source 优先级：mcp > patch > core。
   * @param agent - 可选；用于标注 mcp 桥接行的会话级连接状态。
   */
  list(agent?: Agent): PluginFiberView[] {
    this.syncSpecs()
    const patchRows = this.readPatchRows()
    const patchIds = new Set(patchRows.map(r => String(r.id)))
    const specs = this.readSpecs()
    const connected = new Set<string>()
    if (agent !== undefined) {
      for (const n of this.mcp.connectedNames(agent)) connected.add(n)
    }

    const fibers = this.registryFibers()
    const seenIds = new Set<string>()
    const views: PluginFiberView[] = []

    for (const fiber of fibers) {
      const rawId = typeof fiber.name === 'string' && fiber.name !== '' ? fiber.name : '(unnamed)'
      // 面板自身 fiber 的 runtime 名是类名（SkillControlPlugin），展示用行 id（dshp-skill-panel）。
      const isSelfFiber = rawId === this.selfFiberName()
      const id = isSelfFiber ? (this.selfRowId() ?? rawId) : rawId
      seenIds.add(id)
      const state = typeof fiber.state === 'number' ? fiber.state : 0
      const stateLabel = FIBER_LABELS[state] ?? `state:${state}`
      const isMcp = this.isMcpClientConfig(fiber.config)
      const isSelf = this.isSelf(id) || isSelfFiber
      const source: PluginSource = isSelf ? 'patch' : (isMcp ? 'mcp' : (patchIds.has(id) ? 'patch' : 'core'))
      // patch 行可管理（非面板自身）；core/mcp 组合行不可在此启停（core 只读；mcp 走会话连接）。
      const manageable = source === 'patch' && !isSelf
      const protected_ = !manageable || isSelf

      let serverName: string | undefined
      let transport: 'stdio' | 'streamable-http' | undefined
      if (isMcp) {
        const cfg = fiber.config as { serverName: string; transport: 'stdio' | 'streamable-http' }
        serverName = cfg.serverName
        transport = cfg.transport
      }
      const packageName = patchRows.find(r => String(r.id) === id)?.name

      views.push({
        id,
        source,
        state,
        stateLabel,
        active: state === 2,
        protected: protected_,
        manageable,
        isSelf,
        ...(typeof packageName === 'string' ? { packageName } : {}),
        ...(isMcp && serverName !== undefined && transport !== undefined
          ? { mcp: { serverName, transport, connected: connected.has(serverName) } }
          : {}),
      })
    }

    // 状态文件里记录了、但当前不在 registry 的规格 → 已停用的用户插件（供重新启用）。
    for (const spec of specs) {
      if (seenIds.has(spec.id)) continue
      if (this.isSelf(spec.id)) continue // 面板自身行 id 不当作「已停用」
      views.push({
        id: spec.id,
        source: 'patch',
        state: -1,
        stateLabel: 'stopped',
        active: false,
        protected: false,
        manageable: true,
        isSelf: this.isSelf(spec.id),
        packageName: spec.name,
      })
    }

    // 稳定排序：活动在前、按 id 字母序。
    return views.sort((a, b) => (a.active === b.active ? a.id.localeCompare(b.id) : a.active ? -1 : 1))
  }

  // ---- patch 行读 / 写 ----

  private readPatchText(): string {
    if (!existsSync(this.patchFile)) return ''
    return readFileSync(this.patchFile, 'utf8').replace(/^\uFEFF/, '')
  }

  /** 解析 patch 文件为顶层 PatchOption[]（非法/空 → 空数组）。 */
  private readPatchOptions(): PatchOption[] {
    const text = this.readPatchText()
    if (text.trim() === '') return []
    try {
      const parsed = parseYaml(text) as unknown
      if (parsed === null || parsed === undefined) return []
      if (Array.isArray(parsed)) return parsed as PatchOption[]
      return []
    } catch {
      return []
    }
  }

  /** 从所有 insert 块里汇总 patch 行。 */
  private readPatchRows(): PatchRow[] {
    const rows: PatchRow[] = []
    for (const opt of this.readPatchOptions()) {
      if (opt !== null && typeof opt === 'object' && Array.isArray(opt.insert)) {
        for (const row of opt.insert) {
          if (row !== null && typeof row === 'object' && typeof row.id === 'string') rows.push(row)
        }
      }
    }
    return rows
  }

  /**
   * 写回 patch 文件：保证用户插件行都在单个 insert 块里。
   * 写保护：备份 + 解析校验 + 原子写。
   */
  private writePatch(rows: PatchRow[]): { ok: true } | { ok: false; reason: string } {
    let options = this.readPatchOptions()
    // 从所有 insert 块收集现有非「面板管理行」的其它 patch 选项/行，避免丢用户手工内容。
    // 简化：保留所有既有 option；把用户插件行统一重写到第一个（或新增）insert 块。
    const kept: PatchOption[] = []
    let hasInsert = false
    for (const opt of options) {
      if (opt !== null && typeof opt === 'object' && Array.isArray(opt.insert)) {
        // 丢弃旧 insert 块（用户插件行由 rows 整体重写）；其它 insert 块（如 home 场景）——
        // 这里只管理活动 profile 文件，其 insert 即用户插件行，故整体重建。
        hasInsert = true
        continue
      }
      kept.push(opt)
    }
    const insertOption: PatchOption = { insert: rows }
    const nextOptions: PatchOption[] = hasInsert
      ? [insertOption, ...kept]
      : [insertOption, ...kept]

    let nextText: string
    try {
      nextText = stringifyYaml(nextOptions, { noRefs: true, lineWidth: 120 })
    } catch (error) {
      return { ok: false, reason: `serialize patch failed: ${error instanceof Error ? error.message : String(error)}` }
    }

    // 校验：新内容必须能解析回一个数组。
    try {
      const reparsed = parseYaml(nextText)
      if (!Array.isArray(reparsed)) return { ok: false, reason: 'generated patch is not a top-level array' }
    } catch (error) {
      return { ok: false, reason: `generated patch failed to parse: ${error instanceof Error ? error.message : String(error)}` }
    }

    // 备份 + 原子写。
    try {
      if (existsSync(this.patchFile)) {
        writeFileSync(this.patchFile + '.bak', this.readPatchText(), 'utf8')
      }
      const tmp = this.patchFile + '.tmp'
      writeFileSync(tmp, nextText, 'utf8')
      renameSync(tmp, this.patchFile)
    } catch (error) {
      return { ok: false, reason: `write patch failed: ${error instanceof Error ? error.message : String(error)}` }
    }
    return { ok: true }
  }

  // ---- 用户插件启停 ----

  /** 停用：从 patch 移除 insert 行 → 热重载卸载该插件。 */
  disable(id: string): PluginToggleResult {
    const views = this.list()
    const view = views.find(v => v.id === id)
    if (view === undefined) return { ok: false, reason: `未找到插件行 "${id}"` }
    if (view.isSelf) return { ok: false, reason: '禁止停用面板自身' }
    if (view.source !== 'patch') return { ok: false, reason: `"${id}" 不是活动 profile 的 patch 行，不可在此停用（bundle 走冷挂载，需改 package.json 后重启）` }
    if (!view.active) return { ok: false, reason: `"${id}" 已处于停用状态` }

    const rows = this.readPatchRows().filter(r => String(r.id) !== id)
    const result = this.writePatch(rows)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, id, enabled: false }
  }

  /** 启用：把记录/已知规格的 insert 行加回 patch → 热重载挂载。 */
  enable(id: string): PluginToggleResult {
    const views = this.list()
    const view = views.find(v => v.id === id)
    if (view === undefined) return { ok: false, reason: `未找到插件行 "${id}"` }
    if (view.active) return { ok: false, reason: `"${id}" 已处于运行状态` }
    const name = view.packageName
    if (typeof name !== 'string' || name === '') {
      return { ok: false, reason: `缺少 "${id}" 的包名，无法重建 insert 行（请在状态文件/手动补 name）` }
    }
    const rows = this.readPatchRows()
    if (rows.some(r => String(r.id) === id)) return { ok: false, reason: `"${id}" 已在 patch 中` }
    rows.push({ id, name })
    const result = this.writePatch(rows)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, id, enabled: true }
  }

  /** 新增/启用一个用户插件：写一条 insert 行（id + 包名）。 */
  install(id: string, name: string): PluginInstallResult {
    if (typeof id !== 'string' || id.trim() === '' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return { ok: false, reason: 'id 需为 1-64 位 [A-Za-z0-9_-]' }
    }
    if (typeof name !== 'string' || name.trim() === '') {
      return { ok: false, reason: 'name（包名）不能为空' }
    }
    if (this.isSelf(id)) return { ok: false, reason: '禁止对面板自身执行安装' }
    const rows = this.readPatchRows()
    if (rows.some(r => String(r.id) === id)) return { ok: false, reason: `"${id}" 已在 patch 中` }
    rows.push({ id: id.trim(), name: name.trim() })
    const result = this.writePatch(rows)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, id: id.trim() }
  }

  // ---- 状态文件（跨会话记住用户插件行规格） ----

  private readSpecs(): UserPluginSpec[] {
    if (!existsSync(this.stateFile)) return []
    try {
      const text = readFileSync(this.stateFile, 'utf8').replace(/^\uFEFF/, '')
      const data = JSON.parse(text) as { plugins?: unknown }
      const list = Array.isArray(data?.plugins) ? data.plugins : []
      return list.filter((s): s is UserPluginSpec => {
        const p = s as UserPluginSpec
        return typeof p?.id === 'string' && typeof p?.name === 'string'
      })
    } catch {
      return []
    }
  }

  private persistSpecs(specs: UserPluginSpec[]): void {
    try {
      mkdirSync(dirname(this.stateFile), { recursive: true })
      writeFileSync(this.stateFile, JSON.stringify({ plugins: specs }, null, 2), 'utf8')
    } catch {
      // 状态文件写失败不阻断启停（只是跨会话还原失效）。
    }
  }

  /** 把当前 patch 行规格并入状态文件（并集，不删除已停用的，保证停用后可还原）。 */
  private syncSpecs(): void {
    const rows = this.readPatchRows()
    const map = new Map<string, UserPluginSpec>()
    for (const spec of this.readSpecs()) map.set(spec.id, spec)
    for (const r of rows) {
      if (typeof r.id !== 'string' || typeof r.name !== 'string' || r.name === '') continue
      map.set(r.id, { id: r.id, name: r.name })
    }
    this.persistSpecs([...map.values()])
  }
}
