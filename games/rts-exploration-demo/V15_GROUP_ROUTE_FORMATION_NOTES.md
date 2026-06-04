# V15 Group Route + Adaptive Formation Pass

This pass builds on `V14_COMBAT_MOVEMENT_NOTES.md`.

## Goal

Reduce narrow-path pileups by giving selected unit groups a shared route and collapsing formation shape when the route passes through constrained terrain.

This is still an incremental RTS movement pass, not a full StarCraft-grade path coordinator.

## Added

### Shared group route

`UnitManager.issueGroupMove()` now handles regular move and attack-move commands.

For each selected group, the engine computes a shared route from the selected group center to the command target using the maximum unit clearance in the group. Individual units still receive their own final destinations, but debug metadata now preserves the common route that drove the command.

### Adaptive formation collapse

The group route is sampled for local route width. Based on the narrowest section, destination assignment becomes:

- `grid` for open terrain
- `two-file` for medium lanes
- `single-file` for tight corridors

This is intentionally simple and deterministic. It prevents wide square formations from being assigned into narrow corridors where several destination offsets are physically invalid or cause units to fight each other.

### Route-aligned destination offsets

Formation offsets are now aligned to the final approach direction rather than blindly using screen/world X/Y. Rows stack behind the command target along the approach vector. Lanes spread perpendicular to the approach vector.

### Group route debug

When path debug is enabled with `P`, the selected group's shared route is drawn as a dashed yellow route. Individual unit paths are still drawn separately.

When movement debug is enabled with `O`, selected unit labels include the active formation mode.

## Important behavior

This pass does not make units reserve corridor tiles yet. It only improves route/formation assignment. Units can still contest space locally in some extreme chokes because the engine does not yet have true corridor lane ownership.

The next pass should focus on combat engagement reservation for moving unit targets and stronger lane ownership while a group is inside a choke.

## Files changed

- `src/units.js`
- `src/renderer.js`

## Validation

- `node --check src/*.js` passed.
- Smoke test instantiated map/unit/command systems, issued move and attack-move commands, advanced simulation, and verified group route plus formation metadata was generated.
