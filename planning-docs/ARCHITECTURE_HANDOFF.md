# Architecture Cleanup Handoff

Last updated: 2026-05-15

This doc is the source-of-truth handoff for the current architecture cleanup pass. Use it after a context clear instead of reconstructing history from chat.

## Read This First

1. `ARCHITECTURE_HANDOFF.md`
2. `PLATFORM_IMPLEMENTATION_PLAN.md`
3. `BUGS.md`
4. `CLAUDE.md`

## Current State

Completed:
- `platform-api/src/app.mjs` started moving toward route-family ownership:
  - shared HTTP helpers extracted to `platform-api/src/http-utils.mjs`
  - auth endpoints extracted to `platform-api/src/routes/auth-routes.mjs`
  - message endpoints extracted to `platform-api/src/routes/message-routes.mjs`
  - notification endpoints extracted to `platform-api/src/routes/notification-routes.mjs`
  - thought endpoints extracted to `platform-api/src/routes/thought-routes.mjs`
  - photo endpoints extracted to `platform-api/src/routes/photo-routes.mjs`
  - player/relationship endpoints extracted to `platform-api/src/routes/player-routes.mjs`
  - seam coverage added in `platform-api/tests/auth-routes.test.mjs`
  - seam coverage added in `platform-api/tests/message-routes.test.mjs`
  - seam coverage added in `platform-api/tests/notification-routes.test.mjs`
  - seam coverage added in `platform-api/tests/thought-routes.test.mjs`
  - seam coverage added in `platform-api/tests/photo-routes.test.mjs`
  - seam coverage added in `platform-api/tests/player-routes.test.mjs`
- `js/platform/activity/` split into schema / normalize / store / builders / api with thin barrel
- `js/platform/relationships/` split into schema / normalize / store / slots / mutations with thin barrel
- `js/profile-social/` established for shared profile social rendering/actions/composer state
- `js/profile-editor/` established for profile editor constants / form fields / view-model / persistence / panel
- `js/player-page/` established for player-page page/render/wire modules, loader, action view-model, page view-model, and page controllers
- `js/thoughts-page/` established for thoughts page page/view-model/render/actions modules and seam tests
- `js/arcade-session-nav.mjs` now owns the shared signed-in primary navigation shell instead of repeating different nav clusters across each social page
- signed-in page chrome is now more consistent: shared shell, direct `Home` route, fixed notification bell contract, and unified mastheads on the utility/feed pages
- owner `/me` layout now uses explicit panel placement and a deliberate mid-desktop reflow instead of leaving the feed/about/badges stack to fight inside ambiguous wrapper columns
- public `/player` mobile layout now fully resets panel placement at phone widths instead of leaving desktop grid columns active and crushing the feed/about/badges stack
- `js/platform/thoughts/thoughts-cards.mjs` now owns thought-card/view-model shaping
- `js/arcade-profile.mjs` reduced to a thin compatibility barrel
- `js/arcade-player.mjs`, `js/arcade-player-wire.mjs`, and `js/arcade-player-view.mjs` reduced to thin compatibility shims over `js/player-page/`
- `js/arcade-thoughts.mjs` reduced to a thin compatibility shim over `js/thoughts-page/`
- `/player/index.html` and `/thoughts/index.html` now point at their subsystem entry modules
- `/me` now includes an owner-only expandable/searchable friend navigator rather than relying only on the visible hero rail
- `/me` composition now more closely matches the public-profile intent: left hero rail, center owner-utility lane, dedicated feed lane on desktop, then a full-width feed row before tablet/mobile collapse
- `/player` now collapses into a readable single-column phone layout instead of leaving some right-rail panels trapped in implicit narrow columns on mobile
- shared profile CSS seam extraction complete; profile CSS ownership cleanup pass also complete:
  - `css/session-nav.css`
  - `css/profile-social.css`
  - `css/profile-page.css` — now owns shared layout grid, column base, panel shell (layout + visual decoration unified), and 980px responsive collapse for both `/me` and `/player`
  - `css/profile-hero.css`
  - `css/profile-hero-card.css`
  - `css/profile-featured-cabinet.css`
  - `css/profile-identity.css`
  - `css/profile-rail.css`
  - `css/me.css` — now mostly `/me`-specific: theme vars, background, 1480px reflow, friend navigator, danger panel, panel ordering
  - `css/player.css` — now mostly `/player`-specific: theme vars, background, nav/back/portal, gesture rail, challenge picker, friend/message actions
- shared page-shell framing is now more explicit too:
  - `css/page-stage.css`
  - `css/grid-stage.css`
  - `css/profile-editor-card.css`
  - `css/gallery-viewer.css`
  - `css/thoughts-stage.css`
  - `css/thoughts-feed.css`
- `js/gallery-page/` now owns shared gallery-page loader/render/wire behavior plus the reusable full-view photo viewer used by gallery, profile, and thoughts surfaces
- primary nav rail is now uniform across all non-home pages; Bulletins, Thoughts, Activity added to `PRIMARY_APP_NAV_ITEMS` in `arcade-session-nav.mjs`; `bulletins/index.html` and `grid.html` migrated from bespoke nav markup to the standard `renderPrimaryAppNav` + `initSessionNav` wiring
- `js/platform/api/auth-token.mjs` added as a thin localStorage token store; login/register now return `token` in the response body; `auth-api.mjs` stores and sends the token as `Authorization: Bearer`; `platform-api.mjs` attaches the header on all requests including uploads; backend `extractTokenFromRequest` checks Bearer header first, falls back to cookie — resolves cross-origin cookie blocking in Edge, Safari, and strict-privacy browsers
- root test files moved from `js/*.test.mjs` into `js/tests/`
- subsystem tests moved into `js/profile-editor/tests/` and `js/profile-social/tests/`
- previously failing baseline tests cleaned back to green:
  - `js/tests/arcade-event-detail.test.mjs`
  - `js/tests/arcade-thoughts.test.mjs`
  - `js/tests/deployment-config.test.mjs`
  - `js/tests/platform-plan.test.mjs`

## Repo Shape As Of 2026-05-15

- live cabinet entries in `js/arcade-catalog.mjs` are currently `lovers-lost`, `battleshits`, `echo-duel`, `circuit-siege`, and `illuminauts`
- `circuit-siege` is a fully playable online 1v1 route-repair puzzle game; Phase 4a UX polish complete; see `games/circuit-siege/PHASE4_HANDOFF.md` for next steps
- `illuminauts` is a 2-player online maze race; Phase 4 online code complete, ready for first playtest
- `echo-duel` is an active 2-6 player online prototype with a host-authoritative lobby model; if resuming cabinet work there, start with `games/echo-duel/README.md` and `games/echo-duel/ECHO_DUEL_NEXT_AGENT_HANDOFF.md`
- `build-buddy` is currently GDD-only in `games/build-buddy/BUILD_BUDDY_GDD.md`
- `questionable-decisions` is currently a scoped docs-first workstream under `games/questionable-decisions/`, including a base GDD plus multiple penalty mini-game GDDs
- `creature-battle` is currently docs/simulator-heavy under `games/creature-battle/` with combat-system docs, progression docs, creature scope docs, battle-scene canon docs, and tuning simulators; it is not a grid-listed cabinet yet

## Pre-TypeScript Gate

Do not start the repo-wide TypeScript migration yet. The active workstream is still architecture cleanup across the API, shared frontend, and the long-lived game cabinets.

Exit criteria before re-scoping TypeScript:
- `platform-api/src/app.mjs` is mostly orchestration and route dispatch, not a mixed route/business-rule file
- shared frontend page entries have clearer ownership around `page`, `render`, `wire`, and `actions`
- the largest shared renderers/controllers are split by responsibility instead of only by file size
- active game entry points are mostly composition and fixed-timestep orchestration, not the long-term home for UI, network, input, and business rules

## Repo-Wide Cleanup Order

1. `platform-api/` route-family extraction
   Why first:
   - backend contracts feed every shared page, so mixed routing/business logic there will make the later TypeScript pass much harder.

   Current state:
   - auth is already extracted
   - messages are already extracted
   - notifications are already extracted
   - thoughts are already extracted
   - photos are already extracted
   - players and relationship mutations are already extracted

   Next targets:
   - friend requests / challenges if we want a nearly route-only backend shell before switching to domain-module cleanup
   - otherwise move directly into `platform-api/src/db/relationships.mjs`, `platform-api/src/db/thoughts.mjs`, and `platform-api/src/normalize.mjs`

2. `platform-api/` domain/db module cleanup
   Why next:
   - route extraction alone is not enough if the DB modules still mix query logic, normalization, and score/mutation rules.

   Main hotspots:
   - `platform-api/src/db/relationships.mjs`
   - `platform-api/src/db/thoughts.mjs`
   - `platform-api/src/normalize.mjs`

   Current state:
   - `platform-api/src/db/relationships.mjs` now delegates pure relationship-state shaping into `platform-api/src/db/relationships-domain.mjs`
   - `platform-api/src/db/thoughts.mjs` now delegates pure thought/viewer-state shaping into `platform-api/src/db/thoughts-domain.mjs`
   - `platform-api/src/normalize.mjs` is now a thin barrel over domain-specific modules:
     `platform-api/src/normalize-activity.mjs`,
     `platform-api/src/normalize-metrics.mjs`,
     `platform-api/src/normalize-profiles.mjs`,
     `platform-api/src/normalize-relationships.mjs`,
     `platform-api/src/normalize-thoughts.mjs`
   - transaction/query flow is still in `relationships.mjs`, which is the right remaining ownership boundary for now
   - transaction/query flow is still in `thoughts.mjs`, which is the right remaining ownership boundary for now

   Next targets:
   - review whether `platform-api/src/db/thoughts-domain.mjs` and `platform-api/src/db/relationships-domain.mjs` should share any small cross-cutting normalization helpers, or stay intentionally separate
   - shift primary cleanup focus to shared frontend ownership seams unless a new backend hotspot appears

3. shared frontend page ownership cleanup — **COMPLETE**
   All major shared frontend hotspots have been resolved.

   Original hotspots (all resolved):
   - `js/arcade-me-wire.mjs` → moved to `js/me-page/wire.mjs`
   - `js/arcade-me-view.mjs` → section rendering extracted to `js/me-page/render-sections.mjs`; view file stays at root as HTML template layer
   - `js/gallery-page/viewer.mjs` → state/social/page-actions/page-controller seams extracted
   - `js/profile-social/social-view.mjs` → thought-card rendering extracted to `social-view-thoughts.mjs`

   Current state:
   - **`js/me-page/` subsystem is now complete** — all `/me` page logic moved out of root `arcade-me-*` files into a dedicated subsystem folder matching the established `player-page/`, `thoughts-page/`, `gallery-page/`, `profile-editor/`, and `profile-social/` pattern
   - `js/arcade-me.mjs` is now a 4-line compatibility shim re-exporting from `js/me-page/`; all old import paths preserved
   - `js/me-page/` contains: `entry.mjs` (boot/auth), `view-model.mjs` (buildMePageViewModel), `render.mjs` (renderMePage), `friend-code-actions.mjs` (addFriendByCode), `wire.mjs`, `page-data.mjs`, `media-actions.mjs`, `friend-navigator.mjs`, `render-sections.mjs`
   - `js/me-page/tests/` contains seam tests for all four extracted/moved modules
   - `arcade-me-wire.mjs`, `arcade-me-page-data.mjs`, `arcade-me-media-actions.mjs`, `arcade-me-friend-navigator.mjs`, and `arcade-me-view-sections.mjs` are deleted
   - `js/arcade-me-view.mjs` (`renderMePageView`) stays at root — it has substantial HTML template logic and a clean boundary; no blast-radius reason to move it yet
   - `js/gallery-page/viewer.mjs` now delegates navigation/reaction-picker/current-photo/social-state bookkeeping into `js/gallery-page/viewer-state.mjs`
   - `js/gallery-page/viewer.mjs` now delegates reaction-chip/comment/date markup shaping into `js/gallery-page/viewer-social.mjs`
   - `js/gallery-page/viewer.mjs` now delegates session caching and photo social reload/mutation flows into `js/gallery-page/viewer-page-actions.mjs`
   - `js/gallery-page/viewer.mjs` now delegates gallery-thumbnail and thought-image click routing into `js/gallery-page/viewer-page-controller.mjs`
   - `js/profile-social/social-view.mjs` now delegates shared thought-card/comment/share/reaction rendering into `js/profile-social/social-view-thoughts.mjs`, with escaping/date helpers shared through `js/profile-social/social-view-shared.mjs`

   Next targets:
   - shared frontend cleanup is now far enough along to shift primary attention to the long-lived game hotspots in `games/lovers-lost/` and `games/echo-duel/`
   - after that, reassess whether `js/gallery-page/viewer.mjs` should lose its last leftover inline gallery helper/constants or whether the remaining shared frontend files are clean enough to pause

4. game architecture cleanup for the long-lived cabinets
   Why before TypeScript:
   - online/networked cabinets will benefit from types later, but only after their entry points stop being the default home for UI, network, input, and loop management together.

   Main hotspots:
   - `games/lovers-lost/scripts/init-game.js`
   - `games/echo-duel/scripts/online-session-controller.js`
   - `games/echo-duel/scripts/renderer.js`
   - `games/battleshits/game.js`
   - `games/battleshits/scripts/online.js`

5. only after the above, re-scope the TypeScript plan
   Why:
   - that is the point where types will reinforce stable contracts instead of freezing accidental architecture in place

## Next Hotspots

1. CSS ownership — **COMPLETE**
   The profile CSS ownership cleanup pass is done. `profile-page.css` now owns all shared profile layout and panel shell primitives. `me.css` and `player.css` are now mostly page-specific. No further CSS cleanup is blocking Profile Music or the next feature pass.


## Folder Reorg — Stable Shape

All the main page-subsystem folders are now in place. Do not introduce new subsystem folders without stable ownership boundaries.

Canonical subsystem layout:
- `js/me-page/` — `/me` owner profile page (complete)
- `js/player-page/` — `/player` public profile page (complete)
- `js/thoughts-page/` — `/thoughts` feed page (complete)
- `js/gallery-page/` — gallery viewer (complete)
- `js/profile-editor/` — profile editor panel (complete)
- `js/profile-social/` — shared social rendering and actions (complete)
- `js/platform/` — shared domain/data layer (complete)
- tests in dedicated `tests/` subfolders, never mixed into source roots

## Verification Baseline

Useful commands after each cleanup step:

```powershell
node .\js\tests\arcade-player.test.mjs
node .\js\tests\arcade-playerpage.test.mjs
node .\js\tests\arcade-me.test.mjs
node .\js\tests\arcade-mepage.test.mjs
node .\js\tests\arcade-session-nav.test.mjs
node .\js\tests\arcade-searchpage.test.mjs
node .\js\tests\arcade-thoughts.test.mjs
node .\js\tests\arcade-thoughtspage.test.mjs
node .\js\tests\arcade-activitypage.test.mjs
node .\js\tests\arcade-messagespage.test.mjs
node .\js\tests\arcade-notificationspage.test.mjs
node .\js\profile-editor\tests\view-model.test.mjs
node .\js\profile-editor\tests\persistence.test.mjs
node .\js\profile-editor\tests\panel.test.mjs
node .\js\profile-social\tests\social-actions.test.mjs
node .\js\me-page\tests\friend-navigator.test.mjs
node .\js\me-page\tests\media-actions.test.mjs
node .\js\me-page\tests\page-data.test.mjs
node .\js\me-page\tests\render-sections.test.mjs
node .\js\tests\platform-plan.test.mjs
```

Previously repaired baseline tests:

```powershell
node .\js\tests\arcade-event-detail.test.mjs
node .\js\tests\arcade-thoughts.test.mjs
node .\js\tests\deployment-config.test.mjs
node .\js\tests\platform-plan.test.mjs
```

## Working Rules For The Next Person

- Do not revert the new test-folder layout.
- Prefer thin compatibility barrels when moving ownership into a new subsystem folder.
- Keep TDD strict: add seam tests first for each new split.
- Keep the signed-in shell centralized in `js/arcade-session-nav.mjs`; do not go back to hand-editing bespoke nav link clusters per page unless a page truly needs a contextual exception.
- Treat `BUGS.md` as split between manual-QA-ready platform bug fixes and longer-term architecture backlog.
- If a module is large but cohesive, move it later; prioritize mixed-responsibility files first.
- If the task is game-specific rather than platform-specific, prefer the cabinet-local docs first (`games/echo-duel/ECHO_DUEL_NEXT_AGENT_HANDOFF.md`, `games/build-buddy/BUILD_BUDDY_GDD.md`, `games/questionable-decisions/`, `games/creature-battle/`) before expanding platform cleanup scope.
