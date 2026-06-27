# Games

This directory is the cabinet/workbench area for JavaScript Game Factory. Most
folders are self-contained browser games with vanilla HTML/CSS/JavaScript; a few
are tools, prototypes, or docs-first design workspaces that support the arcade.

The larger repository owns the shared platform, identity, social surfaces, and
API work. Individual game folders own only cabinet-local rules, presentation,
assets, and tests.

## Current Inventory

| Folder | Status | Notes |
| --- | --- | --- |
| `battleshits/` | Playable cabinet | Battleship-style game with solo bot battle, online play, platform registration, assets, and Node tests. |
| `bird-duty/` | Playable port | TurboWarp-origin cabinet with solo, hotseat/two-player, online menu/match work, personal bests, sounds, mobile coverage, and a broad test suite. |
| `build-buddy/` | Playable prototype | Co-op runner/builder platformer prototype with pack/stage architecture, local dual-role controls, online/client seams, and tests. |
| `circuit-siege/` | Active online cabinet | Server-authoritative 1v1 route-repair game with shared rules, client/server modules, map editor, and extensive tests. |
| `cockpit-swarm/` | Playable prototype | First-person cockpit fixed-shooter with 15 campaign stages, boss encounters, mobile controls, modular systems, and multiplayer seams in progress. |
| `creature-battle/` | Playable cabinet | Platform wrapper plus `creature-battler/`, a playable creature battler with 3v3 training, online 1v1 blind pick, activity publishing, class routes, animation, and sound. |
| `echo-duel/` | Playable online cabinet | 2-6 player online memory duel with solo survival, personal bests, server-authoritative match support, and compatibility fallback paths. |
| `game-sound-factory-v3/` | Tool | Hybrid game sound editor with organized pseudo-filesystem, persistent patch controls, WAV rendering, and standalone/integration entry points. |
| `illuminauts/` | Playable online cabinet | 2-player maze race with fog/light systems, chips, doors, hazards, audio, map tools, online identity handling, and tests. |
| `jaybox/` | Platform prototype | Shared-screen party-game host shell with room/session identity boundaries and the phone-controller model. Hosts its cabinets as nested folders: `jaybox/pot-of-greed/` (first catalog target) and `jaybox/questionable-decisions/` (trivia + phone-controlled penalty mini-games). |
| `juggle-fighter/` | Engine prototype | Deterministic platform-fighter foundation with fixed-step simulation, input buffering, fighter archetypes, local training scene, and tests. |
| `last-bastion/` | Playable prototype | Tactical defense game with campaign menu flow, authored missions/maps, deployable unit roles, wave pressure, gold rewards, and smoke/campaign tests. |
| `lovers-lost/` | Playable cabinet | Split-screen reunion runner with mobile/name input support, scoring, obstacle, player, input, and project-structure tests. |
| `meat-cards/` | Rules + engine workbench | Digital rules capture and implementation workspace for a paper card game, including card digitization, engine tests, and scene/layout work. |
| `mini-tactics/` | Playable prototype | Modular isometric squad tactics extraction with deterministic headless engine, reducer, seeded RNG, settings, CPU/multiplayer seams, and Node tests. |
| `project-draw/` | Tool prototype | Mobile drawing-engine fill prototype with canvas setup, camera, joystick movement, drawing tools, shape/fill tools, undo, and raw/smooth strokes. |
| `rts-exploration-demo/` | Playable prototype | Browser RTS slice with selection, movement, attack-move, fog of war, harvesters, neutral patrols, breakable walls, and scenario tests. |
| `sumorai/` | Playable cabinet | Samurai-sumo fighter port with local 2P, CPU difficulty modes, online casual/ranked play, rollback netcode, grid registration, and tests. |
| `tactical-arena/` | WIP playable prototype | Successor to Mini-Tactics: local hot-seat 1v1, menu flow, deterministic reducer, data-driven units/ARTS/statuses, seeded combat rolls, and Node tests. |

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

Tests should focus on game logic, collision, scoring, deterministic reducers,
state transitions, online contracts, and shared identity/platform seams. Avoid
testing canvas draw calls directly.

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
