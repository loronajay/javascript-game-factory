# Claude Code — Lovers Lost

Refer to the root `CLAUDE.md` for general project conventions. This file covers specifics for this game.

## Source of truth

All game design decisions live in `GDD.md`. Before implementing any feature, confirm it is scoped in the GDD. Open questions in the GDD must be resolved before the relevant feature is built.

## Architecture

The game has two logically independent sides that share a clock:

- `game.js` — main loop, state machine, shared clock, mode routing
- `player.js` — player entity (speed, score, state); instantiated twice (boy + girl)
- `obstacles.js` — obstacle spawning, types, collision
- `scoring.js` — timing grade calculation, score math
- `renderer.js` — all canvas draw calls (no logic here)
- `input.js` — input mapping for single player, local co-op, and online modes
- `online.js` — network layer for online co-op *(built last)*

## TDD rules for this game

- `player.js`, `obstacles.js`, and `scoring.js` must have full test coverage before any rendering code touches them
- Timing grade windows are pure functions — test every boundary
- Collision detection is a pure function — test every edge case
- State transitions (playing → reunion → score screen) must be tested

## Sprite sheets

| File            | Dimensions | Frame size | Frames |
|-----------------|------------|------------|--------|
| images/boy.png  | 96 × 16    | 16 × 16    | 6      |
| images/girl.png | 96 × 16    | 16 × 16    | 6      |

- Render scale: 3× (48 × 48 on canvas)
- `ctx.imageSmoothingEnabled = false` always

## State machine

```
menu → mode select → playing → reunion → score screen → menu
                              ↘ game over → score screen → menu
```

## Obstacle types (4)

Each obstacle type maps to exactly one required response. This is the core mechanic — do not add ambiguity.

| Type       | Visual                      | Required response  | Sprite  |
|------------|-----------------------------|--------------------|---------|
| Spikes     | Ground spikes               | Jump               |         |
| Bird       | Low-flying bird             | Crouch             | pending |
| Arrow wall | 3 stacked arrows            | Block              |         |
| Goblin     | Goblin (possible pre-attack)| Block → Attack or Attack | |

The goblin is the only two-phase obstacle. See GDD.md for full goblin mechanic spec.

## Online mode

Uses the existing Factory Network server (Railway). Do not introduce a separate backend.

- Server: `factory-network-server` (Express + `ws`)
- Matchmaking: `{ type: "find_match", gameId: "lovers-lost" }`
- Private room: `{ type: "create_room" }` / `{ type: "join_room", roomCode }`
- State sync: `{ type: "room_message", messageType, value }`
- `online.js` wraps all WebSocket logic — no raw WS calls outside this file

## What's already built (pre-scope placeholder)

`game.js`, `index.html`, `style.css` exist from before scope was locked. They should be treated as throwaway scaffolding — rewrite as needed to fit the architecture above.
