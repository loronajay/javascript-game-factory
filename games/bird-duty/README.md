# Bird Duty

Bird Duty is the native JavaScript Game Factory port of the original TurboWarp cabinet. Drop payloads on moving targets, avoid hazards, build a score, and cash in before the active turn ends.

## Current status

- Single-player runs with a platform-backed personal best.
- Local two-player hotseat play uses explicit turn/session state.
- Online menus, public/private lobby flows, host snapshots, remote input, and match results are implemented.
- Keyboard, pointer, and shared mobile-controller input all route through the same cabinet seams.
- The original `bird-duty.sb3` remains in the folder as the porting reference; production play runs through `index.html` and the JavaScript modules.

## Structure

- `index.html`, `style.css`, `game.js`: browser entry, presentation, and fixed-step orchestration
- `scripts/state.js`: screen and mode transitions
- `scripts/play-session.js` and `scripts/hotseat-session.js`: run/turn state
- `scripts/online-client.js` and `scripts/online-match.js`: transport and online match state
- `scripts/player.js`, `npcs.js`, and `poop.js`: cabinet rules
- `scripts/renderer.js` and `assets.js`: canvas presentation and assets
- `scripts/mobile-ui.js`: landscape/fullscreen mobile gate
- `tests/`: Node regression coverage for gameplay, menus, online contracts, mobile behavior, audio, and geometry

## Run locally

Serve the cabinet over HTTP because it uses ES modules:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Tests

From `games/bird-duty/`:

```bash
node --test
```

Bird Duty owns match-local names and cabinet rules. Long-term player identity and profile data remain owned by the factory shell.
