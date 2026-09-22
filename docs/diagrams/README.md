# 图表（Archify）

本目录放 Archify 的**图源**与 `deliver` 出的**自包含可交互成品**；README 里嵌的是由成品导出的静态 PNG。

## 文件约定

| 文件 | 说明 |
| --- | --- |
| `<name>.architecture.json` | 图源（typed JSON IR）——**改图只改这里** |
| `<name>.zh.architecture.json` | 中文版图源；英文版不带 `.zh` |
| `<name>.architecture.html` | `deliver` 出的自包含成品（明暗主题、搜索、focus、上下游追溯、导出） |
| `docs/assets/<name>.{dark,light}.png` | README 用的静态图，由 `scripts/archify-png.mjs` 生成 |

现有两张图：`how-it-works`（How it works 主图）、`runtime-architecture`（运行时架构，带源码证据）。

## 改一张图

```bash
# 全局 skill 安装后在此路径；按自己的安装方式调整
A=~/.agents/skills/archify/bin/archify.mjs

node $A validate architecture docs/diagrams/<name>.architecture.json --quality showcase --repo-root "$PWD" --json
node $A deliver  architecture docs/diagrams/<name>.architecture.json docs/diagrams/<name>.architecture.html --quality showcase --repo-root "$PWD" --json
```

- `showcase` 要求 9 项 artifact 检查全过且 **0 error / 0 warning**（含连线交叉、标签遮挡、1440 宽下投影字号 ≥6px 等）。不达标时按 `diagnostics[].subject` 做**局部**修复，一次只动被点名的那一处。
- 只有声明了 `meta.repository` + 组件 `sources` 的图才需要 `--repo-root`；`runtime-architecture` 有源码证据（图上 `SRC n` 可点回具体文件行）。
- `validate` 通过后再跑 `deliver`：它冻结规格、原子替换产物，失败时保留上一版。

## 重新生成 README 的 PNG

```bash
pnpm add -D @resvg/resvg-js @xmldom/xmldom      # 一次性

node scripts/archify-png.mjs docs/diagrams/how-it-works.architecture.html docs/assets how-it-works
node scripts/archify-png.mjs docs/diagrams/how-it-works.zh.architecture.html docs/assets how-it-works.zh \
  --font "Noto Sans SC" --font-file /path/to/NotoSansSC-Regular.ttf
```

**为什么需要脚本**：Archify 的 inline SVG 依赖页面 `<style>` 里的 CSS 类与 `var(--x)`，单独把 `<svg>` 抠出来会丢样式（默认全黑）。脚本把每个元素的生效样式解析成内联 `style`，再用 `resvg` 光栅化，因此**没有可用浏览器**（无法截图）的环境也能稳定出深 / 浅两套 PNG。中文必须给 `--font` + `--font-file`，否则渲染成方块。

依赖缺失时脚本会提示安装；也可以只临时装一份，用 `ARCHIFY_PNG_DEPS=<dir>/node_modules` 指过去。

## 成品里自带的能力

明暗主题切换、缩放平移、`/` 搜索聚焦、上下游可达追溯、两点间路由、语义视角、引导故事播放，以及 PNG / SVG / WebM / 1200×630 分享卡导出。
