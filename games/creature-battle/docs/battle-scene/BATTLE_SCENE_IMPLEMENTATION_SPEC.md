# Battle Scene Implementation Spec

## Purpose

This document defines how to build the canonical Creature Battle scene using real battle data instead of visual placeholders.

This is a scene implementation spec, not the combat engine. The scene should consume resolved runtime battle data from the shared combat core or a mock fixture that follows the same shape.

## Core Rule

The combat engine uses logical slots.

The visual scene maps those logical slots to screen positions.

Do not let visual coordinates become combat logic.

Correct model:

```txt
battleState.playerSlots = [top, middle, bottom]
battleState.enemySlots  = [top, middle, bottom]

battleScene.slotLayout maps those slots to x/y/scale/zIndex.
```

Incorrect model:

```txt
Combat targeting decides based on CSS coordinates.
```

## Recommended File Structure

```txt
creature-battle/
  battle-scene/
    index.html
    battle-scene.css
    battle-scene.js
    data/
      battle-scene.mock.json
      battle-ui-theme.default.json
    assets/
      backgrounds/
        blue-forest-arena.png
      creatures/
        aquaphant.png
        salamander.png
        pengun.png
      ui/
        command-icons/
          attack.svg or png
          defend.svg or png
          art.svg or png
          skill.svg or png
          item.svg or png
```

For the current repo stage, the scene may be built as a self-contained prototype first, but keep the internal structure separated as if it will later become real game code.

## Screen Regions

The scene should be 16:9 and scale responsively.

Recommended base design size:

```txt
width: 1672
height: 941
aspect-ratio: 16 / 9
```

Use responsive scaling rather than fixed pixel-only placement.

Recommended top-level DOM structure:

```html
<main class="battle-screen" data-theme="default-blue">
  <section class="battle-background"></section>

  <section class="battlefield" aria-label="Battlefield">
    <div class="creature-slot side-player slot-top"></div>
    <div class="creature-slot side-player slot-middle"></div>
    <div class="creature-slot side-player slot-bottom"></div>
    <div class="creature-slot side-enemy slot-top"></div>
    <div class="creature-slot side-enemy slot-middle"></div>
    <div class="creature-slot side-enemy slot-bottom"></div>
  </section>

  <section class="battle-hud battle-hud-top" aria-label="Active creature status"></section>
  <section class="battle-command-panel" aria-label="Battle commands"></section>
</main>
```

## Visual Slot Coordinates

Use normalized percentages so the scene can scale.

Initial canonical coordinates:

```json
{
  "player": {
    "top":    { "xPercent": 26, "yPercent": 38, "scale": 0.58, "zIndex": 20 },
    "middle": { "xPercent": 31, "yPercent": 52, "scale": 0.74, "zIndex": 30 },
    "bottom": { "xPercent": 25, "yPercent": 68, "scale": 0.62, "zIndex": 40 }
  },
  "enemy": {
    "top":    { "xPercent": 74, "yPercent": 38, "scale": 0.58, "zIndex": 20 },
    "middle": { "xPercent": 69, "yPercent": 52, "scale": 0.74, "zIndex": 30 },
    "bottom": { "xPercent": 75, "yPercent": 68, "scale": 0.62, "zIndex": 40 }
  }
}
```

Interpretation:

```txt
xPercent/yPercent = center point of the creature slot
scale = render scale relative to the source sprite baseline
zIndex = draw order; bottom slots draw above upper slots
```

Enemy sprites should be horizontally mirrored by CSS or renderer transform.

```css
.side-enemy .creature-sprite {
  transform: scaleX(-1);
}
```

If the source sprite already faces left, do not double-flip it. Store facing behavior in the asset manifest.

## Top HUD Rendering

The top HUD should render from `battleState.playerSlots` and `battleState.enemySlots`.

Status entry data required:

```txt
slot ID
game side
creature display name
portrait asset
current HP
max HP
current MP
max MP
status list
team marker
is selected / active / targetable flags
```

HUD layout:

```txt
[Player Top] [Player Middle] [Player Bottom] | [Enemy Top] [Enemy Middle] [Enemy Bottom]
```

The current mock shows Salamander, Aquaphant, Pengun order visually across the HUD because that matches the selected slot layout. Do not hardcode the names. Render from the runtime slot list.

## Bottom Command Panel Rendering

The bottom command row uses this command array:

```json
[
  { "id": "attack", "label": "ATTACK" },
  { "id": "defend", "label": "DEFEND" },
  { "id": "art", "label": "ART" },
  { "id": "skill", "label": "SKILL" },
  { "id": "item", "label": "ITEM" }
]
```

The selected command is controlled by UI state:

```json
{
  "phase": "choose_command",
  "activeSide": "player",
  "activeSlot": "middle",
  "selectedCommandId": "attack"
}
```

Do not implement command effects in the scene renderer. The scene renderer should emit a command selection event, then the battle controller decides what happens.

Example event:

```json
{
  "type": "COMMAND_SELECTED",
  "side": "player",
  "slot": "middle",
  "commandId": "attack"
}
```

## Command Availability

Every command has a visual availability state.

```txt
enabled
selected
disabled
hidden only if ruleset/UI mode explicitly requires it
```

Recommended first rule:

```txt
Always render ATTACK, DEFEND, ART, SKILL, ITEM.
Disable ITEM if the ruleset forbids items.
Disable ART if the creature knows no legal Arts or lacks MP for all Arts.
Disable SKILL if the creature knows no legal Skills or cannot pay any Skill cost.
```

## Data Binding Rules

The scene must not use placeholders for creature status.

Bad:

```txt
Hardcoded HP 420/420 in HTML.
```

Good:

```txt
Read hp.current and hp.max from battle-scene.mock.json or live runtime state.
```

The same applies to:

```txt
Creature names
Creature portraits
Creature sprites
HP/MP bars
Command availability
Slot occupancy
Active creature marker
Target marker
Status icons
```

## UI Theme Variables

Use CSS custom properties or equivalent theme tokens.

Minimum theme tokens:

```css
:root {
  --battle-ui-primary: #064f8f;
  --battle-ui-primary-dark: #02172f;
  --battle-ui-accent: #27caff;
  --battle-ui-accent-soft: rgba(39, 202, 255, 0.45);
  --battle-ui-panel-bg: rgba(3, 31, 68, 0.86);
  --battle-ui-panel-bg-soft: rgba(3, 70, 120, 0.62);
  --battle-ui-border: #06182d;
  --battle-ui-text: #f2fbff;
  --battle-ui-muted-text: #a8d8ef;
  --battle-ui-hp: #35d84b;
  --battle-ui-mp: #27bfff;
  --battle-ui-disabled: rgba(145, 164, 178, 0.45);
  --battle-ui-selected: #ffffff;
}
```

Future HUD customization should update tokens, not rewrite layout.

## First Build Acceptance Criteria

The first build passes if:

```txt
The scene loads from JSON fixture data.
The arena background renders behind everything.
All six creatures render in the correct slot positions.
Player creatures face right.
Enemy creatures face left.
The top HUD renders six entries from data.
HP and MP bars reflect current/max values from data.
The bottom command panel shows ATTACK, DEFEND, ART, SKILL, ITEM.
The selected command has a visible cursor/highlight.
Item can be disabled by ruleset data.
No placeholder text such as COMBAT MENU remains.
The layout remains usable at 16:9 desktop sizes.
```

## Deferred Implementation

Do not block the first build on:

```txt
Real damage resolution
Combo previews
Networked PvP
Animations
Status VFX
Audio
Mobile control overlay
Player theme editor UI
```

The first build should be a faithful, data-driven screen renderer. Combat resolution can connect after the scene contract is stable.
