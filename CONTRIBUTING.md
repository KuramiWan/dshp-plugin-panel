# Contributing to dshp-skill-panel

Thanks for considering contributing! This is a small, focused plugin for
DeepSeek Harness (DSH) session-scoped skill control. Keep changes small,
reviewable, and aligned with the project's stated design (ADR-0007 "three
entrances" sharing one core; ADR-0008 plugin management). Design decisions are
recorded in the DSH monorepo's `docs/adr/`.

## Ground rules

- **One surface, one source of truth.** `browse` / `introduce` / `remove`
  business logic lives in `src/actions.ts` + `src/pool.ts` — the model tools
  (`src/tools.ts`), slash commands (`src/commands.ts`) and the panel
  (`src/skill-panel-service.ts` + `src/client/`) all forward to it. Do not
  duplicate business logic in a surface.
- **No typert / Remote.** The panel talks to the host over a DSH `webServer`
  HTTP route (`POST /skill-panel/<method>`), client uses relative-path
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

- `index.ts` — plugin entry: `SkillControlPlugin` (default export),
  `inject: ['agents','tools','skills','commands']`, `Config.poolRoot?`;
  registers tools + commands (`ctx.effect`), the `SkillPanelService` sub-service
  (`ctx.plugin`), and subscribes to `agent/session-start` (source=resume) to
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
- `skill-panel-service.ts` — `SkillPanelService` (`inject: ['agents','skills']`):
  registers the HTTP route via `ctx.get('webServer').register({kind:'prefix',
  path:'/skill-panel'})` (`ctx.effect` cleanup), `dispatch` routes
  `browse/list/detail/introduce/removeSkill` to pool/store; no typert.
- `types.ts` — panel boundary payload types (pure serializable, host/client
  shared).
- `client/` — browser half: `index.ts` (`createSkillPanelClient()` + registers
  the `settings.section` slot), `api.ts` (HTTP client: relative-path
  `fetch('/skill-panel/<method>')`, returns raw business JSON), `view.tsx`
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
- The prebuilt `lib/` is committed (same as dsh-web-billing), so consumers
  install and use it without building.
- `cordis.patch.yml` declares the `dsh.bundle` patch injected on install.

## Testing / validation

- Run `pnpm typecheck` before opening a PR — CI runs exactly this.
- Manual smoke checks: commands main path, idempotency edges, slash-skill
  invocation, model tools, session isolation, and the panel.
- For browser UI changes, verify in the DSH web GUI Settings → 「技能面板」.

## Commit style

Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`).
CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/); update it
in the same PR as the change.

## Licensing

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE) (© 2026 super_camel).
