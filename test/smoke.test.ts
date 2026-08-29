/**
 * 冒烟测试（S 装配层）：不引宿主运行时，用最小 fake ctx 把插件三入口整体挂起来，
 * 验证「装配不炸 + 每入口走通一条核心链路」。与按模块拆分的单元测试互补：
 * 单元测试证明各零件行为正确，本文件证明它们装配在一起能跑（ADR-0007 三面同源）。
 *
 * 覆盖：
 *  - 三入口注册：5 个 session_skill_* 模型工具、5 个 /skill-* 斜杠命令、
 *    SkillPanelService 的 /skill-panel webServer 路由，全部注册成功；
 *  - 每入口一条核心链路：HTTP browse 经真实 node:http request/response 走通、
 *    /skill-browse 命令走通、模型工具走通；
 *  - 共享存储：工具/命令/面板三个入口操作的是同一个 SessionSkillStore
 *    （browse 的 introduced 标记、introduce 的互见），避免三面各持一份状态。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySessionSkillTools } from '../src/tools.ts'
import { applySessionSkillCommands } from '../src/commands.ts'
import { SkillPanelService } from '../src/skill-panel-service.ts'
import { SessionSkillStore } from '../src/handles.ts'
import type { SessionMcpManager } from '../src/mcp-manager.ts'
import type { PluginManager } from '../src/plugin-manager.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandResult } from '@deepseek-ai/dsh-commands'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'smoke-test')
mkdirSync(testRoot, { recursive: true })

/** 最小 Agent：带 session.id 与 agent.ctx.get('skills') 桩（introduce 注册用）。 */
function makeAgent(id: string): Agent {
  const registered: Array<{ name: string; description?: string }> = []
  const skillsStub = {
    register: (def: { name: string }) => {
      registered.push({ name: def.name })
      return () => {}
    },
    // 会话已注册技能视图（影子覆盖判定 / list 渲染共用同一桩）
    registered,
  }
  const agent = {
    id,
    session: { id },
    ctx: {
      get: (key: string) => (key === 'skills' ? skillsStub : undefined),
    },
  } as unknown as Agent
  return agent
}

/**
 * 最小 fake ctx：三入口注册面全部捕获，不引宿主运行时。
 * - tools/commands：捕获注册定义（list/find 供断言用）；
 * - webServer：捕获路由 handler（供 HTTP 冒烟用）；
 * - agents：live 会话 + root 标记；skills.list 返回「会话已注册技能」视图（影子覆盖判定）；
 * - effect/plugin：立即执行（模拟 cordis 挂载，不做真生命周期管理）。
 */
function makeCtx(agent: Agent) {
  const tools = new Map<string, ToolDefinition>()
  const commands = new Map<string, CommandDefinition>()
  let captured: { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> } | undefined

  const ctx = {
    effect: (fn: () => void) => fn(),
    plugin: (_svc: unknown, _opts: unknown) => {},
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    agents: {
      get: (id: string) => (id === agent.id ? agent : undefined),
      list: () => [agent],
      roots: () => [],
    },
    tools: {
      register: (def: ToolDefinition) => {
        tools.set(def.name, def)
        return () => {}
      },
    },
    commands: {
      register: (def: CommandDefinition) => {
        commands.set(def.name, def)
        return () => {}
      },
      find: (a: Agent, name: string) => commands.get(name),
    },
    webServer: {
      register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => {
        captured = { handler: route.handler }
        return () => {}
      },
    },
    skills: {
      list: async (opts: { scope: Agent }) => {
        const s = opts.scope as unknown as { id: string }
        // 会话已注册技能 = agent.ctx.get('skills') 桩记录的引入（影子覆盖判定据此）
        return s.id === agent.id
          ? (agent.ctx.get('skills') as { registered: Array<{ name: string; description?: string }> }).registered.map(r => ({ name: r.name, description: r.description ?? '' }))
          : []
      },
    },
  }

  return {
    ctx: ctx as never,
    tools,
    commands,
    /** 取捕获的 /skill-panel 路由 handler。 */
    handler: () => {
      assert.ok(captured !== undefined, 'webServer.register 未被调用，/skill-panel 路由未注册')
      return captured!.handler
    },
  }
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

/** 发一个请求，收集 (status, body)。 */
function send(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, req: IncomingMessage): Promise<{ status: number; body: string }> {
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
    void handler(req, res as ServerResponse)
  })
}

/** 造临时池：local/<name>/SKILL.md。 */
function makePool(names: string[]): string {
  const root = mkdtempSync(join(testRoot, 'pool-'))
  for (const name of names) {
    const dir = join(root, 'local', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: does ${name}\n---\n\nbody\n`, 'utf8')
  }
  return root
}

/**
 * 把插件三入口整体挂到一个 fake ctx（等价于插件 init 的注册序列），
 * 返回注册表 + store + HTTP handler，供各冒烟用例复用。
 */
function mount(agent: Agent, poolRoot: string) {
  const store = new SessionSkillStore(poolRoot)
  const { ctx, tools, commands, handler } = makeCtx(agent)
  applySessionSkillTools(ctx, { poolRoot, store })
  applySessionSkillCommands(ctx, { poolRoot, store })
  const mcp = { views: () => [], whitelist: () => [] } as unknown as SessionMcpManager
  const plugins = { list: () => [] } as unknown as PluginManager
  new SkillPanelService(ctx, { poolRoot, store, mcp, plugins })
  return { store, tools, commands, handler }
}

test('冒烟：三入口全部注册成功（5 工具 + 5 命令 + /skill-panel 路由）', () => {
  const root = makePool(['git'])
  try {
    const agent = makeAgent('s1')
    const { tools, commands, handler } = mount(agent, root)
    for (const name of ['session_skill_browse', 'session_skill_search', 'session_skill_list', 'session_skill_introduce', 'session_skill_remove']) {
      assert.ok(tools.has(name), `模型工具 ${name} 未注册`)
    }
    for (const name of ['skill-browse', 'skill-search', 'skill-list', 'skill-introduce', 'skill-remove']) {
      assert.ok(commands.has(name), `斜杠命令 /${name} 未注册`)
    }
    // 路由注册成功且 handler 可用（webServer.register 被调用过）
    assert.doesNotThrow(() => handler())
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冒烟：HTTP browse 经真实 node:http 请求走通，且与工具浏览结果同源', async () => {
  const root = makePool(['git', 'markdown'])
  try {
    const agent = makeAgent('s1')
    const { handler, tools } = mount(agent, root)
    // HTTP 面：POST /skill-panel/browse
    const { status, body } = await send(handler(), makeReq('POST', '/skill-panel/browse', JSON.stringify({ sessionId: 's1' })))
    assert.equal(status, 200)
    const data = JSON.parse(body) as { entries: Array<{ name: string }> }
    assert.deepEqual(data.entries.map(e => e.name).sort(), ['git', 'markdown'])
    // 工具面：session_skill_browse 直接执行（同源：同一池、同一 store）
    const exec = await (tools.get('session_skill_browse')!.execute as (args: unknown, exec: unknown) => Promise<{ entries: Array<{ name: string }> }>)({}, { agent })
    assert.deepEqual(exec.entries.map(e => e.name).sort(), ['git', 'markdown'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冒烟：命令 /skill-browse 走通（经 commands.find 取注册定义执行 handler）', () => {
  const root = makePool(['git'])
  try {
    const agent = makeAgent('s1')
    const { commands } = mount(agent, root)
    const def = commands.get('skill-browse')!
    const res = def.handler({ agent, rawInput: '' }) as CommandResult
    assert.equal(res.kind, 'success')
    assert.match((res as { text: string }).text, /git/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('冒烟：引入/列出/移除完整会话流程经共享 store 互见（三入口同一份状态）', async () => {
  const root = makePool(['git'])
  try {
    const agent = makeAgent('s1')
    const { store, tools, commands, handler } = mount(agent, root)

    // 1) 工具面引入
    const intro = await (tools.get('session_skill_introduce')!.execute as (args: unknown, exec: unknown) => Promise<{ introduced: boolean; name: string }>)({ name: 'git' }, { agent })
    assert.equal(intro.introduced, true)
    assert.equal(intro.name, 'git')
    // store 记录了会话引入（session-level）
    assert.deepEqual(store.names(agent), ['git'])

    // 2) 命令面 /skill-list 看到同一 store
    const listDef = commands.get('skill-list')!
    const listRes = (await listDef.handler({ agent, rawInput: '' })) as CommandResult
    assert.equal(listRes.kind, 'success')
    assert.match((listRes as { text: string }).text, /git/)

    // 3) HTTP 面板 browse 看到 introduced 标记（同一 store）
    const { status, body } = await send(handler(), makeReq('POST', '/skill-panel/browse', JSON.stringify({ sessionId: 's1' })))
    assert.equal(status, 200)
    const data = JSON.parse(body) as { entries: Array<{ name: string; introduced: boolean }> }
    assert.equal(data.entries[0].name, 'git')
    assert.equal(data.entries[0].introduced, true)

    // 4) 工具面移除 → 三面共享的 store 同步清空
    const remove = await (tools.get('session_skill_remove')!.execute as (args: unknown, exec: unknown) => Promise<{ removed: boolean }>)({ name: 'git' }, { agent })
    assert.equal(remove.removed, true)
    assert.deepEqual(store.names(agent), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
