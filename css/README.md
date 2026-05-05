# Shared Frontend CSS

This folder contains shared styles for the arcade shell and platform pages.

## What lives here

- route-level styles such as `activity.css`, `bulletins.css`, `event.css`, `events.css`, `gallery.css`, `me.css`, `messages.css`, `notifications.css`, `player.css`, `search.css`, and `thoughts.css`
- shared layout and shell styles such as `arcade.css`, `home.css`, `grid.css`, `page-stage.css`, and `session-nav.css`
- profile-specific style layers such as `profile-page.css`, `profile-hero.css`, `profile-social.css`, and related profile card styles

## Working guidance

- Keep shared platform styling here, not inside game folders.
- Keep cabinet-local styling inside the relevant game folder.
- When a page has multiple style concerns, prefer small focused files over turning one stylesheet into the owner of unrelated page sections.
