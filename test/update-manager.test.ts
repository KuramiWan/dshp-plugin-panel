/**
 * 更新路径集成级用例（fake profile 目录 + 桩 pnpm/dsh）：
 * - checkUpdates 合成视图（自身 range + 受管 patch/bundle 行 + 非 range 跳过）。
 * - applyUpdate 校验（不在依赖声明 / 非 range 拒绝；dsh 成功/失败分支）。
 * 不引真实 pnpm/registry —— 把 PluginManager 的 runInProfile 换成注入式 stub。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PluginManager, PANEL_PACKAGE } from '../src/plugin-manager.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'update-manager-test')
mkdirSync(testRoot, { recursive: true })

/** 造一个假 profile：package.json 依赖 + node_modules 里两个包 + 规格文件 + patch 行。 */
function makeProfile(opts: { deps: Record<string, string>; specs?: unknown[] }): string {
  const root = mkdtempSync(join(testRoot, 'profile-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'fake-profile',
    version: '1.0.0',
    dependencies: opts.deps,
    dsh: { profile: { bundles: [] } },
  }, null, 2))
  // node_modules 里放两个真实包 manifest
  for (const pkg of ['commander', PANEL_PACKAGE]) {
    const dir = join(root, 'node_modules', ...pkg.split('/'))
    mkdirSync(dir, { recursive: true })
    const version = pkg === PANEL_PACKAGE ? '0.2.2' : '11.0.0'
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: pkg, version }))
  }
  // 规格文件
  writeFileSync(join(root, '.dshp-plugins.json'), JSON.stringify({ plugins: opts.specs ?? [] }))
  // patch 行（无 insert = 空 cordis）
  writeFileSync(join(root, 'cordis.patch.yml'), '# empty\n')
  return root
}

/** 用 stub runInProfile 的 manager：把命令映射成预置输出。 */
function makeManagerWithPnpm(root: string, stub: (args: string[]) => { code: number; stdout: string; stderr: string }) {
  const ctx = { registry: new Map(), fiber: {} } as never
  const mcp = { whitelist: () => [], connectedNames: () => [] } as never
  const mgr = new PluginManager(ctx, mcp, root) as PluginManager & {
    runInProfile: (args: string[], timeoutMs?: number) => Promise<{ code: number; stdout: string; stderr: string }>
  }
  // 覆写私有方法（TS 不拦）
  ;(mgr as unknown as { runInProfile: unknown }).runInProfile = (args: string[]) => Promise.resolve(stub(args))
  return mgr
}

test('checkUpdates: 自身 range + 受管 patch 行 + registry 有新版 → updatable', async () => {
  const root = makeProfile({
    deps: { [PANEL_PACKAGE]: '^0.2.2', commander: '^11.0.0' },
    specs: [{ id: 'cmd', name: 'commander', source: 'patch' }],
  })
  const mgr = makeManagerWithPnpm(root, (args) => {
    if (args[0] === 'pnpm' && args[1] === 'outdated') {
      return {
        code: 0,
        stdout: JSON.stringify({
          commander: { current: '11.0.0', wanted: '11.1.0', latest: '11.1.0' },
          [PANEL_PACKAGE]: { current: '0.2.2', wanted: '0.2.2', latest: '0.2.2' },
        }),
        stderr: '',
      }
    }
    return { code: 0, stdout: '', stderr: '' }
  })
  const checks = await mgr.checkUpdates()
  // 自身不 updatable（已最新）；commander 受管行 updatable 且同 major
  const self = checks.find(c => c.packageName === PANEL_PACKAGE)
  const cmd = checks.find(c => c.packageName === 'commander')
  assert.equal(self?.current, '0.2.2')
  assert.equal(self?.updatable, false)
  assert.equal(cmd?.updatable, true)
  assert.equal(cmd?.major, false)
  assert.equal(cmd?.wanted, '11.1.0')
  assert.equal(cmd?.latest, '11.1.0')
})

test('checkUpdates: 跨 major → major=true', async () => {
  const root = makeProfile({
    deps: { commander: '^11.0.0' },
    specs: [{ id: 'cmd', name: 'commander', source: 'patch' }],
  })
  const mgr = makeManagerWithPnpm(root, () => ({
    code: 0,
    stdout: JSON.stringify({ commander: { current: '11.0.0', wanted: '11.0.0', latest: '12.0.0' } }),
    stderr: '',
  }))
  const cmd = (await mgr.checkUpdates()).find(c => c.packageName === 'commander')
  assert.equal(cmd?.updatable, true)
  assert.equal(cmd?.major, true)
})

test('checkUpdates: 非 range 声明（file:/github:）→ 只展示差异不 updatable', async () => {
  const root = makeProfile({
    deps: { commander: 'file:node_modules/commander' },
    specs: [{ id: 'cmd', name: 'commander', source: 'patch' }],
  })
  const mgr = makeManagerWithPnpm(root, () => ({
    code: 0,
    stdout: JSON.stringify({ commander: { current: '11.0.0', wanted: '11.0.0', latest: '12.0.0' } }),
    stderr: '',
  }))
  const cmd = (await mgr.checkUpdates()).find(c => c.packageName === 'commander')
  assert.equal(cmd?.specKind, 'non-range')
  assert.equal(cmd?.updatable, false)
  assert.equal(cmd?.latest, '12.0.0')
})

test('applyUpdate: 不在依赖声明 → 拒绝且不跑命令', async () => {
  const root = makeProfile({ deps: {}, specs: [] })
  let ran = false
  const mgr = makeManagerWithPnpm(root, () => { ran = true; return { code: 0, stdout: '', stderr: '' } })
  const res = await mgr.applyUpdate('commander', false)
  assert.equal(res.ok, false)
  assert.equal(ran, false)
})

test('applyUpdate: 非 range 声明 → 拒绝', async () => {
  const root = makeProfile({ deps: { commander: 'file:node_modules/commander' }, specs: [] })
  const mgr = makeManagerWithPnpm(root, () => ({ code: 0, stdout: '', stderr: '' }))
  const res = await mgr.applyUpdate('commander', false)
  assert.equal(res.ok, false)
})

test('applyUpdate: range 内成功 → ok + version + restartRequired', async () => {
  const root = makeProfile({
    deps: { commander: '^11.0.0' },
    specs: [{ id: 'cmd', name: 'commander', source: 'patch' }],
  })
  let calledArgs: string[] | null = null
  const mgr = makeManagerWithPnpm(root, (args) => {
    calledArgs = args
    // 模拟 dsh plugin 成功：把 node_modules 里 commander 的 version 改成 11.1.0
    if (args.includes('update')) {
      const p = join(root, 'node_modules', 'commander', 'package.json')
      const pkg = JSON.parse(readFileSync(p, 'utf8'))
      pkg.version = '11.1.0'
      writeFileSync(p, JSON.stringify(pkg, null, 2))
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  })
  const res = await mgr.applyUpdate('commander', false)
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.version, '11.1.0')
    assert.equal(res.restartRequired, true)
    assert.equal(res.major, false)
  }
  // 命令形如 [dsh, plugin, --profile, <name>, update, commander]
  assert.ok(calledArgs !== null)
  assert.equal(calledArgs[0], 'dsh')
  assert.equal(calledArgs[1], 'plugin')
  assert.equal(calledArgs[2], '--profile')
  assert.equal(calledArgs[3], mgr.profileName)
  assert.ok(calledArgs.indexOf('update') >= 0)
  assert.ok(calledArgs.includes('commander'))
})

test('applyUpdate: 命令失败 → ok:false 带原因', async () => {
  const root = makeProfile({ deps: { commander: '^11.0.0' }, specs: [] })
  const mgr = makeManagerWithPnpm(root, () => ({ code: 1, stdout: '', stderr: 'pnpm ERR! something broke' }))
  const res = await mgr.applyUpdate('commander', true)
  assert.equal(res.ok, false)
  if (!res.ok) assert.ok(res.reason.includes('something broke'))
})

test('applyUpdate: 并发守卫 —— 第二个调用被拒', async () => {
  const root = makeProfile({ deps: { commander: '^11.0.0' }, specs: [] })
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  const mgr = makeManagerWithPnpm(root, async () => {
    await gate
    return { code: 0, stdout: '', stderr: '' }
  })
  const p1 = mgr.applyUpdate('commander', false)
  // 稍等让第一个进入 updating
  await new Promise(r => setTimeout(r, 10))
  const res2 = await mgr.applyUpdate('commander', false)
  assert.equal(res2.ok, false)
  release()
  await p1
})