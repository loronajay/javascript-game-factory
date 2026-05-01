# Bugs

## My page view (loronajay) vs Drellgor's page view. Mine is these screenshots: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091558.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091612.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091629.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091640.png". Drellgor's is these screenshots: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091516.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091532.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 091545.png"

## Remaining architecture / polish backlog

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

Folderization follow-up:
- `js/player-page/` and `js/thoughts-page/` are now real subsystems; preserve them as the canonical homes for those page concerns
- only introduce `js/me-page/` if we can move stable ownership boundaries there instead of creating another dump folder
