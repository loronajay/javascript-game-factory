# Yam Bowling

A playable local and online bowling cabinet built from the V5 depth and physics prototype.

## Play

From the JavaScript Game Factory repository root, serve the site over HTTP and open
`games/yam-bowling/index.html`. The cabinet keeps all runtime assets relative to its
own folder, so it also supports its local development server:

```powershell
npm start
```

Open `http://127.0.0.1:4189`. Choose Quick Bowl or Classic Ten, then play Hotseat, Vs CPU, Quick Match, or a code-based private room with any of the 28 canon bowlers. Local online development expects `factory-network-server` on port 3000.

On the lane, use A/D to strafe and the left/right arrow keys to aim (or use the sliders), then tap Throw or Space to start the moving spin needle. Press and hold again to lock spin and build power; release to bowl. Quick taps roll slowly, while longer holds build steadily to maximum speed. More power carries farther through the oil before the ball hooks, and A/D can add a tiny correction during release. Shift+D toggles the physics hitbox overlay.

## Test

```powershell
npm test
```

The suite covers the roster contract, scoring, final-frame bonuses, turn handoffs, CPU planning, contact response, trajectories, online commands, reconnect handshakes, and required cabinet structure. It uses Node's built-in test runner and has no package dependencies.

## Project map

- `GDD.md`: current local and online design scope.
- `online-client.mjs`: Factory Network v2 lobby client and reconnect state.
- `CLAUDE.md`: as-built architecture and ownership boundaries.
- `prototype/yam-bowling-v5-standalone.html`: original all-in-one scene/physics reference.
- `assets/characters/processed/canon/`: five cleaned throw frames for each bowler.
- `assets/characters/portraits/canon/`: front-facing selection and identity portraits.
- `tools/extract_canon_frames.py`: character extraction pipeline.
