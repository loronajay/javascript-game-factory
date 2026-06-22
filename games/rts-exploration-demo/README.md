# RTS Exploration Demo

Browser RTS prototype for JavaScript Game Factory.

The game design source of truth is [GDD.md](GDD.md). It supersedes the historical version notes and prior prototype scope.

## Run locally

```bash
python -m http.server 8080
```

Open <http://localhost:8080>.

## Current playable slice

- Select and move Scouts and Grunts.
- Attack breakable grey walls and the two Drifters.
- Explore through fog of war using the authored Level 01 reference map.
- Use `Q` for attack-move and `X` to stop selected units.

Level 01 landmark icons are deliberate map data. Only the Drifters currently use live neutral-unit behavior; the Nexus, camps, deposits, and Space Dragon are the stable foundation for upcoming mechanics.

## Tests

Run focused scenarios with Node, for example:

```bash
node --test test/scenarios/level01_legend_contract.mjs
```

The legacy all-scenarios launcher remains in `test/scenarios/run-all.mjs`.
