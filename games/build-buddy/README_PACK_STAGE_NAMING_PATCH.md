# Historical Build Buddy Pack/Stage Naming Patch

This document records the original pack/stage-coordinate migration. The patch has been applied and the first pack now contains all ten registered stages. Use `README.md` for the current cabinet guide.

## Files introduced by the original patch

```text
js/stages/stage-registry.js
js/stages/packs/pack-01/pack-01-manifest.js
js/stages/packs/pack-01/pack-01-stage-01.js
```

## Files retired by the original patch

```text
js/stages/builder-required-route-01.js
js/stages/stage-01-gapworks.js
```

Those files are obsolete and no longer imported by the registry.

## Convention

```text
Folder:      js/stages/packs/pack-##/
Stage file:  pack-##-stage-##.js
Manifest:    pack-##-manifest.js
Stage ID:    pack_##_stage_##
Display:     Pack ## — Stage ##
```

Original first stage:

```text
File:        js/stages/packs/pack-01/pack-01-stage-01.js
Stage ID:    pack_01_stage_01
Display:     Pack 01 — Stage 01
```

Pack/stage position remains the source of truth. The current manifest and stage list live under `js/stages/packs/pack-01/`.
