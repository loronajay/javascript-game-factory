# Shark Hall

House 8-ball in a late-night room, for the JavaScript Game Factory.

Vs CPU at three strengths, or local hotseat. Real cue-ball physics: follow and
draw are genuine topspin and backspin, English survives a cushion, and the table
settles before it scores you.

## Running it

Plain ES modules with no build step, but it must be **served over http** — the
browser will not load modules from `file://`.

```bash
python -m http.server 8899        # from this folder
# then open http://127.0.0.1:8899/index.html
```

## Testing

```bash
npm test
```

Zero dependencies, all under node. The suite covers the rules, the physics,
a whole break run to rest, the CPU, the match state machine, the audio catalogs,
and the layering itself.

## Where things are

- `GDD.md` — what the game is and the design rules behind it
- `CLAUDE.md` — how it is built, and what will bite you
- `scripts/sim/` — the pure layer: physics, rules, geometry, the CPU
- `reference/` — the original single-file demo this was extracted from
