# dshp-skill-panel

**Session-scoped skill control for DeepSeek Harness (DSH).** Adds model tools
(`session_skill_*`), slash commands (`/skill-*`) and a browser Skill Panel —
three entrances over one shared, session-isolated skill store. The panel
communicates over a DSH `webServer` HTTP route (relative-path `fetch`), so the
package builds and installs independently of the DSH monorepo.

DSHP 会话级 Skill 控制插件（**命令 + 工具 + 面板三入口**，共享同一会话隔离的 skill store）：

- 5 个 `session_skill_*` **模型工具**（模型自主调用）：browse / search / list / introduce / remove
- 5 个 `/skill-*` **斜杠命令**（人类直接调用，不经模型）：`/skill-browse [origin] [query]` `/skill-search <query>` `/skill-list` `/skill-introduce <name>` `/skill-remove <name>`
- **技能面板（Skill Panel）**：浏览器加性 UI——设置页「技能面板」节（`settings.section`）；数据经 **DSH webServer HTTP 路由**（`POST /skill-panel/<method>`，相对路径 fetch，不依赖 typert/Remote）
- 三面共享同一个 `SessionSkillStore` + `pool.ts` 只读层（幂等、会话隔离、影子覆盖语义一致；面板零新业务逻辑）

## 结构（src/）

- `index.ts` — 插件入口：`SkillControlPlugin`（默认导出类），`inject: ['agents','tools','skills','commands']`，`Config.poolRoot?`；构造时注册工具+命令（`ctx.effect`）+ 子服务 `SkillPanelService`（`ctx.plugin`）
- `pool.ts` — 池读取层：目录扫描 / SKILL.md frontmatter 解析（BOM 剥离）/ 信任校验 / 未订阅生态目录；`defaultPoolRoot` 遵循 DSH home 优先级（显式 `poolRoot` > `$DSH_HOME` > `~/.dsh`）
- `handles.ts` — `SessionSkillStore`：按 agent+name 的引入句柄（WeakMap，不泄漏、不跨会话）
- `tools.ts` — 5 个模型工具（`ctx.tools.register` + `ctx.effect`）
- `commands.ts` — 5 个斜杠命令（`ctx.commands.register` + `ctx.effect`）
- `skill-panel-service.ts` — `SkillPanelService`（`inject: ['agents','skills']`）：构造时经 `ctx.get('webServer').register({kind:'prefix', path:'/skill-panel'})` 注册 HTTP 路由（`ctx.effect` 回收），`dispatch` 分发 `browse/list/detail/introduce/removeSkill` 到 pool/store；不依赖 typert
- `types.ts` — 面板边界载荷类型（纯序列化类型，host/client 共享）
- `client/` — 浏览器半：`index.ts`（`createSkillPanelClient()` + 注册 `settings.section` 槽位）、`api.ts`（HTTP 客户端：相对路径 `fetch('/skill-panel/<method>')`，返回裸业务 JSON）、`view.tsx`（共享面板视图：搜索/来源过滤/前置置灰/影子标注/详情展开）、`sections.tsx`、`locale.ts`（zh/en）、`styles.ts`（`--dsw-alias-*` 主题令牌）

## 开发 / 构建（Development）

独立于 DSH monorepo 构建（peerDeps 从本包 node_modules 解析）：

```bash
pnpm install
pnpm typecheck    # 轻量类型检查（host + client，CI 同一门槛）
pnpm build        # 产出 lib/index.js + lib/client.js
```

- `tsconfig.host.json` / `tsconfig.client.json`：自包含类型检查配置，`@deepseek-ai/*` 从本包 node_modules 解析。
- `build-client.mjs`：独立 bundle 脚本（`node build-client.mjs` → client；`--host` → host）。
- 预构建的 `lib/` 随仓库提交（dsh-web-billing 同款），消费者安装即用，无需自行构建。
- `cordis.patch.yml`：`dsh.bundle` 声明，安装时注入插件行。

## 安装（Install）

```bash
# 从 npm（发布后）
dsh plugin --profile web add @kuramiwan/dsh-skill-panel

# 或直接从源码仓库
dsh plugin --profile web add github:kuramiwan/dshp-skill-panel
```

装好后**重启 dsh web**。host 半注册工具/命令/HTTP 路由；client 半经 `dsh.client`
声明被 browser roster 发现（设置页「技能面板」节）。

## 已知显示行为 / 边界

- 空白新会话中命令结果节点可能不实时上屏（DSH 客户端有意不把 command 节点当会话内容），发一条消息或刷新后全部出现——建议在**有对话历史的会话**中使用命令。
- 生态"未确认来源"条目命令/工具/面板路径保持前置置灰报错（确认点=订阅）。

## 免责声明（Disclaimer）

本插件是 **DeepSeek Harness 的个人性、非官方扩展**，与 DeepSeek / DSH 官方无从属
或背书关系（这是社区 `dsh-plugin` 生态的一员）。技能（Skill）内容来自本地 `~/.dsh/.skill-pool`
池与订阅的生态目录——“生态来源未确认”条目引入前会前置置灰/报错提示，引入后按
`SKILL.md` 原文原样注册，**不对任何技能内容的正确性、安全性或后果负责**。使用即表示
你了解 Skill 以本地目录为资源基座、按会话隔离执行；请仅引入你信任的技能源。

This plugin is an unofficial, personal extension of DeepSeek Harness and is not
affiliated with or endorsed by DeepSeek / DSH. Skills come from your local pool
and subscribed ecosystem sources; always review and trust sources before
introducing them. Use at your own risk. Licensed under [MIT](LICENSE) — no
warranty, no liability.

## License

[MIT](LICENSE) © 2026 kuramiwan
