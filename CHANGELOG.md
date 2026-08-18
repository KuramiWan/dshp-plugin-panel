# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Added project governance: `LICENSE` (MIT, © 2026 kuramiwan),
  `CONTRIBUTING.md`, CI (lightweight type-check), Keep-a-Changelog file.

[Unreleased]: https://github.com/kuramiwan/dshp-skill-panel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kuramiwan/dshp-skill-panel/releases/tag/v0.1.0
