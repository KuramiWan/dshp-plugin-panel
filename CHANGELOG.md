# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `dsh-dev` / `dsh-test` 启动前幂等补全 `@deepseek-ai/dsh-web-app` bundle
  （052e220 重构删掉 708aa20 修复的回归防护）：profile 模板组合缺 web-app 时
  自动补入，防止面板 initialized 后无 web 层静默挂起（无监听、无报错）。
  判断走 JSON 解析（不全文 grep，避免子串误判），在 `dsh-base` 之后插入；
  `dsh.profile.bundles` 结构异常（缺 bundles 数组或缺 dsh-base）时大声失败
  退出，不静默继续。

### Changed
- **面板改名：「技能面板 → 插件面板」**。设置页节名/页面标题/`nav`/`page.title` 改为
  「插件面板」（en: Plugin Panel），技能页签按钮独立为「技能」（`tab.skills`）。
  面板层标识符全量改名：`SkillPanelService` → `PluginPanelService`（文件
  `src/plugin-panel-service.ts`）、HTTP 路由 `/skill-panel` → `/plugin-panel`、
  `SkillControlPlugin` → `PluginPanelPlugin`、注册 id `dshp-skill-panel` →
  `dshp-plugin-panel`、日志文件 `.dshp-skill-panel.log` → `.dshp-plugin-panel.log`、
  locale NS / STYLE_ID / bundle 注册名同步。npm 包名 `@super_camel/dsh-skill-panel`
  → `@super_camel/dsh-plugin-panel`，仓库 `KuramiWan/dshp-skill-panel` →
  `KuramiWan/dshp-plugin-panel`。**技能层保留原名**：`/skill-*` 命令、`session_skill_*`
  工具、技能池、`.session-skills/` 持久化、`SKILL.md` 均不变。
- wrapper 报错文案由「开发根未构建」改为「测试/开发根未构建」，并在
  `test/fixtures/INSTALL.md` 说明 `.dsh-dev` 是 dev/test 共用根（不是
  「先跑 dev 才能跑 test」的双 profile 结构）。

## [0.2.0] - 2026-08-28

### Added
- `pluginDemote`（改为冷挂载）：热插拔（patch）行可降级回 bundle（冷挂载）——与
  `promoteToPatch` 对称；降级时自动恢复包的 `dsh.bundle` 声明（优先从 .bak 还原，
  否则探测包内真实 patch 文件；两者皆无则拒绝），标记 `pendingDemote` 待重启生效。
- 面板自动探测所在 profile：dsh boot 时 `ctx.baseUrl` 即 profile 目录（官方机制），
  PluginManager / SessionMcpManager 从它派生 profileDir——不再需要往 patch 注入
  `profileDir`（`config.profileDir` 显式提供时仍优先，向后兼容）。
- 开发环境：`dsh-dev` / `dsh-test` wrapper——DSH_HOME 隔离开发根（`.dsh-dev/`）、
  官方 `web` profile（与生产同组合）、凭证/模型配置经 `config.path` 指向生产
  （零复制零软链）；`dsh-test` 自动补全 fixtures patch。
- 测试 fixtures 并入仓库（`test/fixtures/`：skill-pool ×4、dshp-test-plugin、
  test-mcp-stdio 桥接行）。

### Fixed
- M3：patch 里的 mcp 桥接行不再被插件段当 patch 行管理（`readPatchRows` 跳过）。
- M7：mcp 全局形态支持 profile patch——`select`/`removeTemplate` 同时处理
  home + profile patch，取消管理后条目不再消失（sidecar 记 `__sourceFile`）。
- M8：停用 fixtures 预置的 patch 行后保留为已停用（可重新启用），不再完全消失。
- M9：`writePatch` 重建时保留 mcp 桥接行——停用插件不再连带删除同 patch 的
  mcp 行。

## [0.1.4] - 2026-08-25

### Added
- Structured logging: `ctx.logger` backend with console / JSON Lines file (`<dshHome>/.dshp-plugin-panel.log`) / in-memory buffer exporters (ADR-0009); replaces bare `console.warn/error`.
- Standalone read-only debugger `scripts/debug-dump.ts` (`pnpm debug`): pool scan, session introduce-set, config resolution, consistency self-check, and recent error/warn log clues (ADR-0010).
- `POST /plugin-panel/sessions`: enumerate live sessions (`{sessionId, status, root}`) so a debugger/caller can discover live session ids instead of guessing (ADR-0010 live-session gap).

### Changed
- CI (`ci.yml`) now runs the full type-check (host + client), tests, build, and a `pack-check` preflight; release adds a `verify` gate before publish.
- `prepublishOnly` runs the full type-check (including client).
- Rewrote README (EN + zh): feature-domain structure (Skills / Plugins & MCP), added the `session_mcp_*` tools, corrected the global-layer management story, and linked a new observability SOP for agents.

### Fixed
- `recentLogs` severity filter inverted: `minLevel='warn'` now returns error+warn, not error+info+warn.
- `writePatch` no longer silently drops pre-existing patch rows whose id is not a string.
- Multiple fibers with empty names no longer collapse into a single `(unnamed)` row and hide real plugins.
- Disabling a plugin mounted in both patch and bundle now also removes the bundle (and marks restart required).
- MCP `deriveServerName` keeps the full agent hash (long whitelist names no longer collide across agents).
- MCP `restoreGlobalMcp` scans all insert blocks before restoring, avoiding duplicate rows.
- MCP `disableGlobalMcp` preserves all same-named rows in the sidecar and restores them all (legacy single-row format still read).
- MCP `connect` returns `{ok:false}` instead of throwing when `agent.ctx.plugin()` throws synchronously, and no longer leaks `ownedServerNames`.
- MCP `select` surfaces rollback failures in the returned reason and logs them, instead of discarding them.
- MCP `usedCount` is now decremented on session end (via `agent.ctx.effect`), so `removeTemplate` is released once a session is gone.

## [0.1.3] - 2026-08-24

### Added
- MCP is now managed as a plugin: enable = connect to the current session, disable = disconnect. "加入管理/取消管理" (manage/unmanage) replaces "新增 MCP/删除".
- Bundle→patch promote: convert a bundle plugin to a hot-pluggable patch plugin, with an in-place `dsh.bundle` rewrite so DSH stops re-adding it to `dsh.profile.bundles`.
- Bundle plugins are now manageable (cold-mount enable/disable via `dsh.profile.bundles`).
- MCP select/deselect symmetry: selecting an MCP disables its global instance and moves it to session-level; deselecting restores the global instance.

### Changed
- The plugin tab now has its own subtitle (four groups: built-in / patch / bundle / MCP) instead of reusing the skill tab's.
- README and package description updated to cover plugin management.

### Fixed
- Deduplicated built-in plugins (the same plugin class mounted in multiple contexts appeared many times).
- Fixed skill-tab group collapse state leaking across scopes (same-named groups in different scopes toggled together).

## [0.1.2] - 2026-08-24

### Fixed
- Ship `cordis.patch.yml` in the npm package (it was missing from `files`, so DSH boot failed with ENOENT when reading `dsh.bundle.patch`).
- Harden the plugin against blocking DSH startup: derive the client bundle registration id from `package.json` name, and wrap the host apply in try/catch so an init failure degrades instead of throwing.

## [0.1.1] - 2026-08-23

### Added
- Plugin management tab (ADR-0008): list host composition plugins, enable/disable user plugins via hot-mount, install new plugins, with MCP management folded in.
- CI/CD pipeline: pnpm-based CI (type-check + build) and a tag-triggered release workflow (npm publish with provenance + GitHub Release).

### Changed
- Excluded DSH core plugins from the management list (shown as a read-only summary).
- Rewrote panel copy to user-facing language and polished the plugin/MCP/skill tab layout.

### Fixed
- MCP rows now show their server name and transport instead of the identical bridge package name.
- The panel now recognizes its own plugin row (was showing itself as "stopped").
- MCP check counts the global instance's tools and warns when none are found.

## [0.1.0] - 2026-08-18

### Added
- First public release of the session-scoped skill control plugin.

### Changed
- Panel host service migrated from typert Remote RPC to a DSH `webServer`
  HTTP route (`POST /plugin-panel/<method>`, relative-path `fetch`), and the
  client dropped the RPC value unwrap. This decouples the package from the DSH
  monorepo so it can be built and published standalone.
- `peerDependencies` / `devDependencies` pinned to real npm versions
  (`cordis@^4.0.1`, `schemastery@^3.18.1`, `dsh-*@^0.1.0-rc.7`).
- Added self-contained type-check configs (`tsconfig.host.json`,
  `tsconfig.client.json`) and a standalone bundle script
  (`build-client.mjs`), plus the `dsh.bundle` patch (`cordis.patch.yml`).
- Added project governance: `LICENSE` (MIT, © 2026 super_camel),
  `CONTRIBUTING.md`, CI (lightweight type-check), Keep-a-Changelog file.

[Unreleased]: https://github.com/kuramiwan/dshp-plugin-panel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kuramiwan/dshp-plugin-panel/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/kuramiwan/dshp-plugin-panel/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/kuramiwan/dshp-plugin-panel/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kuramiwan/dshp-plugin-panel/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kuramiwan/dshp-plugin-panel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kuramiwan/dshp-plugin-panel/releases/tag/v0.1.0
