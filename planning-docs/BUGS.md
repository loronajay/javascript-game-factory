# Bugs

## Active

- Thought and photo comments still cannot be deleted by the comment author or by the owning thought/photo owner. Track the implementation details in `COMMENT_DELETE_PLAN.md`.

- **Layout editor/profile rendering manual QA follow-up (as of 2026-05-18)**: The major live-panel regressions from the 2026-05-16 pass have been addressed: panels scale content down to the user-selected box instead of adding panel-level scrollbars, the hero card respects its grid placement again, hero content is centered inside its scaling shell, the thoughts feed remains intentionally scrollable, and friend/top-friends-style panels get a post-image-load rescale to avoid bottom clipping. The editor grid overlay now uses real grid cells instead of a decorative background. The editor now uses live `/me` renderers/CSS/style variables for hero, identity, rankings, top friends, friends, friend code, favorite game, gallery, about, and badges instead of fake placeholders. Still do a manual browser pass after deploy/static refresh, especially for tiny panels, hero resize/drag behavior, gradients on each panel type, music/thoughts live previews, and public `/player` pages with real friend data.

## Notes

- Old architecture-cleanup notes about `normalize.mjs`, `app.mjs`, `relationships.mjs`, and the `/me` subsystem decision were removed from this file because those are no longer active bugs. Current ownership lives in `ARCHITECTURE_HANDOFF.md`.
