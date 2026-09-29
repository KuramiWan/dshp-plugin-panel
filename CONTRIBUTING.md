# Contributing to dshp-plugin-panel

Thanks for considering contributing! This is a small, focused plugin for
DeepSeek Harness (DSH) session-scoped skill control. Keep changes small,
reviewable, and aligned with the project's stated design (ADR-0007 "three
entrances" sharing one core; ADR-0008 plugin management). Design decisions are
recorded in the DSH monorepo's `docs/adr/`.

## Ground rules

- **One surface, one source of truth.** `browse` / `introduce` / `remove`
  business logic lives in `src/actions.ts` + `src/pool.ts` — the model tools
  (`src/tools.ts`), slash commands (`src/commands.ts`) and the panel
  (`src/plugin-panel-service.ts` + `src/client/`) all forward to it. Do not
  duplicate business logic in a surface.
- **No typert / Remote.** The panel talks to the host over a DSH `webServer`
  HTTP route (`POST /plugin-panel/<method>`), client uses relative-path
  `fetch`. Keep it that way — it is what keeps this package buildable outside
  the DSH monorepo.
- **Session scoping.** Introductions are per-session and idempotent; shadow
  overrides are per-session only. Preserve these semantics.
- **i18n.** Any new user-facing string must be added to both `zh` and `en` in
  `src/client/locale.ts`.
- **Lifecycle.** Any side effect registered via `ctx` (services, tools,
  commands, slots, the HTTP route, timers) must be wrapped in `ctx.effect()` /
  `ctx.on()` so stop/update cleanup works.

## Project structure

- `index.ts` — plugin entry: `PluginPanelPlugin` (default export),
  `inject: ['agents','tools','skills','commands']`, `Config.poolRoot?`;
  registers tools + commands (`ctx.effect`), the `PluginPanelService` sub-service
  (`ctx.plugin`), and subscribes to `agent/created` (source=resume) to
  replay the session introduced set.
- `pool.ts` — pool read layer: `local/` directory scan / `SKILL.md` frontmatter
  parsing (BOM stripping); `defaultPoolRoot` follows DSH home precedence
  (explicit `poolRoot` > `$DSH_HOME` > `~/.dsh`).
- `handles.ts` — `SessionSkillStore`: per-agent+name introduction handles
  (WeakMap, no leaks, no cross-session) + the on-disk introduced set
  (`.session-skills/<sessionId>.json`).
- `actions.ts` — core actions shared by all three surfaces: browse / filter /
  introduce / remove / replaySession.
- `tools.ts` — the 5 model tools (`ctx.tools.register` + `ctx.effect`).
- `commands.ts` — the 5 slash commands (`ctx.commands.register` + `ctx.effect`).
- `plugin-panel-service.ts` — `PluginPanelService` (`inject: ['agents','skills']`):
  registers the HTTP route via `ctx.get('webServer').register({kind:'prefix',
  path:'/plugin-panel'})` (`ctx.effect` cleanup), `dispatch` routes
  `browse/list/detail/introduce/removeSkill` to pool/store; no typert.
- `types.ts` — panel boundary payload types (pure serializable, host/client
  shared).
- `client/` — browser half: `index.ts` (`createPluginPanelClient()` + registers
  the `settings.section` slot), `api.ts` (HTTP client: relative-path
  `fetch('/plugin-panel/<method>')`, returns raw business JSON), `view.tsx`
  (two-pane view: pool + introduced, search / detail expand / shadow badge),
  `sections.tsx`, `locale.ts` (zh/en), `styles.ts` (`--dsw-alias-*` theme
  tokens).

## Development

Prerequisites: Node.js ≥ 20 and `pnpm`.

```bash
pnpm install
pnpm typecheck          # lightweight type-check (host + client) — the CI gate
pnpm build              # emits lib/index.js + lib/client.js
```

Type-check configs are self-contained and resolve `@deepseek-ai/*` from this
package's own `node_modules` (`tsconfig.host.json` / `tsconfig.client.json`),
so the package builds independently of the DSH source tree.

- `build-client.mjs` is the standalone bundle script (`node build-client.mjs`
  → client; `--host` → host).
- `lib/` is **not** committed (build artifacts stay out of git). Fresh clones
  must run `pnpm install && pnpm build` before running or testing — see the
  `## Development` block above.
- `cordis.patch.yml` declares the `dsh.bundle` patch injected on install.

## Testing / validation

- Run `pnpm typecheck` **and** `pnpm test` before opening a PR — CI runs both
  (host + client type-check, plus the test suite).
- CI (`ci.yml`) runs `check:name`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  and a `pack-check` job that verifies the packed archive contents.
- Release (`release.yml`) has a `verify` preflight (type-check + test + build +
  pack dry-run) that must pass before `publish` runs.
- Tests cover: pool/frontmatter parsing, the session introduce-set
  (`SessionSkillStore`), the shared core actions, the resume-replay contract
  (`test/session-replay.test.ts`: event name + `source==='resume'` only + the
  returned-promise shape), plugin-manager write-protection/hot-mount, and the
  HTTP route protocol (`405/404/400`, dispatch, method routing). Keep pure-logic
  tests in `test/*.test.ts` (Node built-in `node:test`, no extra deps); each test
  file uses its own subdir under `test/.tmp/` so parallel runs don't clobber each other.
- Manual smoke checks: commands main path, idempotency edges, slash-skill
  invocation, model tools, session isolation, and the panel.
- For browser UI changes, verify in the DSH web GUI Settings → 「插件面板」.

## DSH version baseline

The plugin supports **two DSH lines at once**: `latest` (`0.1.7-rc.2`) and `next`
(`0.2.0-rc.1`). `peerDependencies` therefore declares a **union** range per
consumer package:

```
"@deepseek-ai/dsh-agent": "^0.1.7-rc.2 || ^0.2.0-rc.1"
```

Why a union and not one wide range: semver only lets a **prerelease** version
satisfy a comparator set when some comparator has the *same* `major.minor.patch`
tuple. So `>=0.1.7-rc.2 <0.3.0-0` does **not** match `0.2.0-rc.1` — each
prerelease line must be named explicitly.

Two mechanisms keep this honest, because "declared" is not "tested":

- **Install-time gate (DSH 0.2+)** — DSH refuses to install a plugin whose
  `peerDependencies` exclude the running DSH (`dsh: installation rejected: ...
  incompatible with dsh 0.2.0-rc.1`). A too-narrow range means users literally
  cannot install; the escape hatch `dsh plugin allow-version … --accept-risk` is
  for local experiments only, never for a release.
- **`dsh-matrix` CI job + `scripts/set-dsh-baseline.mjs`** — `devDependencies`
  can only hold one version and `pnpm typecheck` only sees the installed `.d.ts`,
  so CI re-pins and re-runs type-check + tests on **each** line. The script also
  *asserts* the target version satisfies every declared `dsh-*` peer range and
  fails loudly otherwise (`0.1.8-rc.1` is a good negative test).

To add support for a new DSH line:

1. `npm view @deepseek-ai/dsh dist-tags` to get the version.
2. Extend each `@deepseek-ai/dsh-*` **peer** range with `|| ^<new>`, and add the
   version to the `matrix.dsh` list in `.github/workflows/ci.yml`.
3. `node scripts/set-dsh-baseline.mjs <new>` (asserts the peer range admits it),
   then `pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm test`.
4. Boot it for real before claiming support — type-check and tests do not prove
   host behaviour (event emission, `webServer` routing, fiber introspection).
   Point `DSH_HOME` at a scratch dir, install the target `@deepseek-ai/dsh`
   locally, and mount this package via `link:`.

`cordis` and `schemastery` are pinned to whatever the DSH lines ship
(currently `^4.0.4` / `^3.18.4`) and are **not** part of the matrix.

Note: `pnpm typecheck` only catches drift for the version you already installed —
never claim in release notes that it "covers" a DSH upgrade by itself.

## Commit style

Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`).
CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/); update it
in the same PR as the change.

## Licensing

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE) (© 2026 super_camel).
