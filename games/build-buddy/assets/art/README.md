# Night Shift artwork

Generated with the built-in OpenAI image generation tool on 2026-09-11. Original PNG outputs are preserved without raster edits.

- `sky.png`: opaque sky, fixed backdrop.
- `city.png`: transparent distant scenery, 0.18 camera speed.
- `cranes.png`: transparent near scenery, 0.42 camera speed.
- `springs.png`: yellow, green and blue sprite atlas. Runtime crops remove transparent padding and map each device to its existing 54 × 28 hitbox. Collision and bounce strength remain defined by the tool constants.

Layers move vertically as well as horizontally. Alternating mirrored tiles avoid hard wrap seams. Code-rendered fallbacks remain available while images load.

## Generation prompts

### sky

Use case: game-asset. Create a wide 1536x1024 raster background for Build Buddy, a polished 2D cooperative construction platformer. Night shift, painterly graphic novel atmosphere, deep ink navy upper sky blending into muted petrol teal haze at bottom, a small warm cream moon high toward upper right, wispy elongated clouds. Very restrained contrast, calm negative space for gameplay. Sky only: no buildings, cranes, ground, platforms, characters, text, border, watermark. Edge colors match horizontally for scrolling. Opaque full bleed artwork.

### city

Use case: game-asset. Create a wide 1536x1024 TRANSPARENT PNG parallax layer for a polished 2D night-shift construction platformer. Only a distant industrial city skyline along the bottom half: varied blocky warehouses, unfinished towers, rooftop vents, occasional tiny warm amber windows. Sophisticated painterly graphic novel style, subdued slate blue and petrol teal silhouettes, navy shadows, atmospheric low contrast. Orthographic side view. Buildings fill entire bottom edge; upper half genuinely transparent alpha with no sky or backdrop. No ground platforms, foreground objects, cranes, people, text, border or watermark. Horizontally seamless silhouette endpoints at same height. Single layer, not a mockup.

### cranes

Use case: game-asset. Create a wide 1536x1024 TRANSPARENT PNG parallax foreground scenery layer for a polished 2D night-shift construction platformer. A sparse row of three large construction tower cranes and skeletal steel structures rising from bottom edge. Orthographic side view, elegant industrial graphic novel art, ink navy steel silhouettes with selective desaturated teal highlights and a few small amber warning lights. Airy open negative space between thin structural beams. Genuine transparent alpha everywhere outside the structures, no sky, no city, no ground surface, no characters, text, border or watermark. Dark muted distant scenery, no bright distracting highlights. Entire structure feet extend to bottom edge. Single layer, not a mockup.

### springs

Use case: game-asset. A production sprite atlas for Build Buddy, a 2D side-scrolling construction game. Transparent PNG, wide 1536x1024 canvas. EXACTLY THREE isolated spring launch pads in a single horizontal row, evenly spaced: yellow cap on left, green cap in middle, blue cap on right. All three have IDENTICAL geometry and size. Each is a low wide mechanical device aspect ratio exactly 54:28: a perfectly horizontal broad flat colored rectangular top cap, one stout silver compression coil underneath, dark navy bolted base. Orthographic FRONT/SIDE elevation for a platformer, NO perspective, NO visible top plane, no sloping launch surface. Crisp illustrated industrial game art, simple bold shapes readable at 54x28 pixels, subtle highlights and strong outlines. Cap is widest part, flat top flush with top of each sprite bounding box; base flush with bottom. Objects separated by large transparent gaps. Genuine transparent alpha, no floor shadow, glow, backdrop, text, labels, numbers, border or watermark. No extra items. All three objects sit at same vertical position.

