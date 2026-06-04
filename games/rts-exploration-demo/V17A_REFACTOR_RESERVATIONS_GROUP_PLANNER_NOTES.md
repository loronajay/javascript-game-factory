# RTS Engine v17A — Reservation and Group Planner Extraction

Source baseline: `rts-exploration-demo-v16-engagement-reservation.zip`

## Purpose

This is a foundation patch. It intentionally does not attempt full choke ownership yet.

The goal is to remove the first major architecture bottleneck before adding more movement behavior. v16's narrow-path fixes were useful, but continuing to pile behavior into `src/units.js` would make the RTS engine harder to debug and harder to evolve into multiplayer authority, AI, or real scenario regression coverage.

## What Changed

### 1. Added `src/movement/reservations.js`

New exported class:

```js
ReservationManager
```

It now owns:

- static attack slot reservations
- mobile engagement slot reservations
- slot refresh
- slot release
- target reservation cleanup
- live-unit cleanup

`UnitManager` still exposes wrapper methods such as `reserveAttackSlot()`, `releaseAttackSlot()`, and `reserveMobileEngagementSlot()` so existing call sites remain stable.

This is not a rewrite. It is a seam extraction.

### 2. Added `src/movement/group-planner.js`

New exported functions:

```js
buildGroupMovePlan()
buildGroupRoute()
groupApproachDirection()
estimateRouteColumns()
estimateColumnsAtPoint()
orderUnitsForGroupMove()
mergeGroupRouteForUnit()
adaptiveFormationOffsets()
```

`UnitManager.issueGroupMove()` now delegates route/formation planning to `buildGroupMovePlan()`.

This preserves the existing v16 group route behavior while moving planning logic out of the unit manager.

### 3. Added deterministic scenario-test foundation

New folder:

```txt
test/scenarios/
```

Current scenarios:

```txt
mobile_engagement_slots.mjs
group_move_plan.mjs
reservation_cleanup_on_death.mjs
run-all.mjs
helpers.mjs
```

Run all scenarios:

```bash
node test/scenarios/run-all.mjs
```

Expected result:

```json
{
  "ok": true,
  "scenarios": 3
}
```

### 4. Preserved v16 smoke behavior

Existing smoke command still passes:

```bash
node v16-smoke.mjs
```

The smoke output still shows multiple grunts preserving attack intent with distinct mobile engagement slots.

## What Did Not Change

This patch does not implement choke-cell ownership yet.

It does not add:

- choke-map classification
- choke-cell route reservations
- opposing-flow priority
- multiplayer authority
- serious strategic AI
- pathfinding replacement

Those are explicitly deferred to v17B.

## Why This Was the Correct First Patch

The hard problem is not just making units move through a narrow lane once. The hard problem is making movement behavior predictable enough that future systems can depend on it.

Before this patch, `src/units.js` directly owned too many systems: unit storage, selection, combat, path execution, separation, group route planning, static attack slots, mobile engagement slots, queue fallback, and debug fields.

After this patch, reservations and group planning have their own modules. That gives the next pass a cleaner place to add choke ownership without expanding the unit manager again.

## Validation Performed

Validated with:

```bash
node --check src/units.js
node --check src/movement/group-planner.js
node --check src/movement/reservations.js
node v16-smoke.mjs
node test/scenarios/run-all.mjs
```

Observed scenario pass:

- mobile engagement slots remain assigned
- group move plan produces formation debug metadata
- mobile engagement reservations clear when target dies

## Recommended v17B Scope

Next patch should be:

```txt
RTS Engine v17B — Choke Map + Choke-Cell Reservations
```

Recommended order:

1. Add `src/movement/choke-map.js`.
2. Classify route points by corridor capacity.
3. Add short-lived route/choke reservations to `ReservationManager` or a sibling `RouteReservationManager`.
4. Add debug exposure for reserved choke cells.
5. Add scenarios for:
   - group movement through one-tile choke
   - attack-move through choke
   - mobile target engagement through choke
   - stop/retarget cleanup while inside choke

Do not tune separation as the first fix. Separation should become a polish layer after choke admission exists.
