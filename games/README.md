# Games

This directory is the cabinet/workbench area for JavaScript Game Factory. Most
folders are self-contained browser games with vanilla HTML/CSS/JavaScript; a few
are tools, prototypes, or docs-first design workspaces that support the arcade.

The larger repository owns the shared platform, identity, social surfaces, and
API work. Individual game folders own only cabinet-local rules, presentation,
assets, and tests.

## Current Inventory

"On the grid" means the folder has a `game.json`, a slug in `js/arcade-catalog.mts`, and a
`grid-previews/<slug>.png`. All three are required — a preview image alone does not list a
cabinet. Grid position comes from `game.json`'s `order` field.

| Folder | Status | Notes |
| --- | --- | --- |
| `battleshits/` | On the grid (3) | Battleship-style game with solo bot battle, online 1v1 matchmaking, platform registration, assets, and Node tests. |
| `bird-duty/` | On the grid (7), porting | TurboWarp-origin cabinet with solo, hotseat/two-player, online menu/match work, personal bests, sounds, mobile coverage, and a broad test suite. |
| `build-buddy/` | On the grid (10), playable prototype | Co-op runner/builder platformer with a complete 10-stage first pack, local hybrid/debug play, role-specific online play, public/private lobbies, and tests around stages, progression, sessions, and network contracts. |
| `circuit-siege/` | On the grid (12) | Server-authoritative 1v1 route-repair game with shared rules, client/server modules, map editor, and a broad local TDD harness. One shipped map (`maps/index.json`); procedural generation is a future scope doc, not built. |
| `cockpit-swarm/` | On the grid (9) | First-person cockpit fixed-shooter: 15 campaign stages in three 5-stage blocks, three bosses (Dreadmaw / Arbiter / Eclipsis) reachable via campaign gate, Boss Rush, and Boss Practice, plus a 1v1 Dodgeball online mode. Mobile controls and modular render/system split. |
| `creature-battle/` | On the grid (8) as `creature-battler` | Umbrella folder: platform wrapper plus `creature-battler/`, a 12-creature 3v3 battler with solo training vs AI, online 1v1 blind pick, activity publishing, class routes, animation, and sound. The catalog maps the `creature-battler` slug onto this folder path. Draft pick is scoped but not implemented. |
| `echo-duel/` | On the grid (11) | 2-6 player online memory duel with solo survival, personal bests, server-authoritative match support, and compatibility fallback paths. |
| `game-sound-factory-v3/` | Tool | Hybrid game sound editor with organized pseudo-filesystem, persistent patch controls, WAV rendering, and standalone/integration entry points. Not a cabinet. |
| `illuminauts/` | On the grid (6) | 2-player online maze race with fog/light systems, chips, doors, hazards, audio, map tools, online identity handling, and tests. Also solo Sprint/Sweep time-attack modes across a 6-map catalog. Procedural generation (Phase 5) is next. |
| `jaybox/` | Playable host shell | Shared-screen party-game host with phone controllers and server-authoritative cabinet adapters. Pot of Greed has a live Jaybox cabinet module, while `jaybox/questionable-decisions/` contains both the Jaybox adapter and a playable Questionable Decisions prototype with tested trivia/penalty-game seams. |
| `juggle-fighter/` | Engine prototype | Deterministic platform-fighter foundation with fixed-step simulation, input buffering, fighter archetypes, local training scene, and tests. |
| `last-bastion/` | Playable, not on the grid | Single-player real-time tactical lane-defense. Campaign is the only enabled mode: 5 stages across 4 authored battlefields, gold economy, 6 deployable unit types on a counter triangle. Endless and Skirmish are visible-but-disabled placeholders, with standalone regression scripts under `tests/`. |
| `lovers-lost/` | On the grid (2), featured | Split-screen reunion runner with mobile/name input support, scoring, obstacle, player, input, and project-structure tests. |
| `meat-cards/` | Rules + engine workbench | Digital rules capture and implementation workspace for a paper card game, including card digitization, engine tests, and scene/layout work. Not on the grid despite having a preview image. |
| `mini-tactics/` | On the grid (5) | Isometric squad tactics on a deterministic headless engine: hot-seat 2–4P (FFA + 2v2 teams), vs CPU on three difficulties, and online 2–4P lockstep. Online is headless-validated but not yet browser-playtested. A tutorial subsystem exists in `src/tutorials/` but is deliberately not linked from the main menu. |
| `project-draw/` | Tool prototype | Mobile drawing-engine fill prototype with canvas setup, camera, joystick movement, drawing tools, shape/fill tools, undo, and raw/smooth strokes. |
| `questionable-decisions/` | Stray empty folder | Not a workspace. The real docs live at `jaybox/questionable-decisions/`. |
| `rts-exploration-demo/` | Playable prototype, not on the grid | Browser RTS slice with selection, movement, attack-move, fog of war, harvesters, neutral patrols, breakable walls, and scenario tests. |
| `speed-demon/` | On the grid (13) | Top-down drag racer built on manual-shift execution: the H-pattern gate is a traversable graph, the christmas tree has a holeshot window, and the dashboard is analog. Distance Race and Time Attack are playable across a 24-model roster and five tracks; Online Versus is listed but locked and will run on `factory-network-server`. Cars are cosmetic-only, customized through a server-backed garage (`game_loadouts`) that requires sign-in. Also ships Speed Demon Radio, the player's own music folder on a car-stereo faceplate. Persistent bests are not implemented. Must be served from the repo root — it imports `js/platform/api/`. |
| `sumorai/` | On the grid (4) | Samurai one-hit-kill fighter port with local 2P, CPU difficulty modes, online casual and ranked (ELO) play over rollback netcode with peer time-sync, and a headless two-client sync test. |
| `tactical-arena/` | On the grid (1), release candidate | The flagship cabinet and successor to Mini-Tactics. 30-unit roster with ARTS/passives/statuses/summons/weather/terrain, a 22-mission campaign, five tutorials, local hot-seat 2–4P, CPU, Online Versus (Classic/Draft 1v1, 4P FFA, 2v2 Teams), server-authoritative Ranked 1v1, a TA-scoped friends/profile/badge layer, and a monetized shop on Valor plus real money. Also packaged as an Android app — see `mobile/tactical-arena/`. |

## Folder Expectations

Game cabinets should stay self-contained and normally follow this shape:

```text
games/<game-name>/
  index.html
  style.css
  game.js
  game.test.js or tests/
  GDD.md or project README/scope docs
  AGENTS.md when cabinet-specific instructions are needed
  images/ or other local assets
```

Not every folder is a full cabinet yet. Tools and prototypes may use `src/`,
`js/`, `styles/`, or docs packets when that better matches the workbench.

## Running Games

Many cabinets use ES modules, so serve the folder over HTTP instead of opening
`index.html` directly:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` from inside the game folder. Some simpler
single-page prototypes still work through a direct file open; check the local
README or GDD first.

## Testing

Prefer each cabinet's local test command when a `package.json` is present:

```bash
npm test
```

Several games use direct Node scripts instead of a package script. Common forms:

```bash
node tests/example.test.js
node --test tests/*.test.js
node --test
```

There is **no test framework in this repo** — everything is Node's built-in runner
(`node --test`) or plain scripts using `node:assert`. Do not add Jest, Vitest, or Mocha;
copy the shape a neighbouring cabinet already uses. Note that not every `tests/` folder
holds `node:test` files: `last-bastion/tests/*.mjs` are standalone scripts that must be run
one at a time, so `node --test tests/` reports a single failure there rather than running them.

Tests should focus on game logic, collision, scoring, deterministic reducers,
state transitions, online contracts, and shared identity/platform seams. Avoid
testing canvas draw calls directly. Online sync in particular is proven by a headless
multi-client harness under simulated latency, never by a single-machine playtest —
see `sumorai/tests/online-sync.test.js` and `mini-tactics/tests/online-lockstep.test.js`.

## Engineering Boundaries

- Keep cabinet rules and presentation inside the game folder.
- Keep long-term player identity, profiles, activity feeds, and shared social
  records in the platform layer, not in a cabinet.
- Prefer pure logic modules for state transitions and rules.
- Use a fixed-timestep accumulator for gameplay updates; rendering may run every
  animation frame, but it must only read state.
- Set `ctx.imageSmoothingEnabled = false` whenever drawing pixel-art canvases,
  especially after resizing.
- If a large script starts mixing state, rendering, storage, networking, and DOM
  wiring, extract a small module before adding more behavior.

## Asset Notes

Use local assets when available. If art is missing, placeholders should be
generated in code or CSS so the game remains runnable. Sprite work should measure
actual sheet dimensions, keep hitboxes aligned to visible art, and include a
debug hitbox view for collision tuning.
