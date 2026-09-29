#!/usr/bin/env node
/**
 * 把 devDependencies 里的 @deepseek-ai/dsh-* 钉到指定 DSH 版本，用于**逐版本验证**。
 *
 * 为什么需要它：本插件同时支持两条 DSH 线（`latest` 与 `next`），peerDependencies 写的是
 * 联合区间 `^A || ^B`；但 devDependencies 只能装一个版本，而 `pnpm typecheck` 只能看到
 * **已安装**的那个 `.d.ts`。CI 用 matrix 调本脚本逐条线验证，才不会出现「声明支持但其实
 * 没测过」——这正是本仓库踩过的坑（事件改名静默失效，且当时没有任何自动防线）。
 *
 * 同时**断言**该版本确实落在声明的 peer 区间内：DSH 0.2 起会在安装时按 peerDependencies
 * 拒绝不兼容的插件，所以区间写窄了用户直接装不上——这里提前在 CI 大声失败。
 *
 * 只改 devDependencies 的 `@deepseek-ai/dsh-*`；peerDependencies 的联合区间**不动**。
 *
 * 用法：node scripts/set-dsh-baseline.mjs 0.2.0-rc.1
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const version = process.argv[2]
if (version === undefined || version === '') {
  console.error('用法: node scripts/set-dsh-baseline.mjs <dsh 版本，如 0.2.0-rc.1>')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const dev = pkg.devDependencies ?? {}
const peer = pkg.peerDependencies ?? {}

// 先断言：声明的 peer 区间必须接受这个版本，否则用户装了会被 DSH 的兼容性闸门拒绝。
const uncovered = []
for (const [name, range] of Object.entries(peer)) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  if (!semver.satisfies(version, range)) uncovered.push(`${name}: 声明 ${range}`)
}
if (uncovered.length > 0) {
  console.error(`[set-dsh-baseline] ✗ ${version} 不在声明的 peer 区间内，先补 peerDependencies：`)
  for (const line of uncovered) console.error(`  - ${line}`)
  console.error('（DSH 0.2 起安装时会按 peerDependencies 拒绝不兼容插件，区间写窄 = 用户装不上。）')
  process.exit(1)
}

const touched = []
for (const name of Object.keys(dev)) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  dev[name] = `^${version}`
  touched.push(name)
}
if (touched.length === 0) {
  console.error('devDependencies 里没有 @deepseek-ai/dsh-*，脚本前提不成立')
  process.exit(1)
}

// dsh-* 之外的 peer（cordis / schemastery）不跟随 dsh 线，保持原样。
pkg.devDependencies = dev
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`[set-dsh-baseline] devDependencies → ^${version}（${touched.length} 个包）`)
for (const n of touched) console.log(`  - ${n}`)
