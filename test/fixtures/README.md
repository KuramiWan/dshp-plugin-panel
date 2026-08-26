# Test Fixtures — moved to fork

测试用制品（技能、测试插件、MCP 配置）已迁出本仓，集中在独立 test fork：

**[`dshp-skill-panel-test-fork`](https://github.com/KuramiWan/dshp-skill-panel-test-fork)**
（本地路径：`~/code/dshp-skill-panel-test-fork/`）

## 为什么拆出去

- 测试制品与生产代码解耦——主仓 PR 不会意外影响 test profile
- `dshp-skill-panel` 的 npm `files` 列表不含 fixtures 也不会再是问题（不在仓内了）
- test fork 可被多个 DSH profile / 多个项目复用
- fixtures 迭代节奏可独立（不与主仓 release 绑定）

## 仓内保留的

本目录只剩本 README——历史 fixtures 已迁出。test profile 的接入步骤见 fork 仓 `INSTALL.md`。
