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
- `js/player-page/` established for player-page page/render/wire modules, loader, action view-model, page view-model, and page controllers
- `js/thoughts-page/` established for thoughts page page/view-model/render/actions modules and seam tests
- `js/platform/thoughts/thoughts-cards.mjs` now owns thought-card/view-model shaping
- `js/arcade-profile.mjs` reduced to a thin compatibility barrel
- `js/arcade-player.mjs`, `js/arcade-player-wire.mjs`, and `js/arcade-player-view.mjs` reduced to thin compatibility shims over `js/player-page/`
- `js/arcade-thoughts.mjs` reduced to a thin compatibility shim over `js/thoughts-page/`
- `/player/index.html` and `/thoughts/index.html` now point at their subsystem entry modules
- root test files moved from `js/*.test.mjs` into `js/tests/`
- subsystem tests moved into `js/profile-editor/tests/` and `js/profile-social/tests/`
- previously failing baseline tests cleaned back to green:
  - `js/tests/arcade-event-detail.test.mjs`
  - `js/tests/arcade-thoughts.test.mjs`
  - `js/tests/deployment-config.test.mjs`
  - `js/tests/platform-plan.test.mjs`

## Next Hotspots After The Current Folder Move

1. remaining root-owned page files around `/me`
   Why they matter:
   - we now have stable `player-page` and `thoughts-page` folders, but `/me` ownership still sits more loosely in root `js/` files.

   Likely direction:
   - only introduce `js/me-page/` if we can move stable page/render/wire ownership there, not just shuffle files.

2. CSS folder breakup
   Why it matters:
   - the root `css/` folder still contains oversized page stylesheets that cost context and blur ownership.

3. large game-local monoliths
   Why they matter:
   - `Lovers Lost`, `Battleshits`, and similar game files still violate the same architecture rules we just enforced in platform code.

## Cleanup Order

Do this in order:
1. decide whether `/me` has stable enough seams for `js/me-page/`
2. continue the broader page-folder/path cleanup only where ownership is already clear
3. split oversized CSS and game-local monoliths with the same seam-first rule

## Folder Reorg Goal

The next broad folder move should happen only where ownership is already stable enough that folders reflect real boundaries instead of temporary dumping grounds.

Target direction:
- `js/player-page/`
- `js/thoughts-page/`
- `js/me-page/` only if more shared ownership boundaries become clear
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
- If a module is large but cohesive, move it later; prioritize mixed-responsibility files first.
