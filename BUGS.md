# Bugs

## Progress update (2026-04-29)

Completed in current pass:
- Fixed broken gesture/message emoji mojibake on the player page.
- Fixed friends rail profile pictures so they clamp to the intended avatar box size.
- Fixed gallery double-submit behavior by adding an in-progress upload state and disabling owner gallery controls while upload/save is running.
- Fixed direct Home navigation from the messages inbox and message thread pages.
- Fixed reaction-state clarity so already-reacted posts render as reacted across shared thought-card surfaces while still allowing reaction changes.
- Fixed the empty owner favorite card so it now performs the expected click behavior and opens the favorite picker instead of only looking clickable.
- Fixed the `/me` page panel layout so the photo gallery grows inside its own column stack instead of pushing the lower right-side panels down the page.

Partially addressed:
- Navigation UI/UX still needs a broader cleanup pass, but the specific "can't get home from messages" issue is fixed now.

## Remaining bugs

## need to seriously improve the ui/ux for navigation. it just seems like there is a huge number of boxes on some pages, and navigating to the homepage is not possible from the messages page. navigation across the board just feels a little sloppy.

## Lovers Lost has two huge files game.js and renderer.js, i think those need to be broken up into modules too. Bad architectural practice.

## Same with Battleshits and game.js and style.css, the files are way too large. Bad architectural practice.

## The root css folder also has gigantic css files that should be broken up too, there should be no reason to have giant files.

## relationship.mjs, thoughts.mjs, and others are still large files that are likely owning too much logic.

## Architecture cleanup status (2026-04-29)

Completed:
- `js/platform/activity/` split into schema / normalize / store / builders / api with thin barrel
- `js/platform/relationships/` split into schema / normalize / store / slots / mutations with thin barrel
- `js/profile-social/` established as a subsystem for shared social rendering/actions/state
- `js/profile-editor/` established as a subsystem for profile editor constants / form fields / view-model / persistence / panel
- `js/player-page/` established as a subsystem for player-page page/render/wire modules, loader, view-model shaping, and page controllers
- `js/thoughts-page/` established as a subsystem for thoughts-page page/view-model/render/actions ownership
- `js/platform/thoughts/thoughts-cards.mjs` now owns thought-card/view-model shaping
- `js/arcade-player.mjs`, `js/arcade-player-wire.mjs`, and `js/arcade-player-view.mjs` reduced to compatibility shims over `js/player-page/`
- `js/arcade-thoughts.mjs` reduced to a compatibility shim over `js/thoughts-page/`
- `/player/index.html` and `/thoughts/index.html` now point at their subsystem entry modules
- root `js/*.test.mjs` files moved into `js/tests/`
- subsystem tests moved into `js/profile-editor/tests/` and `js/profile-social/tests/`

Still needs cleanup after the current folder move:
- `/me` still needs a decision on whether it has stable enough boundaries for a real `js/me-page/` subsystem
- the root `css/` folder still has giant files that need the same seam-first cleanup
- large game-local monoliths like `Lovers Lost` and `Battleshits` still need architecture cleanup

Folderization follow-up:
- `js/player-page/` and `js/thoughts-page/` are now real subsystems; preserve them as the canonical homes for those page concerns
- only introduce `js/me-page/` if we can move stable ownership boundaries there instead of creating another dump folder
- later audit `Lovers Lost`, `Battleshits`, and the root CSS files with the same architecture rules
