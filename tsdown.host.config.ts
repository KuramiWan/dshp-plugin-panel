import { defineConfig } from 'tsdown'
// 发布方案一：host 侧已改为 webServer HTTP 路由（skill-panel-service.ts），
// 不再生成 typert 桩，故去掉 typertPlugin，改为纯 ESM 打包 lib/types/index.js。
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
