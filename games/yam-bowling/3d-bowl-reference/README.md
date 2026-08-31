# Yam Bowling — 3D Bowl V6

Playable handoff prototype for a future **3D Bowl** mode inside Yam Bowling.

## What is shared from Yam Bowling
- `game-core.js`: scoring, notation, frame completion, standing-pin counts.
- `physics-core.js`: hook-meter timing and charge/overcharge curve.
- `animation-core.js`: canonical roster and five-frame throw assets.
- `ball-core.js`: active ball handling profile.

The demo currently loads those files from the public `javascript-game-factory` repo through jsDelivr. The production port should import the local modules instead.

## V6 shot lifecycle
Each roll is intentionally isolated. At roll resolution:
1. Determine `downIds` from persistent 3D fall evidence.
2. Remove those IDs from the canonical `standingPinIds` set.
3. Commit pinfall to Yam scoring state.
4. Destroy the ball body/mesh.
5. Destroy every pin body/mesh.
6. Rebuild a fresh 3D rack containing only `standingPinIds` for ball 2, or a full rack when Yam rules request one.

This avoids stale Cannon bodies, sleeping/contact caches, and fallen pins carrying into the next ball.

## Presentation
- Lowered physical pit behind the pin deck.
- Kickbacks, back masking unit, sweep bar, lounge blocks, wall panels, neon rail lighting.
- Six procedural theme palettes based on the supplied Yam Bowling lane references.
- Theme selector in the lane HUD.
- Canon character selector and throw-frame animation.
- Mobile layout remains no-scroll.

## Reference art
The six supplied lane moodboards are included under `references/` for the production port. They are design references; the playable 3D room is procedural and does not use the flat lane images as fake perspective textures.
