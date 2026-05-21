# Battle Scene Data Contract

## Purpose

This document defines the minimum data required for the battle scene UI to render the canonical 3v3 battle screen.

This contract is intentionally scene-focused. It does not replace the full shared combat data contract. It is the rendering subset needed by the battle screen.

## Battle Scene State Object

The scene consumes a single battle scene state object.

Top-level shape:

```json
{
  "schemaVersion": "battle-scene-state.v0.1",
  "battleId": "mock-blue-forest-001",
  "ruleset": {},
  "theme": {},
  "assets": {},
  "layout": {},
  "sides": {},
  "uiState": {},
  "commands": []
}
```

## Ruleset Subset

The scene needs enough ruleset data to display command availability.

```json
{
  "rulesetId": "rental-direct-level-30-dev",
  "displayName": "Rental Direct Level 30 Dev",
  "teamSize": 3,
  "levelCap": 30,
  "itemsAllowed": false,
  "combosAllowed": true
}
```

The full ruleset validator belongs to the combat layer. The UI should only consume already-resolved legality flags or simple display flags.

## Asset Manifest

Every creature points to portrait and battle sprite assets.

```json
{
  "creatures": {
    "aquaphant": {
      "portrait": "assets/creatures/aquaphant.png",
      "battleSprite": "assets/creatures/aquaphant.png",
      "nativeFacing": "right"
    }
  },
  "backgrounds": {
    "blueForestArena": "assets/backgrounds/blue-forest-arena.png"
  }
}
```

`nativeFacing` prevents accidental double-flipping.

Allowed values:

```txt
right
left
front
unknown
```

## Side and Slot Data

The scene receives two sides.

```json
{
  "sides": {
    "player": {
      "displayName": "Player",
      "slots": []
    },
    "enemy": {
      "displayName": "Enemy",
      "slots": []
    }
  }
}
```

Each side has ordered slots.

```txt
top
middle
bottom
```

Do not infer slot order from array position only. Store slot IDs explicitly.

## Slot Object

Each slot object:

```json
{
  "slotId": "middle",
  "side": "player",
  "occupied": true,
  "creature": {}
}
```

An empty slot is legal for future 1v1 or 2v2 modes.

```json
{
  "slotId": "bottom",
  "side": "player",
  "occupied": false,
  "creature": null
}
```

## Runtime Creature Rendering Object

The scene needs this subset of resolved runtime creature data:

```json
{
  "runtimeId": "player-aquaphant-001",
  "creatureId": "aquaphant",
  "displayName": "Aquaphant",
  "element": "Water",
  "level": 30,
  "role": "Sustain bruiser",
  "hp": { "current": 420, "max": 420 },
  "mp": { "current": 120, "max": 120 },
  "statusEffects": [],
  "assetKey": "aquaphant",
  "teamMarker": "blue-shield",
  "isKnockedOut": false,
  "isActiveCommandUser": false,
  "isTargetable": true,
  "legalCommands": {
    "attack": true,
    "defend": true,
    "art": true,
    "skill": true,
    "item": false
  },
  "knownArts": [],
  "knownSkills": []
}
```

The renderer does not need all combat stats to draw the first battle screen. It may carry them for debugging, but HP/MP/level/status/commands are the only required combat-visible values for the current mock.

## Command Object

Canonical command objects:

```json
[
  {
    "id": "attack",
    "label": "ATTACK",
    "commandSource": "Attack",
    "iconKey": "attack_sword",
    "enabledByDefault": true
  },
  {
    "id": "defend",
    "label": "DEFEND",
    "commandSource": "Defend",
    "iconKey": "defend_shield",
    "enabledByDefault": true
  },
  {
    "id": "art",
    "label": "ART",
    "commandSource": "Art",
    "iconKey": "art_diamond",
    "enabledByDefault": true
  },
  {
    "id": "skill",
    "label": "SKILL",
    "commandSource": "Skill",
    "iconKey": "skill_spiral",
    "enabledByDefault": true
  },
  {
    "id": "item",
    "label": "ITEM",
    "commandSource": "Item",
    "iconKey": "item_potion",
    "enabledByDefault": false
  }
]
```

`enabledByDefault` is not final legality. The active creature and ruleset still determine actual availability.

## UI State Object

The UI state drives prompt text, active slot, target selection, and selected command.

```json
{
  "phase": "choose_command",
  "prompt": "Choose Command",
  "activeSide": "player",
  "activeSlotId": "middle",
  "selectedCommandId": "attack",
  "targetSide": "enemy",
  "targetSlotId": "middle"
}
```

Recommended phases:

```txt
intro
choose_command
choose_art
choose_skill
choose_item
choose_target
combo_preview
resolving_actions
round_end
battle_end
```

The first implementation only needs `choose_command`.

## Layout Object

The visual layout maps logical slots to normalized coordinates.

```json
{
  "baseWidth": 1672,
  "baseHeight": 941,
  "slots": {
    "player": {
      "top": { "xPercent": 26, "yPercent": 38, "scale": 0.58, "zIndex": 20 },
      "middle": { "xPercent": 31, "yPercent": 52, "scale": 0.74, "zIndex": 30 },
      "bottom": { "xPercent": 25, "yPercent": 68, "scale": 0.62, "zIndex": 40 }
    },
    "enemy": {
      "top": { "xPercent": 74, "yPercent": 38, "scale": 0.58, "zIndex": 20 },
      "middle": { "xPercent": 69, "yPercent": 52, "scale": 0.74, "zIndex": 30 },
      "bottom": { "xPercent": 75, "yPercent": 68, "scale": 0.62, "zIndex": 40 }
    }
  }
}
```

These are visual placement values only. They do not determine targeting or combat order.

## Theme Object

The scene should receive theme tokens.

```json
{
  "themeId": "default-blue",
  "displayName": "Default Blue",
  "colors": {
    "primary": "#064f8f",
    "primaryDark": "#02172f",
    "accent": "#27caff",
    "panelBg": "rgba(3, 31, 68, 0.86)",
    "panelBgSoft": "rgba(3, 70, 120, 0.62)",
    "border": "#06182d",
    "text": "#f2fbff",
    "mutedText": "#a8d8ef",
    "hp": "#35d84b",
    "mp": "#27bfff",
    "disabled": "rgba(145, 164, 178, 0.45)",
    "selected": "#ffffff"
  }
}
```

Future HUD customization should output this same object shape.

## Validation Rules for Scene Input

Before rendering, validate:

```txt
schemaVersion exists
ruleset.teamSize is 1, 2, or 3
slot IDs are top/middle/bottom
occupied slots have creature objects
creature objects have displayName, hp, mp, assetKey
hp.current <= hp.max
mp.current <= mp.max
commands include attack, defend, art, skill, item
selectedCommandId points to a known command
activeSlotId points to an occupied player slot during choose_command
asset keys exist in the asset manifest
```

Invalid scene data should fail loudly during development.

## Boundary Rule

The battle scene owns:

```txt
Visual layout
HUD rendering
Command menu rendering
Selection highlight
Target highlight
Theme token application
Scene-level accessibility labels
```

The combat core owns:

```txt
Command validation
Damage resolution
Accuracy/evasion resolution
Turn order
Targeting and retargeting
Combo detection
Combo resolution
Ruleset validation
Battle event logs
```

Do not duplicate combat rules inside the renderer.
