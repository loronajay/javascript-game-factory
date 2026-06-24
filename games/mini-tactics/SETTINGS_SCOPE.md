# Mini-Tactics — Settings Scope (v1)

Status: **BUILT** (2026-06-24) — all five v1 settings shipped; headless tests
still 81/81. This was the design contract for the formerly-disabled
`Settings · Soon` button (title + main-menu + in-match toolbar, `index.html`).
Presentation-only by deliberate boundary; gameplay/balance and match-config
settings are explicitly out of scope here.

**As built:**
- `src/ui/settings.js` — store: defaults, load/save to `mini-tactics.settings`,
  and `applySettings()` (pushes into audio buses + the animation-speed lever +
  the `data-theme`/`data-reduce-motion`/`data-colorblind` root attributes).
- `src/ui/settingsModal.js` + `#settingsModal` markup — the overlay; every
  control applies live and persists immediately (no Save button). `app.js` loads
  + applies on boot before first render; reachable via `ctx.openSettings()` from
  title, main menu (`[data-action="settings"]`), and the match toolbar
  (`#settingsBtn`).
- **Audio sliders** — `AudioManager` gained `masterVolume` + `setMasterVolume`/
  `setVolume`/`setMusicVolume`; effective level is master × bus; music updates
  live.
- **Animation speed** — `src/render/timing.js` (`scale()`); every `EffectsRenderer`
  duration/beat and the CPU pacing `sleep()` route through it.
- **Reduce motion** — `render/motion.js` now also honors `data-reduce-motion="on"`;
  `responsive.css` mirrors the OS media query for the attribute.
- **Colorblind palette** — `config.js` `COLORBLIND_PLAYER_COLORS`/
  `COLORBLIND_TEAM_COLORS`, injected at match creation in `GameController.reset()`
  (color isn't hashed → safe per-client online); `tokens.css` mirrors the same
  hues for chrome that reads `--p1..--p4`. **Limitation:** hues bake in at match
  start, so a mid-match toggle applies to the *next* match, not the live board.
- **Theme light/dark** — `tokens.css` `:root[data-theme="light"]` override set.
  First pass; **still needs the visual QA pass** the scope warned about (HUD/board
  contrast, ivory pieces on lighter wood).

## Boundary (what Settings is and is NOT)

- **Presentation only.** Nothing in Settings may touch the authoritative reducer,
  the RNG stream, dice/HP/range constants, or anything an online peer must agree on.
  Every setting is safe to differ per client and per session.
- **Not match config.** Board size, player count, format, difficulty, and team
  names stay on the **setup screens** where they already live. Settings does not
  duplicate them.
- **Not house rules.** Any balance modifier (HP/range/damage/dice) is a future
  match/house-rules feature that flows through `matchConfig → createMatchState`,
  NOT a global client toggle. Out of scope.
- **Not identity.** Per-player names belong to the deferred online-lobby work and
  the factory profile, not to a game-local settings store. Out of scope.

## The five v1 settings

### 1. Audio (sliders)
Three sliders: **Master / SFX / Music**, each 0–100%.
- `AudioManager` already carries `enabled`, `volume`, `musicVolume`; `play()` reads
  `this.volume` per call and music reads `this.musicVolume`. ~90% there.
- Add `setVolume(v)` / `setMusicVolume(v)` setters (mirroring the existing
  `setEnabled`). Effective SFX = `master * sfx`; effective music = `master * music`.
- Music must update **live**: when the music slider (or master) moves, set
  `this.currentMusic.volume` immediately so a playing track responds without a
  restart.
- 0% on a slider is a clean silence; keep the existing best-effort/silent-failure
  contract — no setting ever throws or gates the match.

### 2. Animation speed
Options: **Slow / Normal / Fast / Instant**, expressed as a single speed multiplier.
- Scales the CPU pacing constants (`CPU_*_MS`) and the `EffectsRenderer` animation
  durations. "Instant" collapses animation to near-zero but still resolves events in
  order (presentation only — rules and event order are untouched).
- Useful today because CPU and online turns are paced; a fast/instant option makes
  long FFA/CPU games far less tedious.

### 3. Reduce motion (toggle)
Disables ambient/decorative motion: embers/candlelight ambient, expanding rings,
float-text rise. Accessibility win; pairs naturally with Instant animation speed.
Implementation is CSS-class / token driven off the root, no renderer rewrites.

### 4. Colorblind palette (toggle, or named modes)
Swaps the squad-identity hues (and/or adds patterns) so `--p1..--p4` squads stay
distinguishable. Drives off the existing `--p1..--p4` tokens and the `--team`
custom-property system — no per-slot color rules to chase.
- Start with a single colorblind-safe palette toggle; named modes
  (deuter/prot/trit) can come later if wanted.

### 5. Theme — light / dark
Root `data-theme` attribute selecting a **parallel token set** in `tokens.css`.
- Feasible because the whole look is already token-driven (one variable set,
  swapped values re-skin the cascade). The toggle is cheap; the **design work is
  not** — the current fantasy war-table identity is *mixed* (parchment/brass menus +
  dark carved-oak match HUD), so a coherent light and a coherent dark variant each
  need real authoring, not just inverted values.
- Treat the token authoring as the bulk of this item. The wiring is trivial.

## Persistence

- Single game-local key in `localStorage`: **`mini-tactics.settings`**, holding one
  JSON object for all five settings (`{ master, sfx, music, animSpeed, reduceMotion,
  colorblind, theme }`).
- Read **once on boot** (app.js boot path), apply to the root + `AudioManager`
  before first render so there's no flash of default theme/motion.
- Write on change (debounced is fine; not performance-sensitive).
- Defaults reproduce today's experience exactly: master/sfx/music at current
  defaults (0.8 / 0.8 / 0.35-equivalent), Normal speed, motion on, colorblind off,
  theme = current fantasy default.
- **Open consideration (not blocking v1):** whether settings should later promote to
  a factory-profile-owned store so they follow the player across cabinets. Per the
  platform's factory-identity lean that's a *platform* decision, not a mini-tactics
  one — keep it game-local for v1, leave the seam clean enough to lift later.

## Integration points

- The disabled `Settings · Soon` buttons at `index.html` (title + pause/menu) become
  the entry points; drop the `disabled`/`.soon` and route to a settings panel/screen
  via `screenManager`.
- A small `settings` module owns: load/save to `localStorage`, apply-to-root (theme /
  reduce-motion / colorblind classes or `data-*`), and push audio values into the
  live `AudioManager`. The panel UI binds to it.
- Reachable from both title and mid-match menu; mid-match changes apply live (audio +
  animation speed especially).

## Out of scope (named so it stays out)

- Balance / house-rules modifiers (HP, range, damage, dice).
- Per-player names (online-lobby + factory profile work).
- Board size / player count / format / difficulty (setup screens own these).
- Factory-profile-synced settings store (possible future; game-local for now).
- Keybinding/remap UI (not requested).

## Suggested build order (when greenlit)

1. `settings` module + `localStorage` load/save + apply-on-boot, defaults = today.
2. Audio sliders (smallest; `AudioManager` already most of the way).
3. Animation speed + reduce motion (token/class + pacing multiplier).
4. Colorblind palette toggle.
5. Theme light/dark — wiring last, but budget the token-authoring as its own task.
