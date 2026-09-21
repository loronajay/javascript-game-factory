# Farm animals — asset credits

## Gobkit Free Animal Pack
- Source: https://gobkit.itch.io/gobkit-free-animal-pack
- License: **CC0 1.0** (public domain) — commercial use OK, no attribution required, modification and redistribution allowed. Original `LICENSE.txt` and `README-gobkit.txt` kept beside the files.
- Format: rigged low-poly GLB, unlit baked colour, one shared atlas (`atlas.png` is the raw atlas for recolours; each GLB embeds its own copy).
- Animation: one 120-frame track per file at 24 fps — subclip with `AnimationUtils.subclip(clip, name, from, to, 24)`:

| clip   | frames  |
|--------|---------|
| idle   | 0–29    |
| attack | 30–59   |
| dead   | 60–89   |
| walk   | 90–119  |

| file              | pack name  |
|-------------------|------------|
| `anglerfish.glb`  | Anglerfish |
| `bat.glb`         | Bat        |
| `corgi.glb`       | Corgi      |
| `duck.glb`        | Duck       |
| `hippo.glb`       | Hippo      |
| `jellyfish.glb`   | Jellyfish  |
| `platypus.glb`    | Platypus   |
| `red-panda.glb`   | Red (red panda) |
| `rhino.glb`       | Rhino      |
| `shark.glb`       | Shark      |

Files were renamed to kebab-case only; the meshes, rigs and textures are unmodified.
