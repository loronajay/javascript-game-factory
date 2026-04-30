# Bugs

## Status snapshot (2026-04-29)

Tracked platform/UI bugs from this pass are fixed in code and ready for manual verification.

## Resolved in code

- Fixed broken gesture/message emoji mojibake on the player page.
- Fixed friends rail profile pictures so they clamp to the intended avatar box size.
- Fixed gallery double-submit behavior by adding an in-progress upload state and disabling owner gallery controls while upload/save is running.
- Fixed direct `Home` navigation from the messages inbox and message thread pages.
- Fixed reaction-state clarity so already-reacted posts render as reacted across shared thought-card surfaces while still allowing reaction changes.
- Fixed the empty owner favorite card so it now performs the expected click behavior and opens the favorite picker instead of only looking clickable.
- Fixed the `/me` page panel layout so the photo gallery grows inside its own column stack instead of pushing the lower right-side panels down the page.
- Fixed the `/me` friend navigator so friends stay hidden until the owner opens the panel, the button actually opens the list, and the in-panel search filters the full linked-friend list.
- Replaced page-specific signed-in nav clusters with a shared primary shell across `/me`, `/player`, `/thoughts`, `/activity`, `/search`, `/messages`, and `/notifications`.
- Restored a direct `Home` route inside the shared signed-in shell so the public homepage is reachable from the major signed-in pages.
- Fixed the shared notification bell styling contract on `/search`, `/thoughts`, `/activity`, and `/player` so the bell and dropdown no longer render as broken unstyled boxes on those pages.
- Reduced shared-nav clutter by removing the duplicate `Notifications` tab, grouping the shell into a dedicated tab row plus utility cluster, and making the bell the primary notifications entry with a `View all` path.
- Reduced stacked chrome on `/search`, `/messages`, `/notifications`, `/thoughts`, and `/activity` by collapsing the nav and page title areas into unified masthead surfaces instead of separate top boxes.
- Moved the notifications page's one-off inline styles back into `css/notifications.css` so that surface uses shared stylesheet ownership again.
- Continued the root CSS seam cleanup with these extracted shared files:
  - `css/session-nav.css`
  - `css/profile-social.css`
  - `css/profile-page.css`
  - `css/profile-hero.css`
  - `css/profile-hero-card.css`
  - `css/profile-featured-cabinet.css`
  - `css/profile-identity.css`
  - `css/profile-rail.css`

## Manual verification checklist

Use this before starting game architecture work:

- `/player`: confirm gesture labels render correctly and message/challenge controls still work.
- `/me` and owner-view `/player`: confirm reacting to an already-reacted thought is clearly presented and reaction changes still work.
- `/me`: open the Friends toggle, confirm the dropdown opens, scrolls, filters by search text, and links through to player pages.
- `/me`: try the empty favorite card and confirm clicking it opens the favorite picker instead of doing nothing.
- `/me`: start a gallery upload and confirm duplicate submit is blocked while the upload is in flight.
- `/me`: confirm the gallery grows inside its own column without shoving lower right-rail panels down the page.
- `/messages` and `/messages/conversation`: confirm the shared signed-in shell renders and the direct `Home` route works.
- `/search`, `/thoughts`, `/activity`, `/player`, `/notifications`: confirm the notification bell/dropdown is styled correctly and the full notifications page still works.
- Signed-in pages generally: confirm the shared shell order, active-state styling, and unified masthead layout feel consistent.

## No open reproducible platform bugs currently tracked

What remains before game work is architecture and polish, not a known unresolved functional bug on the platform pages.

## Remaining architecture / polish backlog

- Navigation UI/UX can still be polished further, but it is no longer tracked here as a known broken route/interaction bug.
- `Lovers Lost` still has oversized files (`game.js`, `renderer.js`) that should be broken into modules.
- `Battleshits` still has oversized files (`game.js`, `style.css`) that should be broken into modules.
- The root `css/` folder still has oversized files and should keep following the seam-first split.

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
