# Battle Scene Canon Docs Package

This package contains the repo-ready documents and seed data for building the current Creature Battle scene direction.

## Included Docs

```txt
docs/BATTLE_SCENE_VISUAL_CANON.md
docs/BATTLE_SCENE_IMPLEMENTATION_SPEC.md
docs/BATTLE_SCENE_DATA_CONTRACT.md
```

## Included Data

```txt
data/battle-scene.mock.json
data/battle-ui-theme.default.json
```

## Included Reference Assets

```txt
assets/reference/battle_scene_canon_commands_reference.png
assets/reference/arena_background_reference.png
assets/reference/aquaphant_reference.png
assets/reference/salamander_reference.png
assets/reference/pengun_reference.png
```

The mock JSON uses actual scene data for the current visual target: slot order, HP/MP values, runtime IDs, command labels, command availability, theme reference, and asset keys.

The numeric combat stats in the fixture are prototype scene/rendering data, not final balance data. The build should read them from JSON rather than hardcode them into the UI.
