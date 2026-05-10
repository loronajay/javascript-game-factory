# TypeScript Migration Plan

Status: deferred pending repo-wide architecture cleanup.

**Scope**: 234 JS/MJS files across browser platform, Node.js backend, and 2 games  
**Strategy**: Incremental, platform-first, file-by-file using `allowJs` as a bridge  
**Order**: Infrastructure → Platform layer → Page subsystems → Backend → Games

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

   Follow-on backend cleanup still required before typing:
   - `platform-api/src/db/relationships.mjs` has been partially modularized by extracting pure state rules into `platform-api/src/db/relationships-domain.mjs`
   - `platform-api/src/db/thoughts.mjs` has been partially modularized by extracting pure thought/viewer-state helpers into `platform-api/src/db/thoughts-domain.mjs`
   - `platform-api/src/normalize.mjs` is now a thin barrel over domain modules, which removes it as a major pre-TypeScript hotspot
   - backend cleanup is now mostly about preserving the new seams and avoiding regressions, not breaking up one remaining giant file

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

## Phase 0: Infrastructure Setup

**Goal**: `tsc --noEmit` runs without crashing on the platform layer. No source files changed yet.

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

## Phase 1: Platform Schemas

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

## Phase 2: Platform Normalize

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

## Phase 3: Platform Store + Builders + Mutations

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

## Phase 4: Platform API Clients

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

## Phase 5: Platform Barrels

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

**Files**: ~35 files across 4 subsystems  
**Subsystems**: `js/player-page/`, `js/thoughts-page/`, `js/profile-editor/`, `js/profile-social/`

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

**`js/profile-editor/`** (5 source files):
- form-fields.mts, constants.mts, view-model.mts, persistence.mts, panel.mts

**`js/profile-social/`** (3 source files):
- social-actions.mts, social-view.mts, media-composer-state.mts

### Estimated effort: 3–4 days

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

## Phase 8: Classic Scripts (Global JS files)

**Files**: 3 files  
**Current state**: Loaded as classic `<script>` tags, expose globals

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

At ~1500 LOC, `app.mts` is large. Don't split it during migration — just type it. Splitting it is a separate refactor that can follow. The typing pass will naturally surface where the boundaries should be.

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

| Phase | Files | Complexity | Est. Time |
|-------|-------|-----------|-----------|
| 0: Infrastructure | 5–8 config files | Low | 2–4 hrs |
| 1: Platform Schemas | 9 | Low | 1 day |
| 2: Platform Normalize | 9 | Medium | 1–2 days |
| 3: Platform Store/Builders | 15 | Medium | 1–2 days |
| 4: Platform API Clients | 6 | Medium | 1 day |
| 5: Platform Barrels | 9 | Low | 0.5 days |
| 6: Page Subsystems | 35 | High | 3–4 days |
| 7: Root Page Entries | 34 | Medium | 2–3 days |
| 8: Classic Scripts | 3 | Medium | 1 day |
| 9: Backend | 33 | High | 3–4 days |
| 10: Lovers Lost | 36 | Medium | 2–3 days |
| 11: Battleshits | 17 | Medium | 1–2 days |
| **Total** | **234** | | **~18–27 days** |

---

## Key Risks and Mitigations

### Risk 1: `.mjs` extension conflicts during migration

While migrating file-by-file, you'll have both `.mts` and `.mjs` versions of some files briefly. TypeScript may complain about duplicate module identifiers.

**Mitigation**: Delete the old `.mjs` file immediately when creating the `.mts` replacement. Never have both exist simultaneously.

### Risk 2: Import path changes break the browser

TypeScript ESM requires explicit `.mjs` extensions in import paths. Current imports already use `.mjs`, so this is fine — but watch for any bare imports (`import from './foo'` without extension) that would break.

**Mitigation**: `moduleResolution: "Bundler"` in tsconfig handles some of this; run `tsc --noEmit` after each file migration.

### Risk 3: `platform-api/app.mts` is too large to type safely in one pass

~1500 LOC with many inline type casts could produce hundreds of errors when strict mode is turned on.

**Mitigation**: Type `app.mts` with `strict: false` first (file-level override via `// @ts-nocheck` or tsconfig `exclude` initially), then progressively remove the override section by section.

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
