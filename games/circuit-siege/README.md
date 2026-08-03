# Circuit Siege

Circuit Siege is an online-first 1v1 route-repair puzzle. Both players race across mirrored boards to connect a source to the requested terminal; the first player to complete five live routes wins, with score deciding the result when the five-minute timer expires.

## Current status

- Public matchmaking and private rooms are playable.
- Match rules, route validation, timer, scoring, dud feedback, and results are server-authoritative.
- `maps/index.json` is the manifest-driven board catalog. One authored map currently ships.
- `map-editor.html` is the internal board authoring tool.
- Procedural generation is scoped in `Circuit_Siege_Procedural_Generation_Scope.md` but is not implemented.

Circuit Siege also depends on matching handlers in the separate `factory-network-server` repository. Client rules or board-contract changes may require a coordinated server update before website testing is valid.

## Structure

- `index.html` and `game.js`: cabinet entry and browser boot
- `scripts/shared/`: board model, connectivity, commands, snapshots, and match engine
- `scripts/client/`: lobby/session controllers, view models, rendering, identity, and input
- `server/`: local server bridge/reference implementation
- `maps/`: shipped board manifest and content
- `map-editor.html`: internal authored-map editor
- `tests/shared/`, `tests/client/`, and `tests/server/`: local cabinet contract coverage; these TDD harnesses are intentionally gitignored from the shipped repository
- `Circuit_Siege_GDD_v1_10.md`: game-design source of truth
- `CLAUDE.md`: as-built architecture and authority rules

## Run locally

Serve the repository or cabinet over HTTP and open `index.html`. Online play needs a compatible Factory Network server; local query/config overrides should target the matching development server rather than replacing production defaults in source.

## Tests

From a development workspace that includes the local `tests/` harness, run from `games/circuit-siege/`:

```bash
npm test
```

Focused `test:shared`, `test:client`, and `test:server` scripts are also available. A fresh shipped checkout does not contain the gitignored test harness.
