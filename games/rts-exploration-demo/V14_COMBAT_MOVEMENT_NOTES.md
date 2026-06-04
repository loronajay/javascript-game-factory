# RTS Engine v14 — Combat Movement State/Debug Pass

This pass assumes the v13 narrow-path combat patch is the base.

## Main changes

- Added explicit unit tactical states:
  - `idle`
  - `moving`
  - `attack-moving`
  - `pursuing-target`
  - `attacking`
  - `blocked-repathing`
  - `queued-behind-ally`
  - `dead`
- Added `setUnitState()` so state transitions update `debug.stateSince` instead of scattering raw string assignments.
- Added per-unit debug data:
  - `pathGoal`
  - `lastWaypoint`
  - `queueAnchor`
  - `blockerId`
  - `lastRepathAt`
- Added movement-progress details to `movementState`:
  - `lastProgressAt`
  - `lastBlockedAt`
  - `lastBlockReason`
- Kept attack intent alive when a unit has to queue or repath.
- Marked queue-following units as `queued-behind-ally` instead of hiding that behavior under generic pursuit.
- Added an `O` hotkey for movement/combat debug overlays.
- HUD now reports aggregate unit state counts and selected-unit state counts.
- Debug snapshot now includes `blockedFor`, `pathGoal`, and `queueAnchor`.

## Debug hotkeys

- `Q`: arm attack-move
- `X`: stop selected units
- `F`: fog debug
- `P`: path debug
- `O`: movement/combat debug

## What to test

1. Select all grunts.
2. Right-click an enemy scout or neutral creature through a narrow path.
3. Press `O` to view state labels, target lines, attack ranges, body radius, path goals, and queue anchors.
4. Press `P` if you also need raw path lines.

Expected behavior: units should remain in useful tactical states instead of becoming opaque idle-looking actors. A rear melee unit that cannot directly engage should now show `queued-behind-ally` or `blocked-repathing`, preserving attack intent while the front line resolves.

## Not included yet

This is not the full group-route / adaptive formation pass. That should be v15. This patch makes unit intent visible and less brittle so the next pass can be built without guessing.
