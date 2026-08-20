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

On the lane, use A/D to strafe and the left/right arrow keys to aim (or use the sliders), then tap Throw or Space to start the moving spin needle. Press and hold again to lock spin and build power; release to bowl. Quick taps roll slowly, while longer holds build steadily to maximum speed. More power carries farther through the oil before the ball hooks. Shift+D toggles the physics hitbox overlay.

## Test

```powershell
npm test
```

The suite covers the roster contract, scoring, final-frame bonuses, turn handoffs, CPU planning, contact response, trajectories, online commands, reconnect handshakes, and required cabinet structure. It uses Node's built-in test runner and has no package dependencies.

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
test keeps the 482 player-facing runtime images below 48 MB.

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
