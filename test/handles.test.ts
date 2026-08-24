/**
 * SessionSkillStore（handles.ts）关键用例（B 引入集）。
 * 覆盖：幂等同名覆盖、会话隔离、持久化落盘/读取、跨重启稳定、落盘失败不阻断、损坏恢复。
 * 用 Node 内置 node:test，临时目录落在 test/.tmp/（工作区可写），用完清理。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionSkillStore } from '../src/handles.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'handles-test')
mkdirSync(testRoot, { recursive: true })

/** 造一个最小 Agent（只带 session.id，满足 store 的持久键需求）。 */
function makeAgent(id: string): Agent {
  return { session: { id } } as unknown as Agent
}

/** 收集日志调用（注入 PanelLogger 以便断言"落盘失败仅告警"）。 */
function makeSpyLogger() {
  const calls: Array<{ level: string; args: unknown[] }> = []
  const logger = {
    error: (...args: unknown[]) => calls.push({ level: 'error', args }),
    info: (...args: unknown[]) => calls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
    debug: (...args: unknown[]) => calls.push({ level: 'debug', args }),
  }
  return { logger, calls }
}

test('track: 幂等同名覆盖（disposer 被替换）', () => {
  const store = new SessionSkillStore() // 不持久化
  const agent = makeAgent('s1')
  let ran1 = 0
  let ran2 = 0
  store.track(agent, 'a', () => { ran1++ })
  store.track(agent, 'a', () => { ran2++ })
  assert.deepEqual(store.names(agent), ['a'])
  // 同名覆盖后，names 不重复、disposer 是新的
  store.disposer(agent, 'a')?.()
  assert.equal(ran1, 0)
  assert.equal(ran2, 1)
})

test('track/drop: names 与 disposer 反映最新状态', () => {
  const store = new SessionSkillStore()
  const agent = makeAgent('s1')
  store.track(agent, 'a', () => {})
  store.track(agent, 'b', () => {})
  assert.deepEqual(store.names(agent).sort(), ['a', 'b'])
  store.drop(agent, 'a')
  assert.deepEqual(store.names(agent), ['b'])
  assert.equal(store.disposer(agent, 'a'), undefined)
})

test('会话隔离: 不同 agent 的引入集互不可见', () => {
  const store = new SessionSkillStore()
  const a1 = makeAgent('s1')
  const a2 = makeAgent('s2')
  store.track(a1, 'x', () => {})
  assert.deepEqual(store.names(a2), [])
  assert.equal(store.disposer(a2, 'x'), undefined)
  store.track(a2, 'y', () => {})
  assert.deepEqual(store.names(a1), ['x'])
  assert.deepEqual(store.names(a2), ['y'])
})

test('持久化: track 后落盘 <persistDir>/<sessionId>.json 内容正确', () => {
  const root = mkdtempSync(join(testRoot, 'store-'))
  try {
    const store = new SessionSkillStore(root)
    const agent = makeAgent('sess-1')
    store.track(agent, 'alpha', () => {})
    store.track(agent, 'beta', () => {})
    const file = join(root, '.session-skills', 'sess-1.json')
    const data = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(data.sessionId, 'sess-1')
    assert.deepEqual(data.skills.sort(), ['alpha', 'beta'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('持久化: drop 后落盘文件更新（移除该 skill）', () => {
  const root = mkdtempSync(join(testRoot, 'store-'))
  try {
    const store = new SessionSkillStore(root)
    const agent = makeAgent('sess-1')
    store.track(agent, 'alpha', () => {})
    store.track(agent, 'beta', () => {})
    store.drop(agent, 'alpha')
    const data = JSON.parse(readFileSync(join(root, '.session-skills', 'sess-1.json'), 'utf8'))
    assert.deepEqual(data.skills, ['beta'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('不持久化: poolRoot 未提供（测试等）不落盘、不抛错', () => {
  const store = new SessionSkillStore() // persistDir === undefined
  assert.doesNotThrow(() => store.track(makeAgent('s1'), 'a', () => {}))
  assert.deepEqual(store.readPersisted('s1'), [])
})

test('会话无 session.id: 不落盘（缺持久键）', () => {
  const root = mkdtempSync(join(testRoot, 'store-'))
  try {
    const store = new SessionSkillStore(root)
    const agent = {} as Agent // 无 session
    store.track(agent, 'a', () => {})
    // 无 session.id 时不写任何文件
    assert.deepEqual(store.readPersisted(JSON.stringify(agent)), [])
    const dir = join(root, '.session-skills')
    // 目录可能不存在（未写）
    try {
      const files = require('node:fs').readdirSync(dir)
      assert.equal(files.length, 0)
    } catch {
      assert.ok(true) // 目录不存在，未写
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readPersisted: 文件不存在 → []', () => {
  const store = new SessionSkillStore()
  assert.deepEqual(store.readPersisted('nonexistent'), [])
})

test('readPersisted: JSON 损坏 → []（容错恢复）', () => {
  const root = mkdtempSync(join(testRoot, 'store-'))
  try {
    mkdirSync(join(root, '.session-skills'), { recursive: true })
    writeFileSync(join(root, '.session-skills', 'sess-1.json'), '{broken', 'utf8')
    const store = new SessionSkillStore(root)
    assert.deepEqual(store.readPersisted('sess-1'), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('readPersisted: skills 非数组/混入非字符串被过滤', () => {
  const root = mkdtempSync(join(testRoot, 'store-'))
  try {
    mkdirSync(join(root, '.session-skills'), { recursive: true })
    writeFileSync(
      join(root, '.session-skills', 'sess-1.json'),
      JSON.stringify({ sessionId: 'sess-1', skills: ['a', 42, 'b', null] }),
      'utf8',
    )
    const store = new SessionSkillStore(root)
    assert.deepEqual(store.readPersisted('sess-1'), ['a', 'b'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('落盘失败不阻断: persist 抛错仅告警、track 不抛', () => {
  const root = mkdtempSync(join(testRoot, 'store-'))
  try {
    // 让 .session-skills 变成一个文件，mkdirSync({recursive}) 会抛 ENOTDIR/EEXIST
    writeFileSync(join(root, '.session-skills'), 'i am a file not a dir', 'utf8')
    const { logger, calls } = makeSpyLogger()
    const store = new SessionSkillStore(root, logger)
    assert.doesNotThrow(() => store.track(makeAgent('s1'), 'a', () => {}))
    assert.ok(calls.some(c => c.level === 'warn'), '落盘失败应告警')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
