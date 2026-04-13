# Codex — HTML/JS Games

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
  AGENTS.md        # game-specific instructions
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

## Assets & Rendering

- **Code-As-Asset (Placeholders):** If external images are missing, generate them dynamically. 
  - Use a `generatePlaceholder(w, h, color)` function that returns a Base64 DataURI.
  - For UI, use CSS `box-shadow` or `linear-gradient` to create "pixel art" styles directly in `style.css`.
- **Scaling:** Always implement a `scale` factor.
  - Calculate: `Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT)`.
  - Ensure `ctx.imageSmoothingEnabled = false` is set *every* frame if the canvas is resized.
- **UI Isolation:** Draw HUD/UI elements (Score, Health) *after* resetting the camera transform so they stay fixed to the screen.

- **Sheet Logic:** Assume horizontal strips (single row per state). 
- **Auto-Fit:** Confirm `frameW`, `frameH`, and `frameCount` from actual image dimensions. If the sprite size doesn't match the game world's grid, scale the draw call to fit the `hitbox` dimensions.
- **Hitboxes:** 
  - Must reflect the **visible** sprite art, not the full transparent frame.
  - Use `offsetX` and `offsetY` to align the physics box to the character's feet/body.
  - Always include a `debugDraw()` method to render hitboxes (Red for solid, Green for triggers).


- Assume pixel art sprite sheets (horizontal strip, single row per animation state).
- Always confirm `frameW`, `frameH`, and `frameCount` from actual image dimensions before writing sprite code.
- Hitboxes must reflect the actual visible sprite art. Do not use arbitrary guessed collision boxes when the sprite pixels can be measured or inferred from the art.
- If collision feels wrong, align the hitbox to the visible sprite/body first rather than tuning arbitrary thresholds.
