# RTS Engine v17B — Choke Map + Route Reservations

Baseline: `rts-exploration-demo-v17A-refactor-reservations-group-planner.zip`

## Purpose

v17B starts the real narrow-path ownership layer. v17A extracted reservation and group-planning seams; v17B uses those seams to add deterministic choke detection and short-lived route-cell reservations.

This is still not the final StarCraft-grade traffic model. It is the first working corridor-admission layer that makes queue behavior explicit instead of leaving narrow paths to local separation steering.

## Added

### `src/movement/choke-map.js`

Adds `ChokeMap`, a reusable map service that classifies passable tiles by local column capacity.

Key behavior:

- Precomputes tile capacity at construction/rebuild time.
- Marks one-column cells as choke cells.
- Samples choke cells along movement segments.
- Provides debug cells for the path overlay.

Important API:

```js
new ChokeMap(map)
chokeMap.rebuild()
chokeMap.getTileInfo(tileX, tileY)
chokeMap.isChokeTile(tileX, tileY)
chokeMap.sampleChokeCellsAlongSegment(ax, ay, bx, by, maxCells)
chokeMap.debugCells(limit)
```

### Route choke reservations

`ReservationManager` now owns `routeReservations` in addition to static attack slots and mobile engagement slots.

Route reservations are:

- keyed by choke tile
- same-team only for v17B collision/admission decisions
- short-lived and refreshed while moving
- released when a unit stops, finishes moving, attacks, snaps to an attack slot, dies, or receives a replacement path

Important API:

```js
reserveRouteChokeCells(unit, cells, simTime, routeId, directionKey)
releaseRouteReservations(unit)
cleanupRouteReservations(simTime, liveUnits)
routeReservationSnapshot()
```

### Unit movement integration

`UnitManager` now owns a `chokeMap` instance and asks it for upcoming choke cells before each move step.

If the next route choke cell is already reserved by a same-team unit with equal or better route priority, the current unit waits in `queued-behind-ally` instead of physically shoving into the corridor.

Priority rule for this pass:

- Group formation slot index is used as the first simple route priority.
- Lower slot index can preempt a later slot if update order briefly reserves the cell in the wrong order.
- This avoids rear units permanently blocking front units just because they were iterated first.

### Debug/snapshot visibility

`createDebugSnapshot()` now includes:

- route reservation snapshots
- choke cell snapshots
- per-unit `routeId`
- per-unit choke reservation debug state

Path debug overlay (`P`) now draws:

- translucent choke cells
- active route reservations

## Added scenario tests

New scenarios:

```txt
test/scenarios/choke_map_classification.mjs
test/scenarios/choke_move_6_grunts.mjs
```

Updated runner:

```bash
node test/scenarios/run-all.mjs
```

The choke movement scenario builds an artificial one-tile corridor map, sends six grunts through it, verifies that route reservations are created, verifies queueing occurs, verifies at least one unit progresses through the corridor, and verifies reservations clear after Stop.

## Validation Run

Commands run:

```bash
node --check src/*.js src/movement/*.js test/scenarios/*.mjs v16-smoke.mjs
node v16-smoke.mjs
node test/scenarios/run-all.mjs
```

Result: all passed.

## Known Limits

This patch does not solve opposing-flow traffic yet.

This patch does not implement a global tactical engagement plan around targets. Mobile engagement slots still remain target-local soft slots.

This patch does not replace A*. Pathfinding is still the existing radius-aware A*.

This patch does not remove separation. Separation remains a polish layer, but route reservations now take over the first layer of same-team choke admission.

The current choke-map capacity calculation is conservative and tile-based. That is acceptable for v17B. Later passes can add clearance caching and body-sweep path smoothing.

## Next Recommended Patch

`v17C-engagement-plan-target-queues`

Recommended scope:

1. Create target-level engagement plans:

```js
engagementPlan = {
  targetKey,
  frontSlots: [],
  queueSlots: [],
  assignedUnitIds: [],
  updatedAt,
}
```

2. Move queue identity out of debug-only fields.
3. Add stable queue indices per target and per choke approach.
4. Add scenario tests for three grunts attacking a moving scout through a one-tile choke.
5. Add reservation leak checks for retarget/target death/stop while queued.

Do not start multiplayer authority or strategic AI yet. The movement semantics are still changing.
