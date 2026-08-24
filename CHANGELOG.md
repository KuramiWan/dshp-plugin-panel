# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kuramiwan/dshp-skill-panel/releases/tag/v0.1.0
