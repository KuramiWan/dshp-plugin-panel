/**
 * DSHP 池读取层（规范源 standalone src/pool.ts；DSHP 的 plugin/dshp-skill-panel/src 为只读镜像）。
 * 目录扫描 / SKILL.md frontmatter 解析。池 = 用户自管的唯一内容源：`local/` 下每个含 SKILL.md
 * 的目录即一份技能（放文件 = 加入管理），无订阅/生态/目录缓存/信任概念。
 * 分组（2026-08-19）：`local/` 下不含 SKILL.md 的子目录视为分组，其下技能目录归该组；
 * `local/<skill>/` 顶层技能无分组。分组只影响展示/过滤，不影响引入的会话语义。
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
  readonly directory: string
  /** 分组名（local/<group>/<skill>/ 时存在）；顶层技能无分组。 */
  readonly group?: string
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
const GROUP_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_. ]{0,31}$/

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

/** 分组名：1-32 位字母/数字/连字符/下划线/点/空格；不可含路径分隔符，不可为空。 */
export function isValidGroupName(group: string): boolean {
  return GROUP_PATTERN.test(group) && !group.includes('/') && !group.includes('\\')
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

function parseDir(dir: string, group?: string): PoolEntry | undefined {
  const skillPath = join(dir, 'SKILL.md')
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
    directory: dir,
    ...(group === undefined ? {} : { group }),
  }
}

/**
 * 扫描本地池（磁盘真相）。规则：
 * - `local/<skill>/`（含 SKILL.md）= 无分组技能；
 * - `local/<group>/`（不含 SKILL.md，但有子目录）= 分组，其下 `local/<group>/<skill>/` 归该组。
 */
export function listPoolEntries(poolRoot: string): PoolEntry[] {
  const entries: PoolEntry[] = []
  const localRoot = join(poolRoot, 'local')
  if (!existsSync(localRoot)) return entries
  for (const dirent of readdirSync(localRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue
    const dir = join(localRoot, dirent.name)
    const direct = parseDir(dir)
    if (direct !== undefined) {
      entries.push(direct)
      continue
    }
    // 分组目录：无 SKILL.md 但有子技能目录。
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue
      const parsed = parseDir(join(dir, child.name), dirent.name)
      if (parsed !== undefined) entries.push(parsed)
    }
  }
  return entries
}

export function findPoolEntry(poolRoot: string, name: string): PoolEntry | undefined {
  return listPoolEntries(poolRoot).find(e => e.name === name)
}

export function readSkillContent(entry: PoolEntry): SkillContent | undefined {
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
