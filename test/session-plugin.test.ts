/**
 * 会话级插件挂载 —— HTTP 缝用例（spec「单接缝」：全部新行为经 POST /plugin-panel/* 断言）。
 * 伪造 agents 注册表；每个 agent 的会话 Context 用**真实 cordis 子 Context** 构造，
 * 使 fiber 生命周期、泄漏预检、会话结束清理都是真实语义。
 * 临时「profile」目录承载可解析的插件包（node_modules/<name>）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { PluginPanelService } from '../src/plugin-panel-service.ts'
import { SessionPluginManager } from '../src/session-plugin-manager.ts'
import { SessionSkillStore } from '../src/handles.ts'
import type { SessionMcpManager } from '../src/mcp-manager.ts'
import { PluginManager, type PluginFiberView } from '../src/plugin-manager.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'session-plugin-test')
mkdirSync(testRoot, { recursive: true })

/** 建一个临时 profile 目录，并装入一个可解析的插件包。 */
function makeProfile(pkg: string, entry: string): string {
  const dir = mkdtempSync(join(testRoot, 'profile-'))
  mkdirSync(join(dir, 'node_modules', pkg), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test-profile', private: true }))
  writeFileSync(join(dir, 'node_modules', pkg, 'package.json'),
    JSON.stringify({ name: pkg, version: '0.0.0', type: 'module', main: 'index.js' }))
  writeFileSync(join(dir, 'node_modules', pkg, 'index.js'), entry)
  return dir
}

/** 在 root 上建一个真实 cordis 会话 Context（复刻 dsh-scope createScope + agent-loop 的 extend）。 */
async function makeSessionCtx(root: Context, id: string) {
  const scope = root.plugin({ name: 'scope', apply() {} })
  await scope.await()
  const agentCtx = scope.ctx.extend({ agent: { id } })
  return { scope, agentCtx, dispose: () => scope.dispose() }
}

/** 组合行视图的最小造法（管理器只读 packageName）。 */
function row(id: string, packageName: string, active = true): PluginFiberView {
  return {
    id, source: 'patch', state: active ? 2 : -1, active,
    protected: false, manageable: true, isSelf: false, packageName,
  }
}

interface Captured {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  kind: string
  path: string
}

interface Harness {
  post: (method: string, payload: object) => Promise<{ status: number; body: Record<string, unknown> }>
  /** 会话结束：销毁 agent scope（真实 cordis 子 Context 展开）；缺省销毁首个会话。 */
  disposeSession: (id?: string) => Promise<void>
  /** 真实 root Context（用例可借此模拟「全局挂载的插件」）。 */
  root: Context
  /** 临时 profile 目录（用例可借此自行解析并全局挂载包）。 */
  profileDir: string
  /** 首个会话的 Context。 */
  agentCtx: Context
  cleanup: () => void
}

/** 组装：真实会话 Context + 临时 profile + 伪造 agents 注册表，走面板 HTTP 缝。 */
async function makeHarness(opts: { rows: PluginFiberView[]; pkg: string; entry: string; sessionId?: string; sessionIds?: string[]; real?: boolean }): Promise<Harness> {
  const ids = opts.sessionIds ?? [opts.sessionId ?? 's1']
  const profileDir = makeProfile(opts.pkg, opts.entry)
  // 真实宿主里所有会话共享同一个 root Context。
  const root = new Context()
  const sessions = new Map<string, Awaited<ReturnType<typeof makeSessionCtx>>>()
  for (const id of ids) sessions.set(id, await makeSessionCtx(root, id))
  const first = sessions.get(ids[0]) as Awaited<ReturnType<typeof makeSessionCtx>>
  const captured: Captured = { handler: async () => {}, kind: '', path: '' }
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    baseUrl: pathToFileURL(profileDir).href,
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    webServer: {
      register: (route: Captured) => {
        captured.handler = route.handler
        captured.kind = route.kind
        captured.path = route.path
        return () => {}
      },
    },
    registry: root.registry,
    agents: {
      get: (id: string) => agentsById.get(id),
      list: () => [...agentsById.values()],
      roots: () => [...agentsById.values()],
    },
    skills: { list: async () => [] },
  }
  // 真实宿主的 ctx.agents.get(id) 返回同一实例；管理器用 WeakMap 以 agent 为键，故这里必须稳定。
  const agentsById = new Map([...sessions].map(([id, s]) => [id, { id, status: 'idle', ctx: s.agentCtx }]))
  const store = new SessionSkillStore(join(profileDir, 'pool'))
  const mcp = { views: () => [], whitelist: () => [], connectedNames: () => [] } as unknown as SessionMcpManager
  // real=true：用**真实** PluginManager（走真实 registry 遍历与视图归并），行来源为 profile 里的 patch 行。
  let plugins: PluginManager
  if (opts.real === true) {
    // 登记规格（面板状态文件）：这些行未启用、registry 里没有 fiber，靠 specs 视图成行。
    writeFileSync(join(profileDir, '.dshp-plugins.json'),
      JSON.stringify({ plugins: opts.rows.map(r => ({ id: r.id, name: r.packageName, source: 'patch' })) }))
    plugins = new PluginManager(ctx as never, mcp, profileDir)
  } else {
    plugins = { list: () => opts.rows } as unknown as PluginManager
  }
  const sessionPlugins = new SessionPluginManager(ctx as never, profileDir, plugins)
  new PluginPanelService(ctx as never, {
    poolRoot: join(profileDir, 'pool'), store, mcp, plugins, sessionPlugins,
  })
  return {
    post: async (method, payload) => {
      const req = new PassThrough() as unknown as IncomingMessage
      ;(req as { method: string }).method = 'POST'
      ;(req as { url: string }).url = `/plugin-panel/${method}`
      req.write(JSON.stringify(payload))
      req.end()
      return await new Promise((resolve) => {
        const res = new PassThrough() as unknown as ServerResponse
        let status = 0
        let body = ''
        ;(res as { statusCode: number }).statusCode = 200
        ;(res as unknown as { writeHead: (s: number) => void }).writeHead = (s: number) => { status = s }
        ;(res as unknown as { end: (data?: string) => void }).end = (data?: string) => {
          body = data ?? ''
          resolve({ status, body: body === '' ? {} : JSON.parse(body) as Record<string, unknown> })
        }
        void captured.handler(req, res as ServerResponse)
      })
    },
    disposeSession: async (id?: string) => { await sessions.get(id ?? ids[0])?.dispose() },
    root,
    profileDir,
    agentCtx: first.agentCtx,
    cleanup: () => {
      rmSync(profileDir, { recursive: true, force: true })
    },
  }
}

const REGISTER_ONLY = "export const name = 'demo-plugin'\nexport function apply() {}\n"

test('挂载到会话后，该会话的挂载点列表显示该插件', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    const mounted = await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })
    assert.equal(mounted.status, 200)
    assert.deepEqual(mounted.body, { ok: true, id: 'demo-plugin', mounted: true, alreadyMounted: false })

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.equal(listed.status, 200)
    const mounts = listed.body.mounts as Array<{ id: string; active: boolean }>
    assert.deepEqual(mounts.map(m => m.id), ['demo-plugin'])
    assert.equal(mounts[0].active, true)
  } finally {
    h.cleanup()
  }
})

test('从会话卸载插件后，该会话不再显示该挂载点', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })

    const unmounted = await h.post('pluginUnmount', { sessionId: 's1', id: 'demo-plugin' })
    assert.equal(unmounted.status, 200)
    assert.deepEqual(unmounted.body, { ok: true, id: 'demo-plugin', mounted: false })

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.deepEqual(listed.body.mounts, [])
  } finally {
    h.cleanup()
  }
})

test('重复挂载同一插件到同一会话 → 返回现状，不新增挂载点', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })
    const again = await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })
    assert.equal(again.status, 200)
    assert.deepEqual(again.body, { ok: true, id: 'demo-plugin', mounted: true, alreadyMounted: true })

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.equal((listed.body.mounts as unknown[]).length, 1)
  } finally {
    h.cleanup()
  }
})


const LEAKY = "export const name = 'leaky-plugin'\nexport function apply(ctx) { ctx.provide('leaky-service', { v: 1 }) }\n"

test('向全局发布服务的插件被硬拒绝，不留挂载点且可重试', async () => {
  const h = await makeHarness({ pkg: 'leaky-plugin', entry: LEAKY, rows: [row('leaky-plugin', 'leaky-plugin')] })
  try {
    const rejected = await h.post('pluginMount', { sessionId: 's1', id: 'leaky-plugin' })
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.ok, false)
    assert.match(String(rejected.body.reason), /leaky-service/)

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.deepEqual(listed.body.mounts, [])

    // 重试必须仍是**泄漏**拒绝：若首次回滚没卸干净，服务仍在 store 里，
    // 重试会变成“服务已注册”的启动失败——原因不同，据此可发现回滚缺失。
    const retry = await h.post('pluginMount', { sessionId: 's1', id: 'leaky-plugin' })
    assert.equal(retry.body.ok, false, '回滚后重试仍是拒绝，而不是“已挂载”现状')
    assert.match(String(retry.body.reason), /published process-global/, '重试必须仍是「泄漏」拒绝（若回滚没卸干净，会退化成“服务已注册”的启动失败）')
  } finally {
    h.cleanup()
  }
})


test('会话 Context 销毁后，其挂载点自动从视图消失', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })
    const before = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.equal((before.body.mounts as unknown[]).length, 1)

    await h.disposeSession()

    const after = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.deepEqual(after.body.mounts, [])
  } finally {
    h.cleanup()
  }
})


test('非 live 会话 → 400', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    const res = await h.post('pluginMount', { sessionId: 'nope', id: 'demo-plugin' })
    assert.equal(res.status, 400)
    assert.match(String(res.body.reason), /not a live agent/)
  } finally {
    h.cleanup()
  }
})

test('卸载未挂载的插件 → 明确失败', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    const res = await h.post('pluginUnmount', { sessionId: 's1', id: 'demo-plugin' })
    assert.equal(res.status, 200)
    assert.equal(res.body.ok, false)
    assert.match(String(res.body.reason), /not mounted/)
  } finally {
    h.cleanup()
  }
})

test('登记但未启用的插件行也能会话挂载', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin', false)] })
  try {
    const mounted = await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })
    assert.equal(mounted.body.ok, true)

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.deepEqual((listed.body.mounts as Array<{ id: string }>).map(m => m.id), ['demo-plugin'])
  } finally {
    h.cleanup()
  }
})


test('插件列表标注本会话的挂载点', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    const before = await h.post('pluginList', { sessionId: 's1' })
    const beforeEntries = before.body.plugins as Array<{ id: string; sessionMounted?: boolean }>
    assert.equal(beforeEntries[0].sessionMounted, undefined, '未挂载时无标注')

    await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })

    const after = await h.post('pluginList', { sessionId: 's1' })
    const afterEntries = after.body.plugins as Array<{ id: string; sessionMounted?: boolean }>
    assert.deepEqual(afterEntries.map(e => e.id), ['demo-plugin'])
    assert.equal(afterEntries[0].sessionMounted, true)
  } finally {
    h.cleanup()
  }
})


test('会话挂载不额外多出一行：会话 fiber 归入所属插件行', async () => {
  const h = await makeHarness({
    real: true,
    pkg: 'demo-plugin',
    entry: REGISTER_ONLY,
    // 故意让行 id 与插件模块名不同：会话 fiber 名为 demo-plugin，行 id 为 my-row。
    rows: [row('my-row', 'demo-plugin')],
  })
  try {
    await h.post('pluginMount', { sessionId: 's1', id: 'my-row' })

    const listed = await h.post('pluginList', { sessionId: 's1' })
    const entries = listed.body.plugins as Array<{ id: string; sessionMounted?: boolean }>
    const ids = entries.map(e => e.id)
    assert.ok(ids.includes('my-row'), `应含插件行 my-row（实际 ${ids.join(',')}）`)
    assert.ok(!ids.includes('demo-plugin'), `会话 fiber 不应多出一行（实际 ${ids.join(',')}）`)
    assert.equal(entries.find(e => e.id === 'my-row')?.sessionMounted, true)
  } finally {
    h.cleanup()
  }
})


/** bundle 冷挂载行（来源 bundle）。 */
function bundleRow(id: string, packageName: string): PluginFiberView {
  return { ...row(id, packageName), source: 'bundle' }
}

const OCCUPIED = "export const name = 'demo-plugin'\nexport function apply(ctx) { ctx.provide('occupied-service', { v: 2 }) }\n"
const BUNDLE_PROVIDER = "export const name = 'demo-plugin'\nexport function apply(ctx) { ctx.provide('bundle-service', { v: 2 }) }\n"

test('缺 sessionId → 400', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: REGISTER_ONLY, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    const res = await h.post('pluginMount', { id: 'demo-plugin' })
    assert.equal(res.status, 400)
  } finally {
    h.cleanup()
  }
})

test('全局已提供同名服务：会话挂载启动失败并回滚', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: OCCUPIED, rows: [row('demo-plugin', 'demo-plugin')] })
  try {
    // 模拟全局行：进程级副本已提供 occupied-service。
    const globalFiber = h.root.plugin({ name: 'global-provider', apply(ctx: { provide: (n: string, v: unknown) => void }) { ctx.provide('occupied-service', { v: 1 }) } } as never)
    await globalFiber.await()

    const res = await h.post('pluginMount', { sessionId: 's1', id: 'demo-plugin' })
    assert.equal(res.status, 200)
    assert.equal(res.body.ok, false)
    assert.match(String(res.body.reason), /occupied-service|registered/)

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.deepEqual(listed.body.mounts, [], '启动失败必须回滚，不留挂载点')
  } finally {
    h.cleanup()
  }
})

test('bundle 冷挂载行：全局副本提供同名服务时被拒并回滚', async () => {
  const h = await makeHarness({ pkg: 'demo-plugin', entry: BUNDLE_PROVIDER, rows: [bundleRow('bundle-row', 'demo-plugin')] })
  try {
    // 模拟 bundle 冷挂载的全局副本：从 profile 解析同一个包并挂到 root。
    const require = createRequire(join(h.profileDir, 'package.json'))
    const ns = await import(pathToFileURL(require.resolve('demo-plugin')).href) as { default?: unknown }
    const globalFiber = h.root.plugin((ns.default ?? ns) as never)
    await globalFiber.await()

    const res = await h.post('pluginMount', { sessionId: 's1', id: 'bundle-row' })
    assert.equal(res.status, 200)
    assert.equal(res.body.ok, false)
    assert.match(String(res.body.reason), /bundle-service|registered/)

    const listed = await h.post('sessionPluginList', { sessionId: 's1' })
    assert.deepEqual(listed.body.mounts, [])
  } finally {
    h.cleanup()
  }
})

test('多会话各自挂载：互不影响，进程级视图仍为一行', async () => {
  const h = await makeHarness({
    real: true,
    sessionIds: ['s1', 's2'],
    pkg: 'demo-plugin',
    entry: REGISTER_ONLY,
    rows: [row('my-row', 'demo-plugin')],
  })
  try {
    assert.equal((await h.post('pluginMount', { sessionId: 's1', id: 'my-row' })).body.ok, true)
    assert.equal((await h.post('pluginMount', { sessionId: 's2', id: 'my-row' })).body.ok, true)

    const mountIds = async (s: string) => ((await h.post('sessionPluginList', { sessionId: s })).body.mounts as Array<{ id: string }>).map(m => m.id)
    assert.deepEqual(await mountIds('s1'), ['my-row'])
    assert.deepEqual(await mountIds('s2'), ['my-row'])

    // 从 s1 卸载不影响 s2。
    await h.post('pluginUnmount', { sessionId: 's1', id: 'my-row' })
    assert.deepEqual(await mountIds('s1'), [])
    assert.deepEqual(await mountIds('s2'), ['my-row'])

    // 进程级视图：两个会话各挂一份，仍只有插件行一行（会话 fiber 归并）。
    const view = await h.post('pluginList', { sessionId: 's2' })
    const entries = view.body.plugins as Array<{ id: string; sessionMounted?: boolean }>
    const ids = entries.map(e => e.id)
    assert.ok(ids.includes('my-row'), `应含插件行（实际 ${ids.join(',')}）`)
    assert.ok(!ids.includes('demo-plugin'), `会话 fiber 不应成行（实际 ${ids.join(',')}）`)
    assert.equal(entries.find(e => e.id === 'my-row')?.sessionMounted, true)
  } finally {
    h.cleanup()
  }
})


test('插件列表给出该插件的全部会话挂载点', async () => {
  const h = await makeHarness({
    sessionIds: ['s1', 's2'],
    pkg: 'demo-plugin',
    entry: REGISTER_ONLY,
    rows: [row('my-row', 'demo-plugin')],
  })
  try {
    await h.post('pluginMount', { sessionId: 's1', id: 'my-row' })
    await h.post('pluginMount', { sessionId: 's2', id: 'my-row' })

    const listed = await h.post('pluginList', { sessionId: 's1' })
    const entry = (listed.body.plugins as Array<{ id: string; mountedSessions?: string[] }>)
      .find(e => e.id === 'my-row')
    assert.deepEqual(entry?.mountedSessions, ['s1', 's2'])

    await h.post('pluginUnmount', { sessionId: 's1', id: 'my-row' })
    const after = await h.post('pluginList', { sessionId: 's1' })
    const afterEntry = (after.body.plugins as Array<{ id: string; mountedSessions?: string[] }>)
      .find(e => e.id === 'my-row')
    assert.deepEqual(afterEntry?.mountedSessions, ['s2'])
  } finally {
    h.cleanup()
  }
})

