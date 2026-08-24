#!/usr/bin/env node
/**
 * dshp-skill-panel 调试器（ADR-0010：独立可运行、只读）。
 *
 * 给 agent（LLM）排查插件自身错误用：一条命令 dump 插件状态 + 近期日志。
 * - 独立于宿主进程运行（宿主未启动也能跑），只读落盘状态，绝不改动任何文件。
 * - 复用与插件完全一致的推导逻辑（home.ts / pool.ts / logger.ts），保证读的就是插件写的。
 * - 输出四块：
 *    1. 池扫描（local/* 目录 + SKILL.md 元数据）；
 *    2. 会话引入集（.session-skills/<sessionId>.json 跨会话快照）；
 *    3. 配置解析（dshHome / poolRoot / profileDir / 日志文件路径的优先级结果）；
 *    4. 一致性自检（落盘引入集的 skill 是否真在池里 + 日志文件里最近 error/warn 线索）。
 *
 * 用法：
 *   node --experimental-strip-types scripts/debug-dump.ts            # 文本（默认）
 *   node --experimental-strip-types scripts/debug-dump.ts --json     # JSON
 *   node --experimental-strip-types scripts/debug-dump.ts --root <dir>  # 覆盖 poolRoot
 *   node --experimental-strip-types scripts/debug-dump.ts --logs 20  # 只显示最近 20 条错误/警告
 *
 * 环境变量：$DSH_HOME 可覆盖 dshHome（与插件解析一致）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { homedir } from 'node:os'
import { defaultPoolRoot, listPoolEntries } from '../src/pool.ts'
import { defaultLogFile } from '../src/logger.ts'
import { defaultDshHome } from '../src/home.ts'

// ---- 命令行解析（轻量，不引依赖） ----

interface CliArgs {
  json: boolean
  root?: string
  logs: number
  profileDir?: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { json: false, logs: 50 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--root') out.root = argv[++i]
    else if (a === '--logs') out.logs = Number.parseInt(argv[++i] ?? '50', 10)
    else if (a === '--profile') out.profileDir = argv[++i]
  }
  if (!Number.isFinite(out.logs) || out.logs < 0) out.logs = 50
  return out
}

// ---- 读取会话引入集 ----

interface SessionSnapshot {
  sessionId: string
  skills: string[]
}

function readSessionIntroduceSets(poolRoot: string): SessionSnapshot[] {
  const dir = join(poolRoot, '.session-skills')
  if (!existsSync(dir)) return []
  const out: SessionSnapshot[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const file = join(dir, name)
    let raw: string
    try {
      raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    } catch {
      continue
    }
    try {
      const data = JSON.parse(raw) as { sessionId?: unknown; skills?: unknown }
      out.push({
        sessionId: String(data?.sessionId ?? name.replace(/\.json$/, '')),
        skills: Array.isArray(data?.skills) ? data.skills.filter(s => typeof s === 'string') as string[] : [],
      })
    } catch {
      // 单个快照损坏不阻断整体 dump。
    }
  }
  // 按文件名稳定排序。
  return out.sort((a, b) => a.sessionId.localeCompare(b.sessionId))
}

// ---- 读日志文件最近 error/warn ----

interface LogLine {
  ts: number
  level: string
  name: string
  msg: string
}

/** 从日志文件尾部读最近 count 条 error/warn（JSON Lines）。 */
function readRecentErrorLogs(logFile: string, count: number): LogLine[] {
  if (!existsSync(logFile)) return []
  const picked: LogLine[] = []
  try {
    const lines = readFileSync(logFile, 'utf8').split('\n')
    for (let i = lines.length - 1; i >= 0 && picked.length < count; i--) {
      const line = lines[i]
      if (line === undefined || line.trim() === '') continue
      try {
        const obj = JSON.parse(line) as Partial<LogLine>
        if (obj.level === 'error' || obj.level === 'warn') {
          picked.push({ ts: obj.ts ?? 0, level: obj.level, name: obj.name ?? '', msg: obj.msg ?? '' })
        }
      } catch {
        // 跳过损坏行。
      }
    }
  } catch {
    return []
  }
  return picked.reverse()
}

// ---- 一致性自检 ----

interface ConsistencyIssue {
  kind: 'introduced-missing-in-pool' | 'corrupt-snapshot' | 'log'
  detail: string
}

function consistencyCheck(poolRoot: string, snapshots: SessionSnapshot[], logs: LogLine[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const poolNames = new Set(listPoolEntries(poolRoot).map(e => e.name))
  for (const snap of snapshots) {
    for (const skill of snap.skills) {
      if (!poolNames.has(skill)) {
        issues.push({
          kind: 'introduced-missing-in-pool',
          detail: `会话 ${snap.sessionId} 的引入集含 "${skill}"，但池中无此技能（可能已从池移除/改名）`,
        })
      }
    }
  }
  for (const log of logs) {
    issues.push({ kind: 'log', detail: `[${log.level}] [${log.name}] ${log.msg}` })
  }
  return issues
}

// ---- 配置解析 ----

function profileDirOf(root: string | undefined, dshHome: string): string {
  if (root !== undefined) return root
  // 对齐 plugin-manager resolveProfileDir：找引用 dshp-skill-panel 的 profile，退回 web。
  const profiles = join(dshHome, 'profiles')
  if (existsSync(profiles)) {
    for (const name of readdirSync(profiles)) {
      const patch = join(profiles, name, 'cordis.patch.yml')
      if (!existsSync(patch)) continue
      try {
        const text = readFileSync(patch, 'utf8')
        if (text.includes('dshp-skill-panel')) return join(profiles, name)
      } catch {
        // 忽略不可读 profile。
      }
    }
  }
  return join(dshHome, 'profiles', 'web')
}

// ---- 渲染 ----

function renderText(args: CliArgs): string {
  const dshHome = defaultDshHome()
  const poolRoot = args.root ?? defaultPoolRoot()
  const profileDir = profileDirOf(args.profileDir, dshHome)
  const logFile = defaultLogFile()
  const pool = listPoolEntries(poolRoot)
  const snapshots = readSessionIntroduceSets(poolRoot)
  const logs = readRecentErrorLogs(logFile, args.logs)
  const issues = consistencyCheck(poolRoot, snapshots, logs)

  const out: string[] = []
  out.push('# dshp-skill-panel 调试 dump')
  out.push('')
  out.push('## 配置解析')
  out.push(`  DSH_HOME      : ${process.env.DSH_HOME?.trim() || '(未设置，用 ' + homedir() + sep + '.dsh)'}`)
  out.push(`  dshHome       : ${dshHome}`)
  out.push(`  poolRoot      : ${poolRoot}${args.root ? ' (--root 覆盖)' : ''}`)
  out.push(`  profileDir    : ${profileDir}`)
  out.push(`  日志文件       : ${logFile}${existsSync(logFile) ? ` (${statSync(logFile).size} 字节)` : ' (不存在)'}`)
  out.push('')
  out.push(`## 池扫描（${pool.length} 条）`)
  if (pool.length === 0) {
    out.push('  （无技能 —— 把含 SKILL.md 的目录放进 ' + join(poolRoot, 'local') + '/ 即加入管理）')
  } else {
    for (const e of pool) {
      out.push(`  - ${e.name}${e.tags.length === 0 ? '' : ` (tags: ${e.tags.join(', ')})`}: ${e.description}`)
    }
  }
  out.push('')
  out.push(`## 会话引入集（${snapshots.length} 个会话）`)
  if (snapshots.length === 0) {
    out.push('  （无会话引入记录）')
  } else {
    for (const s of snapshots) {
      out.push(`  - ${s.sessionId}: ${s.skills.length === 0 ? '(空)' : s.skills.join(', ')}`)
    }
  }
  out.push('')
  out.push(`## 一致性自检（${issues.length} 项，含最近 ${logs.length} 条 error/warn 日志）`)
  if (issues.length === 0) {
    out.push('  未发现错误线索。')
  } else {
    for (const it of issues) out.push(`  [${it.kind}] ${it.detail}`)
  }
  return out.join('\n')
}

function renderJson(args: CliArgs): string {
  const dshHome = defaultDshHome()
  const poolRoot = args.root ?? defaultPoolRoot()
  const profileDir = profileDirOf(args.profileDir, dshHome)
  const logFile = defaultLogFile()
  const pool = listPoolEntries(poolRoot)
  const snapshots = readSessionIntroduceSets(poolRoot)
  const logs = readRecentErrorLogs(logFile, args.logs)
  const issues = consistencyCheck(poolRoot, snapshots, logs)
  return JSON.stringify(
    {
      config: { dshHome, poolRoot, profileDir, logFile, dshHomeEnv: process.env.DSH_HOME?.trim() ?? null },
      pool: pool.map(e => ({ name: e.name, description: e.description, tags: e.tags })),
      sessions: snapshots,
      issues,
      logs,
    },
    null,
    2,
  )
}

// ---- 主入口 ----

const args = parseArgs(process.argv.slice(2))
process.stdout.write((args.json ? renderJson(args) : renderText(args)) + '\n')
