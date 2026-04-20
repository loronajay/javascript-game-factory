# Javascript Game Factory Platform Implementation Plan

## Purpose

This document turns the platform idea into a build plan we can execute safely.

The goal is not to ship every social/platform feature quickly. The goal is to grow the arcade into a stable multi-page platform without creating a tangled mess of one-off page logic, duplicated data rules, or game-owned profile state.

## Product Direction

The platform is evolving from a game launcher into a multi-page arcade site with:

- shared player identity
- player profile pages
- bulletin and announcement surfaces
- event pages
- user links
- friends activity
- a shared thoughts feed
- eventual media upload

The platform remains the owner of long-term identity and social state.
Games remain self-contained experiences that can read platform data and publish approved activity/results, but games must not become the permanent home for profile ownership.

## Non-Negotiables

These rules are here to protect stability.

1. Platform-owned identity stays platform-owned.
   `playerId`, canonical `profileName`, future profile fields, friends, links, posts, bulletins, activity, and media metadata belong to the platform layer, not to individual games.

2. Read-heavy pages come before write-heavy pages.
   We should ship stable display pages before adding many forms, mutations, uploads, or cross-user interactions.

3. Local-first before backend.
   We can prototype page structure and data contracts locally, but we should not fake a full social backend in scattered page code.

4. Uploads come late.
   Photo/avatar upload should wait until auth, storage, file validation, moderation rules, and failure handling are defined.

5. Every shared rule lives in shared modules.
   No page should invent its own idea of what a profile, bulletin, activity item, or post looks like.

6. Games publish through a contract.
   Games may emit platform-recognized results and activity events, but only through a shared interface owned by the platform.

7. Stability beats cleverness.
   Prefer simple modules, plain HTML pages, query-param routing where needed, and explicit tests over premature abstraction.

## Current Foundation

The repo already has the start of a platform layer:

- `index.html` and `grid.html` establish the arcade shell.
- `js/arcade-catalog.mjs` owns game listing and launcher metadata loading.
- `js/factory-profile.mjs` already defines canonical shared identity storage.
- `js/match-identity.mjs` already separates permanent identity from temporary per-match aliases.
- `js/arcade-profile.mjs` already gives us a shell-level profile editor.
- `games/lovers-lost/` already consumes the shared identity model.

This means the platform does not need to start from zero. It needs to become more deliberate and more formal.

## Architecture Shape

The safest platform structure is four layers.

### 1. Page Layer

Owns page-specific HTML composition and interaction flow.

Examples:

- home page
- games page
- player profile page
- bulletins page
- events page
- activity page
- thoughts page

This layer should be thin. It renders shared view models and calls shared modules.

### 2. Shared Domain Layer

Owns data shapes, sanitization, normalization, and core platform rules.

Examples:

- player profile normalization
- link validation
- bulletin model normalization
- activity item formatting
- post visibility rules
- event metadata shape

This is where stability comes from.

### 3. Storage / Data Source Layer

Owns where data comes from and where it is written.

Early on this will be local storage plus fixture files.
Later this will expand to backend APIs and media storage.

The page layer should not care whether data came from:

- local storage
- JSON fixtures
- mock adapters
- a real backend

### 4. Game Integration Layer

Owns the contract between games and the platform.

Examples:

- reading canonical player identity
- reading preferences/favorites
- publishing run results
- publishing recent activity
- requesting temporary match aliases

Games should never write directly into random platform storage keys.

## Route / Page Plan

Because this repo is plain HTML/CSS/JS, the route plan should stay static-host friendly.

Recommended first-class pages:

- `/index.html`
  Arcade home and entry point.
- `/grid.html`
  Game library / cabinet browser.
- `/me/index.html`
  Personal dashboard for the signed-in or local current player.
- `/players/index.html`
  Player discovery or player list later if needed.
- `/player/index.html?id=<playerId>`
  Public player profile page.
- `/bulletins/index.html`
  Platform notices and curated announcements.
- `/events/index.html`
  Event listing page.
- `/event/index.html?slug=<eventSlug>`
  Event detail page.
- `/activity/index.html`
  Friends and platform activity.
- `/thoughts/index.html`
  Shared thoughts feed.

Notes:

- For now, prefer stable query-param detail pages over pretending we have full dynamic routing.
- If we later move to a hosting setup that supports clean routes, the page logic can survive the URL change.

## Shared Data Objects

These objects should be defined centrally before new pages are built.

### `factoryProfile`

Platform-owned identity and private player state.

Suggested shape:

```js
{
  version: 1,
  playerId: "player-123",
  profileName: "Maya",
  bio: "",
  tagline: "",
  avatarAssetId: "",
  favorites: [],
  friends: [],
  recentPartners: [],
  links: [],
  preferences: {},
  createdAt: "",
  updatedAt: ""
}
```

### `playerProfileView`

Public-facing subset of player profile data.

Suggested shape:

```js
{
  playerId: "player-123",
  profileName: "Maya",
  bio: "",
  tagline: "",
  avatarUrl: "",
  links: [],
  featuredGames: [],
  recentActivity: [],
  thoughtCount: 0
}
```

### `linkItem`

Suggested shape:

```js
{
  id: "link-1",
  label: "Itch.io",
  url: "https://example.com",
  kind: "external",
  createdAt: ""
}
```

### `bulletin`

Suggested shape:

```js
{
  id: "bulletin-1",
  slug: "spring-jam",
  title: "Spring Jam",
  summary: "",
  body: "",
  status: "published",
  audience: "public",
  publishedAt: "",
  createdBy: "system"
}
```

### `eventItem`

Suggested shape:

```js
{
  id: "event-1",
  slug: "lovers-lost-weekend",
  title: "Lovers Lost Weekend",
  summary: "",
  body: "",
  startsAt: "",
  endsAt: "",
  relatedGames: [],
  bulletinIds: [],
  status: "scheduled"
}
```

### `activityItem`

Suggested shape:

```js
{
  id: "activity-1",
  type: "game-result",
  actorPlayerId: "player-123",
  gameSlug: "lovers-lost",
  summary: "Maya finished a run in Lovers Lost",
  visibility: "friends",
  createdAt: "",
  metadata: {}
}
```

### `thoughtPost`

Suggested shape:

```js
{
  id: "thought-1",
  authorPlayerId: "player-123",
  text: "Need one more clean goblin pass.",
  visibility: "public",
  createdAt: "",
  editedAt: ""
}
```

### `mediaAsset`

Do not implement uploads yet, but define the future boundary now.

Suggested shape:

```js
{
  id: "asset-1",
  ownerPlayerId: "player-123",
  kind: "avatar",
  storageKey: "",
  mimeType: "image/png",
  width: 0,
  height: 0,
  status: "ready",
  createdAt: ""
}
```

## Ownership Rules

These rules should stay true through every phase.

- The platform owns canonical identity.
- The platform owns profile editing.
- The platform owns social graph data.
- The platform owns posts, links, bulletins, events, and media metadata.
- Games may request a temporary match/session display name.
- Games may publish approved result/activity payloads.
- Games may read public platform profile data when necessary.
- Games must not directly mutate profile, friends, feed, bulletin, or upload records.

## Implementation Phases

## Phase 0: Hardening The Foundation

Goal: formalize the platform core before we add pages.

Deliverables:

- define central data shapes and normalization helpers
- separate platform storage keys by feature area
- create shared modules for profile, links, bulletins, events, activity, and thoughts
- create fixture data strategy for non-game pages
- document the game-to-platform integration contract

Recommended code areas:

- `js/platform/identity/`
- `js/platform/profile/`
- `js/platform/bulletins/`
- `js/platform/events/`
- `js/platform/activity/`
- `js/platform/thoughts/`
- `js/platform/storage/`

Testing expectations:

- unit tests for every normalizer/sanitizer
- tests for storage adapters
- tests for fixture loading fallbacks

Exit criteria:

- no new page invents its own data shape
- shared objects have stable normalizers
- storage access is no longer ad hoc

## Phase 1: Read-Only Platform Pages

Goal: add stable page structure without heavy mutation risk.

Pages:

- `me` dashboard shell
- public player profile page
- bulletins listing
- events listing and event detail
- activity page with fixture/mock data

Rules:

- pages may read from local storage and fixture data
- pages should avoid destructive or multi-user write paths
- visual structure should be real even if some data is mocked

Testing expectations:

- page smoke tests for required mounts/copy/controls
- unit tests for page view-model builders

Exit criteria:

- page map exists
- navigation model is stable
- shared modules can support multiple pages without duplication

## Phase 2: Safe Personal Editing

Goal: allow the current player to edit platform-owned personal data.

Writes allowed in this phase:

- edit canonical profile name
- edit bio/tagline
- add/remove personal links
- set lightweight preferences

Writes not allowed yet:

- cross-user friend requests
- media upload
- public comments/replies
- complex moderation-dependent content

Rules:

- all forms write through shared platform modules
- page code never writes raw storage payloads directly
- every editable field has sanitization and normalization tests

Exit criteria:

- `me` becomes the single edit surface for personal platform data
- other pages read the same shared data cleanly

## Phase 3: Controlled Social Surfaces

Goal: add low-complexity social behavior without requiring the hardest backend work yet.

Features:

- shared thoughts feed
- recent activity feed
- game-published activity items
- simple friends list display

Guardrails:

- start with append-only or simple replace flows
- no rich replies/threads yet
- no private messaging
- no cross-user mutation without real backend planning

Exit criteria:

- platform can display meaningful social surfaces
- game results can flow into a common activity model
- page interactions stay simple and testable

## Phase 4: Backend Transition

Goal: move from local-first platform scaffolding to real persistent multi-user data.

This is the trigger point for:

- authentication
- database-backed profiles
- friend relationships
- real shared feed data
- event publishing workflows
- cross-device state

Preconditions:

- stable front-end data contracts already exist
- page responsibilities are already separated
- write flows are already understood locally

Exit criteria:

- backend replaces adapters, not page logic
- platform pages do not need to be rewritten from scratch

## Phase 5: Media Uploads

Goal: add avatars/photos only after backend and moderation boundaries exist.

Required before implementation:

- authenticated ownership rules
- supported mime types
- file size caps
- image dimension rules
- upload failure states
- asset replacement rules
- moderation/safety decisions

Exit criteria:

- uploads are a narrow feature built onto stable profile/media contracts
- upload logic does not leak into unrelated page code

## Things We Should Explicitly Not Build Yet

- direct messages
- threaded comments
- notifications system
- generalized chat
- multi-image galleries
- arbitrary file upload
- per-game custom social schemas
- backend-dependent UX before backend contracts exist

## Navigation Strategy

Navigation should expand gradually instead of all at once.

Recommended progression:

1. keep current home and grid stable
2. add `Me` and `Bulletins`
3. add `Events`
4. add `Activity`
5. add `Thoughts`
6. add profile discovery only when it has a clear purpose

This keeps the shell understandable while the platform surface grows.

## Testing Strategy

Because this repo is already test-oriented, the platform should follow the same discipline.

Required test categories:

- data normalization tests
- storage adapter tests
- page structure/smoke tests
- view-model tests
- game integration contract tests

Not required:

- pixel-perfect rendering tests
- full DOM/browser integration for every interaction

The highest-value tests for the platform are the ones that prevent schema drift and ownership drift.

## Suggested Build Order For The Next Few Passes

1. Formalize shared platform modules and storage keys.
2. Create `me` page as the first non-game platform page.
3. Create read-only bulletin and events pages using fixtures.
4. Create public player profile page backed by shared view models.
5. Define and test the game-to-platform activity publishing contract.
6. Add simple thoughts feed only after the previous layers are clean.

## Current Progress

- `js/platform/identity/` is now the source of truth for canonical platform identity.
- `js/platform/storage/` now owns shared platform storage keys and safe storage access helpers.
- `js/platform/profile/` now owns shared bio/tagline/link normalization plus public profile-view building.
- `/me/index.html` now exists as the first non-game platform page and reuses the synthwave shell language rather than introducing a separate visual system.
- Home and grid now expose direct navigation into the player page.
- The `/me` hero now uses a default portrait asset plus a clamped avatar frame so future uploads with mixed dimensions crop consistently.
- The `/me` hero layout now reserves dedicated space for the portrait rail so long names and bio copy do not collide with the avatar area.

## Decision Gates

Before starting a feature, ask:

- Is this page mostly read-only or write-heavy?
- Does the data shape already exist centrally?
- Does this belong to the platform or to a game?
- Can this ship locally first without lying about multi-user behavior?
- Will this feature force backend decisions we have not made yet?

If the answer to the last question is yes, the feature probably belongs in a later phase.

## Definition Of Success

We are succeeding if:

- the arcade grows into a multi-page platform without losing clarity
- shared identity remains centralized
- new pages reuse shared contracts instead of inventing their own
- games integrate through platform APIs instead of storage hacks
- backend adoption later feels like swapping adapters, not rebuilding the product

## Immediate Working Assumptions

These assumptions should hold unless we explicitly change them.

- The repo remains vanilla HTML/CSS/JS for now.
- Platform pages should stay static-host friendly.
- Query-param detail pages are acceptable early on.
- Local storage and fixtures are valid scaffolding for early phases.
- Real social persistence and uploads require a backend phase.
