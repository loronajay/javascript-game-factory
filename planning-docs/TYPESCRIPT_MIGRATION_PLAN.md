# TypeScript Migration Plan

Status: **THE ENTIRE NON-GAME MIGRATION (Phases 0–9) IS COMPLETE; only the game cabinets remain (2026-05-30).** Phase 8 done: the 3 classic global scripts (`pixel-text.js`, `arcade-input.js`, `platform-config.js`) are now typed ES modules (`.mts` → emitted `.mjs`). Under `isolatedModules: true` a no-import/export file errors **TS1208** ("considered a global script file"), so a "type-in-place but stay classic" approach was impossible — each file gets a trailing `export {};` to make it a module. Because they're modules, every `<script src="…js/X.js">` had to become `<script type="module" src="…js/X.mjs">` — **56 tags across 27 HTML files** updated (a `node` regex pass over `*.html`). The files keep their **global-attach side effects** (`window.PixelText` / `window.ArcadeInput` / `globalThis.__JGF_PLATFORM_API_URL__`) rather than exporting values, because every consumer reads the global, not an import (5 consumers: `arcade-home`, `arcade-grid`, `arcade-me-view`, `player-page/render`, `platform-api`) — so **`js/globals.d.ts` is KEPT as the permanent ambient contract**, not deleted (its header was re-worded from "Phase 0 stub / will be deleted" to permanent). **Load-order is safe:** classic→module makes the 3 scripts deferred, but they still execute in document order before each page's entry module, and `platform-api.resolvePlatformApiBaseUrl` reads the URL global lazily at request time (with a hardcoded prod default + localhost fallback), and no game file reads any of these globals directly — games only consume them through the shared `platform-api` module. **Zero `.js` source files now remain in `js/`** (only `.mts` sources, emitted `.mjs`, `.d.ts`, and gitignored `.test.mjs`). Three tests needed source-path realignment (they read/exec the old `.js` by name): `deployment-config.test` → reads `platform-config.mts`; `arcade-input.test` → reads `arcade-input.mjs` and strips the trailing `export {};` before running the IIFE in its `vm` sandbox; the 6 `*page.test` files assert the HTML include → expectation updated to `platform-config.mjs`. **typecheck:browser = 0, typecheck:api = 0, 91/91 browser tests, 116/116 backend tests.** ▶ NEXT: game cabinets only, per-cabinet after each one's own seam cleanup (Phases 10+). The pre-2026-05-30 status line follows for history: ~~Phases 0–7 + 9 COMPLETE; only Phase 8 (3 classic global scripts) + games remain (2026-05-29).~~ Backend `platform-api/src/**` is fully migrated (38 source files → `.mts`): config, all 9 normalize modules, all 16 `db/*` files, `email`/`auth-helpers`/`http-utils`, both `services/*`, all 8 `routes/*`, `app.mts` (778), `server.mts`, `migrate.mts`. Installed `@types/pg`/`@types/jsonwebtoken`/`@types/busboy` (bcryptjs + cloudinary bundle their own). **Deploy mechanics unchanged:** added `platform-api/scripts/sync-emitted-mjs.mjs` (mirror of the browser one) + flipped `build` to `tsc && sync`; tsc emits to `dist/` then the in-place `.mjs` are synced back next to each `.mts`, so Railway's `npm start` → `node ./src/server.mjs` keeps working with **no railway.json change** (the Railway `dist/` flip stays deferred — committed in-place `.mjs` is the run output, same tradeoff as the browser). Backend typing is uniformly loose at the seams: `db`/`pool`/`client`/`req`/`res`/`context`/`options` are `any`, row mappers take `row: any`, query helpers return `Promise<any>`; the structured wins are typed return interfaces (`ApiConfig`, `SendEmail*`) and `Record<string, number|string>` reduce accumulators. `catch (e)` is `unknown` under strict → use `(e as any)?.message`. **TS caught a latent bug:** `db/thoughts.mjs` referenced `ensureJsonObject` that was never imported/defined (a dormant `ReferenceError` masked only because the map always had the key) — added the missing local helper. `npm run typecheck:api` = 0, **116/116 backend tests green.** ▶ NEXT: Phase 8. — the entire `js/platform/**` layer (31 `.mts`) is migrated and **`strict: true` is on**. **Phase 7 done: ALL root `js/*` source files are now `.mts`** (31 files: 10 shims + utilities + every page entry incl. `arcade-grid` 418, `arcade-notifications` 347, `arcade-event-detail` 332, `mobile-controller` 678). The only remaining `.js` in `js/` are the 3 classic global scripts (`pixel-text.js`, `arcade-input.js`, `platform-config.js` — Phase 8) and the `.test.mjs` files. Typecheck (browser+api) clean, 91/91 tests green. Phase 6 (Page Subsystems) is fully done: **`thoughts-page` (4) + `profile-social` (5) + `gallery-page` (8) + `player-page` (9) + `profile-editor` (10) + `me-page` (12) + `profile-layout` (11) done** — all 7 subsystems migrated. `me-page`: `view-model.mts` exports `MePageViewModel`; the two big-but-cohesive files `apply-layout.mts` (694 LOC composition/overlay rendering) and `apply-scale.mts` (zoom/fit geometry) were typed in place — layout/element/style data is `any` (owned by `profile-layout`, migrates last), DOM cast to `HTMLElement`. `music-player.mts` is a re-export shim over `profile-editor/music-player`. One cast needed: `(PROFILE_PANEL_REGISTRY as Record<string, any>)[panel.id]` (the registry is a concrete object inferred from unmigrated JS; a string index trips `noImplicitAny`). `profile-editor`: `view-model.mts` exports `ArcadeProfileViewModel`; `music-player.mts`/`music-player-controller.mts` export `ProfileMusicPlayer`/`PlayerController`; `panel.mts` uses a `byId<T extends HTMLElement>()` helper for its ~30 element lookups. Also loosened `savePlayerProfile`/`savePlayerMetrics`/`savePlayerRelationships` patch params in `platform-api.mts` to `unknown` (callers pass interface-typed records — `FactoryProfile`/`ProfileRelationshipsRecord` — which lack index signatures; still structurally assignable to the `MetricsApiClient` stub by param contravariance). **Cache-bust `?v=` query strings were stripped from ALL `.mjs`/`.mts` imports** (user-approved) — TS can't resolve `./foo.mjs?v=123`; cache-busting moves to the deploy layer. `player-page`: `view-model.mts` exports `PlayerPageViewModel` (helper-derived arrays typed `any` since `arcade-profile-page-helpers.mjs` is Phase 7); `actions-view-model.mts` exports `FriendAction`/`GestureAction`/`MessageAction`; added `__JGF_LAST_FRIEND_REQUEST_ERROR__` to `globals.d.ts`. TS caught a **latent bug**: `wire.mjs` used `buildPlayerThoughtFeed` in `afterDelete` without importing it (now imported). **Lesson:** do NOT drop "unused" helper functions during migration — `noUnusedLocals` is off so they compile fine, and source-asserting tests (e.g. `arcade-playerpage.test`) expect them (`renderCardItem`/`renderPanel` had to be restored). `gallery-page` viewer types live in leaf `viewer-state.mts` (`GalleryPhoto`/`PhotoSocialState`/`ViewerComment`/`SetPhotosOptions`); `viewer.mts` exports the `PhotoViewer` api interface; `viewer-page-actions.mts` exports `PageGalleryViewerActions = ReturnType<...>`. Typing the viewer removed the `as any` cast in `thoughts-page/page.mts`; dropped unreachable dead code in `viewer.mts`. Two new gotchas: **(TS2774)** a positive `if (doc?.getElementById)` can trip "always returns true / did you mean to call it" — use `if (typeof doc?.getElementById === "function")` (negated `if (!doc?.getElementById) return` is fine); and **redundant `!apiClient?.method` existence checks** trip TS2774 once `apiClient` is typed — drop them. Typecheck clean (browser + api), all 91 browser test files green. **`strict` is global** — all future `.mts` are strict from creation; no second strictness pass. Game cabinets remain a later, per-cabinet pass.

### ▶ RESUME HERE — game cabinets only (Phases 10+); the entire non-game migration (Phases 0–9) is DONE

> Phases 0–9 are complete (see the top status block). What remains is per-cabinet game migration, each gated on that cabinet's own seam cleanup. The Phase 7/8/9 notes below are retained as historical implementation record.

**Phase 7 is COMPLETE (2026-05-29).** Every root `js/*` source file is `.mts`. Pattern that held across all page entries:
- **DOM page-entry idiom:** `escapeHtml(v: unknown)`, view-model builders + render fns take `(container: HTMLElement | null, model: any)`, `if (!container) return;` guards; module-boot blocks gate on `if (typeof doc?.getElementById === "function")` (positive `if (doc?.getElementById)` trips **TS2774** — but the *negated* `if (!doc?.getElementById) return null;` inside render fns is fine and was kept verbatim).
- **getElementById casts by usage:** `as HTMLButtonElement | null` (`.disabled`), `as HTMLInputElement | null` (`.value`), `as HTMLSelectElement | null` (`.value` on selects), `as HTMLElement` (non-null) where a const is used unguarded across helpers (e.g. `arcade-grid`'s `track`/`pageIndicator`, `arcade-notifications`' freshly-built `badge`/`list`). **Form named-field access** (`form.email`) isn't on `HTMLFormElement` — use `(form as any).email?.value`.
- **Event targets:** `e.target`/`e.currentTarget` → cast (`as HTMLButtonElement`, `as Node | null` for `.contains`). Object-literal lookup maps (`ERROR_MESSAGES`, `GESTURE_*`, `THOUGHT_REACTION_GLYPHS`) → type/cast as `Record<string, string>` so string-indexing passes `noImplicitAny`.
- **Callbacks into still-JS modules** (`renderNotificationItem` from `arcade-notifications` while it was still `.mjs`) need **explicit `(x: any)` params** — an arrow assigned to an `any`-typed param gets no contextual type → implicit-any error. (Now both are `.mts`.)
- **`arcade-grid` / `mobile-controller` specifics:** canvas `getContext("2d")!` non-null; dynamic `document.createElement(tag)` is `HTMLElement` so anchor `.href` needs `(card as HTMLAnchorElement).href`; `window.webkitAudioContext` → `(window as any).webkitAudioContext`; SVG `setAttribute('x1', n)` wants a string OR keep the element `any` (mobile-controller types `doc`/elements as `any` throughout to avoid `setAttribute(number)` churn).
- **Latent bug TS caught:** `ARCADE_GAME_SLUGS` is `ReadonlyArray<string | {slug,path}>`; the `/me/edit` favorite-game picker passed the object entry (`creature-battler`) straight into `normalizeGameEntry(slug: string)` → `"[object Object]"` option. Fixed the consumer.
- **`arcade-me-view` gotcha:** `renderPageHeader` is called in tests with a partial mock `doc` lacking `querySelector` — keep the load-bearing `doc.querySelector?.(".me-stage")` optional call and cast the result `as HTMLElement | null` (no `<T>` type-arg on optional calls). `PixelText.render(el)` wants non-null `HTMLElement` → `if (title) ...render(title)`.

**Phase 8 (next, small):** convert the 3 classic globals to ES modules and delete `js/globals.d.ts` in favor of real exports (or keep the ambient stub and just type the files). Lowest urgency — the ambient `.d.ts` already keeps everything compiling. **Phase 9 (backend `platform-api/src/**`)** is the larger next body of work: typed `pg.QueryResult<RowT>` generics, `config.mts` env narrowing, route families, and finally flipping Railway's start command to compiled `dist/server.mjs` (do on a branch; keep `main` deployable).

**Baseline at Phase 7 completion:** all root `js/*` are `.mts`; `npm run typecheck:browser` = 0, `npm run typecheck:api` = 0, 91/91 browser tests green.

**`profile-layout` migration notes (all 11 files, done in foundation→DOM order, typed-in-place):**
- Shared layout-data interfaces (`PanelStyle`, `PanelChild`, `LayoutPanel`, `LayoutElement`, `ProfileLayout`) are defined and exported from `normalize-layout.mts`. They describe the *normalized output* shapes; transform internals stay loose (`any` at untrusted-input boundaries), exactly as the plan called for.
- `registry.mts` exports `PROFILE_PANEL_REGISTRY: Record<string, PanelDef>` + `PanelDef` (string-indexable for consumers). `child-layout.mts` exports `PanelChildGroup`/`PanelChildDef`/`PanelChildGrid`/`DefaultPanelChild` and `PROFILE_PANEL_CHILD_REGISTRY: Record<string, PanelChildGroup>`. `composition-layout.mts`'s `PROFILE_COMPOSITION_ELEMENT_REGISTRY` is typed `Record<string, any>` (heterogeneous defs; keeps `apply-layout`/renderer `.galleryContent`-style access free).
- `layout-zoom.mts` exports `ComputeFitZoomOptions`/`BuildZoomFrameOptions`/`ZoomFrame`; option fields are optional `number` with `= 0`/`= 1` destructure defaults so strict arithmetic is happy without changing the no-arg/NaN→zoom-1 behavior. `layout-storage.mts` uses `PlatformApiClient` for the injected client.
- `layout-editor.mts` exports `GridMetrics` + `LayoutEditorCallbacks`; drag/resize/ghost state are `any` bags, `ghost: HTMLElement | null`, `event.target as Element | null` + `closest<HTMLElement>`. `findSwapTarget`/`swapPanels` are still present-but-unused — KEPT (noUnusedLocals off; don't drop).
- `layout-renderer.mts` (768) and `layout-wire.mts` (872): **typed in place, NOT split.** Heavy DOM: `querySelector<HTMLElement>(...)` wherever `.style` is read; data/models `any`. In `layout-wire`, the heavily-and-unguarded-used `canvas`/`canvasWrap`/`inspector` are cast `as HTMLElement` (non-null) at `getElementById` — the runtime `if (canvas)`/`?.` guards still work (cast is compile-time only); `saveBtn` cast `as HTMLButtonElement` for `.disabled`. `buildPreviewModels(playerId, storage, apiClient: any)` keeps `apiClient` loose so `apiClient?.loadPlayerProfile` doesn't trip TS2774.
- Two micro-fixes worth remembering: a `string | number` value computed by a `type === "range" ? parseFloat : value` ternary trips strict arithmetic later — wrap with `Number(value)` at the use site; and a computed key `{ [key]: value }` where `key = el.dataset.x` (`string | undefined`) needs `dataset.x || ""`.
- The two tracked splits (`layout-wire`, `layout-renderer`) remain a SEPARATE post-typing follow-up — typing-first was the point; revisit the real seam later.

**Phase 7 scope (root `js/*`):** auth flow pages, feed/home/grid pages, profile pages, messaging, and the shared utilities. Typing the utilities (`arcade-paths.mjs`, `arcade-catalog.mjs`, `arcade-session-nav.mjs`, `arcade-profile-page-helpers.mjs`, `arcade-profile.mjs`, `arcade-me-view.mjs`) is what lets the remaining `any` casts in the now-migrated page subsystems tighten. `js/mobile-controller.mjs` is a tracked split for this phase (mixes control specs / keyboard dispatch / geometry / SVG / CSS injection / DOM factory).

**Gotchas already learned (apply all):** `?.<T>()` (optional-call + type arg) does NOT parse — cast the result instead; positive `if (doc?.getElementById)` trips **TS2774** (use `if (typeof doc?.getElementById === "function")`); `event.target` → `const t = event.target as Element | null; t?.closest<HTMLElement>(...)`; `getElementById` → `as HTMLInputElement|HTMLSelectElement|...|null` (or `as HTMLElement` non-null when the code treats it as always-present and uses it unguarded across helper functions); interfaces (no index sig) aren't assignable to `Record<string, unknown>` params — loosen the param to `unknown`; don't delete "unused" helpers (tests assert source).

### Phase 6 DOM-typing pattern (validated on `thoughts-page`, reuse for every subsystem)
- **`event.target.closest` / `dataset` / `value`:** add small helpers — `closestEl(event, sel): HTMLElement | null` (`(event.target as Element | null)?.closest<HTMLElement>(sel) ?? null`) and `closestField(event, sel): HTMLTextAreaElement | null` for inputs whose `.value` is read. Avoids repeating casts.
- **Event handlers:** type params `event: Event`; for submit `form: EventTarget | null` then `const formEl = form as Element` before `.matches()`.
- **View-model / panel-state interfaces** live in the subsystem (e.g. `actions.mts` owns `SharePanelState`/`CommentPanelState`/`ViewState`); `render.mts` imports them as types and takes `Partial<...>` for optional render-time state. One-directional: `render → view-model` + `render → actions` (types only); no cycles.
- **`doc.getElementById(...)`** is `HTMLElement | null` — guard before `.innerHTML`. Render fns take `container: HTMLElement | null` and early-return on null.
- **Cross-boundary to not-yet-migrated `.mjs`:** `allowJs` infers JS signatures, and `= null`/`= {}` defaults often infer too-narrow params (e.g. `apiClient: null`). Cast the call arg `as any` with a one-line comment naming the unmigrated module; remove when that module migrates. (`arcade-session-nav.mjs`, `gallery-page/viewer.mjs` are the common ones.)
- **strict function-param contravariance:** an option like `rerender?: (feed?: unknown[]) => unknown` must match what the caller actually passes — widen/narrow the declared param to the real value type, don't default to `unknown`.

**Build-output workflow (decided 2026-05-29 — read before migrating any file):** the site is served as raw static files with no bundler. We **commit the tsc-emitted `.mjs` in-place** next to each `.mts` source so the site keeps loading unchanged. Mechanics:
- `tsconfig.browser.json` emits to a staging `dist/js` (NOT in-place) so `allowJs` can never overwrite the not-yet-migrated `.mjs` SOURCE files.
- `scripts/sync-emitted-mjs.mjs` then copies only the `.mjs` that correspond to a real `.mts` source back into `js/`. Hand-written `.mjs` sources are never touched.
- `npm run build:browser` = tsc emit + sync. `npm run typecheck:browser` = `tsc --noEmit`.
- For a migrated file, the in-place `.mjs` is **generated build output**, not source — edit the `.mts`. (At the end of the migration we can flip to gitignoring the `.mjs` once a build step is added to dev/deploy.)

**Planned splits to handle inline as their phase arrives** (decided 2026-05-29; split by responsibility, not line count): `js/mobile-controller.mjs` (Phase 6/7 — mixes control specs, keyboard dispatch, geometry math, SVG paths, CSS injection, DOM factory; **not in the original audit**), `platform-api/src/db/profiles.mjs` (Phase 9 — `profiles-domain` split), `js/profile-layout/layout-wire.mjs` and `layout-renderer.mjs` (Phase 6 — drag-preview/controller and renderer view-model seams). All other large files are large-but-cohesive and get typed in place.

**Scope (non-game)**: ~160 source `.mjs` files + 3 classic global `.js` files across the browser platform (`js/`) and Node.js backend (`platform-api/src/`).
**Scope (games)**: 7 cabinets now exist — `lovers-lost`, `battleshits`, `echo-duel`, `circuit-siege`, `illuminauts`, `sumorai`, `creature-battle` — not the 2 this plan originally assumed. Games are migrated last and only after each cabinet's own seam cleanup; treat each as its own scoped sub-pass rather than expanding this plan to cover all 7 up front.
**Strategy**: Incremental, platform-first, file-by-file using `allowJs` as a bridge.
**Order**: Infrastructure → Platform layer → Page subsystems → Backend → Games

## Audit Snapshot (2026-05-29)

Verified before re-confirming this plan:
- The non-game test baseline is **green (96/96 `.test.mjs` files)**. The per-phase Definition of Done relies on green tests — this is now true. (25 files had rotted against shipped features/extractions and were realigned to current behavior.)
- `platform-api/src/app.mjs` is **778 LOC** (a dispatch shell plus some player/gesture/avatar logic), not the ~1500 this plan once estimated.
- All eight backend route families are extracted into `platform-api/src/routes/` (auth, message, notification, thought, photo, player, **layout**, **rating**).
- The page subsystems that actually exist are: `me-page` (12), `player-page` (9), `thoughts-page` (4), `gallery-page` (8), `profile-editor` (10), `profile-social` (5), `profile-layout` (11), plus `platform` (31). Earlier drafts of Phase 6 omitted `me-page`, `gallery-page`, and `profile-layout` — they are folded in below.

---

## Pre-Migration Gate

This plan is not the active workstream yet. Before Phase 0 starts, finish the architecture cleanup listed in `planning-docs/ARCHITECTURE_HANDOFF.md`.

Required cleanup gates:

1. `platform-api/src/app.mjs` must be reduced into route-family modules.
   Current progress:
   - auth routes already extracted into `platform-api/src/routes/auth-routes.mjs`
   - message routes already extracted into `platform-api/src/routes/message-routes.mjs`
   - notification routes already extracted into `platform-api/src/routes/notification-routes.mjs`
   - thought routes already extracted into `platform-api/src/routes/thought-routes.mjs`
   - photo routes already extracted into `platform-api/src/routes/photo-routes.mjs`
   - player and relationship routes already extracted into `platform-api/src/routes/player-routes.mjs`

   Follow-on backend cleanup still required before typing (sizes from the 2026-05-29 audit):
   - `platform-api/src/db/relationships.mjs` (**625 LOC**) has had its pure state rules extracted into `platform-api/src/db/relationships-domain.mjs` (389); the remaining transaction/query flow is the right ownership boundary for now.
   - `platform-api/src/db/thoughts.mjs` (**506 LOC**) has had pure thought/viewer-state helpers extracted into `platform-api/src/db/thoughts-domain.mjs` (252); same — query flow stays.
   - `platform-api/src/db/profiles.mjs` (**449 LOC**) was not previously listed here. It is the third-largest backend file and mixes query + row-shaping; decide before typing whether it needs a `profiles-domain` split or is cohesive enough to type in place.
   - `platform-api/src/normalize.mjs` is now a thin barrel over domain modules (35 LOC), so it is no longer a pre-TypeScript hotspot.
   - Otherwise backend cleanup is about preserving the new seams and avoiding regressions, not breaking up one remaining giant file.

2. the largest shared frontend page modules must have clearer ownership boundaries — **COMPLETE**
   All major shared frontend page modules have been resolved. The `js/me-page/` subsystem is now fully extracted (as of 2026-05-09):
   - all `/me` logic moved from root `arcade-me-*` files into `js/me-page/` (`wire.mjs`, `page-data.mjs`, `media-actions.mjs`, `friend-navigator.mjs`, `render-sections.mjs`, `entry.mjs`, `view-model.mjs`, `render.mjs`, `friend-code-actions.mjs`); `arcade-me.mjs` is now a 4-line compatibility shim
   - gallery viewer navigation/current-photo/social-state bookkeeping extracted into `js/gallery-page/viewer-state.mjs`
   - gallery viewer reaction-chip/comment/date markup shaping extracted into `js/gallery-page/viewer-social.mjs`
   - gallery viewer session caching and photo social reload/mutation flows extracted into `js/gallery-page/viewer-page-actions.mjs`
   - gallery viewer gallery-thumbnail and thought-image click routing extracted into `js/gallery-page/viewer-page-controller.mjs`
   - shared profile-social thought-card/comment/share/reaction rendering extracted into `js/profile-social/social-view-thoughts.mjs`, with escaping/date helpers in `js/profile-social/social-view-shared.mjs`

3. active game hotspots need controller/renderer/network seams before typing them.
   Main examples:
   - `games/lovers-lost/scripts/init-game.js`
   - `games/echo-duel/scripts/online-session-controller.js`
   - `games/battleshits/game.js`

Why this gate exists:
- types help most once module boundaries are stable
- migrating large mixed-purpose files too early hardens accidental architecture
- route, page, and game seams will give us much smaller and more reliable type surfaces

When these gates are complete, revisit this document and re-sequence the migration based on the cleaned architecture rather than the current raw file count.

---

## Why This Order

The platform layer (`js/platform/`) is the most shared code in the project — schema constants, normalize functions, store helpers, and API clients are imported by every page subsystem, every page entry point, and eventually the games. Getting those typed first creates a cascade of free inference downstream. The backend and games are isolated enough to migrate independently after the platform is solid.

---

## Architecture Decisions

### Extension Strategy: `.mts` → `.mjs`

TypeScript 4.7+ supports `.mts` source files that compile to `.mjs`. This project already uses `.mjs` throughout, so:

- Rename source files: `.mjs` → `.mts`
- `tsc` outputs `.mjs` (same filenames the HTML already references)
- Import paths inside `.mts` files must use the final `.mjs` extension, not `.ts` — this is the TypeScript ESM requirement and matches current style already

**Example**:
```ts
// inside arcade-home.mts — import paths stay .mjs
import { getProfile } from './platform/profile/profile.mjs';
```

### Build Output

**Browser frontend**: Source `.mts` files compile to `.mjs` in-place (same directory). HTML is unchanged. Compiled `.mjs` files are build artifacts — gitignore them and regenerate on dev/deploy.

**Backend (`platform-api/`)**: Source `.mts` compiles to `dist/`. Update `package.json` start script to `node ./dist/server.mjs`. Add `"build": "tsc -p tsconfig.json"` and configure Railway to run `npm run build && npm start`.

**Games**: Each game compiles its `scripts/*.mts` to `scripts/*.mjs` in-place. Same as frontend.

### TypeScript Configurations

Three separate tsconfigs rooted from a shared base:

```
tsconfig.base.json           ← shared strictness + target settings
tsconfig.browser.json        ← extends base, includes js/**, DOM lib
platform-api/tsconfig.json   ← extends base, includes src/**, Node lib
games/lovers-lost/tsconfig.json
games/battleshits/tsconfig.json
```

### Strictness Progression

Start lenient to get the build working, tighten as each phase completes:

| Phase | Setting |
|-------|---------|
| Phase 0 | `strict: false`, `allowJs: true`, `checkJs: false` |
| Phase 1–4 | `strict: true` on platform/ only (override via tsconfig paths) |
| Phase 5–7 | `strict: true` expanded to page subsystems |
| Phase 8–9 | `strict: true` on backend |
| Phase 10–11 | `strict: true` on games |

### Classic Scripts (3 global files)

`pixel-text.js`, `arcade-input.js`, `platform-config.js` are loaded as classic `<script>` tags and expose globals. These cannot be `.mts` without a module wrapper. Two options:

1. **Write ambient `.d.ts` declarations** for the globals they expose, keep the files as `.js` — easiest, non-breaking
2. **Convert to ES modules** and update all HTML `<script>` tags — correct long-term

Do option 1 in Phase 0 to unblock type-checking, then option 2 as a later cleanup.

---

## Phase 0: Infrastructure Setup — DONE (2026-05-29)

**Goal**: `tsc --noEmit` runs without crashing on the platform layer. No source files changed yet.

**What actually shipped (and where it deviated from the draft below):**
- Created `tsconfig.base.json`, `tsconfig.browser.json`, `platform-api/tsconfig.json` as specced.
- Created a root `package.json` (none existed) with `typecheck`, `typecheck:browser`, `build:browser`, `typecheck:api`; `typescript@^5.7` as a root devDep. Installed `@types/node` in `platform-api/`.
- Added backend `build` + `typecheck` scripts. **Did NOT flip `start` to `./dist/server.mjs`** — nothing is compiled yet, so flipping it now would break the live Railway deploy. That flip is a Phase 9 action.
- `js/globals.d.ts` written from the real source, not the draft's guesses: `window.PixelText` (`render(el)`, `renderAll(root?)`), `window.ArcadeInput` (`onAction(listener)`). **`platform-config.js` does NOT expose a `PLATFORM_CONFIG` object** — it sets `globalThis.__JGF_PLATFORM_API_URL__` (a single URL string). The Phase 8 section below still describes the imagined `PLATFORM_CONFIG` shape; treat the real global as authoritative.
- Added `platform-api/src/env.d.ts` (typed `NodeJS.ProcessEnv` for the 10 real env vars in `config.mjs`) so the API tsconfig has an input and starts the Phase 9 env contract.
- `.gitignore`: added `/dist/`, `platform-api/dist/`, `tsconfig.tsbuildinfo`. Did NOT add the `.mjs`-source ignores yet — those go in file-by-file as each source is migrated.
- **Game tsconfigs deferred**: the draft lists `lovers-lost`/`battleshits` tsconfigs here, but games are migrated last and per-cabinet, so each cabinet's tsconfig is created when its phase starts (and there are 7 cabinets now, not 2).
- **Verification**: `npx tsc -p tsconfig.browser.json --noEmit` and `... platform-api/tsconfig.json --noEmit` both exit 0; `--listFilesOnly` confirms each config resolves real project inputs (`js/globals.d.ts`, `platform-api/src/env.d.ts`).

The original draft plan follows unchanged for reference.

### Files to create

**`tsconfig.base.json`** (root):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  }
}
```

**`tsconfig.browser.json`** (root):
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./dist/js",
    "noEmit": false
  },
  "include": ["js/**/*.mts", "js/**/*.ts"]
}
```

**`platform-api/tsconfig.json`**:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "outDir": "./dist",
    "noEmit": false
  },
  "include": ["src/**/*.mts", "src/**/*.ts"]
}
```

**`games/lovers-lost/tsconfig.json`** and **`games/battleshits/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./dist"
  },
  "include": ["scripts/**/*.ts", "game.ts"]
}
```

### Ambient declarations for classic scripts

Create `js/globals.d.ts`:
```ts
// Covers pixel-text.js, arcade-input.js, platform-config.js globals
declare const PIXEL_TEXT: { ... };
declare const ArcadeInput: { ... };
declare const PLATFORM_CONFIG: { apiBase: string; wsBase: string; };
```

Fill in the actual shapes by reading those three files. This is a one-time stub — Phase 8 converts them properly.

### NPM scripts (add to root or platform-api/package.json)

In `platform-api/package.json`:
```json
"scripts": {
  "build": "tsc -p tsconfig.json",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "start": "node ./dist/server.mjs"
}
```

In root (create `package.json` if not present, or use a Makefile / shell scripts):
```json
"scripts": {
  "typecheck:browser": "tsc -p tsconfig.browser.json --noEmit",
  "build:browser": "tsc -p tsconfig.browser.json",
  "typecheck:api": "cd platform-api && npm run typecheck"
}
```

### `.gitignore` additions

```
# TypeScript compiled output
js/**/*.mjs
!js/platform-config.js
!js/pixel-text.js
!js/arcade-input.js
platform-api/dist/
games/lovers-lost/scripts/**/*.mjs
games/battleshits/scripts/**/*.mjs
```

**Wait** — currently the `.mjs` files ARE the source. You need to decide before starting whether to:

- **Keep `.mjs` as committed source** until each file is migrated (recommended — migrate file by file, only gitignore after conversion)
- **Flip all at once** — rename everything on day one (risky, large diff)

Recommended: keep `.mjs` files committed as source until each one is individually migrated to `.mts`. After migration, gitignore that path.

### Estimated effort: 2–4 hours (config only, no logic changes)

---

## Phase 1: Platform Schemas — DONE (2026-05-29)

**What shipped:** all 9 files migrated to `.mts`: `activity-schema`, `thoughts-schema`, `relationships-schema`, `storage`, `identity/factory-profile`, `identity/match-identity`, `bulletins/bulletins`, `events/events`, `metrics/metrics`. Pattern used: `as const` value tuples + derived union types (`ActivityTypeValue`, `ThoughtVisibility`, `BulletinStatus`, `EventStatus`, `ProfileOpenSource`, etc.), exported domain interfaces (`Thought`, `ThoughtComment`, `Bulletin`, `GameEvent`, `FactoryProfile`, `MatchIdentity`, `ProfileMetricsRecord`, `StorageLike`). Runtime exports preserved exactly (Sets stay Sets, frozen objects stay frozen). Set membership uses `is`-typed guards rather than `Set.has` narrowing.

**Deviations / notes for later phases:**
- `metrics.mjs` (328 LOC) and the two identity files are domain modules, not pure constants, but were migrated here per the plan list. Their input-boundary params are typed `unknown` + narrowed; the API-client dependency uses a local minimal `MetricsApiClient` interface (Phase 4 owns the real client type).
- `FactoryProfile`'s profile-domain sub-shapes (`ladderPlacements`, `friendsPreview`, `mainSqueeze`, `links`, `profileMusicPlaylist`) are typed loosely (`unknown[]` / `unknown`) on purpose — `profile.mjs` owns them and tightens them in **Phase 2**. One cast (`backgroundStyle as ...`) exists for the same reason and should be removed when `profile.mts` lands.
- No central `js/platform/types.d.ts` was created; domain interfaces are co-located in their schema files and re-exported. Revisit in Phase 5 (barrels) if a shared types module becomes clearly better.

---

**Files**: 9 schema files — pure string/number constants and enum-like objects  
**Why first**: All downstream modules import from these; typed constants give free inference throughout.

Files to migrate (rename `.mjs` → `.mts`, add explicit types):

| Source file | What to type |
|-------------|-------------|
| `js/platform/activity/activity-schema.mjs` | Export `ActivityType` as `const enum` or `as const` union |
| `js/platform/thoughts/thoughts-schema.mjs` | `ThoughtVisibility`, reaction keys |
| `js/platform/relationships/relationships-schema.mjs` | `RelationshipStatus`, slot names |
| `js/platform/identity/factory-profile.mjs` | `FactoryProfile` interface |
| `js/platform/identity/match-identity.mjs` | `MatchIdentity` interface |
| `js/platform/storage/storage.mjs` | Generic `StorageKey<T>` type |
| `js/platform/bulletins/bulletins.mjs` | `Bulletin` interface |
| `js/platform/events/events.mjs` | `GameEvent` interface |
| `js/platform/metrics/metrics.mjs` | `PlayerMetrics` interface |

**Pattern for schema files**:
```ts
// Before (activity-schema.mjs)
export const ActivityType = {
  GAME_RESULT: 'game_result',
  THOUGHT: 'thought',
};

// After (activity-schema.mts)
export const ActivityType = {
  GAME_RESULT: 'game_result',
  THOUGHT: 'thought',
} as const;

export type ActivityTypeValue = typeof ActivityType[keyof typeof ActivityType];
```

**`as const` + derived union type** is the standard pattern here — no need for full enums.

### Key interfaces to define in this phase

Write a `js/platform/types.d.ts` (or co-locate as `*-types.mts`) with the shared domain interfaces that normalize/store/API all agree on:

```ts
export interface PlayerProfile {
  playerId: string;
  profileName: string;
  tagline?: string;
  bio?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  favoriteGame?: string;
  socialLinks: SocialLink[];
  createdAt: string;
  updatedAt: string;
}

export interface SocialLink {
  label: string;
  url: string;
  kind: string;
}

export interface Thought {
  id: string;
  playerId: string;
  content: string;
  imageUrl?: string;
  visibility: ThoughtVisibilityValue;
  reactions: Record<string, number>;
  commentCount: number;
  createdAt: string;
}

export interface Activity {
  id: string;
  playerId: string;
  type: ActivityTypeValue;
  payload: Record<string, unknown>;
  createdAt: string;
}

// Add Relationship, FriendRequest, Message, Notification shapes here too
```

### Estimated effort: 1 day

---

## Phase 2: Platform Normalize — DONE (2026-05-29)

**What shipped:** 5 frontend normalize files migrated to `.mts`: `profile/profile`, `activity/activity-normalize`, `thoughts/thoughts-normalize`, `relationships/relationships-normalize`, `profile/friend-preview-enrichment`. (The backend `normalize.mjs` listed below is Phase 9, not Phase 2.)

- `profile.mts` now owns the precise profile-domain shapes: `ProfileFields`, `PlayerProfileView`, `ProfileLink`, `LadderPlacement`, `FriendPreview`, `MusicTrack`, plus `ProfilePresence` / `ProfileLinkKind` / `ProfileBackgroundStyle` unions.
- **Phase 1 deferrals closed:** `factory-profile.mts` now imports the real profile types — `FactoryProfile`'s `ladderPlacements`/`friendsPreview`/`mainSqueeze`/`links`/`profileMusicPlaylist`/`presence`/`backgroundStyle` are precisely typed and the `backgroundStyle` cast was removed.
- Normalize input boundaries use the `const x = raw as Record<string, any> | null | undefined` cast pattern (preserves the existing `x?.field` optional-chaining style) and `is`-typed guards for Set membership. `thoughts-normalize` exports `ThoughtPost` (the richer normalized post shape, distinct from the seed `Thought`) and `NormalizedThoughtComment`. `relationships-normalize` exports `ProfileRelationshipsRecord` + `RelationshipSlotMode`.
- `friend-preview-enrichment.mts` is loosely-typed API-merge glue: the structured parts (relationships record, API client) are typed; the API-shaped friend rows stay `Record<string, any>` by design (commented).

---

**Files**: ~9 normalize files  
**What these do**: Take raw API responses or user input, validate/sanitize, return typed output

The main value here is typing the function signatures:

```ts
// Before
export function normalizeThought(raw) {
  return { ... };
}

// After
import type { Thought } from '../types.js';

export function normalizeThought(raw: Record<string, unknown>): Thought {
  return { ... };
}
```

Files to migrate:

| File | Input type | Output type |
|------|-----------|------------|
| `activity-normalize.mjs` | `unknown` / raw API row | `Activity` |
| `thoughts-normalize.mjs` | `unknown` | `Thought` |
| `relationships-normalize.mjs` | `unknown` | `Relationship` |
| `profile.mjs` (in js/platform/profile/) | raw API response | `PlayerProfile` |
| `friend-preview-enrichment.mjs` | partial profile | enriched profile |
| `normalize.mjs` (backend) | DB row | typed domain object |

**Key challenge**: Many normalize functions currently accept `raw` with no shape. Use `unknown` as the input type and add explicit property narrowing. Don't use `any` — use type guards or `as` casts with a comment explaining the source.

```ts
// Acceptable cast pattern when input is from a trusted API response
const thought = raw as Record<string, unknown>;
return {
  id: String(thought.id ?? ''),
  content: String(thought.content ?? ''),
  // ...
};
```

### Estimated effort: 1–2 days

---

## Phase 3: Platform Store + Builders + Mutations — DONE (2026-05-29)

**What shipped (6 files, not ~15 — the original estimate over-counted):** `activity/activity-store`, `activity/activity-builders`, `thoughts/thoughts-store`, `relationships/relationships-store`, `relationships/relationships-slots`, `relationships/relationships-mutations`.

- `relationships-store` exports `ProfileRelationshipLedger`; `relationships-slots` exports `ResolvedFriendSlots` (+ internal `FriendCandidate`/`ResolvedFriendCandidate`).
- `relationships-mutations` (the 435-LOC file): its dynamic `record[field]` map mutators are typed with `CountMapField` / `TimestampMapField` key unions so `record[field]` stays a precise `Record<string, number|string>` — strict-safe for Phase 5, no `@ts-ignore`. Pair/result shapes typed (`PairRecords`, `PairResult`, `RemoveFriendResult`); the injected backend client is a local `RelationshipsMutationApiClient` (Phase 4 owns the real one).
- Store CRUD returns typed arrays (`ThoughtPost[]`, `ActivityItem[]`, etc.); sort comparators use a structural `{ createdAt; authorDisplayName }` type so they serve both posts and comments.
- The generic `storage.mts` get/set helpers from the plan below were already added in Phase 1 (`StorageLike` + typed read/write); not re-done here.
- Compiled clean on first build (one earlier `reduce` generic fix aside); typecheck + all 91 browser tests green.

---

**Files**: ~15 files  
**Dependencies**: Phase 1 types, Phase 2 normalize functions

These files manage local storage caching and state mutations. The typing work here is:

1. Type the stored data shapes (arrays of typed domain objects)
2. Type function parameters and return values
3. Type the `storage.mjs` helpers generically: `get<T>(key): T | null`

Files to migrate:

| File | What to type |
|------|-------------|
| `activity-store.mjs` | `ActivityStore` with typed array ops |
| `thoughts-store.mjs` | `ThoughtStore` with typed CRUD + pagination |
| `relationships-store.mjs` | `RelationshipStore` |
| `relationships-slots.mjs` | `SlotConfig`, `SlotState` |
| `relationships-mutations.mjs` | mutation functions with typed before/after |
| `activity-builders.mjs` | builder functions returning `Activity` |

**Generic storage pattern**:
```ts
// storage.mts
export function getStored<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

export function setStored<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
```

### Estimated effort: 1–2 days

---

## Phase 4: Platform API Clients — DONE (2026-05-29)

**What shipped (7 files):** `api/platform-api`, `api/auth-token`, `api/auth-api`, `api/notifications-api`, `api/messages-api`, plus the two domain sync modules `activity/activity-api` and `thoughts/thoughts-api`.

- `platform-api.mts` exports `PlatformApiClient = ReturnType<typeof createPlatformApiClient>` and `PlatformApiClientOptions`. Internal `get/put/post/del` helpers + `fetchImpl` (`typeof fetch | null`) + `RequestInit` options are typed; method params are typed (ids `string`, JSON bodies `unknown`/`Record`). Response payloads stay `Promise<any>` by design — the backend JSON contract isn't typed until the responses are modeled (a later concern; the client surface is what callers depend on).
- `auth-api` exports `AuthResult`; `notifications-api` has an internal `RequestEnvelope`. The `*-api` clients import `PlatformApiClientOptions` for their factory options.
- **Decision — kept the minimal local API-client interfaces** in `metrics.mts` (`MetricsApiClient`), `relationships-mutations.mts` (`RelationshipsMutationApiClient`), and `friend-preview-enrichment.mts` rather than swapping them for the full `PlatformApiClient`. They're interface-segregation stubs (each module declares only the methods it calls) and `PlatformApiClient` satisfies them structurally, so no coupling to the whole client is needed. The earlier "Phase 4 owns the real one" notes are superseded by this.
- **Two contract gaps the types caught:** (1) `ActivityPublishOptions`/`ThoughtApiOptions` now `extends PlatformApiClientOptions` so option objects can legitimately carry `fetchImpl`/`baseUrl` through to `createPlatformApiClient` (was a weak-type error); (2) `MutationOptions` gained `sharedThoughtId?`/`reactionId?` — interaction-context keys `thoughts-api` was already passing into `recordDirectInteractionBetweenPlayers` (now type-checked through the barrel re-export to the typed `.mts`).
- Two `id as string` casts in `thoughts-api` (`deleteThought`/`shareThought`) where an `unknown` param meets a `string`-typed client method.

---

**Files**: 6 files  
**Dependencies**: Phase 1–3 types

These are the fetch wrappers. Typing them enforces the contract between frontend and backend.

| File | What to type |
|------|-------------|
| `platform-api.mjs` | `ApiClient` with typed `get<T>`, `post<T>`, `patch<T>`, `delete<T>` |
| `auth-api.mjs` | `AuthResponse`, `LoginPayload`, `RegisterPayload` |
| `auth-token.mjs` | Token storage typed |
| `notifications-api.mjs` | `Notification[]` response |
| `messages-api.mjs` | `Message`, `Thread` response shapes |

**Generic API client pattern**:
```ts
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) throw new ApiError(res.status, await res.json());
  return res.json() as Promise<T>;
}
```

Write an `ApiError` class with a typed `status: number` and `body: unknown`.

### Estimated effort: 1 day

---

## Phase 5: Platform Barrels — DONE (2026-05-29)

**What shipped (4 files):** the 3 domain barrels `activity/activity`, `relationships/relationships`, `thoughts/thoughts` (now re-export types alongside values via `export type {...}`), plus `thoughts/thoughts-cards` (the card view-model builder — exports `ThoughtCardItem`/`ThoughtCardOptions`/`ThoughtCardActionItem`/`ThoughtCardQuoted`). bulletins/events/metrics/storage/identity/profile/api are single-file or already-typed domains with no separate barrel.

- **`strict: true` enabled globally** in `tsconfig.base.json`. Because every `.mts` at this point lives in `js/platform/**`, this is effectively "platform strict" as the plan intended — but it is NOT scoped by path, so it stays on for all later phases. Decision: that's desirable (no second strictness migration); write Phase 6+ files strict from the start.
- The strict flip surfaced exactly **2 errors**, both in `profile.mts`: the avatar resolver local is `((assetId: string) => unknown) | null` but the param type used `| undefined`. Fixed with an `AvatarUrlResolver = ... | null | undefined` alias on the `resolveNestedAvatar` overloads. No other migrated file needed changes — validation that the `unknown`-at-boundaries discipline held.
- `strictNullChecks` is the meaningful new constraint going forward; explicit `any` casts remain legal under strict and are unaffected.

---

**Files**: ~9 barrel `*.mjs` files (one per platform domain)  
**Work**: Update exports to re-export types alongside values

```ts
// Before
export { normalizeActivity } from './activity-normalize.mjs';
export { ActivityType } from './activity-schema.mjs';

// After
export { normalizeActivity } from './activity-normalize.mjs';
export { ActivityType } from './activity-schema.mjs';
export type { ActivityTypeValue, Activity } from './activity-schema.mjs';
```

This phase also enables turning `strict: true` on for all `js/platform/**` files.

### Estimated effort: 0.5 days

---

## Phase 6: Page Subsystems

**Files**: ~59 source files across 7 subsystems
**Subsystems**: `js/me-page/`, `js/player-page/`, `js/thoughts-page/`, `js/gallery-page/`, `js/profile-editor/`, `js/profile-social/`, `js/profile-layout/`

> Re-scoped 2026-05-29: earlier drafts listed only 4 subsystems and ~35 files. The `me-page`, `gallery-page`, and `profile-layout` subsystems were missing. `profile-layout` in particular is large and DOM/canvas-heavy (`layout-wire.mjs` 872, `layout-renderer.mjs` 768) and should be migrated **last within this phase**, after the simpler subsystems give it typed view-models to lean on.

These are the heaviest migration because they touch the DOM. The main categories of typing work:

### DOM element queries

```ts
// Before
const btn = document.querySelector('#follow-btn');
btn.addEventListener('click', handler);

// After
const btn = document.querySelector<HTMLButtonElement>('#follow-btn');
btn?.addEventListener('click', handler);
```

TypeScript's `querySelector` generics are the cleanest pattern. Use `querySelector<HTMLElement>` as the minimum, narrow further when you need element-specific properties.

### View-model shapes

Each subsystem has a `view-model.mjs` — these are high-value targets because they define the state shape the whole subsystem reads from.

```ts
// player-page/view-model.mts
export interface PlayerPageViewModel {
  profile: PlayerProfile;
  isOwner: boolean;
  relationship: RelationshipState | null;
  thoughts: Thought[];
  hasMoreThoughts: boolean;
}
```

### Subsystem file order (within each subsystem, migrate in this order)

1. `view-model.mts` (define the state shape first)
2. `loader.mts` (types the async data fetch, returns `ViewModel`)
3. `render.mts` (DOM writes — type the DOM queries)
4. `actions.mts` / `wire.mts` (event handlers — type event params)
5. `page.mts` (orchestrator — mostly already typed via imports by now)

### Files per subsystem

**`js/player-page/`** (9 source files):
- page.mts, wire.mts, render.mts, loader.mts, view-model.mts, hero-actions.mts, thought-composer-actions.mts, media-actions.mts, actions-view-model.mts

**`js/thoughts-page/`** (4 source files):
- page.mts, actions.mts, view-model.mts, render.mts

**`js/profile-editor/`** (10 source files):
- form-fields.mts, constants.mts, view-model.mts, persistence.mts, panel.mts, editor-wire.mts, music-editor.mts, music-player.mts, plus the remaining editor modules

**`js/profile-social/`** (5 source files):
- social-actions.mts, social-view.mts, social-view-thoughts.mts, social-view-shared.mts, media-composer-state.mts

**`js/me-page/`** (12 source files):
- entry.mts, view-model.mts, render.mts, render-sections.mts, wire.mts, page-data.mts, media-actions.mts, friend-code-actions.mts, friend-navigator.mts, music-player.mts, apply-scale.mts, apply-layout.mts (`apply-layout.mjs` is 694 LOC — type its `panel`/`element`/`composition` shapes carefully; it is shared by `/me` and `/player`)

**`js/gallery-page/`** (8 source files):
- loader.mts, render.mts, wire.mts, viewer.mts, viewer-state.mts, viewer-social.mts, viewer-page-actions.mts, viewer-page-controller.mts

**`js/profile-layout/`** (11 source files) — migrate last in this phase:
- registry.mts, default-layout.mts, normalize-layout.mts, child-layout.mts, composition-layout.mts, layout-storage.mts, layout-zoom.mts, layout-editor.mts, layout-inspector-view.mts, layout-renderer.mts, layout-wire.mts. Define a shared `LayoutPanel` / `LayoutElement` / `PanelChild` / `PanelStyle` interface set first (in or near `normalize-layout`), since every other file in this subsystem reads those shapes.

### Estimated effort: 5–7 days (was 3–4; reflects the 3 added subsystems, including the large profile-layout editor)

---

## Phase 7: Root Page Entry Points + Utilities

**Files**: ~34 files in `js/`  
**Dependencies**: All platform and subsystem types

This phase is mostly mechanical — the platform types flow up through imports, so many files will gain correct types with minimal changes. The primary work is:

1. Renaming `.mjs` → `.mts`
2. Fixing any TypeScript errors that emerge (DOM queries, missing properties)
3. Typing the 3–4 shared utility files (`arcade-paths.mjs`, `arcade-catalog.mjs`, etc.)

**File groups**:

| Group | Files | Notes |
|-------|-------|-------|
| Auth flows | arcade-sign-in, sign-up, forgot-password, reset-password | Straightforward form handlers |
| Feed pages | arcade-activity, arcade-home, arcade-grid | Read-mostly, light DOM |
| Profile pages | arcade-me, arcade-player, arcade-profile, arcade-profile-page-helpers | Heaviest — many DOM reads |
| Social features | arcade-profile-social-view, arcade-media-composer-state | Moderate complexity |
| Messaging | arcade-messages-inbox, arcade-messages-thread | Polling logic |
| Utilities | arcade-paths, arcade-catalog, arcade-notifications | Simple shapes |
| Legacy shims | arcade-player.mts, arcade-player-wire.mts, arcade-thoughts.mts | Keep as thin re-exports |

### Estimated effort: 2–3 days

---

## Phase 8: Classic Scripts (Global JS files) — DONE (2026-05-30)

**What shipped (deviated from the draft below):** the 3 files became typed ES modules but **kept their global-attach side effects** instead of switching consumers to imports — `platform-config.mts` still sets `globalThis.__JGF_PLATFORM_API_URL__` (the draft's imagined `export const PLATFORM_CONFIG = {...}` does not exist; no consumer imports it), `pixel-text.mts` keeps its load-time `renderAll()` + `window.PixelText`, `arcade-input.mts` keeps its gamepad poll loop + `window.ArcadeInput`. Both IIFEs were preserved verbatim (only types added + a trailing `export {};`). `js/globals.d.ts` was **NOT deleted** — it's the permanent ambient contract for the global reads. `isolatedModules` forced the module conversion (TS1208 on a no-export file), which forced all 56 HTML `<script>` tags across 27 files to `type="module"`. Test realignment: `deployment-config.test`, `arcade-input.test`, and the 6 `*page.test` files referenced the old `.js` names. **typecheck browser+api = 0; 91/91 browser + 116/116 backend green.** The original draft follows for reference.

**Files**: 3 files  
**Current state**: ~~Loaded as classic `<script>` tags, expose globals~~ now `type="module"` ES modules that still attach the same globals

**`platform-config.js`** — convert to ES module first:
```ts
// platform-config.mts
export const PLATFORM_CONFIG = {
  apiBase: 'https://...',
  wsBase: 'wss://...',
} as const;

export type PlatformConfig = typeof PLATFORM_CONFIG;
```
Update all 15 HTML pages that load it as a classic script → load as module or import from the page's `.mts` entry.

**`pixel-text.js`** — canvas-based pixel font renderer:
- Type the `PixelText` API (draw function, font definitions)
- Convert to ES module, export the renderer
- Update HTML pages that load it

**`arcade-input.js`** — gamepad/keyboard dispatcher:
- Type the input event shapes (`GamepadEvent`, custom events)
- Type the dispatch function signatures
- Convert to ES module

This phase is lower priority since the ambient `.d.ts` stubs from Phase 0 keep things compiling. Do it when the rest of the platform is fully migrated.

### Estimated effort: 1 day

---

## Phase 9: Backend (`platform-api/`)

**Files**: 21 source files + 12 tests  
**Runtime**: Node.js — separate tsconfig, `@types/node` needed  
**Deployment**: Railway — needs build step added

### npm packages to add

```bash
cd platform-api
npm install --save-dev typescript @types/node @types/pg @types/jsonwebtoken @types/bcryptjs
```

Note: `cloudinary` v2 ships its own types; no `@types/cloudinary` needed.

### File migration order

1. `config.mts` — typed env vars, `process.env` narrowing
2. `src/db/*.mts` — typed DB row shapes, `pg.QueryResult<T>` generics
3. `src/normalize.mts` — typed transform functions (mirrors frontend normalize)
4. `src/services/auth.mts`, `src/services/upload.mts` — typed service functions
5. `src/auth-helpers.mts`, `src/email.mts` — typed utilities
6. `src/app.mts` — the large route handler file (~1500 LOC)
7. `src/server.mts` — thin entry point

### `app.mts` strategy

`app.mjs` is **778 LOC** (the route-family extraction already shrank it; it is now a dispatch shell plus some player/gesture/avatar resolution). Don't split it during migration — just type it. The earlier "~1500 LOC, will produce hundreds of errors" warning no longer applies; at this size a straight typing pass with `strict: false` first, then tightening, is realistic without a `@ts-nocheck` quarantine.

### DB row typing pattern

```ts
// db/thoughts.mts
import type { Pool } from 'pg';
import type { Thought } from '../../types.js';

interface ThoughtRow {
  id: string;
  player_id: string;
  content: string;
  // ... exact Postgres column names
}

export async function getThoughts(pool: Pool, playerId: string): Promise<Thought[]> {
  const result = await pool.query<ThoughtRow>(
    'SELECT * FROM thoughts WHERE player_id = $1',
    [playerId]
  );
  return result.rows.map(normalizeThoughtRow);
}
```

This is the highest-value typing in the backend — catching DB column name mismatches at compile time.

### Railway deployment update

In `platform-api/package.json`:
```json
"scripts": {
  "build": "tsc -p tsconfig.json",
  "start": "node ./dist/server.mjs",
  "dev": "tsc --watch -p tsconfig.json",
  "test": "node --test ./tests/*.test.mjs"
}
```

In Railway settings: set start command to `npm run build && npm start` (or use a Procfile).

### Estimated effort: 3–4 days

---

## Phase 10: Lovers Lost

**Files**: ~36 files in `games/lovers-lost/`  
**Architecture**: Classic scripts + inline `type="module"` loader

### Migration notes

This game uses `game.js` as a classic script entry that immediately loads an inline ES module. Convert the inline loader to a proper `game.mts` entry point.

The renderer split (`renderer-*.js` files) is already clean — type each one independently.

**High-value files to type first**:
- `game-constants.ts` — all game constants as `as const` objects
- `player.ts` — `PlayerState` interface (used by every other module)
- `collision.ts` — pure functions, easy to type with geometry interfaces
- `scoring.ts` — pure functions

**Canvas/rendering types**:
```ts
type RenderContext = {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  scaleFactor: number;
};
```

**Fixed-timestep types**:
```ts
type GameTick = {
  dt: number;           // fixed delta (1/60)
  accumulator: number;
  lastTime: number;
};
```

### Estimated effort: 2–3 days

---

## Phase 11: Battleshits

**Files**: ~17 files in `games/battleshits/`  
**Architecture**: Cleaner split than Lovers Lost

**High-value files to type first**:
- `board.ts` — `Board`, `Cell`, `Ship`, `Shot` interfaces (pure logic)
- `presentation.ts` — `PresentationState` 
- `match-flow.ts` — `Phase` union type (`'placement' | 'battle' | 'results'`)

The online/WebSocket layer (`online.ts`) will need typed message schemas:
```ts
type WsMessage =
  | { type: 'shot'; cell: number }
  | { type: 'result'; hit: boolean; sunk: boolean }
  | { type: 'game_over'; winner: string };
```

### Estimated effort: 1–2 days

---

## File Count Summary

Counts corrected against the 2026-05-29 audit. Phase 6 grew (3 subsystems were missing); the games total is no longer just Lovers Lost + Battleshits.

| Phase | Files | Complexity | Est. Time |
|-------|-------|-----------|-----------|
| 0: Infrastructure | 5–8 config files | Low | 2–4 hrs |
| 1: Platform Schemas | 9 | Low | 1 day |
| 2: Platform Normalize | 9 | Medium | 1–2 days |
| 3: Platform Store/Builders | 15 | Medium | 1–2 days |
| 4: Platform API Clients | 6 | Medium | 1 day |
| 5: Platform Barrels | 9 | Low | 0.5 days |
| 6: Page Subsystems | ~59 (7 subsystems) | High | 5–7 days |
| 7: Root Page Entries | ~34 | Medium | 2–3 days |
| 8: Classic Scripts | 3 | Medium | 1 day |
| 9: Backend | ~38 | High | 3–4 days |
| **Non-game total** | **~160 + 3 classic** | | **~16–24 days** |
| 10+: Games (per cabinet) | 7 cabinets, scoped individually | Medium each | later, separate passes |

Game phases are intentionally left as per-cabinet sub-passes (each after that cabinet's own seam cleanup), not a single bulk estimate. Lovers Lost and Battleshits are the most migration-ready; `creature-battle`, `echo-duel`, `circuit-siege`, `illuminauts`, and `sumorai` should each be scoped when their turn comes.

---

## Key Risks and Mitigations

### Risk 1: `.mjs` extension conflicts during migration

While migrating file-by-file, you'll have both `.mts` and `.mjs` versions of some files briefly. TypeScript may complain about duplicate module identifiers.

**Mitigation**: Delete the old `.mjs` file immediately when creating the `.mts` replacement. Never have both exist simultaneously.

### Risk 2: Import path changes break the browser

TypeScript ESM requires explicit `.mjs` extensions in import paths. Current imports already use `.mjs`, so this is fine — but watch for any bare imports (`import from './foo'` without extension) that would break.

**Mitigation**: `moduleResolution: "Bundler"` in tsconfig handles some of this; run `tsc --noEmit` after each file migration.

### Risk 3: backend `app.mts` typing churn

`app.mjs` is 778 LOC (not the ~1500 once assumed), so a single typing pass is tractable. The main friction is the many injected `options` dependency callbacks at the top of `createApp` — type the options object as an explicit interface first, and the rest of the file mostly follows.

**Mitigation**: Type `app.mts` with `strict: false` first, then tighten. A `@ts-nocheck` quarantine should not be necessary at this size; reach for it only if a specific section fights back.

### Railway deploy note (Railway root directory)

There is **no root `package.json`**; `railway.json` uses generic `npm install` / `npm start`, which only resolve because the Railway service's root directory is set to `platform-api` in the Railway dashboard. When you add the backend build step, update the **platform-api** service (`npm run build && npm start`, output `dist/server.mjs`) and keep `/health` as the healthcheck — don't expect the root directory to appear in `railway.json`.

### Risk 4: Railway deploy breaks after backend migration

Adding a build step to Railway could break the deployment if the tsconfig or output paths are wrong.

**Mitigation**: Test the full `npm run build && npm start` locally before pushing. Verify `dist/server.mjs` exists and runs. Keep `main` deployable — do the backend phase on a branch.

### Risk 5: Test files need updating

~44 test files (`.test.mjs`) import from source files. After migrating source to `.mts`, the test imports still resolve to `.mjs` (compiled output), so they should continue to work. But if a test file is also migrated to `.mts`, it needs TypeScript to compile it.

**Mitigation**: Leave test files as `.mjs` until their source files are fully migrated, then optionally migrate tests in the same PR.

---

## Definition of Done Per Phase

Each phase is complete when:
1. All files in scope renamed to `.mts`
2. `tsc --noEmit` passes with zero errors for that tsconfig scope
3. The app loads and functions correctly in the browser (manual smoke test)
4. No `@ts-ignore` or `any` casts added without a comment explaining why

The migration is complete project-wide when:
- `strict: true` is active in all tsconfigs
- `allowJs: false` (no plain `.js` files remain in migrated paths)
- `checkJs: false` removed (no longer needed)
- Railway deploys successfully from compiled output

---

## Starting Point Checklist

Before writing a single `.mts` file:

- [ ] Decide: does the project have a root `package.json`? If not, create a minimal one for npm scripts
- [ ] Install TypeScript globally or as a dev dep: `npm install -D typescript`
- [ ] Install `@types/node` in `platform-api/`: `npm install -D @types/node @types/pg @types/jsonwebtoken @types/bcryptjs`
- [ ] Create `tsconfig.base.json`, `tsconfig.browser.json`, `platform-api/tsconfig.json`
- [ ] Create `js/globals.d.ts` with ambient declarations for the 3 classic scripts
- [ ] Verify `tsc -p tsconfig.browser.json --noEmit` runs (even if it produces errors — it should at least find the config)
- [ ] Add `.gitignore` entries for compiled `.mjs` output once files start being migrated
- [ ] Pick Phase 1 file 1: `js/platform/activity/activity-schema.mjs` → rename → type → verify tsc passes
