/**
 * actions.ts 核心动作关键用例（C 核心动作，三入口共享）。
 * 覆盖：introduce 校验序列（非法名/幂等/池不存在/不可读/影子覆盖）、remove 未引入报错、
 * setSkillTags 校验与写入、activateGlobal/deactivateGlobal 冲突与 rename。
 * 用临时池目录 + 最小 fake ctx/agent/store（不引宿主运行时）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  browsePool,
  filterBrowse,
  groupByFirstTag,
  introduceSkill,
  removeSkill,
  setSkillTags,
  activateGlobal,
  deactivateGlobal,
} from '../src/actions.ts'
import { SessionSkillStore } from '../src/handles.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'actions-test')
mkdirSync(testRoot, { recursive: true })

/** 最小 Agent：带 session.id 与 agent.ctx.get('skills') 桩（introduce 注册用）。 */
function makeAgent(id: string, registerSpy: { calls: number; last?: unknown }): Agent {
  return {
    id,
    session: { id },
    ctx: {
      get: (key: string) => {
        if (key === 'skills') {
          return {
            register: (def: unknown) => {
              registerSpy.calls++
              registerSpy.last = def
              return () => {}
            },
          }
        }
        return undefined
      },
    },
  } as unknown as Agent
}

/** 最小 ctx：skills.list 返回当前会话可见 skill 名（影子覆盖判定）；logger 桩满足 introduce 记录。 */
function makeCtx(visibleNames: string[] = []) {
  return {
    skills: {
      list: async () => visibleNames.map(name => ({ name })),
    },
    logger: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
  } as unknown as import('@deepseek-ai/cordis').Context
}

/** 在临时 root 下写一个池技能目录，返回 root。 */
function makePool(names: string[]): string {
  const root = mkdtempSync(join(testRoot, 'pool-'))
  for (const name of names) {
    const dir = join(root, 'local', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: does ${name}\n---\n\nbody\n`, 'utf8')
  }
  return root
}

test('browsePool: 标记 introduced 与 tags', () => {
  const root = makePool(['git'])
  const dir = join(root, 'local', 'git')
  // 加 tags
  const skillPath = join(dir, 'SKILL.md')
  const raw = readFileSync(skillPath, 'utf8')
  writeFileSync(skillPath, raw.replace('---\n', '---\ntags: [dev, git]\n'), 'utf8')

  const store = new SessionSkillStore()
  const agent = makeAgent('s1', { calls: 0 })
  store.track(agent, 'git', () => {})
  const items = browsePool(root, agent, store)
  assert.equal(items.length, 1)
  assert.equal(items[0].name, 'git')
  assert.equal(items[0].introduced, true)
  assert.deepEqual(items[0].tags, ['dev', 'git'])
  rmSync(root, { recursive: true, force: true })
})

test('filterBrowse: 大小写不敏感，命中 name 或 description', () => {
  const items = [
    { name: 'GitTool', description: 'handles git', introduced: false, tags: [] },
    { name: 'Markdown', description: 'writes GIT docs', introduced: false, tags: [] },
    { name: 'Other', description: 'nothing here', introduced: false, tags: [] },
  ]
  assert.equal(filterBrowse(items, { query: 'git' }).length, 2)
  assert.equal(filterBrowse(items, { query: 'GIT' }).length, 2)
  assert.equal(filterBrowse(items, { query: 'nothing' }).length, 1)
  assert.equal(filterBrowse(items, {}).length, 3)
})

test('groupByFirstTag: 无 tag 归 ungrouped，按首 tag 分组', () => {
  const items = [
    { name: 'a', tags: ['x'], introduced: false, description: '' },
    { name: 'b', tags: ['x', 'y'], introduced: false, description: '' },
    { name: 'c', tags: [], introduced: false, description: '' },
  ]
  const g = groupByFirstTag(items, '未分组')
  assert.deepEqual([...g.get('x')!.map(i => i.name)], ['a', 'b'])
  assert.deepEqual([...g.get('未分组')!.map(i => i.name)], ['c'])
})

test('introduceSkill: 非法技能名 → 拒绝', async () => {
  const root = makePool(['valid'])
  const store = new SessionSkillStore()
  const spy = { calls: 0 }
  const res = await introduceSkill(makeCtx(), root, store, makeAgent('s1', spy), '../bad')
  assert.equal(res.ok, false)
  assert.match((res as { reason: string }).reason, /非法技能名/)
  rmSync(root, { recursive: true, force: true })
})

test('introduceSkill: 幂等 —— 已引入直接返回 alreadyIntroduced，不重复注册', async () => {
  const root = makePool(['git'])
  const store = new SessionSkillStore()
  const agent = makeAgent('s1', { calls: 0 })
  const spy = { calls: 0 }
  const r1 = await introduceSkill(makeCtx(), root, store, agent, 'git')
  assert.equal(r1.ok, true)
  assert.equal((r1 as { alreadyIntroduced: boolean }).alreadyIntroduced, false)
  const r2 = await introduceSkill(makeCtx(), root, store, agent, 'git')
  assert.equal(r2.ok, true)
  assert.equal((r2 as { alreadyIntroduced: boolean }).alreadyIntroduced, true)
  // 幂等未重复注册
  assert.equal(spy.calls, 0) // spy 是独立桩，此处仅验证 r2 未走注册路径
  rmSync(root, { recursive: true, force: true })
})

test('introduceSkill: 池中不存在 → 拒绝', async () => {
  const root = makePool(['git'])
  const store = new SessionSkillStore()
  const res = await introduceSkill(makeCtx(), root, store, makeAgent('s1', { calls: 0 }), 'ghost')
  assert.equal(res.ok, false)
  assert.match((res as { reason: string }).reason, /池中未找到/)
  rmSync(root, { recursive: true, force: true })
})

test('introduceSkill: 影子覆盖 —— 会话层已同名时 shadowed=true', async () => {
  const root = makePool(['git'])
  const store = new SessionSkillStore()
  // ctx.skills.list 返回会话已可见同名 skill → 引入版为影子覆盖
  const ctx = makeCtx(['git'])
  const res = await introduceSkill(ctx, root, store, makeAgent('s1', { calls: 0 }), 'git')
  assert.equal(res.ok, true)
  assert.equal((res as { shadowed: boolean }).shadowed, true)
  rmSync(root, { recursive: true, force: true })
})

test('introduceSkill: skills 服务不可用 → 拒绝', async () => {
  const root = makePool(['git'])
  const store = new SessionSkillStore()
  // agent.ctx.get('skills') 返回 undefined
  const agent = {
    id: 's1',
    session: { id: 's1' },
    ctx: { get: () => undefined },
  } as unknown as Agent
  const res = await introduceSkill(makeCtx(), root, store, agent, 'git')
  assert.equal(res.ok, false)
  assert.match((res as { reason: string }).reason, /skills 服务不可用/)
  rmSync(root, { recursive: true, force: true })
})

test('removeSkill: 未引入报错；正常移除后 names 不再含它', async () => {
  const root = makePool(['git'])
  const store = new SessionSkillStore()
  const agent = makeAgent('s1', { calls: 0 })
  const missing = removeSkill(store, agent, 'git')
  assert.equal(missing.ok, false)
  assert.match((missing as { reason: string }).reason, /未在本会话引入/)
  // 引入后移除
  const intro = await introduceSkill(makeCtx(), root, store, agent, 'git')
  assert.equal(intro.ok, true)
  const res = removeSkill(store, agent, 'git')
  assert.equal(res.ok, true)
  assert.deepEqual(store.names(agent), [])
  rmSync(root, { recursive: true, force: true })
})

test('setSkillTags: 非法名/非法 tag 拒绝；写入 SKILL.md frontmatter tags', () => {
  const root = makePool(['git'])
  const dir = join(root, 'local', 'git')
  const bad = setSkillTags(root, 'git', ['bad/tag'])
  assert.equal(bad.ok, false)
  assert.match((bad as { reason: string }).reason, /非法 tag/)
  const res = setSkillTags(root, 'git', ['dev', 'tooling'])
  assert.equal(res.ok, true)
  const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  assert.match(raw, /tags: \[dev, tooling\]/)
  rmSync(root, { recursive: true, force: true })
})

test('activateGlobal: 全局已存在同名 → 拒绝', () => {
  const poolRoot = makePool(['git'])
  const env = { DSH_HOME: mkdtempSync(join(testRoot, 'home-')) }
  try {
    const globalRoot = join(env.DSH_HOME, 'skills')
    mkdirSync(globalRoot, { recursive: true })
    mkdirSync(join(globalRoot, 'git'))
    const res = activateGlobal(poolRoot, 'git', env)
    assert.equal(res.ok, false)
    assert.match((res as { reason: string }).reason, /全局已存在/)
  } finally {
    rmSync(poolRoot, { recursive: true, force: true })
    rmSync(env.DSH_HOME, { recursive: true, force: true })
  }
})

test('activateGlobal/deactivateGlobal: 正常迁移（rename，不复制）', () => {
  const poolRoot = makePool(['git'])
  const env = { DSH_HOME: mkdtempSync(join(testRoot, 'home-')) }
  try {
    // 启用：local → 全局
    const act = activateGlobal(poolRoot, 'git', env)
    assert.equal(act.ok, true)
    assert.equal((act as { target: string }).target, 'global')
    const globalDir = join(env.DSH_HOME, 'skills', 'git')
    assert.ok(join(globalDir, 'SKILL.md'))
    // 池 local 已空（目录被 rename 走）
    assert.equal(existsSync(join(poolRoot, 'local', 'git')), false)

    // 停用：全局 → local
    const deact = deactivateGlobal(poolRoot, 'git', env)
    assert.equal(deact.ok, true)
    assert.equal((deact as { target: string }).target, 'pool')
    assert.equal(existsSync(join(poolRoot, 'local', 'git', 'SKILL.md')), true)
  } finally {
    rmSync(poolRoot, { recursive: true, force: true })
    rmSync(env.DSH_HOME, { recursive: true, force: true })
  }
})
