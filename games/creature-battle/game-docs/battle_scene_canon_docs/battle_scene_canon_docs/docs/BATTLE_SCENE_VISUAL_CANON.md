# Battle Scene Visual Canon

## Purpose

This document locks the current Creature Battle screen direction so the scene can be implemented consistently instead of rebuilt from scratch every time the UI is revised.

The visual target is the current 16:9 battle mock with:

- a mystical blue forest arena background
- a circular stone battle platform
- two active teams of three creatures
- a full-width top HUD showing active creature status
- a bottom command panel showing the canonical battle commands
- a clean blue fantasy/pixel-RPG interface style

Reference image:

```txt
assets/reference/battle_scene_canon_commands_reference.png
```

## Locked Screen Structure

The battle scene has four major layers.

```txt
1. Background Layer
2. Creature Layer
3. Top HUD Layer
4. Bottom Command Layer
```

The layers should be implemented separately. Do not bake the HUD into the background. Do not bake creature placement into the background. Do not make the visual coordinates the source of battle logic.

## Battlefield Layout

The battle format is visually 3v3.

Each side has three visual slots:

```txt
Top
Middle
Bottom
```

The current canonical starter layout is:

```txt
Player side:
- Top: Salamander
- Middle: Aquaphant
- Bottom: Pengun

Enemy side:
- Top: Salamander
- Middle: Aquaphant
- Bottom: Pengun
```

The teams face each other across the center of the arena.

Player-side creatures face right. Enemy-side creatures face left.

The middle slot is slightly more central and larger than the top and bottom slots. The top and bottom slots are slightly farther back and smaller. This keeps the scene readable while preserving the 3v3 formation.

## Creature Scale

Creatures should stay small enough that the arena remains visible.

Bad direction:

```txt
Creatures fill the screen like character portraits.
```

Correct direction:

```txt
Creatures read as battlefield units on a shared arena.
```

The mock reference uses small-to-medium creature scale, leaving the circular arena center mostly open. Preserve that spacing.

## Top HUD Canon

The top HUD spans the full screen width.

It displays six active creature status entries, divided by team.

Each entry should display:

```txt
Creature portrait/icon
Creature display name
HP label
HP bar
Current HP / Max HP
MP label
MP bar
Current MP / Max MP
Small team/status marker
```

The HUD should be compact. It must not consume the main battlefield.

The default HUD visual style is:

```txt
Primary color: deep blue
Accent color: cyan
HP bar: green
MP bar: blue/cyan
Text: white or near-white
Panel style: translucent blue glass / pixel-fantasy frame
Borders: dark outline with cyan highlights
```

## Bottom Command Panel Canon

The bottom panel displays the canonical battle commands:

```txt
ATTACK
DEFEND
ART
SKILL
ITEM
```

The panel may include a small prompt box, usually:

```txt
Choose Command
```

The selected command should be visually highlighted with a cursor, arrow, glow, or brighter panel treatment.

Do not use the literal placeholder text `COMBAT MENU` in the final battle UI. That was only a style reference.

## Command Meaning

The command labels are locked for the battle UI.

```txt
ATTACK = Basic physical action
DEFEND = Defensive action for the round
ART    = Species-defined magic-style Art menu
SKILL  = Class-tree active Skill menu
ITEM   = Battle item menu, if legal under the selected ruleset
```

If a ruleset disables items, `ITEM` should remain visible only if the UI needs consistency, but it should be disabled/greyed out with a clear unavailable state. Do not silently remove commands unless a specific UI mode requires it.

## Default Art Direction

The default battle theme is:

```txt
Blue fantasy battle HUD
Mystical arena background
Pixel-RPG inspired UI framing
Illustrated creature sprites
Clean symmetrical 3v3 layout
Readable HP/MP status strip
Large bottom command panel
```

This is the canon default, not the only future theme.

## Future HUD Customization Vision

The HUD must be built so theme colors can be changed later without changing layout or combat logic.

Future player customization may include:

```txt
HUD primary color
HUD secondary color
Accent/glow color
Panel opacity
Border style
Cursor/highlight color
Team-side accent colors
HP/MP palette presets
Status indicator style
Command button icon style
```

Hard rule:

```txt
Layout is stable. Theme is customizable.
```

Do not let player HUD customization move the status panels, hide core HP/MP data, change command order, or reduce battle readability.

## Non-Goals for First Implementation

Do not implement these in the first scene build:

```txt
Full animation pipeline
Particle effects
Combo preview animation
Damage number animation
Status effect VFX
Spectator UI
Replay controls
Player-custom HUD editor
Mobile-specific rearranged layout
```

The first goal is a stable, data-driven battle screen that renders real runtime creature data and the canon command menu.
