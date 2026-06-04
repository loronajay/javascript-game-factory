# V16 — Engagement Reservation + Choke Queue Pass

This pass builds on v15's shared group route and adaptive formation work.

## Goals

- Reduce multiple melee units trying to occupy the same approach point around a moving target.
- Preserve direct attack intent when grunts are blocked in narrow lanes.
- Make rear attackers queue behind active attackers instead of going idle or thrashing between stale destinations.
- Improve debug visibility for engagement slots and queue behavior.

## Main changes

### 1. Mobile engagement reservations

Unit targets now get soft melee engagement slots.

These are not static attack slots like destructible wall slots. They are angular lanes around the moving target. Each pursuing attacker keeps a stable lane index, and the slot position is refreshed as the target moves.

This prevents the worst case where several grunts constantly recalculate the same closest chase point and fight over it.

### 2. Queueing behind active attackers

If a unit cannot reach its assigned engagement lane, it now tries to queue behind an allied attacker that is closer to the same target.

Queue anchors are spaced behind the blocker so multiple waiting units do not all stack on the same queue point.

### 3. Stronger lane-aware pursuit

Pursuit now prefers the unit's reserved engagement lane. Fallback ring searches are biased toward that lane before trying wider alternatives.

This gives each attacker more stable movement intent around mobile targets.

### 4. Movement priority integration

Units with an active mobile engagement slot now get a higher movement priority. This helps active attackers hold their lane while lower-priority queued/blocking units yield more often.

### 5. Debug overlay expansion

The movement debug overlay now renders engagement slot markers and labels selected units with their slot index.

Snapshot output now includes:

- `engagementSlot`
- `lanePriority`

## Important fix included

The v15 file had an accidental duplicate nested `for (const unit of this.units)` loop inside `updateCombat()`. That has been corrected. Leaving it in place would multiply combat update work and distort movement/combat testing.

## Debug controls

- `O`: movement/combat debug overlay
- `P`: path/group route debug overlay

## Validation

- All JS files passed `node --check`.
- Smoke test instantiated `GameMap` and `UnitManager`, issued a multi-grunt attack command against a scout, advanced the sim, and verified that attackers received distinct mobile engagement slots without runtime failure.

## Remaining work

This is still not full StarCraft-grade lane ownership. The next major engine step should be a real corridor occupancy system:

- reserve short path segments through chokepoints
- let front units own lane cells temporarily
- make rear units wait before entering contested choke cells
- add path-cost penalties around temporarily blocked cells

V16 should make same-target melee pursuit more stable, but extreme choke traffic still needs explicit corridor ownership.
