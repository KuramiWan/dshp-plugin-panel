/**
 * pool.ts / fs.ts 纯逻辑单元测试（跨平台：不依赖特定平台路径分隔符）。
 * 用 Node 内置 node:test + --experimental-strip-types 运行，无需额外依赖。
 * 临时目录落在 test/.tmp/ 下（工作区可写），用完清理。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultGlobalSkillsRoot,
  defaultPoolRoot,
  isValidSkillName,
  isValidTagName,
  parseSkillFile,
  setSkillTags,
} from '../src/pool.ts'
import { defaultDshHome } from '../src/home.ts'
import { readTextFileSync } from '../src/fs.ts'

const testRoot = join(fileURLToPath(new URL('.', import.meta.url)), '.tmp', 'pool-test')

/** 在 test/.tmp 下建一个临时技能目录并写入 SKILL.md，返回目录路径。 */
function makeSkill(raw: string): string {
  mkdirSync(testRoot, { recursive: true })
  const dir = mkdtempSync(join(testRoot, 'skill-'))
  writeFileSync(join(dir, 'SKILL.md'), raw, 'utf8')
  return dir
}

test('parseSkillFile: 解析 name/description/tags 内联列表', () => {
  const raw = `---
name: my-skill
description: does things
whenToUse: when needed
tags: [git, writing]
---

body content
`
  const parsed = parseSkillFile(raw)
  assert.ok(parsed !== undefined)
  assert.equal(parsed.fm.name, 'my-skill')
  assert.equal(parsed.fm.description, 'does things')
  assert.equal(parsed.fm.whenToUse, 'when needed')
  assert.deepEqual(parsed.fm.tags, ['git', 'writing'])
  assert.equal(parsed.body, '\nbody content\n')
})

test('parseSkillFile: 解析 tags 块列表（tags:\\n  - a）', () => {
  const raw = `---
name: my-skill
description: does things
tags:
  - a
  - b
---

body
`
  const parsed = parseSkillFile(raw)
  assert.ok(parsed !== undefined)
  assert.deepEqual(parsed.fm.tags, ['a', 'b'])
})

test('parseSkillFile: 无 frontmatter 返回 undefined', () => {
  assert.equal(parseSkillFile('no frontmatter here\n'), undefined)
})

test('readTextFileSync: 剥离 BOM 头', () => {
  mkdirSync(testRoot, { recursive: true })
  const file = join(testRoot, 'bom.txt')
  writeFileSync(file, '\uFEFFhello', 'utf8')
  try {
    assert.equal(readTextFileSync(file), 'hello')
  } finally {
    rmSync(testRoot, { recursive: true, force: true })
  }
})

test('setSkillTags: 替换内联 tags', () => {
  const dir = makeSkill(`---
name: s
description: d
tags: [a, b]
---

body
`)
  try {
    const r = setSkillTags(dir, ['x', 'y'])
    assert.equal(r.ok, true)
    const after = parseSkillFile(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
    assert.deepEqual(after?.fm.tags, ['x', 'y'])
  } finally {
    rmSync(testRoot, { recursive: true, force: true })
  }
})

test('setSkillTags: 块列表原样不残留续行（回归测试）', () => {
  const dir = makeSkill(`---
name: s
description: d
tags:
  - a
  - b
---

body
`)
  try {
    const r = setSkillTags(dir, ['x'])
    assert.equal(r.ok, true)
    const text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    // 新 tags 行就位，且块列表续行被清掉。
    assert.match(text, /tags: \[x\]/)
    assert.doesNotMatch(text, /\n  - a/)
    assert.doesNotMatch(text, /\n  - b/)
    const parsed = parseSkillFile(text)
    assert.deepEqual(parsed?.fm.tags, ['x'])
    // 其余字段与正文逐字保留。
    assert.match(text, /description: d/)
    assert.match(text, /^body$/m)
  } finally {
    rmSync(testRoot, { recursive: true, force: true })
  }
})

test('setSkillTags: 新增 tags（原 frontmatter 无 tags）', () => {
  const dir = makeSkill(`---
name: s
description: d
---

body
`)
  try {
    const r = setSkillTags(dir, ['git'])
    assert.equal(r.ok, true)
    const after = parseSkillFile(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
    assert.deepEqual(after?.fm.tags, ['git'])
  } finally {
    rmSync(testRoot, { recursive: true, force: true })
  }
})

test('setSkillTags: 清空 tags（写 tags: []）', () => {
  const dir = makeSkill(`---
name: s
description: d
tags: [a, b]
---

body
`)
  try {
    const r = setSkillTags(dir, [])
    assert.equal(r.ok, true)
    // 文件里应写入空数组标记；解析器对空 tags 返回 undefined（语义等同"无 tags"）。
    assert.match(readFileSync(join(dir, 'SKILL.md'), 'utf8'), /tags: \[\]/)
  } finally {
    rmSync(testRoot, { recursive: true, force: true })
  }
})

test('isValidSkillName / isValidTagName', () => {
  assert.equal(isValidSkillName('foo-bar_1.2'), true)
  assert.equal(isValidSkillName('Bad Name'), false)
  assert.equal(isValidSkillName(''), false)
  assert.equal(isValidTagName('git'), true)
  assert.equal(isValidTagName('with space'), true)
  assert.equal(isValidTagName('a/b'), false) // 路径分隔符
  assert.equal(isValidTagName(''), false)
})

test('defaultDshHome / defaultPoolRoot / defaultGlobalSkillsRoot：DSH_HOME 优先', () => {
  const env = { DSH_HOME: '/custom/home' }
  assert.equal(defaultDshHome(env), '/custom/home')
  assert.equal(defaultPoolRoot(env), join('/custom/home', '.skill-pool'))
  assert.equal(defaultGlobalSkillsRoot(env), join('/custom/home', 'skills'))
})

test('defaultDshHome：空白 DSH_HOME 视为未设置，回退用户主目录', () => {
  const env = { DSH_HOME: '   ' }
  assert.equal(defaultDshHome(env), homedir() + sep + '.dsh')
})
