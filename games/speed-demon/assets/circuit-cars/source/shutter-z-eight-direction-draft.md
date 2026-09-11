# Shutter Z directional draft — 2026-09-10

Generated with the built-in OpenAI image generation tool, using `assets/car-sheets/models-a.png` as the vehicle identity reference and the Kaido circuit atlas as the camera/style reference.

This draft is **not runtime-ready**: its checkerboard is baked into opaque pixels. A second image-generation attempt to remove the background also produced an opaque checkerboard. Do not register it in the runtime catalog until it has real alpha, is compiled, and passes visual inspection.

## Generation prompt

Create a production game sprite turntable for ONE car, Shutter Z, the silver car in ROW 1 COLUMN 3 of reference image 1 (vented hood, classic Nissan 300ZX-like coupe, four round red rear lamps, rear spoiler). Reference 1 is vehicle identity. Reference 2 is style/camera reference only. Deliver transparent PNG, eight evenly spaced cells arranged 4 columns by 2 rows. Same car in ALL cells, no stripes, neutral silver paint, dark glass, red rear lights, white front lights. Fixed elevated camera 55 degrees above ground, orthographic, car turns on ground, NOT rotating a flat image. Car noses physically point in this exact row-major sequence: UP, UPPER RIGHT, RIGHT, LOWER RIGHT; DOWN, LOWER LEFT, LEFT, UPPER LEFT. UP shows rear bumper at bottom of car and hood toward top; DOWN shows front bumper at bottom and rear toward top. Diagonals must show correct front/rear. Consistent size and silhouette, full wheels and body visible, centered with generous margins in each equal cell. Crisp detailed arcade sprite shading, no text, no labels, no floor, no shadows outside silhouette. Maintain Shutter Z identity and distinct vented hood from reference. This is an unstriped base intended for runtime paint and stripes.

## Unsuccessful transparency retry

Remove the baked checkerboard background from this sprite sheet. Preserve all eight car sprites exactly. Output actual RGBA alpha transparency, not a drawn checkerboard. Background pixels must have alpha=0. No other changes.
