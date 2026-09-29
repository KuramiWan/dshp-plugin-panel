/**
 * resume 重放的契约回归测试（补 review 指出的「零覆盖」缺口）。
 *
 * 这个契约此前没有任何自动化覆盖，而它恰好坏过一次：DSH 0.1.7-rc.2 移除了
 * `agent/session-start`，旧代码订阅它 → 重放**静默**永不触发、无任何报错，
 * 整个「宿主重启后自动恢复引入集」能力消失。typecheck 只能兜住类型层面的改名，
 * 兜不住「事件名对了但触发条件漂移」。所以这里把三件事钉死：
 *
 *   1. 订阅的事件名必须是 `agent/created`（且不是已移除的 `agent/session-start`）；
 *   2. 只有 `source === 'resume'` 才重放；其它 source 直接返回 `undefined`；
 *   3. 交还框架的是 `Promise<undefined>`（不是 `void`、也不会 reject）——
 *      该事件是 @mode serial 且 awaited，重放因此先于首个 turn。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { subscribeSessionReplay } from '../src/index.ts'
import { SessionSkillStore } from '../src/handles.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'session-replay-test')
mkdirSync(testRoot, { recursive: true })

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

/** 落盘一个会话的引入集（replay 的输入）。 */
function seedPersisted(poolRoot: string, sessionId: string, names: string[]): void {
  const dir = join(poolRoot, '.session-skills')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ skills: names }), 'utf8')
}

/** 最小 Agent：session.id + agent.ctx.get('skills') 桩，记录 register 调用。 */
function makeAgent(id: string): { agent: Agent; registered: string[] } {
  const registered: string[] = []
  const agent = {
    id,
    session: { id },
    ctx: {
      get: (key: string) => (key === 'skills'
        ? { register: (def: { name: string }) => { registered.push(def.name); return () => {} } }
        : undefined),
    },
  } as unknown as Agent
  return { agent, registered }
}

/** 最小 fake ctx：捕获 ctx.on 的订阅（含事件名与监听器），effect 立即执行。 */
function makeCtx(): {
  ctx: Context
  subscription: () => { event: string; listener: (payload: { agent: Agent; source: string }) => unknown }
  warnings: string[]
} {
  let captured: { event: string; listener: (payload: { agent: Agent; source: string }) => unknown } | undefined
  const warnings: string[] = []
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    on: (event: string, listener: (payload: { agent: Agent; source: string }) => unknown) => {
      captured = { event, listener }
      return () => {}
    },
    logger: () => ({ info: () => {}, warn: (m: string) => { warnings.push(m) }, error: () => {}, debug: () => {} }),
    skills: { list: async () => [] },
  } as unknown as Context
  return {
    ctx,
    subscription: () => {
      assert.ok(captured !== undefined, 'ctx.on 未被调用：重放订阅没有建立')
      return captured
    },
    warnings,
  }
}

test('重放订阅：事件名是 agent/created（不是已被移除的 agent/session-start）', () => {
  const poolRoot = makePool([])
  try {
    const { ctx, subscription } = makeCtx()
    subscribeSessionReplay(ctx, { poolRoot, store: new SessionSkillStore(poolRoot) })
    assert.equal(subscription().event, 'agent/created')
    assert.notEqual(subscription().event, 'agent/session-start')
  } finally {
    rmSync(poolRoot, { recursive: true, force: true })
  }
})

test('重放订阅：非 resume（startup/clear/compact）不重放，同步返回 undefined', async () => {
  const poolRoot = makePool(['probe-skill'])
  try {
    const sid = 'sess-startup'
    seedPersisted(poolRoot, sid, ['probe-skill'])
    const { ctx, subscription } = makeCtx()
    subscribeSessionReplay(ctx, { poolRoot, store: new SessionSkillStore(poolRoot) })

    for (const source of ['startup', 'clear', 'compact']) {
      const { agent, registered } = makeAgent(sid)
      const result = subscription().listener({ agent, source })
      assert.equal(result, undefined, `source=${source} 应同步返回 undefined`)
      assert.deepEqual(registered, [], `source=${source} 不应重放注册技能`)
    }
  } finally {
    rmSync(poolRoot, { recursive: true, force: true })
  }
})

test('重放订阅：resume 时把落盘引入集重新注册进该会话，返回 Promise<undefined>', async () => {
  const poolRoot = makePool(['probe-skill', 'other-skill'])
  try {
    const sid = 'sess-resume'
    seedPersisted(poolRoot, sid, ['probe-skill'])
    const { ctx, subscription } = makeCtx()
    subscribeSessionReplay(ctx, { poolRoot, store: new SessionSkillStore(poolRoot) })

    const { agent, registered } = makeAgent(sid)
    const result = subscription().listener({ agent, source: 'resume' })

    // 契约：交还框架的是 promise（不是 void）——@mode serial 会 await 它。
    assert.ok(result instanceof Promise, 'resume 分支应返回 Promise 交还框架')
    assert.equal(await result, undefined, 'promise 应 resolve 成 undefined')
    assert.deepEqual(registered, ['probe-skill'], '应重放该会话落盘的引入集')
  } finally {
    rmSync(poolRoot, { recursive: true, force: true })
  }
})

test('重放订阅：重放失败降级为 warn，不 reject（不让 agent 创建失败）', async () => {
  const poolRoot = makePool([])  // 池为空：落盘的技能已不存在
  try {
    const sid = 'sess-missing'
    seedPersisted(poolRoot, sid, ['gone-skill'])
    const { ctx, subscription, warnings } = makeCtx()
    subscribeSessionReplay(ctx, { poolRoot, store: new SessionSkillStore(poolRoot) })

    const { agent, registered } = makeAgent(sid)
    const result = subscription().listener({ agent, source: 'resume' })

    // 池中找不到 → introduceSkill 返回 ok:false（不抛），replay 路径不应把 rejection 抛给框架
    await assert.doesNotReject(async () => { await result })
    assert.deepEqual(registered, [])
  } finally {
    rmSync(poolRoot, { recursive: true, force: true })
  }
})
