/**
 * 结构化日志系统（grilling 定稿）：
 * - 后端采用 cordis 自带 `ctx.logger(name)`（error/info/warn/debug 四级、exporter 导出、
 *   per-fiber 作用域），不重复造轮子。
 * - 注册 3 个 exporter（ADR-0009「JSON Lines 固定文件」）：
 *    1. 控制台 sink —— 保持现状可见性（替代裸 console 的可见性）；
 *    2. JSON Lines 文件 sink —— 追加写 `<dshHome>/.dshp-plugin-panel.log`（调试器读它）；
 *    3. 缓冲 sink —— 内存保留最近 N 条（供面板/未来查询，`recentLogs()`）。
 * - `installPanelLogging(ctx)` 在插件 init 时调用一次，把 3 个 exporter 挂到当前 fiber
 *   （`ctx.logger.exporter` 内部以 ctx.effect 注册、随 fiber 回收）。
 *
 * 领域命名：子系统 logger 名 = `plugin-panel` / `pool` / `store` / `mcp` / `plugin-manager`。
 * 统一 `console` 的裸日志全部替换为命名 logger，使错误具备结构化字段可被调试脚本提取。
 */
import type { Context } from '@deepseek-ai/cordis'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defaultDshHome, type EnvLike } from './home.ts'

/** 插件日志文件名（固定、追加、不轮转 —— 首版从简，ADR-0009）。 */
export const LOG_FILE_NAME = '.dshp-plugin-panel.log'

/** 缓冲 exporter 保留的近期日志条数上限。 */
export const RECENT_LIMIT = 500

/**
 * 日志文件默认位置：`<dshHome>/.dshp-plugin-panel.log`。
 * 选 `defaultDshHome()` 而非 profileDir：profileDir 需扫描 profiles 目录、非插件可导出；
 * dshHome 可由独立调试脚本用同一推导（home.ts）找到，保证「插件写、脚本读」同址。
 */
export function defaultLogFile(env: EnvLike = process.env): string {
  return join(defaultDshHome(env), LOG_FILE_NAME)
}

/** 插件子系统日志面（与 cordis Logger 的四个级别方法同形状）。 */
export interface PanelLogger {
  error(format: unknown, ...param: unknown[]): void
  info(format: unknown, ...param: unknown[]): void
  warn(format: unknown, ...param: unknown[]): void
  debug(format: unknown, ...param: unknown[]): void
}

/** 近期日志条目（缓冲 sink 的最小结构）。 */
export interface RecentLogEntry {
  ts: number
  level: string
  name: string
  msg: string
}

/** 缓冲 sink 的内存环（模块级；`recentLogs()` 供面板/未来查询）。 */
const recent: RecentLogEntry[] = []

/** 读取近期日志（可过滤级别与条数）。 */
export function recentLogs(limit = 100, minLevel?: 'error' | 'info' | 'warn' | 'debug'): RecentLogEntry[] {
  // severity 排序：error 最高、debug 最低。minLevel='warn' 表示"warn 及更严重"= error+warn。
  const rank: Record<string, number> = { error: 3, warn: 2, info: 1, debug: 0 }
  const floor = minLevel === undefined ? -1 : (rank[minLevel] ?? -1)
  // 由新到旧过滤，取严重度 >= floor 的最多 limit 条，再倒回时间正序。
  const picked: RecentLogEntry[] = []
  for (let i = recent.length - 1; i >= 0 && picked.length < limit; i--) {
    const entry = recent[i]
    if (entry !== undefined && (rank[entry.level] ?? 0) >= floor) picked.push(entry)
  }
  return picked.reverse()
}

/** 把 logger args 格式化为单行文本（Error 取 message，对象 JSON 化，失败 String()）。 */
function formatArgs(args: readonly unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.stack ?? a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/** 控制台可读格式：`[LEVEL] [name] msg`。 */
function formatConsole(level: string, name: string, args: readonly unknown[]): string {
  return `[${level.toUpperCase().padEnd(5)}] [${name}] ${formatArgs(args)}`
}

export interface PanelLoggingOptions {
  /** 覆盖日志文件路径（默认 defaultLogFile()）。 */
  logFile?: string
  /** 覆盖缓冲保留条数（默认 RECENT_LIMIT）。 */
  recentLimit?: number
}

/**
 * 注册插件日志 exporter（控制台 + JSON Lines 文件 + 缓冲）。
 * 在插件 init 内调用一次；`ctx.logger.exporter` 以 ctx.effect 注册，随当前 fiber 回收。
 * 文件写失败静默降级（日志系统自身不因磁盘故障中断宿主）。
 */
export function installPanelLogging(ctx: Context, options: PanelLoggingOptions = {}): void {
  const file = options.logFile ?? defaultLogFile()
  const recentLimit = options.recentLimit ?? RECENT_LIMIT

  // 1) 控制台 sink —— 保持现状可见性。
  ctx.logger.exporter({
    export: (message) => {
      const { level, type, name, args } = message
      const line = formatConsole(type, name, args)
      if (level === 0) console.error(line)
      else if (level === 2) console.warn(line)
      else if (level === 3) console.debug(line)
      else console.log(line)
    },
  })

  // 2) JSON Lines 文件 sink —— 调试器数据源。
  ctx.logger.exporter({
    export: (message) => {
      const { ts, type, name, args } = message
      const line = JSON.stringify({ ts, level: type, name, msg: formatArgs(args) })
      try {
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, line + '\n', 'utf8')
      } catch {
        // 文件写失败不阻断宿主；日志系统自身降级。
      }
    },
  })

  // 3) 缓冲 sink —— 内存近期日志。
  ctx.logger.exporter({
    export: (message) => {
      const { ts, type, name, args } = message
      recent.push({ ts, level: type, name, msg: formatArgs(args) })
      if (recent.length > recentLimit) recent.splice(0, recent.length - recentLimit)
    },
  })
}

/** `console` 可直接作为 PanelLogger 用（SessionSkillStore 默认日志面，测试无需 ctx）。 */
export const consoleLogger: PanelLogger = console
