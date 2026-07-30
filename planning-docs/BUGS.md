# Bugs

## Active

- **Layout editor/profile rendering manual QA follow-up (as of 2026-05-18)**: The major live-panel regressions from the 2026-05-16 pass have been addressed: panels scale content down to the user-selected box instead of adding panel-level scrollbars, the hero card respects its grid placement again, hero content is centered inside its scaling shell, the thoughts feed remains intentionally scrollable, and friend/top-friends-style panels get a post-image-load rescale to avoid bottom clipping. The editor grid overlay now uses real grid cells instead of a decorative background. The editor now uses live `/me` renderers/CSS/style variables for all current profile panels instead of fake placeholders. Still do a manual browser pass after deploy/static refresh, especially for tiny panels, hero resize/drag behavior, gradients on each panel type, thoughts internal scrolling, and public `/player` pages with real friend data.

## Resolved

- **Creature Battler's test suite could not load (fixed 2026-07-30).** All eight test files are CommonJS but there was no `package.json` under `games/creature-battle/`, so they inherited `"type": "module"` from the repo root and died at load with `ReferenceError: require is not defined in ES module scope`. Added `games/creature-battle/package.json` with `"type": "commonjs"` and a `test` script. Once they actually ran, four stale expectations surfaced and were fixed: sound asset paths missing the `creature-battler/` prefix, missing sandbox stubs for the end-of-round and class-system collaborators, and `SPD DOWN` labels that the engine now reports as stat-stage deltas (`SPD -1`). 8/8 green via `npm test`.

- **Battleshits `npm test` skipped three passing suites (fixed 2026-07-30).** `audio.test.js`, `bot.test.js`, and `emojis.test.js` were omitted from the chained script, leaving the bot AI, SFX controller, and emote mapping unguarded. Added to the `test` script plus focused `test:bot` / `test:audio` / `test:emojis` entries. 11 suites green.

- **Mini-Tactics main-menu test (fixed 2026-07-30) — not a product bug.** `tests/main-menu.test.js` asserted a "Tutorials" button on the main menu. Removing that button was **intentional**; the test was the stale side. It now asserts the button's *absence* so the intent is pinned, while still checking the tutorial completion screen is wired. `mainMenuScreen.js` binds `startTutorial` optionally, so the menu works either way. 143/143 green.

- **Comment deletion (fixed 2026-07-25).** Thought and photo comments can now be deleted by the comment author or by the owning post author / photo owner, enforced server-side from the verified session. The same pass added auth to every thought mutation and cleared the notifications that referenced deleted content. See the Comment Moderation entry in `CHANGELOG.md`; `COMMENT_DELETE_PLAN.md` is now design history.

## Notes

- Old architecture-cleanup notes about `normalize.mjs`, `app.mjs`, `relationships.mjs`, and the `/me` subsystem decision were removed from this file because those are no longer active bugs. Current ownership lives in `ARCHITECTURE_HANDOFF.md`.
