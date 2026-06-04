# Build Buddy Engine Prototype v7 — Pack/Stage Naming Update

This update moves stage files toward the intended content model: several 10-stage packs.

## Run

Because the project uses ES modules, run it from a local server:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Stage architecture

Stages are organized by pack and stage number, not unique stage titles.

```text
js/stages/
  stage-registry.js
  packs/
    pack-01/
      pack-01-manifest.js
      pack-01-stage-01.js
      pack-01-stage-02.js
      ...
      pack-01-stage-10.js
```

Current registered stage:

```text
pack_01_stage_01
```

Naming convention:

```text
Folder:      js/stages/packs/pack-##/
Stage file:  pack-##-stage-##.js
Manifest:    pack-##-manifest.js
Stage ID:    pack_##_stage_##
Display:     Pack ## — Stage ##
```

Do not force unique names for every stage. Build Buddy is structured around 10-stage packs, so pack/stage coordinates are the durable identifiers.

## View modes

Keyboard:

```text
6 Runner view
7 Builder view
8 Hybrid debug view
```

On-screen buttons are also available in the lower-right corner.

Important: v7 view modes are rendering/view routing only. This local prototype still lets one tester drive both Runner and Builder inputs. The actual online implementation should split control authority by role while preserving this view-mode separation.

## Controls

Runner:

```text
A/D or Left/Right: move
Space: jump / wall-jump
W/Up: climb up
S/Down: descend / drop through one-way platforms
R: reposition
```

Builder:

```text
1: platform
2: yellow spring
3: green spring
4: blue spring
5: checkpoint
Left click: place
Right click: delete
Q/E: builder camera nudge
```

## Notes for agent handoff

The code should now be treated as an engine baseline, not a throwaway prototype. Avoid reintroducing hardcoded single-stage imports into `game.js`. New stages should be registered through pack manifests and `stage-registry.js`.

The local Hybrid view is a development/testing affordance. The production game should use Runner and Builder views as role-specific clients, with Hybrid reserved for local debug or internal testing.
