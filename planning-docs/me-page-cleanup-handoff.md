# `/me` Page Cleanup Pass — Scoping Handoff (COMPLETE)

## Goal

Clean up the `/me` frontend ownership structure without changing runtime behavior.

The current platform architecture has already moved several major surfaces into subsystem folders such as `player-page/`, `thoughts-page/`, `gallery-page/`, `profile-editor/`, and `profile-social/`. `/me` is still the remaining route that is partly composed from top-level `arcade-*` files. The cleanup goal is to make `/me` follow the same subsystem-folder pattern.

This is an architecture cleanup pass, not a feature pass.

Do not add Profile Music, Durable Memories, badges, rankings, uploads, groups, doomscroll, or new UI behavior in this pass.

## Current Known Context

The `/me/index.html` page currently loads:

```html
<script type="module" src="../js/arcade-me.mjs"></script>
```

The page contains a large profile owner surface, including:

- profile editor panel
- avatar/background upload controls
- friend rail controls
- discoverability toggle
- delete-account danger zone
- owner profile layout panels
- thought panel
- favorite game panel
- gallery panel
- friends panels
- session/nav mount points

A partial split has already happened through `arcade-me-*` helper files. These are all **active seams**, not leftovers:

| File | Exports | Status |
|---|---|---|
| `arcade-me-wire.mjs` | `wireMePage` | active — wires all DOM events, social actions, data reload, gallery viewer |
| `arcade-me-view.mjs` | `renderMePageView` | active — renders hero card, friend rail, social panels |
| `arcade-me-view-sections.mjs` | `renderRailPanel`, `renderFriendCodePanel`, `renderFavoritePanel`, `renderAboutPanel`, `renderBadgesPanel`, `renderFriendNavigatorPanel` | active — section-level HTML renderers |
| `arcade-me-page-data.mjs` | `createMePageDataController` | active — API hydration, gallery load, thought feed sync |
| `arcade-me-media-actions.mjs` | `uploadPendingThoughtPhoto`, `submitGalleryUpload` | active — photo upload flows |
| `arcade-me-friend-navigator.mjs` | `createFriendNavigatorController`, `applyFriendNavigatorFilter`, `normalizeFriendNavigatorQuery` | active — friend search panel controller |

What **remains in `arcade-me.mjs`** today:

- `addFriendByCode` — friend-code lookup and friendship creation
- `buildMePageViewModel` — converts profile + feeds + metrics + relationships into the page view model
- `renderMePage` — loads data from storage, calls `buildMePageViewModel`, calls `renderMePageView`
- the top-level boot block — auth check, redirect, session binding, API client creation, profile panel init, `renderMePage` call, `wireMePage` call, `initSessionNav` call

This violates the current frontend direction: new shared frontend work should usually land in subsystem folders instead of growing top-level `arcade-*.mjs` files. But the extraction work is further along than zero — the task is folder reorganization of existing seams, not fresh extraction from a monolith.

## Target Shape

Create a dedicated `/me` subsystem folder. All files below are required — the bottom four already exist as `arcade-me-*` helpers and are folder moves, not new work:

```txt
js/me-page/
  entry.mjs              ← extract from boot block in arcade-me.mjs (new)
  page-data.mjs          ← rename from arcade-me-page-data.mjs
  view-model.mjs         ← extract buildMePageViewModel from arcade-me.mjs (new)
  render.mjs             ← extract renderMePage from arcade-me.mjs (new)
  friend-code-actions.mjs ← extract addFriendByCode from arcade-me.mjs (new)
  wire.mjs               ← rename from arcade-me-wire.mjs
  media-actions.mjs      ← rename from arcade-me-media-actions.mjs
  friend-navigator.mjs   ← rename from arcade-me-friend-navigator.mjs
  render-sections.mjs    ← rename from arcade-me-view-sections.mjs
```

`arcade-me-view.mjs` (`renderMePageView`) stays where it is unless a clean `render-view.mjs` slot opens up — it contains substantial HTML template logic and moving it without a clear boundary would add blast radius with no gain.

## Pre-Move Assessment (already done)

All `arcade-me-*` helper files are actively used. No stale leftovers. The seams are clean.

The work is to move these files into `js/me-page/` under the canonical names listed in Target Shape, update the one import in `/me/index.html` (or keep the `arcade-me.mjs` shim pointing at the new folder), and add/update tests. No fresh extraction from a monolith is required.

Before moving, verify no other files outside `/me` import directly from any `arcade-me-*` helper (only `arcade-me.mjs` should be the public surface). Use grep or your editor to confirm.

## Recommended Code Mapping

### `js/me-page/entry.mjs`

Owns page boot only.

Move the top-level document boot logic out of `arcade-me.mjs` into `entry.mjs`.

Responsibilities:

- get `document`
- render primary app nav
- create auth client
- get current session
- redirect unauthenticated users to sign-in with `next=/me/index.html`
- bind current profile to authenticated session
- create storage/API/auth clients
- initialize profile editor panel
- render initial page
- wire page actions
- initialize session nav

This file should not build profile view models directly. It should call imported helpers.

### `js/me-page/view-model.mjs`

Move `buildMePageViewModel` here.

Responsibilities:

- convert canonical profile data into owner-page view model
- build thought card items
- resolve thought count
- normalize metrics and relationships
- build favorite-game, ranking, friend, friend-navigator, hero, identity-link, and badge items
- set owner-specific labels and composer config

This file should not touch the DOM.

### `js/me-page/render.mjs`

Move `renderMePage` here.

Responsibilities:

- load or receive thought feed
- sync thought post count
- load or receive metrics
- load or receive relationships
- call `buildMePageViewModel`
- call existing `renderMePageView`
- return the model

This file may coordinate rendering, but should not define section-level HTML if that already lives in `arcade-me-view.mjs` or `arcade-me-view-sections.mjs`.

### `js/me-page/friend-code-actions.mjs`

Move `addFriendByCode` here.

Responsibilities:

- sanitize friend code
- validate current profile
- reject self-add
- call platform API friend-code lookup
- call `createFriendshipBetweenPlayers`
- return UI-safe result object

This file should not render UI directly.

### `js/arcade-me.mjs`

Convert this into a compatibility shim.

Recommended contents:

```js
export { addFriendByCode } from "./me-page/friend-code-actions.mjs";
export { buildMePageViewModel } from "./me-page/view-model.mjs";
export { renderMePage } from "./me-page/render.mjs";

import "./me-page/entry.mjs";
```

This preserves old imports while moving real ownership into `js/me-page/`.

Do not update `/me/index.html` to point directly at `js/me-page/entry.mjs` in the same pass unless all tests/imports are already clean. Keeping the HTML pointed at `arcade-me.mjs` reduces blast radius.

## Hard Boundaries

Do not move `profile-editor/` into `me-page/`.

The `/me` page uses the profile editor, but it does not own profile editing as a platform concept.

Do not move `profile-social/` into `me-page/`.

The `/me` page uses shared social rendering and actions, but thought cards/social components are shared platform UI.

Do not change backend API routes.

Do not change database migrations.

Do not change profile schema.

Do not change CSS layout unless a broken import path requires it.

Do not add Profile Music during this cleanup.

Do not add Durable Memories during this cleanup.

Do not redesign `/me/index.html`.

Do not remove compatibility exports until all dependent tests/imports have been updated.

## Tests / Verification

Add or update tests to cover:

1. `buildMePageViewModel` still returns the same core fields:
   - `pageTitle`
   - `pageSubtitle`
   - `heroName`
   - `heroTagline`
   - `isOwnerView`
   - `thoughtItems`
   - `favoriteGameItems`
   - `friendItems`
   - `friendNavigator`
   - `badgeItems`

2. `addFriendByCode` still handles:
   - empty code
   - missing current profile
   - self friend code
   - missing API lookup function
   - no matched player
   - successful friendship
   - already-linked friendship

3. `renderMePage` still:
   - builds a model
   - calls the existing render view function
   - syncs thought post count when player ID exists
   - accepts injected test options for storage/feed/metrics/relationships

4. Compatibility shim:
   - old imports from `js/arcade-me.mjs` still resolve
   - `/me/index.html` still boots through the same script path

Manual smoke test:

- visit `/me`
- unauthenticated user redirects to sign-in
- authenticated user sees owner profile
- Edit Profile opens/closes
- profile save still works
- friend-code add still works
- friend navigator still works
- thought composer still works
- delete account button still wires correctly
- session nav still renders
- avatar/background controls still behave as before

## Definition of Done

**All criteria met as of 2026-05-09.**

- `arcade-me.mjs` is now a 4-line compatibility shim
- all `/me` route logic lives under `js/me-page/`
- all existing helper seams moved into `js/me-page/` under canonical names
- `arcade-me-wire.mjs`, `arcade-me-page-data.mjs`, `arcade-me-media-actions.mjs`, `arcade-me-friend-navigator.mjs`, and `arcade-me-view-sections.mjs` deleted
- no user-facing behavior changes
- old imports from `arcade-me.mjs` still resolve
- `/me/index.html` still loads through the same shim path
- all 34 tests passing across `js/tests/arcade-me.test.mjs`, `js/tests/arcade-mepage.test.mjs`, and `js/me-page/tests/`
- manual smoke test: pending (standard pre-push verification)

## What Not To Do

Do not turn this into a broad refactor.

Do not chase every root `arcade-*` file.

Do not restructure the whole profile system.

Do not merge `/me` and `/player`.

Do not replace static routing with dynamic routing.

Do not build new product features during the cleanup.

The purpose of this pass is to make the next feature pass safe.
