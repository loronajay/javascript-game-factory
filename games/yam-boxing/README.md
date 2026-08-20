# Yam Boxing

The playable game lives at the project root. `index.html` loads modular runtime
code from `src/`, styling from `styles/`, and approved assets from `assets/`.
Rejected prototypes and asset attempts are not retained in this workspace.

## Current match-view slice

- first-person free movement inside the ring;
- independent camera look via keyboard, pointer drag, or touch controls;
- Maddie Bloom anchored at ring center with a fixed world orientation;
- runtime selection of her approved eight-direction idle sprites based on the
  player's position around her;
- an in-match Guard Off/On review toggle (`G` or the on-screen button) that
  briefly crossfades to a consistency-locked high-guard preview derived only
  from the approved idle pixels, without changing the approved idle package;
- character-specific casual fashion, with gloves as her only boxing equipment;
- deterministic camera, movement, projection, and direction-selection logic in
  `src/core/match-state.mjs`.

Run the tests with:

```powershell
node --test
```
