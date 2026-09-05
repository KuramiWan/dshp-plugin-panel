/**
 * 更新功能的纯逻辑层（无 IO，可单测）：
 * - 依赖声明分类：semver range（可更新）/ 非 range（file/github/link 等，只展示差异不执行）。
 * - 版本判定：`pnpm outdated --format json` 输出的解析 + range 内 / 跨 major 分级。
 * - major 解析：把 `latest` 与 `current`（或 `wanted`）比较，跨 major 需额外确认。
 *
 * 执行引擎（IO）在 PluginManager，本文件保持零副作用，方便 node:test 直接覆盖。
 */
import { join } from 'node:path'

/** 依赖声明是否是可被 pnpm 更新的 semver range（^x.y.z / ~x.y.z / x.y.z / >=x <y …）。 */
export function isSemverRange(spec: string): boolean {
  const trimmed = spec.trim()
  if (trimmed === '') return false
  // 显式非 registry 来源一律不可更新（file:/link:/workspace:/portal:/github:/git: 等）。
  if (/^(file|link|workspace|portal|github|git|http|https):/.test(trimmed)) return false
  // 目录/相对路径。
  if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.startsWith('~/')) return false
  // 其余应至少能以版本号/range 运算符开头（tag 如 'latest'/'next' 保守视为不可更新，
  // 语义浮动；与 DSH 安装的实际 spec 形式 —— semver range —— 匹配）。
  return /^(\^|~|>=|<=|>|<|\*|x|v)?\s*[0-9]/.test(trimmed) || /^\*$/.test(trimmed)
}

/** 从 semver 串解析出 major 段；失败返回 undefined。'v1.2.3' / '1.2.3-beta' 均接受。 */
export function parseMajor(version: string): number | undefined {
  const m = version.trim().match(/^v?(\d+)\./)
  return m === null ? undefined : Number(m[1])
}

/** 两个版本串的 major 是否不同（任一不可解析 → 视为相同，避免误报跨 major）。 */
export function isMajorBump(current: string | undefined, latest: string | undefined): boolean {
  if (current === undefined || latest === undefined) return false
  const a = parseMajor(current)
  const b = parseMajor(latest)
  if (a === undefined || b === undefined) return false
  return a !== b
}

/**
 * `pnpm outdated --format json` 输出 → 扁平列表。
 * 输出形如 { "<pkg>": { current, wanted, latest, isDeprecated, dependencyType } }。
 */
export interface OutdatedEntry {
  name: string
  /** 已安装版本（磁盘 package.json 解析）；可能缺失。 */
  current?: string
  /** range 允许的最新（pnpm wanted）。 */
  wanted?: string
  /** registry 最新。 */
  latest?: string
}

export function parseOutdatedJson(text: string): OutdatedEntry[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []
  const entries: OutdatedEntry[] = []
  for (const [name, raw] of Object.entries(data as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object') continue
    const rec = raw as { current?: unknown; wanted?: unknown; latest?: unknown }
    const entry: OutdatedEntry = { name }
    if (typeof rec.current === 'string') entry.current = rec.current
    if (typeof rec.wanted === 'string') entry.wanted = rec.wanted
    if (typeof rec.latest === 'string') entry.latest = rec.latest
    entries.push(entry)
  }
  return entries
}

/** profile 依赖目录里某包的可更新判定（声明必须是 semver range 才可执行更新）。 */
export function installedSpecOf(
  packageName: string,
  dependencies: Readonly<Record<string, string>> | undefined,
): { kind: 'range'; spec: string } | { kind: 'non-range'; spec: string } | { kind: 'absent' } {
  if (dependencies === undefined) return { kind: 'absent' }
  const spec = dependencies[packageName]
  if (spec === undefined) return { kind: 'absent' }
  if (!isSemverRange(spec)) return { kind: 'non-range', spec }
  return { kind: 'range', spec }
}

/** 计算某包的可更新视图：磁盘版本 + 声明分类 + outdated 记录 → UI 需要的字段。纯函数。 */
export interface UpdateStatus {
  /** 已安装版本（缺则 undefined）。 */
  current?: string
  /** range 内允许的最新（wanted）；无则等于 latest。 */
  wanted?: string
  /** registry 最新。 */
  latest?: string
  /** 是否有可应用更新。 */
  updatable: boolean
  /** 跨 major（latest 的 major ≠ 当前 major）——需额外确认。 */
  major: boolean
  /** 声明分类。 */
  specKind: 'range' | 'non-range' | 'absent'
}

export function buildUpdateStatus(args: {
  current?: string
  specKind: 'range' | 'non-range' | 'absent'
  outdated?: OutdatedEntry
}): UpdateStatus {
  const { current, specKind, outdated } = args
  if (outdated === undefined) {
    return { current, specKind, updatable: false, major: false }
  }
  const latest = outdated.latest ?? outdated.wanted
  const wanted = outdated.wanted ?? latest
  const updatable =
    specKind === 'range' &&
    current !== undefined &&
    latest !== undefined &&
    current !== latest
  return {
    current,
    ...(wanted === undefined ? {} : { wanted }),
    ...(latest === undefined ? {} : { latest }),
    updatable: updatable === true,
    major: isMajorBump(current, latest),
    specKind,
  }
}

/** 某包在 profile node_modules 的 package.json 路径（作用域包展开 @scope/name → @scope/name）。 */
export function selfPackagePath(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}