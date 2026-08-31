# Yam Bowling

A playable local and online bowling cabinet built from the V5 depth and physics prototype.

Character identity, cosmetics, progression, Yam-specific profiles, and campaign progression are tracked in [`METAGAME_SCOPE.md`](METAGAME_SCOPE.md).

## Play

From the JavaScript Game Factory repository root, serve the site over HTTP and open
`games/yam-bowling/index.html`. The cabinet keeps all runtime assets relative to its
own folder, so it also supports its local development server:

```powershell
npm start
```

Open `http://127.0.0.1:4189`. Choose Quick Bowl or Classic Ten, equip an outfit, then play Hotseat, Vs CPU, Quick Match, or a code-based private room with any of the 30 canon bowlers. Local online development expects `factory-network-server` on port 3000.

For the **3D Bowl side mode**, open **Exhibition → Bowling style → 3D Bowl**.
It uses the same setup, bowlers, equipped outfits, eight balls, three- or ten-frame
rules, Hotseat / CPU opponents, pause, results, and rematch flow. All nine houses
have coordinated 3D murals, wall panels, side flooring, upholstery, trim, and lighting
drawn from their original 2D artwork. Crimson Crown has red crown/lightning art;
Blue Circuit has electric chevrons; Emerald Vault has faceted emerald crests;
Royal Gold has violet velvet and gilded Art Deco; Sunset Strip has palms and a
striped synth sun; Neon Carnival has bowling signs, stars and confetti; Cosmic
Bowl has ringed planets and star flooring; Liberty Lanes has banners and trophies;
Oak & Onyx has timber chevrons and a warm-lit trophy display.

Surface art is generated locally with canvas, with no extra image downloads or
dependencies. Four reusable textures repaint only when the house changes; all
houses retain identical physical lane geometry, aiming, and scoring. Decorations
stay outside the lane and the elevated camera corridor. For a development-only
side-by-side comparison with the 2D art, open `tools/lane-gallery.html` on the local
server; it includes approach/follow views and a theme-switch resource check.
Walls use locally bundled, seamless plaster color, normal, and roughness maps
from [Poly Haven](https://polyhaven.com/a/painted_plaster_wall) (CC0). The maps
tile at a consistent world scale across every house. Cross-lane overhead bars
are removed; their lighting and lane reflections remain without blocking the view.
The camera follows the ball, with a Fixed toggle on the lane; reduced motion
disables following. The original Arcade mode, Circuit, tournaments, lessons,
and online play keep their existing engine. 3D exhibition awards no progression.

The 3D lane now has an 84-unit release-to-head-pin run, almost three times the
original length, with the pin deck kept at its original scale. Aiming uses
Arcade's line and power-dependent hook curve until the first pin collision;
Cannon then handles the ball's deflection and pinfall. The preview shows a
dashed white skid line, a blue hook breakpoint, a solid gold hook path, and a
gold target ring at the front standing pins. A red marker warns where a shot
enters the gutter. The camera follows the full lane, and low-power shots get
enough travel time to reach the rack.

3D Bowl requires WebGL 2. Its pinned Three.js and Cannon libraries are bundled
locally and loaded only when starting 3D, with no CDN or package install required.
If graphics initialization fails, setup stays open with a retry/Arcade option.
The provided V6 reference is preserved under `3d-bowl-reference/`; production
modules live in `bowl3d/` and use local Yam assets and scoring.

On the lane, use A/D to strafe and the left/right arrow keys to aim (or use the sliders), then tap Throw or Space to start the moving spin needle. Press and hold again to lock spin and build power; release to bowl. Quick taps roll slowly, while longer holds build steadily to maximum speed. More power carries farther through the oil before the ball hooks. Shift+D toggles the physics hitbox overlay.

## Test

```powershell
npm test
```

The suite covers the roster contract, scoring, final-frame bonuses, turn handoffs, CPU planning, contact response, trajectories, online commands, reconnect handshakes, and required cabinet structure. The 3D tests also exercise real rigid-body pinfall, persistent fall evidence, clean per-roll worlds, gutter capture, bounded shot resolution, CPU corner-pin conversion, and full local match/rematch flow. It uses Node's built-in test runner and needs no package installation.

Python pipeline tests run with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tools -p "test_*.py"
```

## Runtime assets

Browser-facing artwork is WebP. Editable source lineups and protected manual
overrides remain PNG so the art pipeline can regenerate clean runtime files.
To rebuild the optimized image set from the current sources, run:

```powershell
.\.venv\Scripts\python.exe tools\optimize_runtime_assets.py --clean-derived-png
```

`runtime-assets.json` is the allowlist for published game-local files. It omits
source sheets, archived characters, QA previews, and tests. To create a clean
overlay that can be placed at `games/yam-bowling/` in a Factory deployment:

```powershell
.\.venv\Scripts\python.exe tools\package_runtime.py C:\path\to\new\yam-bowling-runtime
```

The packager refuses to overwrite an existing directory. The Node asset-budget
test keeps the 1,074 player-facing runtime images below 72 MB.

## Project map

- `GDD.md`: current local and online design scope.
- `online-client.mjs`: Factory Network v2 lobby client and reconnect state.
- `CLAUDE.md`: as-built architecture and ownership boundaries.
- `runtime-assets.json`: deployment allowlist and runtime image budget.
- `assets/characters/processed/canon/`: five optimized WebP throw frames for each bowler.
- `assets/characters/portraits/canon/`: optimized front-facing selection and identity portraits.
- `assets/characters/skins/<bowler>/<skin-id>/`: drop-in source sheet plus processed alternate outfit assets.
- `tools/extract_canon_frames.py`: character extraction pipeline.
- `tools/process_character_skins.py`: reusable alternate-skin batch processor.
- `tools/optimize_runtime_assets.py`: WebP conversion, resizing, and derived-PNG cleanup.
- `tools/package_runtime.py`: source-free game-local deployment overlay builder.

For tightly overlapping six-pose sheets, use the instance-aware skin pass so
neighboring hair and limbs are removed before the transparent WebPs are written:

```powershell
.\.venv\Scripts\python.exe tools\process_character_skins.py --only maid --instance-model .models\yolo11n-seg.pt --mask-reference-skin swimsuit
```
