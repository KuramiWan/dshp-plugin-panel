# 可观测性 SOP：dshp-skill-panel 日志与调试

> 配套 ADR-0009（日志系统）、ADR-0010（调试器）。
> **受众：AI agent（LLM）。** 本文档写给 agent 排查插件自身错误用，不是给人看的操作手册。
> 目标：让你（agent）**一条命令拿到插件状态 + 错误线索全貌**，无需改源码、无需宿主在跑。

---

## 0. 角色定位：这是 agent 的诊断协议

你（一个 agent）在排查 dshp-skill-panel 时，**遵循本协议**。它不是给人类工程师的舒适阅读材料：

- **命令输出是可解析的**：默认文本给人扫，`--json` 给你精确解析。
- **一致性自检已经替你算了结论**：脚本不只 dump 原始状态，还把"哪里不对"直接算出来。
- **只读、无副作用**：你可以在宿主故障时安全运行，绝不改动任何文件。
- **决策在你**：脚本给证据，修复动作你来做（走正式工具/命令，或改源码）。

---

## 1. 数据流与机制

```
代码 ctx.logger('子系统').info/error/...   ← 命名 logger（ADR-001）
        │  cordis 单一管道
        ▼
   installPanelLogging(ctx)                ← init 注册一次
   ├─ 控制台（肉眼/宿主日志）
   ├─ JSON Lines 文件  <dshHome>/.dshp-skill-panel.log   ← debug 脚本读它
   └─ 内存缓冲 500 条（recentLogs()，不进文件）
```

**为什么能"不修改源码拿到任何地方日志"**：日志是**管道 + 挂接**而非逐点埋点。
所有命名 logger 自动流入同一管道，3 个 exporter 各取所需。你不需要在每个代码位置
手动写文件/控制台——只要代码用命名 logger，文件 exporter 自动落盘。

---

## 2. 兼容性（agent 执行前必读）

| 项 | 约束 | 含义 |
|----|------|------|
| **Node 版本** | ≥ 22.6 | `--experimental-strip-types` 需要 22.6+（v22.23 验证通过） |
| **运行目录** | 必须 `dshp-skill-panel` **源码 git 检出** | `scripts/` + `src/` **不发布到 npm**（`files` 只有 `lib/`），已安装的 bundle 里没有 |
| **是否需装依赖** | 否 | debug 只 import node 内建 + 本地 `src/`，裸检出即可跑，无需 `node_modules` |
| **宿主是否必须在跑** | 否 | 独立进程，宿主宕机也能跑；代价是读不到内存态 |
| **$DSH_HOME 一致性** | 双端一致 | 环境变量同时改插件与脚本的 dshHome；**别只在一端设置**，否则"插件写 A、脚本读 B" |

> **一句话**：从 `dshp-skill-panel` 的 git 检出里跑，用 Node ≥ 22.6，不要依赖已安装的 npm 包。

---

## 3. 命令协议

```bash
# 全貌（默认文本，人扫一眼）
pnpm debug

# 结构化 JSON（agent 精确解析——首选）
node --experimental-strip-types scripts/debug-dump.ts --json

# 只看最近 20 条 error/warn 线索
node --experimental-strip-types scripts/debug-dump.ts --logs 20

# 覆盖 poolRoot / profileDir（如配置被改）
node --experimental-strip-types scripts/debug-dump.ts --root <dir> [--profile <dir>]

# 环境变量覆盖 dshHome
DSH_HOME=/custom/dsh node --experimental-strip-types scripts/debug-dump.ts
```

`--json` 顶层结构：`{ config, pool[], sessions[], issues[], logs[] }`。

---

## 4. Agent 诊断五步

> 对 agent 而言这是固定流程；每步有明确输入与决策。

1. **读 `config`**：确认 `dshHome/poolRoot/profileDir/logFile` 四项解析结果。
   头号错误是**脚本读的目录 ≠ 插件写的目录**——先排除。
2. **读 `issues`**：脚本已算好问题。`introduced-missing-in-pool` = 落盘引入集的 skill
   已不在池中（状态漂移）。**直接采用这个结论，不要自己重新推理。**
3. **读 `logs`**（`--logs N`）：按 `[level] [name] msg` 定位失败子系统。
4. **读 `pool` / `sessions`**：核对管理范围与跨会话快照是否符合预期。
5. **做决策**：脚本只读不改 → 需要修改时走正式工具/命令，或改源码 + 重构建 + 宿主重启。

### 4.1 症状 → 依据块 对照

| 症状 | 看 | 可能结论 |
|------|----|---------|
| skill 没出现在工具/面板 | `pool` | 不在池里 / 无 SKILL.md |
| 恢复会话引入集丢失 | `sessions` | 快照缺失/损坏 |
| 报错却无日志 | `config.logFile` + 文件 | 文件 exporter 静默降级（日志文件不存在 ≠ 没问题） |
| 行为与配置不符 | `config` | dshHome/poolRoot 错位 |
| skill 已移除仍被引入 | `issues` | `introduced-missing-in-pool` |

---

## 5. 埋点规范（写代码的 agent 也要遵守）

- **只用命名 logger**，禁裸 `console.*`。子系统名：`skill-panel`/`pool`/`store`/`mcp`/`plugin-manager`。
- **级别**：`error`=功能失败；`warn`=可降级；`info`=核心业务事件；`debug`=细节。调试器只提取 error/warn，级别错了 agent 看不到。
- **参数**：Error 让 `formatArgs` 取 `stack`（别 `String(err)` 丢堆栈）；对象 JSON 化，别拼长串。
- **新增日志前**：这条会出现在 debug/面板里并被需要吗？不会就**别加**（噪音）。
- **想观测内部状态 → 优先进落盘状态**（会被 dump），别塞临时日志。**状态归状态、日志归日志**。

---

## 6. 边界

- **只看落盘、不看内存**：读不到 WeakMap 句柄/fiber。内存态需宿主内导出面——目前
  `POST /skill-panel/sessions`（`ctx.agents.list()`/`roots()`）是唯一只读枚举端点，给 live session id。
- **文件固定、追加、不轮转**：不自动清理。
- **写失败静默降级**：日志系统不因磁盘故障中断宿主。
- **宿主需重启才加载新 bundle**：改源码重构建后 dev mount 宿主要重启（`lib/index.js` 是构建产物）。

---

## 一句话

> **日志是管道不是埋点，排查只读不写，状态归状态、日志归日志。**
> 你怀疑有问题 → `pnpm debug --json` 拿全貌 → 读 config → 读 issues → 读 logs →
> 决策动作。改源码是最后手段。
