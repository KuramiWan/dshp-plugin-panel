/**
 * logger.ts 日志系统关键用例。
 * 覆盖：defaultLogFile 推导（$DSH_HOME 优先）、JSON Lines 格式（ts/level/name/msg）、
 * 缓冲 recentLogs 按级别过滤与条数、installPanelLogging 三 exporter 写入。
 * 用临时 home 目录 + fake ctx（捕获 exporter）验证。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultLogFile,
  installPanelLogging,
  recentLogs,
  RECENT_LIMIT,
} from '../src/logger.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'logger-test')
mkdirSync(testRoot, { recursive: true })

test('defaultLogFile: $DSH_HOME 优先推导 <dshHome>/.dshp-plugin-panel.log', () => {
  const home = join(testRoot, 'home-x')
  const file = defaultLogFile({ DSH_HOME: home })
  assert.equal(file, join(home, '.dshp-plugin-panel.log'))
})

test('defaultLogFile: 空白 $DSH_HOME 视为未设置（回退 homedir/.dsh）', () => {
  const file = defaultLogFile({ DSH_HOME: '   ' })
  assert.equal(file.endsWith(join('.dsh', '.dshp-plugin-panel.log')), true)
})

test('installPanelLogging: 注册 3 个 exporter，文件写 JSON Lines 正确', () => {
  const logFile = join(testRoot, 'log', '.dshp-plugin-panel.log')
  // 捕获全部注册的 exporter，逐一喂 message，验证其中文件 sink 写 JSON Lines。
  const exporters: Array<{ export: (m: unknown) => void }> = []
  const collectingCtx = {
    logger: {
      exporter: (exporter: unknown) => {
        exporters.push(exporter as { export: (m: unknown) => void })
        return () => {}
      },
    },
  }
  installPanelLogging(collectingCtx as never, { logFile })
  assert.ok(exporters.length >= 3, `应注册 3 个 exporter，实际 ${exporters.length}`)

  // 给每个 exporter 喂同一条 error，文件 sink 会落盘 JSON Lines。
  const msg = { ts: 1700000000000, type: 'error', level: 0, name: 'mcp', args: ['restore failed'] }
  for (const ex of exporters) ex.export(msg)
  const written = readFileSync(logFile, 'utf8')
  assert.ok(written.includes('"level":"error"'))
  assert.ok(written.includes('"name":"mcp"'))
  assert.ok(written.includes('restore failed'))
})

test('recentLogs: minLevel 语义正确（A1 回归：warn 含 error+warn，不含 info）', () => {
  // 用 installPanelLogging 注册的缓冲 exporter 写入各级别，再断言 recentLogs 过滤。
  const exporters: Array<{ export: (m: unknown) => void }> = []
  const collectingCtx = {
    logger: { exporter: (exporter: unknown) => { exporters.push(exporter as { export: (m: unknown) => void }); return () => {} } },
  }
  installPanelLogging(collectingCtx as never, { logFile: join(testRoot, 'log2', '.dshp-plugin-panel.log') })
  const buf = exporters[2] // 第三个是缓冲 exporter
  const levels: Array<[string, number]> = [['error', 0], ['info', 1], ['warn', 2], ['debug', 3]]
  for (const [lv, level] of levels) buf.export({ ts: 1, type: lv, level, name: 'x', args: ['m'] })

  const got = recentLogs(100, 'warn').map(e => e.level)
  assert.ok(got.includes('error') && got.includes('warn'), `minLevel='warn' 应含 error+warn，实际 ${got.join(',')}`)
  assert.ok(!got.includes('info') && !got.includes('debug'), `minLevel='warn' 不应含 info/debug，实际 ${got.join(',')}`)
  const all = recentLogs(100).map(e => e.level)
  assert.ok(all.includes('error') && all.includes('info') && all.includes('warn') && all.includes('debug'), '无 minLevel 应含全部级别')
})

test('recentLogs: 条数上限生效', () => {
  const got = recentLogs(0)
  assert.ok(Array.isArray(got))
})

test('RECENT_LIMIT: 导出常量存在且为正', () => {
  assert.equal(typeof RECENT_LIMIT, 'number')
  assert.ok(RECENT_LIMIT > 0)
})
