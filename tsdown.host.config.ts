import { defineConfig } from 'tsdown'
// 发布方案一：host 侧为 webServer HTTP 路由（skill-panel-service.ts），无 typert。
// 直接从 src 打包（rolldown 转译、不做 tsc 类型检查、不依赖预生成 lib/types），
// 避免 monorepo 复合项目的 rootDir 报错；产物 lib/index.js 即为运行期 host 代码。
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
