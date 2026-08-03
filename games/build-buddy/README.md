# Build Buddy

Build Buddy is a playable co-op platformer prototype built around two asymmetric roles: the Runner crosses momentum-heavy stages while the Builder places platforms, springs, and checkpoints to keep the route alive. The cabinet is registered on the arcade grid and supports local debug play plus public/private online lobby flows.

## Current status

- Pack 01 is a complete 10-stage pack registered through `js/stages/stage-registry.js`.
- Local play exposes Runner, Builder, and Hybrid debug views so one tester can exercise both roles.
- Online play assigns role-specific Runner and Builder clients, exchanges commands/snapshots through `js/online-client.js`, and supports both client-host and server-authoritative match payloads.
- Progression, stage results, run completion, disconnect handling, and online message contracts have Node regression coverage.

The durable stage identifiers use pack/stage coordinates:

```text
Folder:      js/stages/packs/pack-##/
Stage file:  pack-##-stage-##.js
Manifest:    pack-##-manifest.js
Stage ID:    pack_##_stage_##
Display:     Pack ## — Stage ##
```

Add stages through a pack manifest and `stage-registry.js`; do not hardcode stage imports into the browser entry point.

## Run locally

The cabinet uses ES modules, so serve it over HTTP from this folder:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

Runner:

```text
A/D or Left/Right  Move
Space              Jump / wall-jump
W/Up               Climb
S/Down             Descend / drop through one-way platforms
R                  Reposition
```

Builder:

```text
1–5                 Select platform, spring, or checkpoint tool
Left click          Place
Right click         Delete
Q/E                 Nudge builder camera
```

Local view controls are `6` for Runner, `7` for Builder, and `8` for Hybrid debug view. Online sessions hide those controls and derive the view from the assigned role.

## Structure

- `js/app-controller.js`: browser loop, screen orchestration, and online command routing
- `js/app-shell.js`: pure menu/lobby/session state transitions
- `js/game.js`: fixed-step cabinet simulation
- `js/online-client.js`: WebSocket transport
- `js/online-gameplay.js`: online messages, authority checks, results, and disconnect state
- `js/stages/`: stage authoring helpers, registry, manifests, and content
- `js/render/`: focused rendering modules
- `tests/`: Node coverage for stages, progression, sessions, online contracts, and visual structure

## Tests

From `games/build-buddy/`:

```bash
node --test
```

Build Buddy owns cabinet-local rules and presentation. Durable factory identity remains owned by the shared platform.
