# Build Buddy Pack/Stage Naming Patch

This patch replaces named-stage files with pack/stage-coordinate files.

## Replace/add

```text
js/stages/stage-registry.js
js/stages/packs/pack-01/pack-01-manifest.js
js/stages/packs/pack-01/pack-01-stage-01.js
```

## Delete old stage files if present

```text
js/stages/builder-required-route-01.js
js/stages/stage-01-gapworks.js
```

Those files are obsolete. The registry no longer imports them.

## Convention

```text
Folder:      js/stages/packs/pack-##/
Stage file:  pack-##-stage-##.js
Manifest:    pack-##-manifest.js
Stage ID:    pack_##_stage_##
Display:     Pack ## — Stage ##
```

Current stage:

```text
File:        js/stages/packs/pack-01/pack-01-stage-01.js
Stage ID:    pack_01_stage_01
Display:     Pack 01 — Stage 01
```

Do not invent names for every stage unless the game later needs human-facing named stages. Pack/stage position is the source of truth.
