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
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionMcpManager } from './mcp-manager.ts'
import { defaultDshHome } from './home.ts'
import { atomicWriteFileSync, readTextFileSync } from './fs.ts'
import { isMcpClientConfig, registryFibers } from './registry.ts'

/** 面板自身包名与行 id（禁止停）。 */
export const PANEL_PACKAGE = '@super_camel/dsh-skill-panel'
export const PANEL_ROW_ID = 'dshp-skill-panel'
/** mcp-client 桥接包名（M3：patch 行/spec 里 name 为该包者不当作插件 patch 行管理）。 */
export const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** 组合行来源：core（bundle / host 核心）| patch（活动 profile 用户插件行）| mcp（mcp-client 桥接）。 */
export type PluginSource = 'core' | 'patch' | 'bundle' | 'mcp'

/** 面板可见的单个组合行视图。 */
export interface PluginFiberView {
  /** 行 id（fiber.name）。 */
  id: string
  source: PluginSource
  /** FiberState 数值。 */
  state: number
  /** 是否 ACTIVE（state === 2）。 */
  active: boolean
  /** 是否禁止操作（core 或面板自身）。 */
  protected: boolean
  /** 是否可启停（patch 行、非面板自身）。 */
  manageable: boolean
  /** 是否面板自身行。 */
  isSelf: boolean
  /** 已迁移挂载方式、但尚未重启（promote：bundle 已摘、待重启写 patch 行；demote：patch 已摘、bundle 已加回待重启）。 */
  pendingRestart?: boolean
  /** 行包名（patch 行有；mcp 行为 mcp-client 包；core 行可能缺）。 */
  packageName?: string
  /** mcp 桥接信息（source==='mcp' 时）。 */
  mcp?: { serverName: string; transport: 'stdio' | 'streamable-http'; connected: boolean }
}

/** 记录在面板状态文件里的用户插件行规格（id → packageName）。 */
export interface UserPluginSpec {
  id: string
  name: string
  /** 挂载来源（patch=热挂载 cordis.patch.yml；bundle=冷挂载 dsh.profile.bundles）。 */
  source?: 'patch' | 'bundle'
  /** 提升待完成：bundle 已从 dsh.profile.bundles 移除，待重启后启用（写 patch 行）。 */
  pendingPromote?: boolean
  /** 降级待完成：patch 行已移除、bundle 已加回，待重启后生效（冷挂载，重启后自动清理）。 */
  pendingDemote?: boolean
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
  | { ok: true; id: string; enabled: boolean; restartRequired?: true }
  | { ok: false; reason: string }

export type PluginInstallResult =
  | { ok: true; id: string }
  | { ok: false; reason: string }

export type PluginPromoteResult =
  | { ok: true; id: string; restartRequired: true }
  | { ok: false; reason: string }

export type PluginDemoteResult =
  | { ok: true; id: string; restartRequired: true }
  | { ok: false; reason: string }

/** 活动 profile 解析失败时退回的默认 profile 名（ADR：当前只管 web profile）。 */
const DEFAULT_PROFILE = 'web'

/**
 * 解析活动 profile 目录：优先「其 cordis.patch.yml 引用了本面板包」的那个 profile
 * （即正在挂载本插件、且面板要管理的组合所在），否则退回 web。
 */
function resolveProfileDir(): string {
  const profilesDir = join(defaultDshHome(), 'profiles')
  if (existsSync(profilesDir)) {
    for (const name of readdirSync(profilesDir)) {
      const patch = join(profilesDir, name, 'cordis.patch.yml')
      if (!existsSync(patch)) continue
      // 读取失败（权限/损坏）返回 undefined，跳过继续找下一个。
      if (readTextFileSync(patch)?.includes(PANEL_PACKAGE)) return join(profilesDir, name)
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

  /** 活动 profile 目录（供日志/调试）。 */
  get profileDirPath(): string {
    return this.profileDir
  }

  // ---- 组合盘点 ----

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

  /** 组合行来源分类（等价于原嵌套三元，拆开更可读）。 */
  private classifySource(isSelf: boolean, inPatch: boolean, isUserBundle: boolean, pendingPromote: boolean): PluginSource {
    if (isSelf || inPatch) return 'patch'
    if (isUserBundle) return 'bundle'
    if (pendingPromote) return 'patch'
    return 'core'
  }

  /**
   * 盘点：registry 所有 Fiber + 活动 profile patch 行规格 + 状态文件里已停用的用户插件
   * 规格，合并为面板视图。source 优先级：mcp > patch > core。
   * @param agent - 可选；用于标注 mcp 桥接行的会话级连接状态。
   */
  list(agent?: Agent): PluginFiberView[] {
    // 重启后收尾：pendingDemote 的规格若已降级生效（fiber 以 bundle 源回归 registry），
    // 先清理标记，让本次视图不再标红（幂等，仅变更时落盘）。
    this.settlePendingDemote()
    const patchRows = this.readPatchRows()
    const patchIds = new Set(patchRows.map(r => String(r.id)))
    const specs = this.readSpecs()
    const bundleNames = this.readBundleNames()
    const userBundleNames = new Set(bundleNames.filter(n => !n.startsWith('@deepseek-ai/')))
    const connected = new Set<string>()
    if (agent !== undefined) {
      for (const n of this.mcp.connectedNames(agent)) connected.add(n)
    }

    const fibers = registryFibers(this.ctx)
    const seenIds = new Set<string>()
    const views: PluginFiberView[] = []
    // M1 修复：给 unnamed fiber 分配唯一展示 id，避免多个无 name 的插件被去重合并成
    // 一个 '(unnamed)' 而静默隐藏其余。它们仍是 core 只读行，仅保证各自可见。
    let unnamedSeq = 0

    for (const fiber of fibers) {
      const hasName = typeof fiber.name === 'string' && fiber.name !== ''
      const rawId = hasName ? fiber.name as string : `(unnamed #${++unnamedSeq})`
      // 面板自身 fiber 的 runtime 名是类名（SkillControlPlugin），展示用行 id（dshp-skill-panel）。
      const isSelfFiber = hasName && rawId === this.selfFiberName()
      const id = isSelfFiber ? (this.selfRowId() ?? rawId) : rawId
      // 全局 MCP 行（home patch 的 mcp-client 桥接）不再作为插件行展示；
      // 改由「新增 MCP」发现，选中后进白名单、以会话 MCP 行出现在列表。
      if (isMcpClientConfig(fiber.config)) continue
      const state = typeof fiber.state === 'number' ? fiber.state : 0
      // 去重：同一插件类在多个 context（host/agent/session）挂载，只保留一个（优先 active）。
      const existing = views.find(v => v.id === id)
      if (existing !== undefined) {
        if (existing.state !== 2 && state === 2) {
          existing.state = 2
          existing.active = true
        }
        continue
      }
      seenIds.add(id)
      const isSelf = this.isSelf(id) || isSelfFiber
      const packageName = patchRows.find(r => String(r.id) === id)?.name
        ?? specs.find(s => s.id === id)?.name
      const isUserBundle = typeof packageName === 'string' && userBundleNames.has(packageName)
      // 提升待完成（bundle 已移除、patch 行待重启后写入）：fiber 仍在 registry 说明冻结 bundle 还在跑。
      const pendingPromote = specs.find(s => s.id === id)?.pendingPromote === true
      // 降级待完成（patch 已移除、bundle 已加回）：重启后 bundle 生效、fiber 以 bundle 源回来。
      const pendingDemote = specs.find(s => s.id === id)?.pendingDemote === true
      const source = this.classifySource(isSelf, patchIds.has(id), isUserBundle, pendingPromote)
      // patch/bundle 行可管理（非面板自身）；core 只读。
      const manageable = (source === 'patch' || source === 'bundle') && !isSelf
      const isProtected = !manageable || isSelf
      // 需重启标记：pendingPromote（bundle 已摘、重启后写 patch 行启用）或 pendingDemote
      // （patch 已摘、bundle 已加回，重启后冷挂载生效）。
      const pendingRestart = (pendingPromote || pendingDemote) && !isSelf

      views.push({
        id,
        source,
        state,
        active: state === 2,
        protected: isProtected,
        manageable,
        isSelf,
        ...(pendingRestart ? { pendingRestart: true } : {}),
        ...(typeof packageName === 'string' ? { packageName } : {}),
      })
    }

    // 白名单（会话 MCP）作为插件行展示：启用=连接、停用=断开（会话级）。
    for (const template of this.mcp.whitelist()) {
      const id = template.name
      if (seenIds.has(id)) continue
      seenIds.add(id)
      const isConnected = connected.has(id)
      views.push({
        id,
        source: 'mcp',
        state: isConnected ? 2 : -1,
        active: isConnected,
        protected: false,
        manageable: true,
        isSelf: false,
        mcp: { serverName: template.name, transport: template.transport, connected: isConnected },
      })
    }

    // 状态文件里记录了、但当前不在 registry 的规格 → 已停用的用户插件（供重新启用）。
    for (const spec of specs) {
      if (seenIds.has(spec.id)) continue
      if (this.isSelf(spec.id)) continue // 面板自身行 id 不当作「已停用」
      // M3 修复：mcp 桥接行规格（name 是 mcp-client 包）不作为插件 patch 行展示。
      // 与 readPatchRows 的过滤对称——旧版本可能把 mcp 行误记为 patch 规格残留。
      if (spec.name === MCP_CLIENT_PACKAGE) continue
      const specSource = spec.source ?? 'patch'
      // pendingDemote 中间态：patch 行已移除（热）、bundle 待重启挂载（冷）——
      // 行在 bundle 生效前一直显示为「需重启」，避免用户以为已丢失。
      const specPendingRestart = spec.pendingDemote === true && specSource === 'bundle'
      views.push({
        id: spec.id,
        source: specSource,
        state: -1,
        active: false,
        protected: false,
        manageable: specSource === 'patch' || specSource === 'bundle',
        isSelf: this.isSelf(spec.id),
        ...(specPendingRestart ? { pendingRestart: true } : {}),
        packageName: spec.name,
      })
    }

    // 稳定排序：活动在前、按 id 字母序。
    return views.sort((a, b) => (a.active === b.active ? a.id.localeCompare(b.id) : a.active ? -1 : 1))
  }

  // ---- patch 行读 / 写 ----

  private readPatchText(): string {
    return readTextFileSync(this.patchFile) ?? ''
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
          if (row !== null && typeof row === 'object' && typeof row.id === 'string') {
            // M3 修复：mcp 桥接行（config 有 serverName/transport）不走插件段 patch 管理——
            // 与 fiber 循环的 isMcpClientConfig → continue 对称。若混入，syncSpecs 会把它
            // 记为 patch 规格、list 的 specs 视图把它当 patch 行 → 启停报"已在 patch 中"。
            // mcp 行由 MCP 段（白名单/发现）管理。
            if (isMcpClientConfig((row as { config?: unknown }).config)) continue
            rows.push(row)
          }
        }
      }
    }
    return rows
  }

  /** 读活动 profile 的 dsh.profile.bundles（package.json），区分核心 bundle 与用户 bundle。 */
  private readBundleNames(): string[] {
    const pkgFile = join(this.profileDir, 'package.json')
    if (!existsSync(pkgFile)) return []
    const text = readTextFileSync(pkgFile)
    if (text === undefined) return []
    try {
      const pkg = JSON.parse(text) as { dsh?: { profile?: { bundles?: unknown } } }
      const bundles = pkg?.dsh?.profile?.bundles
      return Array.isArray(bundles) ? bundles.filter((b): b is string => typeof b === 'string') : []
    } catch {
      return []
    }
  }

  /** 写回 dsh.profile.bundles（package.json）：备份 + 原子写。 */
  private writeBundleNames(bundleNames: string[]): { ok: true } | { ok: false; reason: string } {
    const pkgFile = join(this.profileDir, 'package.json')
    if (!existsSync(pkgFile)) return { ok: false, reason: 'profile package.json not found' }
    const text = readTextFileSync(pkgFile)
    if (text === undefined) return { ok: false, reason: 'profile package.json not readable' }
    try {
      const pkg = JSON.parse(text) as { dsh?: { profile?: { bundles?: unknown } } }
      if (pkg.dsh === undefined) pkg.dsh = {}
      if (pkg.dsh.profile === undefined) pkg.dsh.profile = {}
      pkg.dsh.profile.bundles = bundleNames
      writeFileSync(pkgFile + '.bak', text, 'utf8')
      atomicWriteFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: `write package.json failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  /**
   * 写回 patch 文件：保证用户插件行都在单个 insert 块里。
   * 写保护：备份 + 解析校验 + 原子写。
   *
   * 数据保全（H1 修复）：既有 patch 里的**非面板管理行**必须保留——面板只管理
   * 字符串 id 的行，而 YAML 允许 id 为数字等非字符串值。若整体重建丢这些行，
   * 任意一次启停/安装都会静默删掉用户手工配置。故这里保留既有所有非字符串 id
   * 的行，仅用传入的 rows（面板管理行）重建字符串 id 部分。
   */
  private writePatch(rows: PatchRow[]): { ok: true } | { ok: false; reason: string } {
    const options = this.readPatchOptions()
    // 从所有既有 insert 块收集「非面板管理」的行（id 非字符串）与其它 patch 选项。
    // 面板管理的行（字符串 id）由传入 rows 整体决定；非字符串 id 行必须原样保留。
    const preservedNonManaged: PatchRow[] = []
    const kept: PatchOption[] = []
    for (const opt of options) {
      if (opt !== null && typeof opt === 'object' && Array.isArray(opt.insert)) {
        for (const row of opt.insert) {
          if (row !== null && typeof row === 'object' && typeof row.id !== 'string') {
            preservedNonManaged.push(row)
          }
        }
        continue
      }
      kept.push(opt)
    }
    const nextOptions: PatchOption[] = [{ insert: [...preservedNonManaged, ...rows] }, ...kept]

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
      atomicWriteFileSync(this.patchFile, nextText)
    } catch (error) {
      return { ok: false, reason: `write patch failed: ${error instanceof Error ? error.message : String(error)}` }
    }
    return { ok: true }
  }

  // ---- 用户插件启停 ----

  /** 停用：patch 行从 cordis.patch.yml 移除（热重载）；bundle 行从 dsh.profile.bundles 移除（冷挂载，需重启）；mcp 行断开会话连接。 */
  async disable(id: string, agent?: Agent): Promise<PluginToggleResult> {
    const views = this.list(agent)
    const view = views.find(v => v.id === id)
    if (view === undefined) return { ok: false, reason: `未找到插件行 "${id}"` }
    if (view.isSelf) return { ok: false, reason: '禁止停用面板自身' }
    if (!view.active) return { ok: false, reason: `"${id}" 已处于停用状态` }
    if (view.source === 'mcp') {
      if (agent === undefined) return { ok: false, reason: '缺少会话上下文，无法断开 MCP' }
      const result = this.mcp.disconnect(agent, id)
      if (!result.ok) return { ok: false, reason: result.reason }
      return { ok: true, id, enabled: false }
    }
    if (view.source === 'bundle') {
      const name = view.packageName
      if (typeof name !== 'string' || name === '') return { ok: false, reason: `缺少 "${id}" 的包名，无法移除 bundle` }
      const bundles = this.readBundleNames().filter(n => n !== name)
      const result = this.writeBundleNames(bundles)
      if (!result.ok) return { ok: false, reason: result.reason }
      this.setSpecSource(id, 'bundle')
      return { ok: true, id, enabled: false }
    }
    if (view.source !== 'patch') return { ok: false, reason: `"${id}" 不是活动 profile 的 patch 行，不可在此停用` }

    // M8 修复：先记录被停用行的规格，再从 patch 移除。fixtures 预置的 patch 行
    // 从未进过 specs（install 才写 specs），若先移除再 syncSpecs，readPatchRows 已
    // 读不到它 → specs 为空 → list() 的 specs 视图不显示 → 停用后完全消失。
    // 先记录保证停用后可重新启用（list 的 specs 视图显示为已停用）。
    const preRows = this.readPatchRows()
    const preRow = preRows.find(r => String(r.id) === id)
    if (preRow !== undefined && typeof preRow.name === 'string' && preRow.name !== '') {
      const specs = this.readSpecs()
      if (!specs.some(s => s.id === id)) {
        specs.push({ id, name: preRow.name, source: 'patch' })
        this.persistSpecs(specs)
      }
    }
    const rows = preRows.filter(r => String(r.id) !== id)
    const result = this.writePatch(rows)
    if (!result.ok) return { ok: false, reason: result.reason }
    // M2 修复：patch 行也可能同时挂在 dsh.profile.bundles（如 reconcile 自动加回的双挂载）。
    // 停用应"原子"撤两处，否则 bundle 残留会让插件重启后仍在跑、UI 却显示已停用。
    // bundle 移除是冷挂载，需重启才完全生效，故标注 restartRequired。
    let removedBundle = false
    const packageName = view.packageName
    if (typeof packageName === 'string' && this.readBundleNames().includes(packageName)) {
      const bundles = this.readBundleNames().filter(n => n !== packageName)
      const rmResult = this.writeBundleNames(bundles)
      if (!rmResult.ok) return { ok: false, reason: rmResult.reason }
      removedBundle = true
    }
    this.syncSpecs()
    return { ok: true, id, enabled: false, ...(removedBundle ? { restartRequired: true as const } : {}) }
  }

  /** 启用：patch 行加回 cordis.patch.yml（热重载）；bundle 行加回 dsh.profile.bundles（冷挂载，需重启）；mcp 行连接会话。 */
  async enable(id: string, agent?: Agent): Promise<PluginToggleResult> {
    const views = this.list(agent)
    const view = views.find(v => v.id === id)
    if (view === undefined) return { ok: false, reason: `未找到插件行 "${id}"` }
    if (view.active) return { ok: false, reason: `"${id}" 已处于运行状态` }
    if (view.source === 'mcp') {
      if (agent === undefined) return { ok: false, reason: '缺少会话上下文，无法连接 MCP' }
      const result = await this.mcp.connect(agent, id)
      if (!result.ok) return { ok: false, reason: result.reason }
      return { ok: true, id, enabled: true }
    }
    const name = view.packageName
    if (typeof name !== 'string' || name === '') {
      return { ok: false, reason: `缺少 "${id}" 的包名，无法重建（请在状态文件/手动补 name）` }
    }
    if (view.source === 'bundle') {
      const bundles = this.readBundleNames()
      if (bundles.includes(name)) return { ok: false, reason: `"${name}" 已在 bundles 中` }
      bundles.push(name)
      const result = this.writeBundleNames(bundles)
      if (!result.ok) return { ok: false, reason: result.reason }
      return { ok: true, id, enabled: true }
    }
    // 防重复挂载：若该包被 `dsh plugin` 的 reconcile 重新加回了 bundles，先移除，
    // 否则下次启动会因 bundle + patch 同 id 而 duplicate entry id 崩溃。
    const bundles = this.readBundleNames()
    if (bundles.includes(name)) {
      const rmResult = this.writeBundleNames(bundles.filter(n => n !== name))
      if (!rmResult.ok) return { ok: false, reason: rmResult.reason }
    }
    const rows = this.readPatchRows()
    if (rows.some(r => String(r.id) === id)) return { ok: false, reason: `"${id}" 已在 patch 中` }
    rows.push({ id, name })
    const result = this.writePatch(rows)
    if (!result.ok) return { ok: false, reason: result.reason }
    this.syncSpecs()
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
    this.syncSpecs()
    return { ok: true, id: id.trim() }
  }

  // ---- bundle → patch 提升（冷迁移，需重启一次） ----

  /**
   * 把 bundle 行提升为 patch 行（热插拔）：从 dsh.profile.bundles 移除（冷），记录为
   * patch 规格（pendingPromote）。重启后该行显示为「已停用」的 patch 插件，用户点「启用」
   * 即写回 cordis.patch.yml（此时冻结 bundle 已消失，写 patch 行不会重复挂载），此后免重启启停。
   */
  promoteToPatch(id: string): PluginPromoteResult {
    const views = this.list()
    const view = views.find(v => v.id === id)
    if (view === undefined) return { ok: false, reason: `未找到插件行 "${id}"` }
    if (view.isSelf) return { ok: false, reason: '禁止对面板自身执行提升' }
    if (view.source !== 'bundle') return { ok: false, reason: `"${id}" 不是 bundle 行，无需提升` }
    const name = view.packageName
    if (typeof name !== 'string' || name === '') return { ok: false, reason: `缺少 "${id}" 的包名，无法提升` }
    // 从 bundles 移除（冷挂载，重启后生效）。
    const bundles = this.readBundleNames().filter(n => n !== name)
    const rmResult = this.writeBundleNames(bundles)
    if (!rmResult.ok) return { ok: false, reason: rmResult.reason }
    // 重写目标包：去掉 dsh.bundle 声明，使 DSH 不再把它当 bundle（reconcile 不再加回 bundles）。
    const rewrite = this.rewriteBundleToPatch(name)
    if (!rewrite.ok) return { ok: false, reason: rewrite.reason }
    // 记录为 patch 规格（待重启后启用）。
    const specs = this.readSpecs()
    const spec = specs.find(s => s.id === id)
    if (spec === undefined) {
      specs.push({ id, name, source: 'patch', pendingPromote: true })
    } else {
      spec.source = 'patch'
      spec.pendingPromote = true
    }
    this.persistSpecs(specs)
    return { ok: true, id, restartRequired: true }
  }

  // ---- patch → bundle 降级（热 → 冷挂载，需重启一次） ----

  /**
   * 把 patch 行降级回 bundle（冷挂载）：从 cordis.patch.yml 移除行（热，fiber 立即卸载），
   * 包名加回 dsh.profile.bundles（冷，重启后挂载），并恢复包的 `dsh.bundle` 声明
   * （promote 时删除过；不恢复则 DSH reconcile 会把该包移出 bundles，降级无效）。
   * 记录为 bundle 规格（pendingDemote），重启后 settlePendingDemote 自动清理标记。
   */
  demoteToBundle(id: string): PluginDemoteResult {
    const views = this.list()
    const view = views.find(v => v.id === id)
    if (view === undefined) return { ok: false, reason: `未找到插件行 "${id}"` }
    if (view.isSelf) return { ok: false, reason: '禁止对面板自身执行降级' }
    if (view.source !== 'patch') return { ok: false, reason: `"${id}" 不是 patch 行，无需降级` }
    const name = view.packageName
    if (typeof name !== 'string' || name === '') return { ok: false, reason: `缺少 "${id}" 的包名，无法降级` }
    // 先做可恢复性校验（不写任何文件）：包必须有可加载的 bundle 声明来源
    // （已有声明 / .bak 备份 / 包内真实 patch 文件），否则 DSH 重启 fail loud。
    // 校验通过才能动 patch 行与 bundles，避免半途失败留下不一致态。
    const probe = this.probeBundleDeclaration(name)
    if (!probe.ok) return probe
    // 移除 patch 行（热，fiber 立即卸载）。
    const rows = this.readPatchRows()
    const filtered = rows.filter(r => String(r.id) !== id)
    const rmResult = this.writePatch(filtered)
    if (!rmResult.ok) return { ok: false, reason: rmResult.reason }
    // 包名加回 bundles（冷挂载，重启后生效）。
    const bundles = this.readBundleNames()
    if (!bundles.includes(name)) {
      bundles.push(name)
      const addResult = this.writeBundleNames(bundles)
      if (!addResult.ok) return { ok: false, reason: addResult.reason }
    }
    // 恢复 dsh.bundle 声明（probe 已保证可恢复）。
    const restore = this.restoreBundleDeclaration(name, probe.declaration)
    if (!restore.ok) return { ok: false, reason: restore.reason }
    // 记录为 bundle 规格 + 待重启（pendingDemote）。
    const specs = this.readSpecs()
    const spec = specs.find(s => s.id === id)
    if (spec === undefined) {
      specs.push({ id, name, source: 'bundle', pendingDemote: true })
    } else {
      spec.source = 'bundle'
      spec.pendingDemote = true
      delete spec.pendingPromote
    }
    this.persistSpecs(specs)
    return { ok: true, id, restartRequired: true }
  }

  /**
   * 探测包作为 bundle 层加载的可行性（只读，不写文件）：
   * 返回可用的 `dsh.bundle` 声明值（restore 时写入），或拒绝原因。
   * 来源优先级：现有声明 > .bak 备份（promote 前原始声明）> 包内真实 patch 文件探测。
   */
  private probeBundleDeclaration(packageName: string): { ok: true; declaration: unknown } | { ok: false; reason: string } {
    const pkgFile = join(this.profileDir, 'node_modules', packageName, 'package.json')
    if (!existsSync(pkgFile)) return { ok: false, reason: `找不到 "${packageName}" 的 package.json` }
    const text = readTextFileSync(pkgFile)
    if (text === undefined) return { ok: false, reason: `找不到 "${packageName}" 的 package.json` }
    try {
      const pkg = JSON.parse(text) as { dsh?: { bundle?: unknown; [k: string]: unknown } }
      if (pkg.dsh?.bundle !== undefined) return { ok: true, declaration: pkg.dsh.bundle }
      const bakFile = pkgFile + '.bak'
      if (existsSync(bakFile)) {
        const bakText = readTextFileSync(bakFile)
        if (bakText !== undefined) {
          try {
            const bakBundle = (JSON.parse(bakText) as { dsh?: { bundle?: unknown } })?.dsh?.bundle
            if (bakBundle !== undefined) return { ok: true, declaration: bakBundle }
          } catch { /* fall through to patch-file probe */ }
        }
      }
      const manifestDir = dirname(pkgFile)
      for (const candidate of ['cordis.patch.yml', 'cordis.patch.yaml', 'patch.yml', 'patch.yaml']) {
        if (existsSync(join(manifestDir, candidate))) {
          return { ok: true, declaration: { patch: `./${candidate}` } }
        }
      }
      return { ok: false, reason: `"${packageName}" 无 dsh.bundle 声明、无 .bak 备份、包内也没有可加载的 patch 文件——无法作为 bundle 层，降级被拒` }
    } catch (error) {
      return { ok: false, reason: `probe ${packageName} failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  /**
   * 把 probeBundleDeclaration 探测到的声明写入包的 package.json。
   * 不覆盖 .bak：promote 前（含声明）的原始 manifest 保留，供再次 promote 复用。
   */
  private restoreBundleDeclaration(packageName: string, declaration: unknown): { ok: true } | { ok: false; reason: string } {
    const pkgFile = join(this.profileDir, 'node_modules', packageName, 'package.json')
    if (!existsSync(pkgFile)) return { ok: false, reason: `找不到 "${packageName}" 的 package.json` }
    const text = readTextFileSync(pkgFile)
    if (text === undefined) return { ok: false, reason: `找不到 "${packageName}" 的 package.json` }
    try {
      const pkg = JSON.parse(text) as { dsh?: { bundle?: unknown; [k: string]: unknown } }
      if (pkg.dsh?.bundle !== undefined) return { ok: true } // 已有声明，no-op
      if (pkg.dsh === undefined) pkg.dsh = {}
      pkg.dsh.bundle = declaration
      atomicWriteFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: `restore ${packageName} failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  /**
   * 重启后收尾（list() 开头调用，幂等）：pendingDemote 的规格若已降级生效——fiber 以
   * bundle 源回归 registry（patch 行已无该 id、包已在 bundles、且该 fiber 的包名属于
   * 用户 bundle）——则清理 pendingDemote 标记，本次视图不再标红。否则保留：
   * patch 行残留（又被手动加回）或 bundle 未生效时，标记在 specs 视图持续显示「需重启」。
   */
  private settlePendingDemote(): void {
    const specs = this.readSpecs()
    if (!specs.some(s => s.pendingDemote === true)) return
    const patchRows = this.readPatchRows()
    const patchIds = new Set(patchRows.map(r => String(r.id)))
    const bundleNames = this.readBundleNames()
    const userBundleNames = new Set(bundleNames.filter(n => !n.startsWith('@deepseek-ai/')))
    // registry 中「包名属于用户 bundle」的 fiber id（降级生效的判据）。
    const regressedBundleIds = new Set<string>()
    for (const fiber of registryFibers(this.ctx)) {
      const id = typeof fiber.name === 'string' && fiber.name !== '' ? fiber.name : undefined
      if (id === undefined) continue
      const pkg = patchRows.find(r => String(r.id) === id)?.name
        ?? specs.find(s => s.id === id)?.name
      if (typeof pkg === 'string' && userBundleNames.has(pkg)) regressedBundleIds.add(id)
    }
    let changed = false
    for (const spec of specs) {
      if (spec.pendingDemote !== true) continue
      const inPatch = patchIds.has(spec.id)
      const inBundles = bundleNames.includes(spec.name)
      const regressed = regressedBundleIds.has(spec.id)
      if (!inPatch && inBundles && regressed) {
        delete spec.pendingDemote
        changed = true
      }
    }
    if (changed) this.persistSpecs(specs)
  }

  /**
   * 重写目标 bundle 包的 package.json：去掉 `dsh.bundle` 声明（备份到 .bak），使 DSH 的
   * `dsh plugin` reconcile 不再把它当 bundle 加回 dsh.profile.bundles。这是「就地 fork」——
   * 修改 node_modules 里的包，`pnpm update`/`dsh plugin update` 会覆盖它（需重新提升）。
   */
  private rewriteBundleToPatch(packageName: string): { ok: true } | { ok: false; reason: string } {
    const pkgFile = join(this.profileDir, 'node_modules', packageName, 'package.json')
    if (!existsSync(pkgFile)) return { ok: false, reason: `找不到 "${packageName}" 的 package.json` }
    const text = readTextFileSync(pkgFile)
    if (text === undefined) return { ok: false, reason: `找不到 "${packageName}" 的 package.json` }
    try {
      const pkg = JSON.parse(text) as { dsh?: { bundle?: unknown; [k: string]: unknown } }
      if (pkg.dsh?.bundle === undefined) return { ok: true } // 已无 bundle 声明，no-op
      writeFileSync(pkgFile + '.bak', text, 'utf8')
      delete pkg.dsh.bundle
      if (Object.keys(pkg.dsh).length === 0) delete pkg.dsh
      atomicWriteFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: `rewrite ${packageName} failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  // ---- 状态文件（跨会话记住用户插件行规格） ----

  private readSpecs(): UserPluginSpec[] {
    if (!existsSync(this.stateFile)) return []
    const text = readTextFileSync(this.stateFile)
    if (text === undefined) return []
    try {
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
      atomicWriteFileSync(this.stateFile, JSON.stringify({ plugins: specs }, null, 2))
    } catch {
      // 状态文件写失败不阻断启停（只是跨会话还原失效）。
    }
  }

  /** 把当前 patch 行规格并入状态文件（并集，不删除已停用的，保证停用后可还原）。 */
  private syncSpecs(): void {
    const rows = this.readPatchRows()
    const map = new Map<string, UserPluginSpec>()
    // M3 修复：读入时跳过 mcp 桥接行规格（旧版本可能误记残留），一并清理。
    for (const spec of this.readSpecs()) {
      if (spec.name === MCP_CLIENT_PACKAGE) continue
      map.set(spec.id, spec)
    }
    for (const r of rows) {
      if (typeof r.id !== 'string' || typeof r.name !== 'string' || r.name === '') continue
      map.set(r.id, { id: r.id, name: r.name, source: 'patch' })
    }
    this.persistSpecs([...map.values()])
  }

  /** 更新某规格的挂载来源（bundle 停用时记录，供重新启用走对路径）。 */
  private setSpecSource(id: string, source: 'patch' | 'bundle'): void {
    const specs = this.readSpecs()
    const spec = specs.find(s => s.id === id)
    if (spec === undefined) return
    spec.source = source
    this.persistSpecs(specs)
  }
}
