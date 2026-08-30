# INSTALL — 接入 DSH 测试环境（fixtures）

把 `test/fixtures/` 下的制品装进 DSH 的测试环境。方案（2026-08 定案）：
**一个 dsh 内核、多个 `$DSH_HOME` 根隔离**。生产用默认根（`~/.dsh`），
测试用项目内根（`.dsh-dev/`），两个根都跑**官方 `web` profile**
（dsh-base + dsh-web-app + 面板，与生产同组合）；差异只在 patch 内容。

> **关于 `.dsh-dev`**：这是 **dev/test 共用根**（`./dsh-dev` 与 `./dsh-test`
> 用同一个 `DSH_HOME`，差异只在 patch 内容），不是「先跑 dev 才能跑 test」
> 的双 profile 结构。名字沿袭双 profile 时代，含义请以本段为准。

## 前置

- `dsh` 在 PATH、`pnpm`、`node ≥ 20`
- 本仓库 checkout；clone 后必须先 `pnpm install && pnpm build`（`lib/` 不进 git）
- 面板自动探测所在 profile（`ctx.baseUrl`），无需注入 `profileDir`

## 快速开始

```bash
# 1. 构建面板（clone 后一次性）
cd dshp-skill-panel && pnpm install && pnpm build

# 2. 建开发根 + 挂载面板（官方入口；web 是官方模板，base+web-app 自动带上）
mkdir -p .dsh-dev
DSH_HOME="$PWD/.dsh-dev" dsh plugin --profile web add "$PWD"

# 3. 启动测试环境（wrapper 自动补全 fixtures patch + 凭证共享）
./dsh-test --port 3182
```

`./dsh-test` 首次运行自动完成：
- 凭证/设置共享（`config.path` 指向生产 `~/.dsh` 的 settings/credentials）
- fixtures patch：dshp-test-plugin 热插拔行 + test-mcp-stdio MCP 桥接行
- test-plugin fixture 以**真副本**装入 profile node_modules（不软链）

## 隔离边界（DSH_HOME 根隔离）

| 层 | 隔离方式 |
|---|---|
| 组合（装什么） | 每根独立 profiles/ + node_modules + bundles + cordis.patch.yml |
| 会话/技能/设置 | 每根独立（测试根不碰生产 `~/.dsh`） |
| 模型凭证 | `config.path` 指向生产文件（零复制，测试环境可用生产模型） |

## 改 fixture 后的开发循环

- 改 `test/fixtures/skill-pool/*/SKILL.md`：刷新面板即生效（DSH 直接读文件）
- 改 `test/fixtures/test-plugin/index.js`：删掉 `.dsh-dev/profiles/web/node_modules/dshp-test-plugin`
  后重跑 `./dsh-test`（wrapper 重新装入真副本）
- 改 `test/fixtures/test-profile/cordis.patch.yml`：DSH 的 `watchUserPatches` 自动热重载

## 回到生产

```bash
dsh --profile web --port 3081   # 生产（默认 ~/.dsh，npm 发布版）
```

`.dsh-dev/` 不会被生产读到（DSH_HOME 根隔离）。

## 验证

打开 `http://127.0.0.1:3182/`，进入 设置 → 技能面板：

- **技能页签**应看到 4 个技能：alpha（带 tag test/demo）、beta（无 tag）、gamma（带 tag test）、delta（带 tag demo）
- **插件页签**应看到：
  - 「热插拔」section：dshp-test-plugin
  - 「MCP 会话连接」section：test-mcp-stdio（command 故意指向不存在二进制，"检查"会失败——是预期）

> **注意**：test-mcp-stdio 是 MCP 桥接行，在 **MCP 段**管理：
> 「加入管理」（select）把它从 profile patch 移到白名单（会话级连接/断开）；
> 「取消管理」（removeTemplate）把它恢复回 profile patch。不在插件段的「热插拔」里
> 启停它（插件段不管理 mcp 行，M3 修复）。
