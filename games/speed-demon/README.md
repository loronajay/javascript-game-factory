# Speed Demon

Speed Demon is a top-down racer built around manual-shift execution. Stage against the christmas tree for a holeshot, then row an H-pattern gate — modelled as a traversable graph, not a canned move list — holding the needle in the shift window on every change. Reaction time, shift timing, and gate execution are the whole skill.

## Current status

Live on the arcade grid (order 13).

- **Five ways to race.** Distance Race (four distances), Time Attack (three clocks), Rival Race against a ten-driver CPU roster or your own ghost, Circuit Race across Old Town Shrine Loop, Docklands Freight Loop, and Downtown Canal Ring with Easy/Normal/Hard CPU pace, and casual **Online Versus** — best of three, server-authoritative, on the separate `factory-network-server`.
- **A campaign.** Chapter one is the whole painted Street Circuit: nine events, START to the boss plate. The other three districts are painted and read `soon`.
- **24-model roster, cosmetic-only.** No stat differences and no alternate gate layouts yet. Bodies are neutral and a livery — base paint, optional gradient, up to four player-placed bands and stripes, window tint, tail-light hue, underglow — is tinted on at runtime, so a new colour costs no art.
- **Customization is server-backed and requires sign-in.** Signed out, the garage reports itself unavailable and the cabinet races on Factory paint — a normal state, not an error.
- **Persistent bests.** Seven boards, kept locally signed out and submitted to a global leaderboard signed in. Unlike the garage, this works signed out: a lap time means something to the player alone.
- **A driver card** — a name, a face, five pinned cars — feeding a VS splash before every rival and campaign race.
- **Speed Demon Radio** plays the player's own music folder through a car-stereo faceplate. The folder is remembered across visits; the permission is re-checked silently rather than prompted.
- **Phone play** via a landscape gate and the shared mobile controller.

**This cabinet is not standalone.** It imports the shared platform client (`js/platform/api/`) for the garage, the leaderboards and the driver, so it must be served from the **repository root** — `http://host/games/speed-demon/index.html`. Serving this folder on its own 404s the platform imports and the boot fails quietly.

## Structure

- `index.html`, `styles/`: cabinet entry and page frame; all presentation lives on the canvas
- `scripts/sim/`: pure drag simulation — gate graph, engine, grading, launch, match rules, race state, input log. No DOM, no canvas, no wall clock, no randomness.
- `scripts/circuit/`: the two-axis runtime — world-space vehicle physics at 120Hz, road-mask collision, checkpoints and laps, eight-direction sprite atlases
- `scripts/runtime/`: the adapter seam between a mode and the thing that simulates it
- `scripts/garage/`: liveries, the paint classifier, saved presets
- `scripts/records/`, `scripts/campaign/`, `scripts/profile/`, `scripts/rival/`: bests, the career, the driver card, and the car in the other lane
- `scripts/online/`: session rules, opponent simulation, circuit prediction; `net.js` is the only module that opens a socket
- `scripts/radio/`: the stereo — pure transport reducer and track rules, plus the file-system, `<audio>` and preferences layers
- `scripts/ui/`: pure geometry and view models for every screen
- `scripts/render/`: canvas drawing only; reads state, never advances it
- `scripts/mobile-ui.js`: the phone posture gate and this cabinet's control labels
- `scripts/init-game.js`: composition root and fixed-timestep loop
- `tools/`: offline asset prep — not shipped, not imported by the game
- `tests/`: cabinet coverage
- `GDD.md`: game-design source of truth
- `CLAUDE.md`: as-built architecture, measured constants, and the decisions that must not be undone

Server-side state lives in `platform-api/`, one table per feature: the garage (`db/game-loadouts.mts`, migration `035`), the leaderboards (`db/run-records.mts`, `036`) and the driver card (`db/game-profiles.mts`, `037`), with validation in `services/speed-demon-catalog.mts` and `services/leaderboard-catalog.mts`.

## Run locally

Serve the **repository root** over HTTP and open `games/speed-demon/index.html`. `file://` blocks module loading. `window.speedDemon` exposes a console handle for driving and inspecting a run — see `CLAUDE.md` for the full surface.

### Circuit stripe-flow authoring

Open `games/speed-demon/tools/circuit-mask-editor.html` from the same local server to author stripe-flow paths over every circuit sprite angle. Dragging over a sprite records an arrowed vector path in the exact direction drawn, including bends; multiple parallel paths can describe perspective changes across a panel. A secondary Band Flow pass is available for cross-car shapes, while Window Tint and Tail Lights remain optional pixel masks. User-facing direction names follow the car's visible nose rather than the legacy camera-facing atlas labels. The tool keeps all eight headings visible, autosaves each model in the browser, and exports an authoritative, model-checked JSON project plus PNG references.

### Circuit track testing

Open `games/speed-demon/tools/circuit-track-viewer.html` from the repository server. It switches between every circuit and drives the real 120Hz vehicle and swept road-mask collision used by the game. Collision, CPU-line and checkpoint overlays can be toggled independently.

## Tests

From `games/speed-demon/`:

```bash
npm test
```

The API side is covered by `platform-api/tests/{loadout,leaderboard,game-profile}-routes.test.mjs`, and the online server side by `factory-network-server/games/speed-demon/`. Those two share committed golden fixtures with this cabinet and fail if the mirrored physics drift apart — run `node tools/mirror-sim.mjs` after touching anything under `scripts/sim/`.
