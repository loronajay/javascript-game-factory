# Shared Frontend CSS

This folder contains shared styles for the arcade shell and platform pages.

## What lives here

Every platform page loads only the files it needs — there is no single global bundle.

**Shell and layout**

- `arcade.css` — base tokens and shell primitives, loaded everywhere
- `session-nav.css` — the signed-in nav/session bar (authored once in `js/arcade-session-nav.mjs`, never per page)
- `page-stage.css` — the shared centred page column
- `mobile-landscape.css` — the landscape gate / small-viewport shell rules

**Route pages**

- `home.css`, `grid.css`, `grid-stage.css`
- `auth.css` — sign-in, sign-up, forgot/reset password
- `activity.css`, `bulletins.css`, `event.css`, `events.css`
- `gallery.css` + `gallery-viewer.css` (the photo viewer overlay)
- `messages.css`, `notifications.css`, `search.css`
- `thoughts.css`, `thoughts-stage.css`, `thoughts-feed.css`

**Profile surfaces** — shared between `/me` and `/player` unless noted

- `profile-page.css` — the shared layout grid, panel shell, and 980px collapse
- `profile-stage.css`, `profile-hero.css`, `profile-hero-card.css`
- `profile-identity.css`, `profile-rail.css`, `profile-featured-cabinet.css`
- `profile-social.css`, `profile-music.css` (mini player widget + editor slots)
- `profile-layout.css` — the `/me/layout/` composition editor
- `profile-editor-card.css`, `me-edit.css` — the `/me/edit/` content editor
- `me.css` — owner-only
- `player.css` — public-profile-only

## Working guidance

- Keep shared platform styling here, not inside game folders.
- Keep cabinet-local styling inside the relevant game folder.
- When a page has multiple style concerns, prefer small focused files over turning one stylesheet into the owner of unrelated page sections.
- Owner-only rules belong in `me.css` and public-only rules in `player.css`; anything both profiles share belongs in the `profile-*.css` layers so the two pages cannot drift.
