# Game Scene Overhaul Plan

This is the handoff plan for replacing the current board UI. The current board is a useful engine scaffold, but it is the wrong UX model for the actual game. It behaves like a static HTML page with panels and reflowing layout. The real target is a video-game-style card battler scene.

## Core Problem

The current board should not be polished incrementally as-is.

Problems observed:

- The page layout jumps and grows when selecting cards or confirming actions.
- The viewer and confirmation UI appear as page panels instead of game popups.
- Wider and narrower browser sizes both produce awkward layouts.
- Monster zones, hands, HUD, logs, and overlays compete for layout space.
- Cards feel like HTML buttons, not game pieces.
- The scene does not feel smooth, inviting, or competitive.

The next pass should be a full game scene overhaul, not a patch to the current document layout.

## New Mental Model

Build the board as a fixed game scene, not a responsive document.

The board should act like a video game screen:

- One fixed viewport/stage.
- No document scroll during gameplay.
- Absolute-positioned scene layers.
- Stable battlefield and hand zones.
- Animated state transitions.
- Popup overlays that do not affect layout.
- Cards treated as game pieces/sprites.

CSS grid/flex can still be used inside individual components, but the overall board should not be controlled by document flow.

## Proposed File Structure

Create a scene-focused UI folder:

```text
src/ui/scene/
  game-scene.mjs
  game-scene.css
  card-piece.mjs
  hand-layer.mjs
  battlefield-layer.mjs
  hud-layer.mjs
  overlay-layer.mjs
  scene-layout.mjs
```

Keep these boundaries:

- `src/engine/`: pure game state and rules.
- `src/data/`: card/deck loading.
- `src/ui/scene/`: visual game scene only.
- `src/game-board-app.mjs`: thin app controller wiring engine actions to scene events.

Do not collapse this into one large file.

## Scene Layout Target

The game should render into a fixed root like:

```html
<main id="gameRoot" class="game-stage"></main>
```

Inside it:

```text
game-stage
  table-background
  opponent-hud
  opponent-hand-layer
  battlefield-layer
    opponent-monster-row
    player-monster-row
  player-hud
  player-hand-layer
  action-overlay-layer
  card-viewer-layer
  confirm-overlay-layer
  turn-banner-layer
  event-toast-layer
```

The battlefield belongs in the center. Opponent monsters should not be far away at the top of the page. Player and opponent monster rows should be visually close enough that attacks feel direct.

## UX Rules

- Cards in hand and on the battlefield should appear as whole mini cards.
- Detailed readability comes from the card viewer, not from cramming all text onto board cards.
- Selecting any visible card opens a card viewer popup.
- Selecting enemy cards without attacking should also open the viewer.
- Card actions should appear as a contextual popup/menu, not a fixed command panel.
- Dragging a card from hand to a valid zone should create a pending action.
- Pending actions require confirmation.
- Confirmation must clearly state star cost, for example: `Summon Homie for 2 stars?`
- Confirming applies the engine action.
- Cancelling leaves the state unchanged.
- The viewer/action/confirm popups must never resize or push the board.
- The active turn should be obvious with a strong visual indicator.
- Players should be labeled `Player One` and `Player Two`, not by deck names.
- Turns should start automatically. The player should not click `Start Turn`.
- `End Turn` is a valid player action and should advance the game to the next started turn.

## Interaction Flow

Summon flow:

1. Player drags a monster card from hand to an empty monster slot.
2. Slot highlights as a valid drop target.
3. Drop creates a pending summon action.
4. Confirm overlay says: `Summon <name> for <cost> stars?`
5. Confirm animates card from hand to battlefield, then commits state.
6. Cancel returns to normal.

Later card flow:

1. Player clicks a Later card.
2. Viewer opens with card text.
3. Context menu shows `Play Later`.
4. Click creates pending action.
5. Confirm overlay states cost and effect summary.
6. Confirm animates card toward play/resolution area, then moves to graveyard if instant.

Accessory flow:

1. Player drags accessory card onto one of their monsters, or selects `Equip`.
2. Valid monster targets highlight.
3. Drop/click creates pending equip action.
4. Confirm overlay states star cost.
5. Confirm attaches accessory visually to the monster.

Attack flow:

1. Player selects one of their monsters.
2. Viewer opens and context menu shows `Attack` if legal.
3. Choosing attack enters target mode.
4. Enemy monster targets highlight.
5. Clicking target creates pending attack action.
6. Confirm overlay says attack cost and roll requirement.
7. Confirm rolls and animates result.

## Animation Expectations

The first overhaul does not need final animation polish, but the architecture should support it.

Needed animation hooks:

- Card draw from deck to hand.
- Card drag and snap back.
- Card summon from hand to battlefield.
- Later card play/resolution.
- Accessory attach.
- Attack declaration and roll result.
- Damage/KO feedback.
- Turn start banner.
- Star spending feedback.

Avoid animation that changes document layout. Use transforms, opacity, and absolute positioning.

## What To Preserve

Keep:

- Existing card data files.
- Existing deck data files.
- Existing card validator.
- Existing pure engine direction.
- Existing tests for setup-turn attack blocking, summoning, Later play, accessory equip, and attack roll rules.

The current `src/ui/board-renderer.mjs` and `src/ui/game-board.css` can be treated as disposable scaffolding.

## What To Avoid

- Do not keep patching the board as a static HTML layout.
- Do not make viewer/confirm/action UI participate in normal page flow.
- Do not use page scrolling as a gameplay layout solution.
- Do not put all scene rendering, events, and DOM helpers into one file.
- Do not use deck names as player names.
- Do not keep a `Start Turn` button.
- Do not make the battlefield split across distant top/bottom page sections.

## First Implementation Slice

The next chat should start by replacing the board shell with the new scene model.

Suggested first slice:

1. Create `src/ui/scene/` modules.
2. Render a fixed `game-stage`.
3. Add opponent HUD, player HUD, central battlefield, and player hand as absolute layers.
4. Render hand and battlefield cards as mini whole cards.
5. Open selected-card viewer as a popup layer.
6. Open contextual action menu as a popup layer.
7. Open confirmation as the top-priority overlay.
8. Keep engine actions wired: summon, play Later, equip accessory, normal attack.
9. Verify no document scroll and no layout jump on select/confirm at narrow and wide viewports.

## Acceptance Criteria

The overhaul is not done until:

- The board feels like a game screen, not a webpage.
- Selecting a card does not move any battlefield or hand zones.
- Confirming/cancelling actions does not resize the page.
- Monster rows remain central and visually connected.
- The player hand remains stable and readable as mini cards.
- Viewer/action/confirm overlays are visually distinct and layered correctly.
- First-turn offensive actions remain blocked by the engine.
- All existing tests still pass.
