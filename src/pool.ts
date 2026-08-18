/**
 * DSHP 池读取层（DSHP src/pool.ts 的可运行副本；规范源在 DSHP，本副本供 checkout 插件构建）。
 * 目录扫描 / SKILL.md frontmatter 解析 / 信任校验；与 scripts/ecosystem-catalog.ps1 约定一致。
 * 注意：Node 26 的 V8 不接受 (?m) 内联标志——逐行匹配，无内联标志。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface PoolEntry {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly origin: 'local' | 'ecosystem'
  readonly source?: string
  readonly directory: string
  readonly available: boolean
  readonly trusted: boolean
}

export interface SkillContent {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly content: string
  readonly directory: string
}

interface Frontmatter {
  name: string | undefined
  description: string | undefined
  whenToUse: string | undefined
  disableModel: boolean | undefined
  userInvocable: boolean | undefined
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-_.]*$/

/**
 * 读取 UTF-8 文本并剥离 BOM（真实池文件由 PowerShell 写入、常带 \uFEFF 头；
 * 否则 frontmatter 正则匹配 ^--- 失败、JSON.parse 报 Unexpected token）。
 */
function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return undefined
  }
}

export interface EnvLike {
  DSH_HOME?: string
}

/**
 * DSH home 解析优先级（对齐 @deepseek-ai/dsh-home-paths resolveDshHome）：
 * 显式配置 > `$DSH_HOME` > `~/.dsh`。空/纯空白的 `$DSH_HOME` 视为未设置。
 * home 目录本身默认即 `~/.dsh`（`$DSH_HOME` 让位时直接是 `~/.dsh`），
 * 技能池固定位于该 home 下的 `.skill-pool` 子目录。
 */
export function defaultPoolRoot(env: EnvLike = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  const home = fromEnv || join(homedir(), '.dsh')
  return join(home, '.skill-pool')
}

/** 显式提供的 poolRoot 或默认根。 */
export function resolvePoolRoot(poolRoot: string | undefined, env: EnvLike = process.env): string {
  return poolRoot ?? defaultPoolRoot(env)
}

export function isValidSkillName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

export function parseSkillFile(raw: string): { fm: Frontmatter; body: string } | undefined {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (m === null || m[1] === undefined) return undefined
  const fmText = m[1]
  const body = raw.slice(m[0].length)
  const lines = fmText.split(/\r?\n/)
  const scalar = (key: string): string | undefined => {
    const re = new RegExp('^' + key + ':(\\s)*(.*)$')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue
      const lm = line.match(re)
      if (lm === null) continue
      const rest = (lm[2] ?? '').trim()
      if (/^[|>][-+]?$/.test(rest) || rest === '') {
        const parts: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j]
          if (next === undefined) continue
          if (/^\s/.test(next)) parts.push(next.trim())
          else if (next.trim() === '') parts.push('')
          else break
        }
        return parts.filter(p => p !== '').join(' ')
      }
      if (/^"(.+)"$/.test(rest) || /^'(.+)'$/.test(rest)) return rest.slice(1, -1)
      return rest
    }
    return undefined
  }
  const bool = (key: string): boolean | undefined => {
    const re = new RegExp('^' + key + ':(\\s)*(true|false)')
    for (const line of lines) {
      const bm = line.match(re)
      if (bm !== null) return (bm[2] ?? '') === 'true'
    }
    return undefined
  }
  const fm: Frontmatter = {
    name: scalar('name'),
    description: scalar('description'),
    whenToUse: scalar('whenToUse'),
    disableModel: bool('disable-model-invocation'),
    userInvocable: bool('user-invocable'),
  }
  return { fm, body }
}

function readTrust(poolRoot: string): Array<{ repo?: string; commit?: string; name?: string }> {
  const path = join(poolRoot, '.trust.json')
  if (!existsSync(path)) return []
  const text = readText(path)
  if (text === undefined) return []
  try {
    const data = JSON.parse(text) as { confirmed?: unknown }
    const confirmed = data?.confirmed
    return Array.isArray(confirmed) ? confirmed as Array<{ repo?: string; commit?: string; name?: string }> : []
  } catch {
    return []
  }
}

function readCatalogSources(poolRoot: string): Record<string, { repo?: string; ref?: string; commit?: string }> {
  const path = join(poolRoot, '.catalog.json')
  if (!existsSync(path)) return {}
  const text = readText(path)
  if (text === undefined) return {}
  try {
    const data = JSON.parse(text) as { sources?: Record<string, { repo?: string; ref?: string; commit?: string }> }
    return data?.sources ?? {}
  } catch {
    return {}
  }
}

function trustedFor(poolRoot: string, entry: PoolEntry): boolean {
  if (entry.origin !== 'ecosystem' || entry.source === undefined) return true
  const sources = readCatalogSources(poolRoot)
  const repo = sources[entry.source]?.repo
  const confirmed = readTrust(poolRoot)
  return confirmed.some(c => c.name === entry.name && (repo === undefined || c.repo === repo))
}

function parseDir(poolRoot: string, dir: string, _name: string, origin: 'local' | 'ecosystem', source?: string): PoolEntry | undefined {
  const skillPath = join(dir, 'SKILL.md')
  if (!existsSync(skillPath)) return undefined
  const raw = readText(skillPath)
  if (raw === undefined) return undefined
  const parsed = parseSkillFile(raw)
  if (parsed === undefined || parsed.fm.name === undefined || parsed.fm.description === undefined) return undefined
  const base: Omit<PoolEntry, 'trusted'> = {
    name: parsed.fm.name,
    description: parsed.fm.description,
    ...(parsed.fm.whenToUse === undefined ? {} : { whenToUse: parsed.fm.whenToUse }),
    modelInvocable: parsed.fm.disableModel !== true,
    userInvocable: parsed.fm.userInvocable !== false,
    origin,
    ...(source === undefined ? {} : { source }),
    directory: dir,
    available: true,
  }
  return { ...base, trusted: trustedFor(poolRoot, base as PoolEntry) }
}

/** 扫描本地池与已订阅生态目录（磁盘真相）。 */
export function listPoolEntries(poolRoot: string): PoolEntry[] {
  const entries: PoolEntry[] = []
  const localRoot = join(poolRoot, 'local')
  if (existsSync(localRoot)) {
    for (const dirent of readdirSync(localRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue
      const parsed = parseDir(poolRoot, join(localRoot, dirent.name), dirent.name, 'local')
      if (parsed !== undefined) entries.push(parsed)
    }
  }
  const ecoRoot = join(poolRoot, 'ecosystem')
  if (existsSync(ecoRoot)) {
    for (const source of readdirSync(ecoRoot, { withFileTypes: true })) {
      if (!source.isDirectory()) continue
      const sourceRoot = join(ecoRoot, source.name)
      for (const dirent of readdirSync(sourceRoot, { withFileTypes: true })) {
        if (!dirent.isDirectory()) continue
        const parsed = parseDir(poolRoot, join(sourceRoot, dirent.name), dirent.name, 'ecosystem', source.name)
        if (parsed !== undefined) entries.push(parsed)
      }
    }
  }
  return entries
}

/** 生态目录（.catalog.json）中尚未订阅的条目：available=false。 */
export function listUnsubscribedCatalogEntries(poolRoot: string): PoolEntry[] {
  const path = join(poolRoot, '.catalog.json')
  if (!existsSync(path)) return []
  const text = readText(path)
  if (text === undefined) return []
  try {
    const data = JSON.parse(text) as {
      entries?: Array<{
        name?: string
        description?: string
        source?: { id?: string }
      }>
    }
    const entries = data?.entries ?? []
    const onDisk = new Set(listPoolEntries(poolRoot).map(e => e.source + '/' + e.name))
    const result: PoolEntry[] = []
    for (const raw of entries) {
      if (raw.name === undefined || raw.description === undefined) continue
      if (onDisk.has(raw.source?.id + '/' + raw.name)) continue
      result.push({
        name: raw.name,
        description: raw.description,
        modelInvocable: true,
        userInvocable: true,
        origin: 'ecosystem',
        ...(raw.source?.id === undefined ? {} : { source: raw.source.id }),
        directory: '',
        available: false,
        trusted: false,
      })
    }
    return result
  } catch {
    return []
  }
}

export function findPoolEntry(poolRoot: string, name: string): PoolEntry | undefined {
  const all = [...listPoolEntries(poolRoot), ...listUnsubscribedCatalogEntries(poolRoot)]
  const local = all.find(e => e.origin === 'local' && e.name === name)
  if (local !== undefined) return local
  return all.find(e => e.origin === 'ecosystem' && e.name === name)
}

export function readSkillContent(entry: PoolEntry): SkillContent | undefined {
  if (!entry.available || entry.directory === '') return undefined
  const skillPath = join(entry.directory, 'SKILL.md')
  if (!existsSync(skillPath)) return undefined
  const raw = readText(skillPath)
  if (raw === undefined) return undefined
  const parsed = parseSkillFile(raw)
  if (parsed === undefined || parsed.fm.name === undefined || parsed.fm.description === undefined) return undefined
  return {
    name: parsed.fm.name,
    description: parsed.fm.description,
    ...(parsed.fm.whenToUse === undefined ? {} : { whenToUse: parsed.fm.whenToUse }),
    modelInvocable: parsed.fm.disableModel !== true,
    userInvocable: parsed.fm.userInvocable !== false,
    content: parsed.body,
    directory: entry.directory,
  }
}
