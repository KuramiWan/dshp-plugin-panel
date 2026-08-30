/**
 * DSHP 池读取层（规范源 standalone src/pool.ts；DSHP 的 plugin/dshp-plugin-panel/src 为只读镜像）。
 * 目录扫描 / SKILL.md frontmatter 解析。池 = 用户自管的唯一内容源：`local/` 下每个含 SKILL.md
 * 的目录即一份技能（放文件 = 加入管理），无订阅/生态/目录缓存/信任概念。
 * 分组（2026-08-19）：统一用技能自身 frontmatter 的 `tags` 字段，三池（全局激活 / 可用池 /
 * 会话引入）共享；目录结构只作存放位置（兼容 `local/<group>/<skill>/` 旧布局，但不作分组展示）。
 * 注意：Node 26 的 V8 不接受 (?m) 内联标志——逐行匹配，无内联标志。
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultDshHome, type EnvLike } from './home.ts'
import { readTextFileSync } from './fs.ts'

export { type EnvLike } from './home.ts'

export interface PoolEntry {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly directory: string
  /** frontmatter tags（跨池共享的分组维度）。 */
  readonly tags: readonly string[]
}

export interface SkillContent {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly content: string
  readonly directory: string
  readonly tags: readonly string[]
}

interface Frontmatter {
  name: string | undefined
  description: string | undefined
  whenToUse: string | undefined
  disableModel: boolean | undefined
  userInvocable: boolean | undefined
  tags: string[] | undefined
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-_.]*$/
const GROUP_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_. ]{0,31}$/

/**
 * DSH home 解析优先级（对齐 @deepseek-ai/dsh-home-paths resolveDshHome）：
 * 显式配置 > `$DSH_HOME` > `~/.dsh`。空/纯空白的 `$DSH_HOME` 视为未设置。
 * home 目录本身默认即 `~/.dsh`（`$DSH_HOME` 让位时直接是 `~/.dsh`），
 * 技能池固定位于该 home 下的 `.skill-pool` 子目录。
 */
export function defaultPoolRoot(env: EnvLike = process.env): string {
  return join(defaultDshHome(env), '.skill-pool')
}

/** 显式提供的 poolRoot 或默认根。 */
export function resolvePoolRoot(poolRoot: string | undefined, env: EnvLike = process.env): string {
  return poolRoot ?? defaultPoolRoot(env)
}

/**
 * user-dsh 全局技能根（默认 ~/.dsh/skills，$DSH_HOME 优先）：DSH 官方 skill-filesystem
 * 启动时扫描的进程级层，所有会话自动可见。本插件把它作为「全局激活池」——可管理
 * （启用/停用 = 与池 local/ 之间移动目录），但默认只扫描展示、不动现有内容。
 */
export function defaultGlobalSkillsRoot(env: EnvLike = process.env): string {
  return join(defaultDshHome(env), 'skills')
}

/**
 * 扫描 user-dsh 全局激活池（磁盘真相）：`~/.dsh/skills/` 下每个含 SKILL.md 的目录。
 * 不递归（官方层无子目录布局）；目录名即技能名（无 frontmatter 也返回，靠目录名兜底）。
 */
export function listGlobalEntries(root: string): Array<{ readonly name: string; readonly description: string; readonly directory: string; readonly tags: readonly string[] }> {
  const entries: Array<{ name: string; description: string; directory: string; tags: string[] }> = []
  if (!existsSync(root)) return entries
  for (const dirent of readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue
    const dir = join(root, dirent.name)
    const skillPath = join(dir, 'SKILL.md')
    if (!existsSync(skillPath)) continue
    const raw = readTextFileSync(skillPath)
    const parsed = raw === undefined ? undefined : parseSkillFile(raw)
    const name = parsed?.fm.name ?? dirent.name
    entries.push({
      name,
      description: parsed?.fm.description ?? '(无 frontmatter 描述)',
      directory: dir,
      tags: parsed?.fm.tags ?? [],
    })
  }
  return entries
}

export function isValidSkillName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

/** 分组 tag：1-32 位字母/数字/连字符/下划线/点/空格；不可含路径分隔符，不可为空。 */
export function isValidTagName(tag: string): boolean {
  return GROUP_PATTERN.test(tag) && !tag.includes('/') && !tag.includes('\\')
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
  /** tags：支持 `tags: [a, b]`、`tags: a, b` 与块列表 `tags:\n  - a`。 */
  const list = (key: string): string[] | undefined => {
    const re = new RegExp('^' + key + ':(\\s)*(.*)$')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue
      const lm = line.match(re)
      if (lm === null) continue
      const rest = (lm[2] ?? '').trim()
      if (rest === '') {
        const parts: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j]
          if (next === undefined) continue
          const bm = next.match(/^\s*-\s*(.+)$/)
          if (bm !== null) parts.push(bm[1]?.trim() ?? '')
          else if (next.trim() === '') continue
          else break
        }
        return parts.length > 0 ? parts : undefined
      }
      // `[a, b]` 或 `a, b`
      const inner = rest.startsWith('[') && rest.endsWith(']') ? rest.slice(1, -1) : rest
      const parts = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s !== '')
      return parts.length > 0 ? parts : undefined
    }
    return undefined
  }
  const fm: Frontmatter = {
    name: scalar('name'),
    description: scalar('description'),
    whenToUse: scalar('whenToUse'),
    disableModel: bool('disable-model-invocation'),
    userInvocable: bool('user-invocable'),
    tags: list('tags'),
  }
  return { fm, body }
}

function parseDir(dir: string): PoolEntry | undefined {
  const skillPath = join(dir, 'SKILL.md')
  if (!existsSync(skillPath)) return undefined
  const raw = readTextFileSync(skillPath)
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
    tags: parsed.fm.tags ?? [],
  }
}

/**
 * 扫描本地池（磁盘真相）。目录结构只作存放位置：递归兼容 `local/<skill>/` 与
 * 旧 `local/<group>/<skill>/` 布局；分组展示一律走 frontmatter tags，不看目录层级。
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
    // 旧目录分组（不含 SKILL.md 但有子技能目录）：递归收录其下技能，不产生分组语义。
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue
      const parsed = parseDir(join(dir, child.name))
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
  const raw = readTextFileSync(skillPath)
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
    tags: parsed.fm.tags ?? [],
  }
}

/**
 * 写操作：替换/新增 SKILL.md frontmatter 的 `tags:` 行（跨池共享分组维度）。
 * 仅改 tags 行，其余 frontmatter 与正文逐字保留；无 frontmatter 或不可解析时拒绝。
 * 兼容块列表形式（`tags:\n  - a`）：替换 `tags:` 行时一并移除其续行，避免残留损坏 frontmatter。
 */
export function setSkillTags(directory: string, tags: readonly string[]): { ok: true } | { ok: false; reason: string } {
  const skillPath = join(directory, 'SKILL.md')
  if (!existsSync(skillPath)) return { ok: false, reason: 'SKILL.md 不存在' }
  const raw = readTextFileSync(skillPath)
  if (raw === undefined) return { ok: false, reason: 'SKILL.md 不可读' }
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/)
  if (m === null || m[2] === undefined) return { ok: false, reason: '无 frontmatter，无法写 tags' }
  const fmText = m[2]
  const lineSep = fmText.includes('\r\n') ? '\r\n' : '\n'
  const lines = fmText.split(/\r?\n/)
  const tagLine = tags.length === 0 ? 'tags: []' : `tags: [${tags.join(', ')}]`
  const idx = lines.findIndex(line => /^tags:/.test(line))
  if (idx >= 0) {
    lines[idx] = tagLine
    // 移除块列表续行（`tags:\n  - a` 形式），避免残留 `  - a` 破坏 frontmatter。
    let j = idx + 1
    while (j < lines.length && /^\s*-\s/.test(lines[j] ?? '')) {
      lines.splice(j, 1)
    }
  } else {
    lines.push(tagLine)
  }
  // m[1]=开头的 --- 行，m[3]=结尾的 --- 行；正文 = raw 从完整匹配后开始。
  const next = m[1] + lines.join(lineSep) + m[3] + raw.slice(m[0].length)
  try {
    writeFileSync(skillPath, next, 'utf8')
  } catch (error) {
    return { ok: false, reason: `写入失败：${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: true }
}
