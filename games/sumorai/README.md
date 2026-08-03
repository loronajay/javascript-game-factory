# Sumorai

Sumorai is a one-hit-kill samurai fighter. Players manage stamina, blocking, dashes, attacks, and ring positioning; one unblocked strike or a ring-out ends the round.

## Modes

- Local two-player
- Single-player versus CPU on Easy, Medium, or Hard
- Online casual matchmaking and private rooms
- Online ranked matchmaking with platform ELO records

Online combat uses deterministic rollback sessions with peer time synchronization. The simulated-latency two-client harness is the authority for sync behavior; do not validate online changes only through a same-machine visual playtest.

## Structure

- `index.html`, `style.css`, and `game.js`: cabinet entry and browser orchestration
- `scripts/rollback-session.js`: rollback state, replay, and committed outcomes
- `scripts/online.js`: WebSocket transport and network health
- `scripts/online-match-start.js`, `online-callbacks.js`, and `online-results.js`: online lifecycle seams
- `scripts/bot.js`: CPU behavior; it is never used as authoritative RNG in online play
- `scripts/online-identity.js`: shared factory-profile adapter
- `tests/online-sync.test.js`: latency/jitter/frame-hitch multi-client proof
- `GDD.md`: game-design source of truth
- `CLAUDE.md`: as-built architecture and online contract

## Run locally

Serve the cabinet over HTTP:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Tests

From `games/sumorai/`:

```bash
npm test
```

The package runs extracted-module, online-sync, mobile UI, and mobile structure suites.
