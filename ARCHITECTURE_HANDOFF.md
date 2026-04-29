# Architecture Cleanup Handoff

Last updated: 2026-04-29

This doc is the source-of-truth handoff for the current architecture cleanup pass. Use it after a context clear instead of reconstructing history from chat.

## Read This First

1. `ARCHITECTURE_HANDOFF.md`
2. `PLATFORM_IMPLEMENTATION_PLAN.md`
3. `BUGS.md`
4. `CLAUDE.md`

## Current State

Completed:
- `js/platform/activity/` split into schema / normalize / store / builders / api with thin barrel
- `js/platform/relationships/` split into schema / normalize / store / slots / mutations with thin barrel
- `js/profile-social/` established for shared profile social rendering/actions/composer state
- `js/profile-editor/` established for profile editor constants / form fields / view-model / persistence / panel
- `js/player-page/` established for player-page loader, action view-model, page view-model, and page controllers
- `js/arcade-profile.mjs` reduced to a thin compatibility barrel
- `js/arcade-player-wire.mjs` reduced to a thin page shell over hero/media/thought-composer/social controllers
- `js/arcade-player.mjs` reduced to page boot/render orchestration over dedicated `player-page` modules
- root test files moved from `js/*.test.mjs` into `js/tests/`
- subsystem tests moved into `js/profile-editor/tests/` and `js/profile-social/tests/`
- previously failing baseline tests cleaned back to green:
  - `js/tests/arcade-event-detail.test.mjs`
  - `js/tests/arcade-thoughts.test.mjs`
  - `js/tests/deployment-config.test.mjs`
  - `js/tests/platform-plan.test.mjs`

## Remaining Hotspots Before The Bigger Folder Reorg

1. `js/arcade-thoughts.mjs`
   Why it still matters:
   - mixes page loading, thought-card rendering, comment/share sheet rendering, and page interaction flow

   Likely split:
   - `thoughts-page/view-model.mjs`
   - `thoughts-page/render.mjs`
   - `thoughts-page/actions.mjs`

2. `js/platform/thoughts/thoughts-store.mjs`
   Why it still matters:
   - storage / CRUD still lives beside `buildThoughtCardItems`, which is presentation/view-model logic

   Likely split:
   - keep storage / CRUD in `thoughts-store.mjs`
   - move card shaping into `thoughts-cards.mjs` or `thoughts-view-model.mjs`

## Cleanup Order

Do this in order:
1. split `arcade-thoughts.mjs`
2. extract card/view-model shaping out of `thoughts-store.mjs`
3. only then do the broader page-folder and path reorganization

## Folder Reorg Goal

The next broad folder move should happen only after the remaining hotspot files are split enough that folders reflect stable ownership.

Target direction:
- `js/player-page/`
- `js/me-page/` only if more shared ownership boundaries become clear
- `js/thoughts-page/`
- keep `js/profile-editor/`
- keep `js/profile-social/`
- keep `js/platform/` as the shared domain/data layer
- keep tests in dedicated `tests/` folders, never mixed directly into source roots

## Verification Baseline

Useful commands after each cleanup step:

```powershell
node .\js\tests\arcade-player.test.mjs
node .\js\tests\arcade-playerpage.test.mjs
node .\js\tests\arcade-me.test.mjs
node .\js\tests\arcade-mepage.test.mjs
node .\js\tests\arcade-thoughts.test.mjs
node .\js\tests\arcade-thoughtspage.test.mjs
node .\js\profile-editor\tests\view-model.test.mjs
node .\js\profile-editor\tests\persistence.test.mjs
node .\js\profile-editor\tests\panel.test.mjs
node .\js\profile-social\tests\social-actions.test.mjs
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
- Do not start a broad path move before finishing the hotspot splits above.
- Prefer thin compatibility barrels when moving ownership into a new subsystem folder.
- Keep TDD strict: add seam tests first for each new split.
- If a module is large but cohesive, move it later; prioritize mixed-responsibility files first.
