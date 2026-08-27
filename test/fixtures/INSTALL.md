# INSTALL — 接入 DSH test profile

把 `test/fixtures/` 下的制品装进 DSH 的 **test profile**（`~/.dsh/profiles/test`）。
方案：官方 profile 机制 + 官方命令——一个 DSH home（`~/.dsh`），`web`（生产）/ `dev` / `test`
多个 profile 区分环境，**不用分支区分环境**（本仓库只有 main 分支）。

## 前置

- `dsh` 在 PATH、`pnpm`、`node ≥ 20`
- 本仓库 checkout（main 分支）；clone 后必须先 `pnpm install && pnpm build`（`lib/` 不进 git）
- 面板自动探测所在 profile（`ctx.baseUrl`），无需注入 `profileDir`

## 快速开始（纯官方命令）

```bash
# 1. 构建面板（clone 后一次性）
cd dshp-skill-panel && pnpm install && pnpm build

# 2. 挂载面板到 test profile（官方入口：自动 init profile + pnpm add + reconcile bundles）
dsh plugin --profile test add "$PWD"

# 3. fixtures 落地（真副本，不软链）
#    a. test-plugin：复制进 profile 的 node_modules（不要用 dsh plugin add——
#       那样双挂载：bundle 层 + patch 行同 id，启动崩溃）。它经下面的 patch 行热挂载。
mkdir -p ~/.dsh/profiles/test/node_modules
cp -r test/fixtures/test-plugin ~/.dsh/profiles/test/node_modules/dshp-test-plugin
#    b. profile patch：fixtures 文件含 dshp-test-plugin 行（热插拔）与 test-mcp-stdio
#       MCP 桥接行；不含面板行（面板从自己的 bundle.patch 挂载）。
#       若你手改过 profile patch，先备份再覆盖。
cp test/fixtures/test-profile/cordis.patch.yml ~/.dsh/profiles/test/cordis.patch.yml
#    c. 独立技能池（可选）：poolRoot 指到 ~/.dsh 之外，fixtures 不污染生产技能页签。
mkdir -p "$PWD/.pool-test/local"
cp -r test/fixtures/skill-pool/. "$PWD/.pool-test/local/"
#       然后在 profile patch 里加面板行（不隔离可省，面板用默认池）：
#         - id: dshp-skill-panel
#           config:
#             poolRoot: $PWD/.pool-test

# 4. 启动
dsh --profile test --port 3081
```

## 隔离边界（profile 方案）

| 层 | 隔离方式 |
|---|---|
| 组合（装什么） | 每 profile 独立 node_modules + bundles + cordis.patch.yml |
| 技能池 | test 用 poolRoot 指到 `<项目>/.pool-test`，fixtures 不污染生产页签 |
| 凭证/会话/设置 | **共享**（profile 机制天然如此，测试环境可直接用生产凭证） |

## 改 fixture 后的开发循环

- 改 `test/fixtures/skill-pool/*/SKILL.md`：刷新面板即生效（DSH 直接读文件）
- 改 `test/fixtures/test-plugin/index.js`：需重新复制到 profile node_modules
- 改 `test/fixtures/test-profile/cordis.patch.yml`：DSH 的 `watchUserPatches` 自动热重载

## 回到生产

```bash
dsh --port 3081        # 默认 --profile web（生产 npm 版）
```

`~/.dsh/profiles/test/` 不会被 web profile 读到（profile 隔离）。

## 验证

打开 `http://127.0.0.1:3081/`，进入 设置 → 技能面板：

- **技能页签**应看到 4 个技能：alpha（带 tag test/demo）、beta（无 tag）、gamma（带 tag test）、delta（带 tag demo）
- **插件页签**应看到：
  - 「热插拔」section：dshp-test-plugin
  - 「MCP 会话连接」section：test-mcp-stdio（command 故意指向不存在二进制，"检查"会失败——是预期）

> **注意**：test-mcp-stdio 是 MCP 桥接行，在 **MCP 段**管理：
> 「加入管理」（select）把它从 profile patch 移到白名单（会话级连接/断开）；
> 「取消管理」（removeTemplate）把它恢复回 profile patch。不在插件段的「热插拔」里
> 启停它（插件段不管理 mcp 行，M3 修复）。
