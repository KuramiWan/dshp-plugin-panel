/**
 * plugin-manager.ts 关键用例（E 插件管理 / ADR-0008 写保护）。
 * 覆盖：install 写 patch 行（校验/去重/自禁）、writePatch 备份 + YAML 校验 + 原子写、
 * 禁停面板自身、行分类（classifySource）。
 * 用 fake ctx（registry/fiber 桩）+ 临时 profile 目录，不引宿主运行时。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as parseYaml } from 'js-yaml'
import { PluginManager, PANEL_ROW_ID, PANEL_PACKAGE } from '../src/plugin-manager.ts'
import type { SessionMcpManager } from '../src/mcp-manager.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'plugin-manager-test')
mkdirSync(testRoot, { recursive: true })

interface FakeFiber {
  name?: string
  entry?: { id?: string }
}

/** fake ctx：registry（可含 fibers）+ fiber 桩；mcp 桩返回空白名单。 */
function makeCtx(fiber: FakeFiber = {}, registryFibers: FakeFiber[] = []): import('@deepseek-ai/cordis').Context {
  return {
    registry: new Map([['plugin', { fibers: registryFibers }]]),
    fiber,
  } as unknown as import('@deepseek-ai/cordis').Context
}

function makeMcpStub(): SessionMcpManager {
  return {
    whitelist: () => [],
    connectedNames: () => [],
  } as unknown as SessionMcpManager
}

/** 建临时 profile 目录，返回 { root, manager }。 */
function makeManager(fiber: FakeFiber = {}, registryFibers: FakeFiber[] = []) {
  const root = mkdtempSync(join(testRoot, 'profile-'))
  const manager = new PluginManager(makeCtx(fiber, registryFibers), makeMcpStub(), root)
  return { root, manager }
}

function patchFile(root: string): string {
  return join(root, 'cordis.patch.yml')
}

test('install: 写入一条 insert 行到 cordis.patch.yml（顶层数组）', () => {
  const { root, manager } = makeManager()
  try {
    const res = manager.install('my-plugin', '@scope/my-plugin')
    assert.equal(res.ok, true)
    const parsed = parseYaml(readFileSync(patchFile(root), 'utf8')) as Array<{ insert?: unknown }>
    assert.ok(Array.isArray(parsed))
    const rows = (parsed[0]?.insert ?? []) as Array<{ id: string; name: string }>
    assert.deepEqual(rows, [{ id: 'my-plugin', name: '@scope/my-plugin' }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('install: 重复 id 拒绝（不重复挂载）', () => {
  const { root, manager } = makeManager()
  try {
    assert.equal(manager.install('p', '@x/p').ok, true)
    const res = manager.install('p', '@x/p')
    assert.equal(res.ok, false)
    assert.match((res as { reason: string }).reason, /已在 patch/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('install: 非法 id / 空 name 拒绝', () => {
  const { root, manager } = makeManager()
  try {
    assert.equal(manager.install('../bad', '@x/p').ok, false)
    assert.equal(manager.install('ok-id', '').ok, false)
    assert.equal(manager.install('', '@x/p').ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('install: 禁对面板自身执行（PANEL_ROW_ID / PANEL_PACKAGE）', () => {
  const { root, manager } = makeManager()
  try {
    assert.equal(manager.install(PANEL_ROW_ID, PANEL_PACKAGE).ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('writePatch: 写前备份到 .bak，新内容 YAML 可解析', () => {
  const { root, manager } = makeManager()
  try {
    // 先写一个 patch，制造「备份旧内容」的场景
    writeFileSync(patchFile(root), '- insert:\n  - id: old\n    name: "@x/old"\n', 'utf8')
    manager.install('new-p', '@x/new')
    assert.ok(existsSync(patchFile(root) + '.bak'), '应生成备份')
    const backup = readFileSync(patchFile(root) + '.bak', 'utf8')
    assert.match(backup, /old/)
    // 新内容合法（可解析为顶层数组）
    const parsed = parseYaml(readFileSync(patchFile(root), 'utf8'))
    assert.ok(Array.isArray(parsed))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('writePatch: 保留非 insert 的用户手工 patch 选项', () => {
  const { root, manager } = makeManager()
  try {
    // 含一个非 insert 的顶层选项（如 schema/version 注释项）
    writeFileSync(patchFile(root), '- insert:\n    - id: keep\n      name: "@x/keep"\n- schema: 1\n', 'utf8')
    manager.install('new-p', '@x/new')
    const parsed = parseYaml(readFileSync(patchFile(root), 'utf8')) as Array<Record<string, unknown>>
    const hasSchema = parsed.some(opt => opt && typeof opt === 'object' && 'schema' in opt)
    assert.ok(hasSchema, '非 insert 选项应被保留')
    // 用户手工 insert 行被整体重建，但新行已写入
    const text = readFileSync(patchFile(root), 'utf8')
    assert.match(text, /new-p/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('disable: 禁停面板自身（fiber 自身行）', async () => {
  // registry 里有一个 name=PANEL_ROW_ID 的 fiber → 视图中 isSelf=true → 禁停。
  const { root, manager } = makeManager(
    { name: PANEL_ROW_ID },
    [{ name: PANEL_ROW_ID }],
  )
  try {
    const res = await manager.disable(PANEL_ROW_ID)
    assert.equal(res.ok, false)
    assert.match((res as { reason: string }).reason, /禁止停用面板自身/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('disable: 未找到插件行 → 报错', async () => {
  const { root, manager } = makeManager()
  try {
    const res = await manager.disable('ghost')
    assert.equal(res.ok, false)
    assert.match((res as { reason: string }).reason, /未找到插件行/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('classifySource: patch/bundle/core 判定', () => {
  const { manager } = makeManager()
  const c = (manager as unknown as { classifySource: (isSelf: boolean, inPatch: boolean, isUserBundle: boolean, pendingPromote: boolean) => string })
  // 私有方法经类型断言访问
  assert.equal(c.classifySource(false, true, false, false), 'patch')
  assert.equal(c.classifySource(false, false, true, false), 'bundle')
  assert.equal(c.classifySource(false, false, false, false), 'core')
  assert.equal(c.classifySource(false, false, false, true), 'patch') // pendingPromote
  assert.equal(c.classifySource(true, false, false, false), 'patch') // isSelf
})

test('state 文件: install 后写入 .dshp-plugins.json（跨会话还原用）', () => {
  const { root, manager } = makeManager()
  try {
    manager.install('p', '@x/p')
    const state = JSON.parse(readFileSync(join(root, '.dshp-plugins.json'), 'utf8'))
    assert.ok(state.plugins.some((s: { id: string }) => s.id === 'p'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('H1: install 不应丢弃既有非字符串 id 的 patch 行（数据保护）', () => {
  const { root, manager } = makeManager()
  try {
    // 既有的 patch 含一行 id 为数字（YAML 允许 id: 123）的行 + 一行字符串 id。
    // writePatch 从 readPatchRows() 重建（只收字符串 id），会丢数字 id 行 —— 这是 H1 缺陷。
    writeFileSync(patchFile(root), [
      '- insert:',
      '    - id: 123',
      '      name: "@x/numeric-id"',
      '    - id: keep-me',
      '      name: "@x/string-id"',
      '',
    ].join('\n'), 'utf8')

    manager.install('new-p', '@x/new')

    const parsed = parseYaml(readFileSync(patchFile(root), 'utf8')) as Array<{ insert?: Array<{ id: unknown; name: unknown }> }>
    const allRows = parsed.flatMap(o => o.insert ?? [])
    const ids = allRows.map(r => String(r.id))
    // 期望：既有行（含数字 id 123）都应保留 —— 当前实现会丢行 123，此断言失败即证实 H1。
    assert.ok(ids.includes('123'), `数字 id 行应被保留，但实际丢失；当前 id 集: ${ids.join(',')}`)
    assert.ok(ids.includes('keep-me'))
    assert.ok(ids.includes('new-p'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('M1: 多个 unnamed fiber 应各自可见，不应合并成一个 (unnamed)', () => {
  // registry 有两个 name 为空的 fiber（非 mcp），list() 应返回 2 条。
  // 当前实现把两者都映射到 id="(unnamed)" 并去重，只留一个 —— M1 缺陷。
  const root = mkdtempSync(join(testRoot, 'profile-'))
  const manager = new PluginManager(
    makeCtx({}, [
      { config: { foo: 1 } },
      { config: { bar: 2 } },
    ]),
    makeMcpStub(),
    root,
  )
  try {
    const views = manager.list()
    assert.equal(views.length, 2, `两个 unnamed fiber 应各占一条视图，实际 ${views.length} 条`)
    assert.notEqual(views[0].id, views[1].id, '两个 unnamed fiber 的 id 不应相同')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('M2: 双挂载（patch + bundle）disable 时同步撤 bundle，并标注需重启', async () => {
  const root = mkdtempSync(join(testRoot, 'profile-'))
  // patch 里有一行 dup-plugin
  writeFileSync(join(root, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: dup-plugin',
    '      name: "@user/dup-plugin"',
    '',
  ].join('\n'), 'utf8')
  // bundles 里也挂同名包（reconcile 自动加回的双挂载）
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@user/dup-plugin'] } },
  }))
  const manager = new PluginManager(
    makeCtx({}, [{ name: 'dup-plugin', config: { pkg: '@user/dup-plugin' }, state: 2 }]),
    makeMcpStub(),
    root,
  )
  try {
    const view = manager.list().find(v => v.id === 'dup-plugin')
    assert.equal(view?.active, true)
    const res = await manager.disable('dup-plugin')
    assert.equal(res.ok, true)
    assert.equal((res as { restartRequired?: boolean }).restartRequired, true, '双挂载停用应标注需重启')
    // patch 行已摘
    const patchText = readFileSync(patchFile(root), 'utf8')
    assert.ok(!patchText.includes('dup-plugin'), 'patch 行应被移除')
    // bundle 也应已摘
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.ok(!pkg.dsh.profile.bundles.includes('@user/dup-plugin'), 'bundle 应同步移除')
    assert.ok(pkg.dsh.profile.bundles.includes('@deepseek-ai/dsh-base'), '其它 bundle 不受影响')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
