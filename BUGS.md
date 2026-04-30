# Bugs

## We need to switch to percentages in general across the board (all pages) instead of hardcoding page element positions, to account for different monitor sizes/mobile web viewers etc. viewing a friend's profile on mobile is completely broken, panels are merging into each other, and panels are so thin i can't see the contents. only the gallery and title really survive.

## The root `css/` folder still has oversized files and should keep following the seam-first split.



## Remaining architecture / polish backlog

- `Lovers Lost` still has oversized files (`game.js`, `renderer.js`) that should be broken into modules.
- `Battleshits` still has oversized files (`game.js`, `style.css`) that should be broken into modules.
- Navigation UI/UX can still be polished further

## Architecture cleanup status (2026-04-29)

Completed:
- `js/platform/activity/` split into schema / normalize / store / builders / api with thin barrel
- `js/platform/relationships/` split into schema / normalize / store / slots / mutations with thin barrel
- `js/profile-social/` established as a subsystem for shared social rendering/actions/state
- `js/profile-editor/` established as a subsystem for profile editor constants / form fields / view-model / persistence / panel
- `js/player-page/` established as a subsystem for player-page page/render/wire modules, loader, view-model shaping, and page controllers
- `js/thoughts-page/` established as a subsystem for thoughts-page page/view-model/render/actions ownership
- signed-in primary navigation is now centralized in `js/arcade-session-nav.mjs` instead of being hand-authored separately on each major social page
- shared signed-in nav/session styling has started moving out of `css/arcade.css` into `css/session-nav.css`
- shared profile gallery/composer styling has started moving out of `me.css` and `player.css` into `css/profile-social.css`
- shared `/me` and `/player` panel/title/support-card styling has started moving out of `me.css` and `player.css` into `css/profile-page.css`
- shared `/me` and `/player` hero support-rail styling has started moving out of `me.css` and `player.css` into `css/profile-hero.css`
- shared `/me` and `/player` hero-card skin/backdrop/portrait/identity styling has started moving out of `me.css` and `player.css` into `css/profile-hero-card.css`
- shared `/me` and `/player` featured-cabinet styling has started moving out of `me.css` and `player.css` into `css/profile-featured-cabinet.css`
- shared `/me` and `/player` identity-field scaffolding has started moving out of `me.css` and `player.css` into `css/profile-identity.css`
- shared `/me` and `/player` left-rail panel shell/layout styling has started moving out of `me.css` and `player.css` into `css/profile-rail.css`
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
