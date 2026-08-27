# Test Fixtures（仓库内测试制品）

本目录是 dshp-skill-panel 仓库内的测试用制品，供 DSH 的 **test profile**（`~/.dsh/profiles/test`）
加载。环境差异由 **profile 配置**区分（web/dev/test 三个 profile 共用同一份代码），
不用分支区分——本仓库只有 `main` 一个分支。

## 包含什么

| 路径 | 性质 | 用途 |
|---|---|---|
| `skill-pool/{alpha,beta,gamma,delta}/SKILL.md` | 4 个技能说明文件 | 验证技能页签三区、tag 分组、搜索、引入/移除、设为全局、影子覆盖 |
| `test-plugin/` | 一个 DSH 插件包（带 `cordis.patch.yml` + `index.js`） | 验证插件页签的热插拔、启停、日志识别 |
| `test-profile/cordis.patch.yml` | test profile 的 patch（含 dshp-test-plugin 热插拔行 + mcp-client 桥接行） | 验证插件页签热挂载 + MCP 段（发现 / 加入管理 / 检查）——`command` 故意指向不存在的二进制，让"检查"返回明确错误 |
| `scripts/switch-mount.sh` | 归档：开发循环工具（历史存档，不作开发调用） | 存档 |
| `INSTALL.md` | test 环境接入指引 | 见下文「接入 DSH test 环境」 |

## 环境模型（单分支 + DSH_HOME 根隔离）

- **一个仓库、一个 main 分支**：插件生产代码（`src/`、`package.json`、文档）+ `test/fixtures/` 共存。
- **环境差异在 `$DSH_HOME` 根**：一个 dsh 内核，生产用默认根（`~/.dsh`，`web`
  profile，npm 发布版）；开发/测试用项目内根（`.dsh-dev/`，`web` profile，
  与生产同组合）。测试根通过 patch 挂 fixtures（`./dsh-test` 自动完成），
  凭证经 `config.path` 指向生产（零复制）。
- 面板自动探测所在 profile（`ctx.baseUrl`），无需注入 `profileDir`。

> 注：`test-plugin` 的入口是 `index.js`（JS）而非 `src/index.ts`——DSH 的 Node loader
> 不支持从 node_modules 目录加载 `.ts` 源文件（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），
> 而 fixture 以真副本放进 profile 的 node_modules。TS 源码保留在 `src/` 作参考。

## 为什么 fixtures 放仓库内而不是独立分支

- 仓内一处搞定，无需多分支 cherry-pick（双分支历史多次漂移，如 CONTRIBUTING 残留旧说法）
- fixtures 改动与主代码改动可在同一 PR 内做关联 review
- profile 配置天然隔离：fixtures 只在 test profile 加载，生产 web profile 读不到

## 接入 DSH test 环境

参见 [INSTALL.md](./INSTALL.md)（纯官方 `dsh plugin` 命令，无自研脚本）。
