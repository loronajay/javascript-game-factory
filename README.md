# Javascript Game Factory

This repository is a browser arcade. The non-game platform (everything in `js/` and `platform-api/src/`) is written in **TypeScript** (`.mts`); game cabinets under `games/` are still vanilla JavaScript. It contains two kinds of code:

- game cabinets under `games/`
- shared platform pages, modules, and API code for identity, profiles, messages, notifications, events, and thoughts

The served site loads compiled `.mjs` directly — `tsc` emits each `.mts` to a same-named `.mjs` that is committed in-place, so a fresh checkout runs without a build step. When editing platform/backend code, edit the `.mts` source and regenerate: `npm run build:browser` (frontend emit + `scripts/sync-emitted-mjs.mjs`) or `platform-api`'s `npm run build`; `npm run typecheck` type-checks both without emitting. Most surfaces are plain `index.html` entry points that load shared modules from `js/` and styles from `css/`.

## Top-level map

- `games/`: self-contained game cabinets and game design work
- `js/`: shared frontend modules, page wiring, platform contracts, and frontend tests
- `css/`: shared styles for platform pages and shared shell UI
- `images/`: shared non-game assets used across the platform shell
- `platform-api/`: persistent backend API for accounts, profiles, thoughts, relationships, messages, notifications, metrics, uploads, per-game ratings/ranked/ladders, game progress sync, and payments
- `mobile/`: packaged native app wrappers. Currently only `mobile/tactical-arena/` — a Capacitor Android build of the Tactical Arena cabinet with Google Play Billing
- `planning-docs/`: cross-cutting plans, architecture notes, and migration handoffs
- `scripts/`: repo-level build tooling (`sync-emitted-mjs.mjs`, which keeps the committed `.mjs` output in step with the `.mts` sources)
- route folders such as `activity/`, `gallery/`, `me/`, `messages/`, `notifications/`, `player/`, `search/`, and `thoughts/`: page entry points that usually contain an `index.html`
- `grid-previews/`: preview art used by the game catalog/grid experience. A preview here does not put a cabinet on the grid — that needs a `games/<slug>/game.json` **and** a slug in `js/arcade-catalog.mts`
- `dist/`: TypeScript build scratch output; gitignored and never served

## Working model

- Shared platform identity is owned by the factory shell and `platform-api/`.
- Games can derive match-local or session-local names, but they should not become the home for durable profile ownership.
- Game logic and tests stay with each game when practical.
- Shared social and profile behavior should usually land in `js/platform/`, route-level page modules, or `platform-api/src/`.
- The non-game TypeScript migration (platform frontend + backend, Phases 0–9) is **complete as of 2026-05-30** — all of `js/**` and `platform-api/src/**` are `.mts` under `strict: true`. Game cabinets are migrated last, per-cabinet, after each one's own seam cleanup. The current shared frontend/backend seams and migration history live in `planning-docs/ARCHITECTURE_HANDOFF.md` and `planning-docs/TYPESCRIPT_MIGRATION_PLAN.md`.
- Some online-authoritative cabinets also depend on matching handlers in the separate `factory-network-server` repo. Circuit Siege is one of those games, so client-side board or rules changes may require a coordinated server deploy before website testing is valid.

## Testing

- Game tests usually live inside the relevant game folder and are run with that cabinet's own `npm test`, or with plain Node commands from that folder.
- Shared frontend tests live in `js/tests/` — `node --test js/tests/*.test.mjs` from the repo root.
- API tests live in `platform-api/tests/` — `npm --prefix platform-api test`.

```bash
npm run typecheck                    # typecheck browser + API, no emit
npm run build:browser                # regenerate js/**/*.mjs from the .mts sources
npm --prefix platform-api run build  # regenerate platform-api/src/**/*.mjs
npm run verify:build                 # emit and fail if the committed .mjs is stale
```

Use the nearest README in a major folder before extending that area. Most of the important ownership boundaries in this repo now have local documentation.

## Hosting

The site is served from `https://factory.jayarcade.com` (GitHub Pages, from the repo root). The apex `jayarcade.com` belongs to a different repo and must not be reassigned — a domain can only attach to one Pages site. `APP_BASE_URL` on Railway and the CORS allow-list in `platform-api/src/http-utils.mts` are origin-sensitive and have to move together with any domain change.
