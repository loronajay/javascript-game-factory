# Project Skills: 2D Game Engineering

## 1. Asset Generation & Implementation
- **Placeholder Generation**: If an image asset is missing, create a temporary one using a `Canvas` utility.
  - Return a Base64 string: `canvas.toDataURL()`.
  - Use specific HEX colors for identification (e.g., #FF00FF for missing, #00FF00 for player).
- **CSS-as-Sprite**: For UI elements or static tiles, use `box-shadow` or `background-image` linear-gradients to simulate pixel art without external files.

## 2. Sprite Scaling & Rendering
- **Scaling Strategy**: Always decouple "World Units" from "Screen Pixels."
  - Use a `scaleFactor` (e.g., `canvas.height / VIRTUAL_HEIGHT`).
  - Set `ctx.imageSmoothingEnabled = false` for every draw call to maintain pixel art crispness.
- **Dynamic Fitting**: Calculate `drawWidth` and `drawHeight` by multiplying the sprite's `frameW/H` by the game's `scaleFactor`.
- **Z-Index Rendering**: Render in this specific order:
  1. Static Backgrounds (Parallax)
  2. Map Tiles/Environment
  3. Entities (Player, Enemies)
  4. HUD/UI (Drawn with `ctx.setTransform(1,0,0,1,0,0)` to bypass camera movement).

## 3. Environment & Camera
- **Camera Follow**: Implement a camera object with `x`, `y`, and `lerp` (smoothing).
  - Use `ctx.translate(-camera.x, -camera.y)` before drawing the world.
- **Culling**: Only run `draw()` logic for environment tiles or entities that overlap the current `camera.viewport`.

## 4. Collision & Hitbox Rules
- **Rule of Literalism**: 
  - Visible hurtbox touches visible obstacle hitbox = **Miss**.
  - Player fully passes without contact = **Clear**.
- **Offset Math**: Use `hitbox.offsetX` and `hitbox.offsetY` to center the physics box on the sprite's actual pixels, ignoring transparent padding in the sprite sheet.
- **Visual Validation**: Every entity must have a `debugDraw(ctx)` method.
  - Draw hitboxes with a 1px stroke. 
  - Validate one obstacle's collision logic fully before moving to the next.

## 5. Game Loop & Input
- **Input Buffer**: Capture key states in a `Set` or `Map` to handle simultaneous presses (e.g., Jump + Move).
- **Deterministic Updates**: Logic updates should use a fixed delta time or be capped at 60fps to ensure physics don't break on high-refresh-rate monitors.

## 6. Launcher UI Enhancements
- **Cabinet Thumbnails**: Each `game.json` must define a `preview` field (GIF or static PNG).
  If absent, generate a placeholder via `PlaceholderGenerator` using the game's `accentColor`.
- **Zoom Launch**: On `.game-card` click, apply `transform: scale(1.08)` with a 300ms
  `ease-in` before navigating. Set `transform-origin` to the card's center.
- **Hover SFX**: Use Web Audio API — a 30ms square wave at 440Hz for hover, 880Hz for select.
  Gate behind `window.matchMedia('(prefers-reduced-motion: no-preference)')`.

