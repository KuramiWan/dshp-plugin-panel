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

test('M3: patch 里的 mcp 桥接行不应被当 patch 行管理（启停报"已在 patch 中"的根因）', async () => {
  // fixtures 场景：profile patch 的 insert 块里有一个 mcp-client 桥接行
  // （config 有 serverName/transport）+ 一个普通插件行。面板的插件段应只管理
  // 普通插件行；mcp 桥接行由 MCP 段（白名单/发现）处理。
  const { root, manager } = makeManager()
  try {
    writeFileSync(patchFile(root), [
      '- insert:',
      '    - id: test-mcp-stdio',
      '      name: "@deepseek-ai/dsh-mcp-client"',
      '      config:',
      '        serverName: test-mcp-stdio',
      '        transport: stdio',
      '        command: __nonexistent_fixture_server__',
      '        args: []',
      '    - id: normal-plugin',
      '      name: "@user/normal-plugin"',
      '',
    ].join('\n'), 'utf8')

    // 触发 syncSpecs（install 会调它），模拟"环境曾启停过"后的状态文件写入。
    manager.install('another', '@x/another')

    // 1. 状态文件不应把 mcp 桥接行记为 patch 规格
    const stateFile = join(root, '.dshp-plugins.json')
    const specs = JSON.parse(readFileSync(stateFile, 'utf8')).plugins as Array<{ id: string; source: string }>
    assert.ok(!specs.some(s => s.id === 'test-mcp-stdio'), 'mcp 桥接行不应被 syncSpecs 记为 patch 规格')
    // 普通行和触发行正常记录
    assert.ok(specs.some(s => s.id === 'normal-plugin'), '普通 patch 行应被记录')
    assert.ok(specs.some(s => s.id === 'another'), 'install 的行应被记录')

    // 2. 无对应 fiber 时，list() 不应把 mcp 桥接行当 patch 行展示（可管理）
    //    （mcp 行的展示由白名单负责）
    const views = manager.list()
    const mcpView = views.find(v => v.id === 'test-mcp-stdio')
    assert.ok(mcpView === undefined || mcpView.source !== 'patch',
      `mcp 桥接行不应以 patch 行展示，实际 source=${mcpView?.source}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('D1: demoteToBundle 把 patch 行改回 bundle（移 patch 行 + 加回 bundles + 恢复声明 + 标需重启）', () => {
  // 场景：一个 bundle 包被 promote 过（声明已删、.bak 留有 dsh.bundle），
  // 之后 enable 写回了 patch 行 → 现在 demote 改回冷挂载。
  const root = mkdtempSync(join(testRoot, 'profile-'))
  // patch 行（enable 后写入）
  writeFileSync(join(root, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  // bundles 不含该包（promote 已移除）
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  // 包 manifest：无 dsh.bundle（promote 已删），.bak 保留原始声明
  const pkgDir = join(root, 'node_modules', '@user', 'my-plugin')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name: '@user/my-plugin', version: '1.0.0',
  }))
  writeFileSync(join(pkgDir, 'package.json.bak'), JSON.stringify({
    name: '@user/my-plugin', version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  // .bak 声明的 patch 路径要真实存在（DSH 重启按它加载）
  writeFileSync(join(pkgDir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  const manager = new PluginManager(
    makeCtx({}, [{ name: 'my-plugin', config: { pkg: '@user/my-plugin' }, state: 2 }]),
    makeMcpStub(),
    root,
  )
  try {
    const res = manager.demoteToBundle('my-plugin')
    assert.equal(res.ok, true)
    assert.equal((res as { restartRequired: boolean }).restartRequired, true, '改冷挂载需重启生效')

    // 1. patch 行已移除
    const patchText = readFileSync(patchFile(root), 'utf8')
    assert.ok(!patchText.includes('my-plugin'), 'patch 行应被移除')

    // 2. bundles 加回（其它 bundle 不受影响）
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.ok(pkg.dsh.profile.bundles.includes('@user/my-plugin'), 'bundle 应加回')
    assert.ok(pkg.dsh.profile.bundles.includes('@deepseek-ai/dsh-base'), '其它 bundle 不受影响')

    // 3. dsh.bundle 声明恢复（从 .bak 还原；否则 reconcile 会把它移出 bundles）
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dsh.bundle, { patch: './cordis.patch.yml' }, 'dsh.bundle 声明应恢复')

    // 4. 状态文件标记为 bundle + 待重启（pendingDemote）
    const specs = JSON.parse(readFileSync(join(root, '.dshp-plugins.json'), 'utf8')).plugins as Array<{
      id: string; source: string; pendingDemote?: boolean
    }>
    const spec = specs.find(s => s.id === 'my-plugin')
    assert.equal(spec?.source, 'bundle')
    assert.equal(spec?.pendingDemote, true, '应标记待重启')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('D2: demote 后 pendingDemote 中间态——重启前视图标注需重启；重启后（bundle 生效）正常显示为 bundle', () => {
  const root = mkdtempSync(join(testRoot, 'profile-'))
  writeFileSync(join(root, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  // 包 manifest（promote 已删 dsh.bundle，无 .bak），包内有一个真实 patch 文件
  const pkgDir = join(root, 'node_modules', '@user', 'my-plugin')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name: '@user/my-plugin', version: '1.0.0',
  }))
  writeFileSync(join(pkgDir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  const manager = new PluginManager(
    makeCtx({}, [{ name: 'my-plugin', config: { pkg: '@user/my-plugin' }, state: 2 }]),
    makeMcpStub(),
    root,
  )
  try {
    assert.equal(manager.demoteToBundle('my-plugin').ok, true)

    // 1. 重启前（pendingDemote）：patch 行移除后 fiber 热卸载（不在 registry），
    //    行从 specs 视图出现，标注「需重启」（bundle 尚未冷挂载生效）。
    const managerMid = new PluginManager(makeCtx({}, []), makeMcpStub(), root)
    const pre = managerMid.list().find(v => v.id === 'my-plugin')
    assert.ok(pre !== undefined, '重启前行不应消失')
    assert.equal(pre?.source, 'bundle')
    assert.equal(pre?.active, false)
    assert.equal(pre?.pendingRestart, true, 'pendingDemote 应映射为 pendingRestart 红标')

    // 2. 重启后（bundle 生效）：fiber 以 bundle 源回归 registry，无红标（settle 已清理）
    const managerAfter = new PluginManager(
      makeCtx({}, [{ name: 'my-plugin', config: { pkg: '@user/my-plugin' }, state: 2 }]),
      makeMcpStub(),
      root,
    )
    const post = managerAfter.list().find(v => v.id === 'my-plugin')
    assert.equal(post?.source, 'bundle')
    assert.equal(post?.pendingRestart, undefined, '重启后不再标需重启')
    // spec 的 pendingDemote 标记已被清理
    const specsAfter = JSON.parse(readFileSync(join(root, '.dshp-plugins.json'), 'utf8')).plugins as Array<{
      id: string; pendingDemote?: boolean
    }>
    assert.equal(specsAfter.find(s => s.id === 'my-plugin')?.pendingDemote, undefined, '重启后应清理 pendingDemote')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('D3: demote 只接受 patch 行——core / bundle / mcp / 面板自身拒绝', () => {
  // core 行：registry 有 fiber，无 patch 行、无 bundle、无 spec
  const root = mkdtempSync(join(testRoot, 'profile-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  const manager = new PluginManager(
    makeCtx({}, [
      { name: 'core-plugin', config: { pkg: '@deepseek-ai/dsh-base' }, state: 2 },
      { name: 'bundle-plugin', config: { pkg: '@user/bundle-plugin' }, state: 2 },
      { name: PANEL_ROW_ID, config: { pkg: PANEL_PACKAGE }, state: 2 },
    ]),
    makeMcpStub(),
    root,
  )
  try {
    // bundle 行（在 bundles 里）
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@user/bundle-plugin'] } },
    }))
    const resBundle = manager.demoteToBundle('bundle-plugin')
    assert.equal(resBundle.ok, false)
    assert.match((resBundle as { reason: string }).reason, /不是 patch 行/)
    // core 行（无 patch 行、无 bundles）
    const resCore = manager.demoteToBundle('core-plugin')
    assert.equal(resCore.ok, false)
    assert.match((resCore as { reason: string }).reason, /不是 patch 行/)
    // 面板自身（patch 行 + self）
    writeFileSync(patchFile(root), [
      '- insert:',
      `    - id: ${PANEL_ROW_ID}`,
      `      name: ${PANEL_PACKAGE}`,
      '',
    ].join('\n'), 'utf8')
    const resSelf = manager.demoteToBundle(PANEL_ROW_ID)
    assert.equal(resSelf.ok, false)
    assert.match((resSelf as { reason: string }).reason, /面板自身/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('D4: 包无 dsh.bundle 声明、无 .bak、无 patch 文件 → demote 拒绝（DSH 无法作为 bundle 层加载）', () => {
  const root = mkdtempSync(join(testRoot, 'profile-'))
  writeFileSync(join(root, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  // 包 manifest 无声明、无 .bak、包内无任何 patch 文件（纯 JS 插件，未声明 bundle）
  const pkgDir = join(root, 'node_modules', '@user', 'my-plugin')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name: '@user/my-plugin', version: '1.0.0',
  }))
  writeFileSync(join(pkgDir, 'index.js'), 'export default {};\n', 'utf8')
  const manager = new PluginManager(
    makeCtx({}, [{ name: 'my-plugin', config: { pkg: '@user/my-plugin' }, state: 2 }]),
    makeMcpStub(),
    root,
  )
  try {
    const res = manager.demoteToBundle('my-plugin')
    assert.equal(res.ok, false)
    assert.match((res as { reason: string }).reason, /无法作为 bundle 层/)
    // 拒绝后不应有残留：patch 行保留、bundles 未加回、无 spec 标记
    assert.ok(readFileSync(patchFile(root), 'utf8').includes('my-plugin'), '拒绝后 patch 行应保留')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.ok(!pkg.dsh.profile.bundles.includes('@user/my-plugin'), '拒绝后 bundles 不应加回')
    const stateFile = join(root, '.dshp-plugins.json')
    if (existsSync(stateFile)) {
      const specs = JSON.parse(readFileSync(stateFile, 'utf8')).plugins as Array<{ id: string }>
      assert.ok(!specs.some(s => s.id === 'my-plugin'), '拒绝后不应写 spec')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('D5: demote 后 fiber 卸载、bundle 未重启的中间态——specs 视图显示为「需重启」的 bundle 行', () => {
  const root = mkdtempSync(join(testRoot, 'profile-'))
  writeFileSync(join(root, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }))
  const pkgDir = join(root, 'node_modules', '@user', 'my-plugin')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name: '@user/my-plugin', version: '1.0.0',
  }))
  writeFileSync(join(pkgDir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: my-plugin',
    '      name: "@user/my-plugin"',
    '',
  ].join('\n'), 'utf8')
  const manager = new PluginManager(
    makeCtx({}, [{ name: 'my-plugin', config: { pkg: '@user/my-plugin' }, state: 2 }]),
    makeMcpStub(),
    root,
  )
  try {
    assert.equal(manager.demoteToBundle('my-plugin').ok, true)
    // fiber 已卸载（热重载生效）但未重启：行从 specs 视图出现，带「需重启」红标
    const managerAfter = new PluginManager(makeCtx({}, []), makeMcpStub(), root)
    const view = managerAfter.list().find(v => v.id === 'my-plugin')
    assert.ok(view !== undefined, '中间态行不应消失')
    assert.equal(view?.source, 'bundle')
    assert.equal(view?.active, false)
    assert.equal(view?.pendingRestart, true, 'bundle 生效前行应标「需重启」')
    assert.equal(view?.manageable, true, '中间态行应可管理（可停用/启用 bundle）')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('M8: 停用 fixtures 预置的 patch 行后应保留为已停用（不消失，可重新启用）', async () => {
  // fixtures 场景：dshp-test-plugin 是 profile patch 预置行（从未经 install 进过 specs）。
  // 停用后应保留在状态文件（list 的 specs 视图显示为已停用），否则热重载移除 fiber 后
  // 完全消失、无法重新启用。
  const { root, manager } = makeManager()
  try {
    writeFileSync(patchFile(root), [
      '- insert:',
      '    - id: dshp-test-plugin',
      '      name: dshp-test-plugin',
      '',
    ].join('\n'), 'utf8')
    // 先让 fiber 在 registry（active），disable 才走 patch 分支
    const ctxActive = {
      registry: new Map([['plugin', { fibers: [{ name: 'dshp-test-plugin', state: 2, config: { pkg: 'dshp-test-plugin' } }] }]]),
    } as unknown as import('@deepseek-ai/cordis').Context
    const managerActive = new PluginManager(
      ctxActive,
      makeMcpStub(),
      root,
    )
    const dis = await managerActive.disable('dshp-test-plugin')
    assert.equal(dis.ok, true)

    // 1. 状态文件应保留该行规格（供重新启用）
    const specs = JSON.parse(readFileSync(join(root, '.dshp-plugins.json'), 'utf8')).plugins as Array<{ id: string; source: string }>
    assert.ok(specs.some(s => s.id === 'dshp-test-plugin'), '停用后应保留规格')
    assert.equal(specs.find(s => s.id === 'dshp-test-plugin')?.source, 'patch')

    // 2. fiber 移除（热重载后）list() 仍显示为已停用
    const managerAfter = new PluginManager(makeCtx({}, []), makeMcpStub(), root)
    const view = managerAfter.list().find(v => v.id === 'dshp-test-plugin')
    assert.ok(view !== undefined, '停用后不应消失')
    assert.equal(view?.active, false, '应显示为已停用')
    assert.equal(view?.manageable, true, '应可重新启用')

    // 3. 重新启用：patch 行恢复
    const en = await managerAfter.enable('dshp-test-plugin')
    assert.equal(en.ok, true)
    assert.ok(readFileSync(patchFile(root), 'utf8').includes('dshp-test-plugin'), '启用后 patch 行应恢复')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('M9: 停用插件不应删除同 patch 里的 mcp 桥接行（writePatch 重建要保留 mcp 行）', async () => {
  // 用户复现场景：fixtures 的 profile patch 含 dshp-test-plugin + test-mcp-stdio 两行。
  // 停用 dshp-test-plugin（M8 路径）后，test-mcp-stdio 桥接行被 writePatch 整体重建
  // 静默删掉 → 面板 MCP 段只剩 plugin、mcp 消失（用户报告「没有看到测试 mcp」）。
  const { root } = makeManager()
  try {
    writeFileSync(patchFile(root), [
      '- insert:',
      '    - id: dshp-test-plugin',
      '      name: dshp-test-plugin',
      '    - id: test-mcp-stdio',
      '      name: "@deepseek-ai/dsh-mcp-client"',
      '      config:',
      '        serverName: test-mcp-stdio',
      '        transport: stdio',
      '        command: __nonexistent_fixture_server__',
      '        args: []',
      '',
    ].join('\n'), 'utf8')
    // fiber 在 registry（active），disable 才走 patch 分支
    const ctxActive = {
      registry: new Map([['plugin', { fibers: [{ name: 'dshp-test-plugin', state: 2, config: { pkg: 'dshp-test-plugin' } }] }]]),
    } as unknown as import('@deepseek-ai/cordis').Context
    const managerActive = new PluginManager(ctxActive, makeMcpStub(), root)
    const dis = await managerActive.disable('dshp-test-plugin')
    assert.equal(dis.ok, true)

    // mcp 桥接行必须保留（MCP 段继续管理它；面板插件段不碰它，M3 语义）
    const patchText = readFileSync(patchFile(root), 'utf8')
    assert.ok(patchText.includes('test-mcp-stdio'), '停用插件后 mcp 桥接行应保留')
    assert.ok(patchText.includes('__nonexistent_fixture_server__'), 'mcp 桥接行的 config 应原样保留')
    assert.ok(!patchText.includes('dshp-test-plugin'), '被停用的插件行应移除')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
