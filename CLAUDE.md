# Claude Code — HTML/JS Games

This repo is a collection of browser games built with **vanilla HTML, CSS, and JavaScript** (no frameworks, no build tools unless explicitly added per-game).

## Discipline

- **TDD always.** Write tests before implementation. No feature code without a corresponding test.
- Keep each game self-contained in its own folder under `games/`.
- Prefer editing existing files over creating new ones.
- No external dependencies without explicit approval.

## File structure (per game)

```
games/<game-name>/
  index.html       # entry point
  style.css        # styles
  game.js          # game logic
  game.test.js     # tests (or tests/ folder for larger games)
  GDD.md           # game design document — source of truth for scope
  CLAUDE.md        # game-specific instructions
  images/          # sprites and assets
```

## Testing

- Use a lightweight test runner that runs in the browser or Node (no Jest unless agreed).
- Tests cover: game logic, collision, scoring, state transitions.
- Tests do NOT cover: rendering, canvas draw calls.
- Run tests before any feature is considered done.

## Code style

- Pure functions for game logic where possible (easier to test).
- Separate concerns: input, update, draw, state.
- `ctx.imageSmoothingEnabled = false` on all canvases (pixel art).
- Game loop: `requestAnimationFrame` only.

## Sprites

- Assume pixel art sprite sheets (horizontal strip, single row per animation state).
- Always confirm `frameW`, `frameH`, and `frameCount` from actual image dimensions before writing sprite code.
