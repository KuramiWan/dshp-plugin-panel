/**
 * skill-panel-service HTTP 路由关键用例（D 路由层）。
 * 用 fake ctx（agents/skills/webServer 桩）+ node:http 真实 request/response，
 * 验证 dispatch 协议：非 POST→405、未知端点→404、未知方法→404、非法 JSON→400、
 * 成功→200 JSON、方法分派转发到正确 handler。
 * 不引宿主运行时；只测协议与分派面，业务语义已由 actions/handles 测试覆盖。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SkillPanelService } from '../src/skill-panel-service.ts'
import { SessionSkillStore } from '../src/handles.ts'
import type { SessionMcpManager } from '../src/mcp-manager.ts'
import type { PluginManager } from '../src/plugin-manager.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'http-test')
mkdirSync(testRoot, { recursive: true })

/** 捕获 webServer 注册的 handler。 */
interface Captured {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  kind: string
  path: string
}

function makeService(poolRoot: string, liveSessions: string[]) {
  const captured: Captured = { handler: async () => {}, kind: '', path: '' }
  const store = new SessionSkillStore(poolRoot)
  const mcp = { views: () => [], whitelist: () => [] } as unknown as SessionMcpManager
  const plugins = { list: () => [] } as unknown as PluginManager
  const ctx = {
    effect: (fn: () => void) => fn(),
    webServer: {
      register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => {
        captured.handler = route.handler
        captured.kind = route.kind
        captured.path = route.path
        return () => {}
      },
    },
    agents: {
      get: (id: string) => (liveSessions.includes(id) ? { id } : undefined),
    },
    skills: { list: async () => [] },
  }
  const service = new SkillPanelService(ctx as never, { poolRoot, store, mcp, plugins })
  return { captured, store }
}

/** 造一个带 body 的 POST 请求。 */
function makeReq(method: string, url: string, body?: string): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  ;(req as { method: string }).method = method
  ;(req as { url: string }).url = url
  if (body !== undefined) req.write(body)
  req.end()
  return req
}

/** 发一个请求，收集 (status, headers, body)。 */
function send(captured: Captured, req: IncomingMessage): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const res = new PassThrough() as unknown as ServerResponse
    let status = 0
    let body = ''
    ;(res as { statusCode: number }).statusCode = 200
    ;(res as unknown as { writeHead: (s: number, h: unknown) => void }).writeHead = (s: number) => {
      status = s
    }
    ;(res as unknown as { end: (data?: string) => void }).end = (data?: string) => {
      body = data ?? ''
      resolve({ status, body })
    }
    void captured.handler(req, res as ServerResponse)
  })
}

test('路由注册: kind=prefix, path=/skill-panel（注入 webServer，勿改可选）', () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    const { captured } = makeService(root, ['s1'])
    assert.equal(captured.kind, 'prefix')
    assert.equal(captured.path, '/skill-panel')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 POST → 405', async () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    const { captured } = makeService(root, ['s1'])
    const { status } = await send(captured, makeReq('GET', '/skill-panel/browse'))
    assert.equal(status, 405)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知端点（无方法名）→ 404', async () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    const { captured } = makeService(root, ['s1'])
    const { status } = await send(captured, makeReq('POST', '/skill-panel/'))
    assert.equal(status, 404)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知方法名 → 404 unknown method', async () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    const { captured } = makeService(root, ['s1'])
    const { status, body } = await send(captured, makeReq('POST', '/skill-panel/nope'))
    assert.equal(status, 404)
    assert.match(body, /unknown method/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非法 JSON body → 400', async () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    const { captured } = makeService(root, ['s1'])
    const { status, body } = await send(captured, makeReq('POST', '/skill-panel/browse', '{bad json'))
    assert.equal(status, 400)
    assert.match(body, /"ok":false/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('sessionId 非活动 agent → 400', async () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    const { captured } = makeService(root, ['live']) // 只有 live 是活的
    const { status, body } = await send(captured, makeReq('POST', '/skill-panel/browse', JSON.stringify({ sessionId: 'ghost' })))
    assert.equal(status, 400)
    assert.match(body, /not a live agent/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('方法分派: browse 命中并返回 200 JSON entries', async () => {
  const root = mkdtempSync(join(testRoot, 'svc-'))
  try {
    // 造一个池技能
    mkdirSync(join(root, 'local', 'git'), { recursive: true })
    writeFileSync(join(root, 'local', 'git', 'SKILL.md'), '---\nname: git\ndescription: does git\n---\n\nbody\n', 'utf8')
    const { captured } = makeService(root, ['s1'])
    const { status, body } = await send(captured, makeReq('POST', '/skill-panel/browse', JSON.stringify({ sessionId: 's1' })))
    assert.equal(status, 200)
    const data = JSON.parse(body) as { entries: unknown }
    assert.ok(Array.isArray(data.entries))
    assert.equal((data.entries as Array<{ name: string }>)[0].name, 'git')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
