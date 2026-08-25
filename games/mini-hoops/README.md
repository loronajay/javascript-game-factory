# Mini Hoops

Pull-back mini basketball. One gesture on the ball carries the whole control
scheme: pull length is power, pull angle is aim and arc together, mirrored like a
slingshot. The reticle is measured against the hoop's *rest* position, never the
moving rim — leading a moving hoop is the skill the moving modes exist to ask for.

As-built architecture, layering rules, and the load-bearing calibration decisions
live in [`CLAUDE.md`](CLAUDE.md); the design scope is in [`GDD.md`](GDD.md).

## Play

From the JavaScript Game Factory repository root, serve the site over HTTP and open
`games/mini-hoops/index.html`. All runtime assets are relative to this folder, so
any static server works:

```powershell
npx serve ..\..
```

Pick Solo Run, Local Hotseat, or Online Multiplayer. Hotseat gives two players one
full timed turn each on the same configured court. Online play requires a signed-in
Factory account and provides Quick Search, private room codes, a host-owned match
config, and Factory win/loss/ELO records.

Online matches run through the sibling `full-games/factory-network-server` repo.
The browser submits normalized pull intent only; that server replays the mirrored
Mini Hoops physics, owns scores and the deadline, and publishes the final winner.

## Test

```powershell
npm test
```

After changing shot physics or the ball flight catalog, refresh the server mirror:

```powershell
npm run mirror:server
```

Node's built-in runner, no dependencies. The suite covers the projection
arithmetic, hoop geometry and motion catalog, the pull gesture, the backward
launch solve, collision and physics ordering, shot resolution, the round clock and
scoring, hotseat rules, the Factory Network client contract, the exact server
physics mirror, both asset catalogs, the store, and the module-layering contract —
`tests/modules.test.js` mechanically enforces that the sim never reaches for the
DOM, a store or a renderer, and that only `store/local-storage.js` says
`localStorage`.

## Project map

- `scripts/init-game.js`: composition root — owns the canvas, the loop, and order. No rules.
- `scripts/sim/`: pure rules, fully testable under node. `constants.js` is the calibration record; `projection.js` is the only owner of world↔screen arithmetic.
- `scripts/store/`: persistence. `boards-store.js` is the seam a server-backed board would replace.
- `scripts/assets/`: the ball and location registries plus a non-blocking image cache. Frame count is per-ball and load-bearing.
- `scripts/render/`: draw calls only — never mutates state, never reads a store.
- `scripts/ui/`: DOM bindings, holding no game state.
- `scripts/multiplayer/`: hotseat duel state, Factory account gate, lobby client, and shared match config.
- `tools/resize-ball-frames.mjs`: ball roll-frame resizer.
- `tools/mirror-server.mjs`: refreshes the authoritative physics mirror in `factory-network-server`.
