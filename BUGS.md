# Bugs

## You broke my gesture emojis, now it's just nonsense instead of the emojis: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-29 100751.png"

## need profile pics on friends rail to clamp to default box size: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-28 204916.png"

## I reacted to his photo from his page, but when i view this post from the "thoughts" feed i still have the option to react and i shouldn't: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-28 205236.png"

## Need to improve the GUI: Drellgor got a double upload because he clicked the button twice, button needs to be replaced with a sign that it's currently loading, and not allow users to click while an upload is in progress.

## Pin a Favorite box while empty still has effect on hover making it seem clickable if you are the owner of the page you might think you can click there and pin your favorite, however it's not clickable unless the game's been set in the profile editor. i think users should be able to pin the favorite from the page as well only if there's no game pinned there already. this will lead to less user confusion on first profile creation.

## need to seriously improve the ui/ux for navigation. it just seems like there is a huge number of boxes on some pages, and navigating to the homepage is not possible from the messages page. navigation across the board just feels a little sloppy.

## Uploading 3 photos has pushed my lower panels all the way down, need to improve the ui so that nothing is getting pushed down on photo upload. possibly move the delete profile panel, and have the badges panel not rely on the bottom of the photo gallery panel: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-28 210736.png"

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
