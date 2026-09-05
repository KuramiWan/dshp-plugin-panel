/**
 * update.ts 纯逻辑层用例：声明分类 / outdated 解析 / major 判定 / 状态合成。
 * 无 IO，只测判定与转换。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSemverRange,
  parseMajor,
  isMajorBump,
  parseOutdatedJson,
  installedSpecOf,
  buildUpdateStatus,
} from '../src/update.ts'

test('isSemverRange: 常见 range 均为真', () => {
  for (const spec of ['^0.2.2', '~1.0.0', '1.2.3', '>=1.0.0 <2.0.0', '0.2.x', '*', 'v1.2.3']) {
    assert.equal(isSemverRange(spec), true, spec)
  }
})

test('isSemverRange: 非 registry 来源均为假', () => {
  for (const spec of ['file:node_modules/@local/x', 'link:../x', 'github:user/repo', 'workspace:*', '.', '../x', '/abs/path', '', 'latest', 'next']) {
    assert.equal(isSemverRange(spec), false, spec)
  }
})

test('parseMajor / isMajorBump', () => {
  assert.equal(parseMajor('0.2.2'), 0)
  assert.equal(parseMajor('v1.2.3'), 1)
  assert.equal(parseMajor('2.0.0-beta.1'), 2)
  assert.equal(parseMajor('nonsense'), undefined)
  assert.equal(isMajorBump('0.2.2', '1.0.0'), true)
  assert.equal(isMajorBump('0.2.2', '0.3.0'), false)
  assert.equal(isMajorBump('0.2.2', undefined), false)
  assert.equal(isMajorBump('bad', '1.0.0'), false)
})

test('parseOutdatedJson: 解析 pnpm 输出', () => {
  const text = JSON.stringify({
    picocolors: { current: '1.1.0', wanted: '1.1.0', latest: '1.1.1', dependencyType: 'dependencies' },
    other: { current: '1.0.0', wanted: '2.0.0', latest: '2.0.0' },
  })
  const entries = parseOutdatedJson(text)
  assert.equal(entries.length, 2)
  const pc = entries.find(e => e.name === 'picocolors')
  assert.deepEqual(pc, { name: 'picocolors', current: '1.1.0', wanted: '1.1.0', latest: '1.1.1' })
})

test('parseOutdatedJson: 坏 JSON / 非对象 → 空数组', () => {
  assert.deepEqual(parseOutdatedJson('not json'), [])
  assert.deepEqual(parseOutdatedJson('[]'), [])
  assert.deepEqual(parseOutdatedJson('{}'), [])
})

test('installedSpecOf: 三类判定', () => {
  const deps = {
    '@super_camel/dsh-plugin-panel': '^0.2.2',
    'ds-harness-remote': 'file:node_modules/ds-harness-remote',
    'dsh-web': 'github:zhu1090093659/dsh-web',
  }
  assert.deepEqual(installedSpecOf('@super_camel/dsh-plugin-panel', deps), { kind: 'range', spec: '^0.2.2' })
  assert.deepEqual(installedSpecOf('dsh-web', deps), { kind: 'non-range', spec: 'github:zhu1090093659/dsh-web' })
  assert.deepEqual(installedSpecOf('missing', deps), { kind: 'absent' })
  assert.deepEqual(installedSpecOf('x', undefined), { kind: 'absent' })
})

test('buildUpdateStatus: range 内有新版（同 major）→ updatable, 非 major', () => {
  const s = buildUpdateStatus({
    current: '1.0.0',
    specKind: 'range',
    outdated: { name: 'p', current: '1.0.0', wanted: '1.0.5', latest: '1.0.5' },
  })
  assert.equal(s.updatable, true)
  assert.equal(s.major, false)
  assert.equal(s.latest, '1.0.5')
})

test('buildUpdateStatus: 跨 major → updatable + major', () => {
  const s = buildUpdateStatus({
    current: '1.0.0',
    specKind: 'range',
    outdated: { name: 'p', current: '1.0.0', wanted: '1.0.5', latest: '2.0.0' },
  })
  assert.equal(s.updatable, true)
  assert.equal(s.major, true)
})

test('buildUpdateStatus: 无 outdated / 最新 / 非 range 声明 → 不可更新', () => {
  assert.equal(buildUpdateStatus({ current: '1.0.0', specKind: 'range' }).updatable, false)
  assert.equal(
    buildUpdateStatus({ current: '1.0.0', specKind: 'range', outdated: { name: 'p', current: '1.0.0', wanted: '1.0.0', latest: '1.0.0' } }).updatable,
    false,
  )
  // 非 range 声明即使有新版也只展示差异。
  const s = buildUpdateStatus({
    current: '1.0.0',
    specKind: 'non-range',
    outdated: { name: 'p', current: '1.0.0', wanted: '1.0.0', latest: '2.0.0' },
  })
  assert.equal(s.updatable, false)
  assert.equal(s.major, true)
  assert.equal(s.specKind, 'non-range')
})
