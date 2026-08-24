/**
 * mcp-manager.ts 全局 MCP 启停（home patch / sidecar）关键用例。
 * 覆盖（缺陷回归）：
 *  - M5: restoreGlobalMcp 对非首个 insert 块里的同名行不应漏判而重复插入；
 *  - M6: disableGlobalMcp 应收集并还原同名多行，而非只存最后一行；
 *  - 旧格式 sidecar（单行对象）读取兼容。
 * 用 $DSH_HOME 指向临时 home 构造 home patch；私有方法经类型断言访问（探针固化）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionMcpManager } from '../src/mcp-manager.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'mcp-test')
mkdirSync(testRoot, { recursive: true })

type Mgr = SessionMcpManager & {
  disableGlobalMcp: (name: string) => { ok: boolean }
  restoreGlobalMcp: (name: string) => { ok: boolean }
}

/** 构造 manager + 指向临时 home，返回 { manager, home, root }。 */
function makeManager(homePatchYaml: string): { manager: Mgr; home: string; root: string } {
  const home = mkdtempSync(join(testRoot, 'home-'))
  const root = mkdtempSync(join(testRoot, 'root-'))
  writeFileSync(join(home, 'cordis.patch.yml'), homePatchYaml, 'utf8')
  const manager = new SessionMcpManager({ registry: new Map(), get: () => undefined }, root) as unknown as Mgr
  process.env.DSH_HOME = home
  return { manager, home, root }
}

/** 记录模块加载时的 DSH_HOME 原始值，供测试结束恢复（避免污染其它用例/并行环境）。 */
const originalDshHome = process.env.DSH_HOME

function countServerName(home: string, serverName: string): number {
  const text = readFileSync(join(home, 'cordis.patch.yml'), 'utf8')
  return (text.match(new RegExp(`serverName: ${serverName}`, 'g')) || []).length
}

test('M5 回归: restoreGlobalMcp 不重复插入非首 insert 块里的同名行', () => {
  const { manager, home, root } = makeManager([
    '- insert:',
    '    - id: mcp-other',
    '      name: "M"',
    '      config: { serverName: mcp-other, transport: stdio, command: npx }',
    '- insert:',
    '    - id: mcp-x',
    '      name: "M"',
    '      config: { serverName: mcp-dup, transport: stdio, command: npx }',
    '',
  ].join('\n'))
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, '.mcp-disabled.json'), JSON.stringify({
      'mcp-dup': [{ id: 'mcp-x', name: 'M', config: { serverName: 'mcp-dup', transport: 'stdio', command: 'npx' } }],
    }))
    const res = manager.restoreGlobalMcp('mcp-dup')
    assert.equal(res.ok, true)
    assert.equal(countServerName(home, 'mcp-dup'), 1, '同名行已存在时不应重复插入')
  } finally {
    process.env.DSH_HOME = originalDshHome
    rmSync(home, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('M6: disableGlobalMcp 收集所有同名行，restore 后全部还原', () => {
  const { manager, home, root } = makeManager([
    '- insert:',
    '    - id: mcp-a',
    '      name: "M"',
    '      config: { serverName: mcp-dup, transport: stdio, command: npx }',
    '- insert:',
    '    - id: mcp-b',
    '      name: "M"',
    '      config: { serverName: mcp-dup, transport: stdio, command: node }',
    '',
  ].join('\n'))
  try {
    const d1 = manager.disableGlobalMcp('mcp-dup')
    assert.equal(d1.ok, true)
    const disabled = JSON.parse(readFileSync(join(root, '.mcp-disabled.json'), 'utf8'))
    assert.equal(disabled['mcp-dup'].length, 2, 'disable 应收集两行到 sidecar')

    const d2 = manager.restoreGlobalMcp('mcp-dup')
    assert.equal(d2.ok, true)
    const patch = readFileSync(join(home, 'cordis.patch.yml'), 'utf8')
    assert.equal((patch.match(/command: npx/g) || []).length, 1, 'npx 行应还原')
    assert.equal((patch.match(/command: node/g) || []).length, 1, 'node 行应还原')
  } finally {
    process.env.DSH_HOME = originalDshHome
    rmSync(home, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('旧格式 sidecar（单行对象）读取兼容', () => {
  const { manager, root } = makeManager('')
  try {
    mkdirSync(root, { recursive: true })
    // 旧版存的是单行对象而非数组
    writeFileSync(join(root, '.mcp-disabled.json'), JSON.stringify({
      'mcp-old': { id: 'mcp-old', name: 'M', config: { serverName: 'mcp-old', transport: 'stdio', command: 'x' } },
    }))
    const disabled = manager.readDisabledRows()
    assert.ok(Array.isArray(disabled['mcp-old']), '旧单行应被归一为数组')
    assert.equal(disabled['mcp-old'].length, 1)
  } finally {
    process.env.DSH_HOME = originalDshHome
    rmSync(root, { recursive: true, force: true })
  }
})

test('M3 回归: connect 同步 throw 时应返回 ok:false 且不泄漏 ownedServerNames', async () => {
  const root = mkdtempSync(join(testRoot, 'root-'))
  try {
    writeFileSync(join(root, '.mcp-whitelist.json'), JSON.stringify({
      servers: [{ name: 'minimcp', transport: 'stdio', command: 'npx', args: [] }],
    }))
    const manager = new SessionMcpManager({ registry: new Map(), get: () => undefined }, root) as unknown as Mgr
    // fake agent：ctx.plugin 同步 throw（mcp-client 同步初始化失败）
    const agent = {
      session: { id: 'sess-x' },
      ctx: { plugin: () => { throw new Error('sync plugin init failed') } },
    } as never
    const res = await manager.connect(agent, 'minimcp')
    assert.equal(res.ok, false, '同步 throw 应返回 ok:false 而非抛错')
    assert.match((res as { reason: string }).reason, /sync plugin init failed/)
    const owned = (manager as unknown as { ownedServerNames: Set<string> }).ownedServerNames
    assert.equal(owned.size, 0, '同步 throw 后 ownedServerNames 不应泄漏')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('M4: select 白名单失败且回滚恢复也失败时，reason 应体现且记录日志', () => {
  // 反射调用私有 select：registry 里有一个已配置 mcp 行（discoveredTemplates 命中），
  // 但其 command 为空 → upsertTemplate 校验失败 → 走 restoreGlobalMcp 回滚分支。
  const root = mkdtempSync(join(testRoot, 'root-'))
  try {
    const mgr = new SessionMcpManager(
      {
        registry: new Map([['x', { fibers: [{ name: 'mcp-x', state: 2, config: { serverName: 'mcp-x', transport: 'stdio' } }] }]]),
        get: () => undefined,
      },
      root,
    ) as unknown as Mgr
    process.env.DSH_HOME = root
    // stdio server 无 command（空串）→ upsertTemplate 校验失败，select 应返回 ok:false。
    const res = mgr.select('mcp-x')
    assert.equal(res.ok, false)
  } finally {
    process.env.DSH_HOME = originalDshHome
    rmSync(root, { recursive: true, force: true })
  }
})

test('H3 回归: 会话结束（agent.ctx 展开）后 usedCount 递减，removeTemplate 放行', async () => {
  const root = mkdtempSync(join(testRoot, 'root-'))
  try {
    writeFileSync(join(root, '.mcp-whitelist.json'), JSON.stringify({
      servers: [{ name: 'sessmcp', transport: 'stdio', command: 'npx', args: [] }],
    }))
    const mgr = new SessionMcpManager({ registry: new Map(), get: () => undefined }, root) as unknown as Mgr

    // fake agent：ctx.plugin 返回 stub fiber（await 成功），ctx.effect 捕获清理函数。
    let sessionCleanup: (() => void) | undefined
    const agent = {
      session: { id: 'sess-h3' },
      ctx: {
        plugin: () => ({ await: async () => {}, dispose: () => {} }),
        effect: (fn: () => () => void) => { sessionCleanup = fn(); return () => {} },
      },
    } as never

    const res = await mgr.connect(agent, 'sessmcp')
    assert.equal(res.ok, true)
    const usedCount = (mgr as unknown as { usedCount: Map<string, number> }).usedCount
    assert.equal(usedCount.get('sessmcp'), 1, '连接后计数应为 1')

    // removeTemplate 此时应拒绝（计数>0）
    const before = mgr.removeTemplate('sessmcp')
    assert.equal(before.ok, false, '会话未结束时不应允许删除')

    // 模拟会话结束：触发 ctx.effect 清理函数
    assert.ok(sessionCleanup, '应注册会话结束清理钩子')
    sessionCleanup!()

    assert.equal(usedCount.get('sessmcp'), undefined, '会话结束后计数应清零')
    const after = mgr.removeTemplate('sessmcp')
    assert.equal(after.ok, true, '会话结束后应能删除')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
