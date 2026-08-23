#!/usr/bin/env node
/**
 * 包完整性校验：package.json 的 name 是唯一事实源，其余硬编码引用必须与之一致。
 * 改名时若漏改任一处，本脚本在 CI / prepublishOnly 阶段直接失败，避免「挂载名 ≠ bundle 注册名」
 * 导致 DSH 启动被阻塞（"loaded without registering"）。
 *
 * 覆盖：
 *   - cordis.patch.yml 的挂载名（insert[0].name）
 *   - src/plugin-manager.ts 的 PANEL_PACKAGE
 *   - dsh.bundle.patch 指向的文件必须在 files 里（否则 npm 发布会漏掉，DSH 启动 ENOENT）
 * （tsdown.client.config.ts 的 banner id 已从 package.json 派生，无需在此校验。）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const name = pkg.name

const failures = []

const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
const patchName = patch.match(/^\s*name:\s*'([^']+)'/m)?.[1]
if (patchName !== name) {
  failures.push(`cordis.patch.yml mounts "${patchName}" but package.json name is "${name}"`)
}

const pm = readFileSync(resolve(root, 'src/plugin-manager.ts'), 'utf8')
const panelPackage = pm.match(/PANEL_PACKAGE\s*=\s*'([^']+)'/)?.[1]
if (panelPackage !== name) {
  failures.push(`plugin-manager.ts PANEL_PACKAGE is "${panelPackage}" but package.json name is "${name}"`)
}

// dsh.bundle.patch 指向的文件必须在 files 里，否则 npm 发布会漏掉它，DSH 启动时 ENOENT。
const bundlePatch = pkg.dsh?.bundle?.patch
if (bundlePatch) {
  const patchFile = bundlePatch.replace(/^\.\//, '')
  if (!Array.isArray(pkg.files) || !pkg.files.includes(patchFile)) {
    failures.push(`dsh.bundle.patch "${bundlePatch}" is not in package.json "files" (npm publish would omit it)`)
  }
}

if (failures.length > 0) {
  console.error('[check:name] package name drift detected:')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}

console.log(`[check:name] OK: all references match "${name}"`)
