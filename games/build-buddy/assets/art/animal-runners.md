# Animal runners

Generated with the built-in image generation tool on 2026-09-15.

`animal-runners.png` is a 2172 × 724 RGBA atlas with a transparent background. The four characters are Pip (fox), Clover (rabbit), Scout (raccoon), and Mochi (bear). Crops and body anchors are defined in `js/character-roster.js`. Both the menu and runner renderer use this same art; no CSS character drawing is used.

The portrait atlas contains one ready pose per animal. The four sheets in runners/ each contain 16 real frames: four idle/blink, four run, jump anticipation, airborne jump, fall, landing, and four alternating climb poses. Sheets were generated and background-extracted with the built-in image tool. Runtime uses measured alpha bounds from js/render/runner-frames.js, a constant scale per animal, and aligned feet/wall contact. The simulation-timed state machine reverses descent and freezes grips when stationary. Movement and collision dimensions remain shared.

Only Local Co-op setup displays both player pickers. Online setup displays the local player choice only. Choices are saved under `build-buddy.characters.v1`. Online choices travel with lobby profile messages and are resolved against the current runner's connection/account id without changing Factory identity ownership.

## Generation prompt

Animation sheets used the same animal identity with a 4-by-4 layout: idle/blink; running contact and passing poses; jump, rise, fall, landing; and alternating far/near-hand reach and pull climbing poses. A separate background-extraction pass removed the generated checkerboard while preserving the art. `tools/measure-character-sheets.py` only measures existing alpha pixels; it does not alter the images. Review playback at `tests/character-preview.html`.

Use case: stylized-concept. Asset type: production 2D platformer animal character sprite atlas. Create four cute original animal adventurers arranged in one horizontal row on a genuinely transparent background: orange fox, cream rabbit, gray raccoon, golden round bear. Each has a charming expressive face, big head, compact body, short legs and oversized simple sneakers. Small teal neckerchief as shared team accessory. Natural animal colors and unique readable silhouettes. All facing RIGHT in a consistent 3/4 side view in a relaxed ready-to-run standing pose. Full body, all ears feet tails entirely visible. Exactly four characters, one per equal-width quarter of the canvas, separated with generous transparent margins, same sole baseline and approximately same overall height. No text, ground shadows, scenery, panels, borders, checkerboard, props or construction clothing. Crisp professional hand-painted cartoon game sprites, thick dark brown contour, clean flat colors with only two-tone cel shading, no fine fur detail, highly readable when reduced to 58px tall. Cute and personable, not generic emoji or realistic animals. Wide horizontal composition 1536x1024 or wider as needed; preserve true transparency.

