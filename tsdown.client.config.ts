import { defineConfig } from 'tsdown'

/**
 * 技能面板 client bundle（ADR-0007）：产出 lib/client.js ——
 * window.__ModuleLoader__.load({id, factory}) 包装（dsh-client-modules 同款格式）。
 * react / react/jsx-runtime / @deepseek-ai/cordis 走 loader 模块表（平台模块外部化）；
 * 其余（含本包生成的 ./remote 桩 + zod）内联进 bundle。
 */
const EXTERNALS = ['react', 'react/jsx-runtime', '@deepseek-ai/cordis']

export default defineConfig({
  name: '@kuramiwan/dsh-skill-panel/client',
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
    banner: 'window.__ModuleLoader__.load({ id: "@kuramiwan/dsh-skill-panel", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
