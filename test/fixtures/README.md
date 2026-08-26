# Test Fixtures（test 分支专属）

本目录是 dshp-skill-panel **test 分支**专属的测试用制品。**main 分支无此目录**——这是为防止主分支的 PR 误把 fixtures 带进生产。

## 包含什么

| 路径 | 性质 | 用途 |
|---|---|---|
| `skill-pool/{alpha,beta,gamma,delta}/SKILL.md` | 4 个技能说明文件 | 验证技能页签三区、tag 分组、搜索、引入/移除、设为全局、影子覆盖 |
| `test-plugin/` | 一个 DSH 插件包（带 `cordis.patch.yml` + `src/index.ts`） | 验证插件页签的热插拔、启停、日志识别 |
| `test-profile/cordis.patch.yml` | mcp-client 桥接 patch 行 | 验证插件页签的 MCP 段（发现 / 加入管理 / 检查）—— `command` 故意指向不存在的二进制，让"检查"返回明确错误 |
| `scripts/switch-mount.sh` | 归档：开发循环工具 | 原属主仓（archive 模式），迁至 test 分支下保存；本目录的开发不依赖它 |
| `INSTALL.md` | test profile 接入步骤 | DSH test profile 的 setup + 启动指引 |

## 主仓 vs test 分支

- **main**：插件生产代码（`src/`、`lib/`、`tests/`、`package.json`、`files` 列表含的发布内容）。`test/fixtures/` 不存在。
- **test**（本分支）：在 main 之上加 `test/fixtures/` 整个目录，专给 DSH test profile 加载。

DSH test profile 的 `cordis.patch.yml` 通过软链 / 直接路径指到本目录的子路径。

## 为什么放 test 分支而不是独立 fork

- 仓内一处搞定，无需多仓同步
- main PR 不会误带 fixtures（不在 main 工作树）
- test 分支 fixtures 改动与主代码改动可在同一仓内做关联 review
- 隔离：worktree 模式可让主仓与 test 分支各自独立 worktree 并行

## 接入 DSH test profile

参见同目录 `INSTALL.md`。
