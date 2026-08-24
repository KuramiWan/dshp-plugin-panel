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
