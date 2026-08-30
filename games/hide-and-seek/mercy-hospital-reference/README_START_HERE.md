# Saint Mercy V5.1 — runtime spawn fix

V5 spawned the review Seeker at the production renderer default `(0, 32)` instead of the map's
intended spawn. Saint Mercy's north exterior wall is at `z = 32`, so the player began inside/on the
wall collider and every movement step was rejected.

V5.1 explicitly relocates the real camera/world state to `(0, -27)` after the engine boots and
before the solo review starts.

Regression QA:

{
  "result": "PASS",
  "rendererDefaultRejected": true,
  "correctedSpawn": {
    "x": 0,
    "z": -27,
    "y": 0
  },
  "cardinalMovementProbes": 4
}

Run `PLAY SAINT MERCY V5.1.cmd`.
