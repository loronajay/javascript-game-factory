# Speed Demon

Speed Demon is a top-down drag racer built around manual-shift execution. Stage against the christmas tree for a holeshot, then row an H-pattern gate — modelled as a traversable graph, not a canned move list — holding the needle in the shift window on every change. Reaction time, shift timing, and gate execution are the whole skill.

## Current status

- **Distance Race** (four distances) and **Time Attack** (three clocks) are playable end to end, behind a full title → mode select → setup → garage → race → results flow with pause and the radio.
- **Online Versus** is listed on the mode select but locked. It will run on the separate `factory-network-server`, not on `platform-api`.
- **24-model roster across five tracks.** Cars are cosmetic-only for now — no stat differences and no alternate gate layouts yet.
- **Customization is server-backed and requires sign-in.** Bodies are neutral and paint, finish, window tint, tail-light hue and underglow are tinted on at runtime, so a new colour costs no art. Signed out, the garage reports itself unavailable and the cabinet races on Factory paint — that is a normal state, not an error.
- **Speed Demon Radio** plays the player's own music folder through a car-stereo faceplate. The folder is remembered across visits; the permission is re-checked silently rather than prompted.
- Persistent bests are not implemented — the results screen shows the run and nothing to beat.

**This cabinet is not standalone.** It imports the shared platform client (`js/platform/api/`) for the garage, so it must be served from the **repository root** — `http://host/games/speed-demon/index.html`. Serving this folder on its own 404s the platform imports and the boot fails quietly.

## Structure

- `index.html`, `styles/`: cabinet entry and page frame; all presentation lives on the canvas
- `scripts/sim/`: pure simulation — gate graph, engine, grading, launch, match rules, race state. No DOM, no canvas, no wall clock.
- `scripts/garage/`: liveries, the paint classifier, saved presets; `garage-store.js` is the only module that knows a server or `localStorage` exists
- `scripts/radio/`: the stereo — pure transport reducer and track rules, plus the file-system, `<audio>` and preferences layers
- `scripts/ui/`: pure geometry and view models for the shell, setup menu, garage editor, gauges, gate plate, track layout and radio panel
- `scripts/render/`: canvas drawing only; reads state, never advances it
- `scripts/assets/`: measured sprite manifests
- `scripts/init-game.js`: composition root and fixed-timestep loop
- `tests/`: cabinet coverage; gitignored from the shipped repository
- `GDD.md`: game-design source of truth
- `CLAUDE.md`: as-built architecture, measured constants, and the decisions that must not be undone

The server side of the garage lives in `platform-api/`: `services/speed-demon-catalog.mts`, `db/game-loadouts.mts` (migration `035`) and `routes/loadout-routes.mts`.

## Run locally

Serve the **repository root** over HTTP and open `games/speed-demon/index.html`. `file://` blocks module loading. `window.speedDemon` exposes a console handle for driving and inspecting a run — see `CLAUDE.md` for the full surface.

## Tests

From a development workspace that includes the local `tests/` harness, run from `games/speed-demon/`:

```bash
npm test
```

The API side is covered by `platform-api/tests/loadout-routes.test.mjs`.
