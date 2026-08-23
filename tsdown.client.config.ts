import { defineConfig } from 'tsdown'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 技能面板 client bundle（ADR-0007）：产出 lib/client.js ——
 * window.__ModuleLoader__.load({id, factory}) 包装（dsh-client-modules 同款格式）。
 * react / react/jsx-runtime / @deepseek-ai/cordis 走 loader 模块表（平台模块外部化）；
 * 其余（含本包生成的 ./remote 桩 + zod）内联进 bundle。
 */
const EXTERNALS = ['react', 'react/jsx-runtime', '@deepseek-ai/cordis']

// bundle 注册 id 必须等于 package.json 的 name：DSH client-modules 按挂载名校验注册名，
// 二者不一致会报 "loaded without registering" 并阻塞整个 DSH 启动。从 package.json 派生，
// 杜绝改名时 banner 漂移。依赖 build-client.mjs 以 cwd=包根 启动 tsdown（process.cwd() 即包根）。
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const id = pkg.name

export default defineConfig({
  name: `${id}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
  // 用独立 tsconfig（免 monorepo）：client 无运行时 @deepseek-ai 值导入（仅 react 外部化），
  // 因此无需 monorepo base/路径映射，jsx: react-jsx 由 tsconfig.client.json 提供。
  tsconfig: 'tsconfig.client.json',
  external: [...EXTERNALS],
  noExternal: (id: string) => (EXTERNALS.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: "${id}", factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
