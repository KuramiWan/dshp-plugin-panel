#!/usr/bin/env node
/**
 * 独立 bundle 脚本（发布方案一，免 monorepo）。
 * 只要求本包自己在 node_modules 装了 tsdown（devDep）与 peerDeps，不引用 deepseek-harness。
 *
 *   node build-client.mjs          → 生成 lib/client.js（tsdown.client.config.ts）
 *   node build-client.mjs --host   → 生成 lib/index.js（tsdown.host.config.ts，需先 tsc 产出 lib/types）
 *
 * 安装即用的发布包可预先提交 lib/（dsh-web-billing 同款），消费端无需构建。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.dirname(fileURLToPath(import.meta.url))
const isHost = process.argv.includes('--host')
const config = isHost ? 'tsdown.host.config.ts' : 'tsdown.client.config.ts'
const out = isHost ? 'lib/index.js' : 'lib/client.js'

// 定位 tsdown CLI：优先本包 node_modules，其次上溯搜索。
function resolveTsdownCli() {
  const candidates = []
  let dir = root
  for (;;) {
    candidates.push(
      path.join(dir, 'node_modules', 'tsdown', 'dist', 'run.mjs'),
      path.join(dir, 'node_modules', 'tsdown', 'dist', 'cli.mjs'),
    )
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error('tsdown not found; run `pnpm install` first (tsdown is a devDependency)')
}

const cli = resolveTsdownCli()
console.log(`[build] config=${config} tsdown=${cli}`)
// 直接 spawn node（不经 shell），避免 Windows 下带空格的 node 路径被 cmd 拆碎。
const res = spawnSync(process.execPath, [cli, '--config', config], {
  cwd: root,
  stdio: 'inherit',
})
if (res.status !== 0) {
  console.error(`[build] failed with exit code ${res.status}`)
  process.exit(res.status ?? 1)
}
console.log(`[build] ${out} built`)
