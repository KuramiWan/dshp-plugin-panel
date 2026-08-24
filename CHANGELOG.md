# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-08-25

### Added
- Structured logging: `ctx.logger` backend with console / JSON Lines file (`<dshHome>/.dshp-skill-panel.log`) / in-memory buffer exporters (ADR-0009); replaces bare `console.warn/error`.
- Standalone read-only debugger `scripts/debug-dump.ts` (`pnpm debug`): pool scan, session introduce-set, config resolution, consistency self-check, and recent error/warn log clues (ADR-0010).
- `POST /skill-panel/sessions`: enumerate live sessions (`{sessionId, status, root}`) so a debugger/caller can discover live session ids instead of guessing (ADR-0010 live-session gap).

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
  HTTP route (`POST /skill-panel/<method>`, relative-path `fetch`), and the
  client dropped the RPC value unwrap. This decouples the package from the DSH
  monorepo so it can be built and published standalone.
- `peerDependencies` / `devDependencies` pinned to real npm versions
  (`cordis@^4.0.1`, `schemastery@^3.18.1`, `dsh-*@^0.1.0-rc.7`).
- Added self-contained type-check configs (`tsconfig.host.json`,
  `tsconfig.client.json`) and a standalone bundle script
  (`build-client.mjs`), plus the `dsh.bundle` patch (`cordis.patch.yml`).
- Added project governance: `LICENSE` (MIT, © 2026 super_camel),
  `CONTRIBUTING.md`, CI (lightweight type-check), Keep-a-Changelog file.

[Unreleased]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kuramiwan/dshp-skill-panel/releases/tag/v0.1.0
