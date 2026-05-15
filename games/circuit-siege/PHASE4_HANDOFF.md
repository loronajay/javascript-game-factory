# Circuit Siege — Phase 4 Handoff

## What was completed this session

### Phase 2 — Compact map format (server tests)
- Fixed `expandSlots` in both `scripts/shared/board-format.js` (client) and `shared/board-format.mjs` (server) to compute `expectedMask` from route geometry via `computeExpectedMask(path, x, y)`
- Added `deriveMaskFromRouteCell` import to `shared/board-format.mjs` (server)
- Fixed all test files that were loading the board without `expandCompactBoard` — now all 6 affected test files use `rawBoard.grid ? expandCompactBoard(rawBoard) : rawBoard` pattern
- All server-side tests pass (room-engine, server-bridge, board-catalog)

### Phase 3 — Board editor compact format round-trip
- Updated `scripts/client/map-editor-state.js`: `formatBoardForEditorExport` now calls `serializeCompactBoardDefinition` which produces true compact format (`{grid, routes:[{src,term,type,path,slots}]}`)
- Updated `scripts/client/init-map-editor.js`: added `toEditorDraft()` helper that detects compact format, expands it, filters to blue-only routes/slots, then normalizes for the editor
- Updated `tests/client/map-editor-state.test.js` to verify the compact export format (grid object, no routeId/cells/paintTiles/points keys)

### Phase 4a — UX polish pass 1 (visual improvements)
All changes are client-only — no server changes needed.

**Slot readability** (`styles/game-board.css`):
- Empty hole slots pulse a cyan glow (`hole-pulse` keyframe, 1.8s)
- Refactor (pre-placed editable) slots pulse a yellow ring (`refactor-ring` keyframe, 2.6s)
- Both animations stop on `:hover` so the hover style takes over cleanly
- Animations only apply to `.slot-group--editable:not(.slot-group--locked):not(:hover)` slots

**Score progress pips** (`scripts/client/board-view-model.js`, `scripts/client/app-renderer.js`, `styles/game-match.css`):
- Added `scoreCount: { blue: N, red: N }` to `buildBoardViewModel` return value
- Score blocks now show 5 pip circles (filled in team color = routes scored) above the "X / 5" count
- `app-renderer.js` renders pips via `renderScorePips(count, max, side)` using `innerHTML`
- `game-match.css`: `.score-block strong` is now a flex column, added `.score-pips`, `.score-pip`, `.score-pip--filled-blue/red/empty` styles

**Held piece text cleanup** (`scripts/client/app-renderer.js`):
- Removed `(${mask})` suffix — "Holding: Corner NE (NE)" → "Holding: Corner NE"

**Tests updated**:
- `tests/client/app-renderer.test.js`: added `scoreCount: { blue: 0, red: 0 }` to fake view model, updated held piece text assertion

All tests pass: `npm test` in the javascript-games circuit-siege folder.

---

## Design decision locked: NO route hover highlighting

**Do not add route hover/trace highlighting.**

The core puzzle of Circuit Siege is mentally tracing wires to identify which routes lead to damage vs dud terminals. If hovering a route highlights it end-to-end, players can trivially identify and avoid dud routes — defeating the game's central challenge.

The GDD's open question ("Should there be a scan/highlight tool?") is answered: **no**. Mental tracing IS the puzzle.

---

## Phase 4b — Planned next (not yet implemented)

Three small improvements to implement after testing:

### 1. Play Again button
- **`index.html`**: Add `<button id="btn-play-again" class="action action--blue action--wide">Play Again</button>` above the existing "Return To Menu" button in `.result-actions`
- **`scripts/client/app-controller.js`**: Add `playAgain()` method:
  ```js
  async function playAgain() {
    const side = runtime.selectedSide || queueSetupState.publicSide || "blue";
    await leaveMatchmaking();
    selectSide(side);
    await findMatch();
  }
  ```
  Expose in returned API object.
- **`scripts/client/init-game.js`**: Wire button inside `bindButtons`:
  ```js
  root.querySelector("#btn-play-again")?.addEventListener("click", () => {
    app.playAgain?.();
  });
  ```

### 2. Number key tool selection (1–6)
- **`scripts/client/init-game.js`**: Add inside the existing `keydown` handler, after the `f` key check:
  ```js
  const digit = parseInt(key, 10);
  if (!isNaN(digit) && digit >= 1 && digit <= 6) {
    const toolOrder = ["EW", "NS", "NE", "ES", "SW", "NW"];
    app.selectTool(toolOrder[digit - 1]);
    event.preventDefault();
    return;
  }
  ```
  Maps 1→EW, 2→NS, 3→NE, 4→ES, 5→SW, 6→NW (left-to-right, top-to-bottom palette order).
- **`index.html`**: Update tool button `aria-label` attributes to include key hint, e.g. `"Straight horizontal (1)"`.

### 3. Escape key to drop held piece
- **`scripts/client/init-game.js`**: Add in `keydown` handler:
  ```js
  if (key === "escape") {
    app.clearHeldPiece?.();
    event.preventDefault();
    return;
  }
  ```
- **`scripts/client/app-controller.js`**: Add `clearHeldPiece()`:
  ```js
  function clearHeldPiece() {
    inputState = selectTool(inputState, null);
    rerender();
    return true;
  }
  ```
  Check that `board-input-controller.js`'s `selectTool` handles `null` gracefully (it should already since `heldMask: null` means no tool held).

### Tests to add for Phase 4b
- **`tests/client/app-controller.test.js`**: `playAgain()` re-queues with same side; `clearHeldPiece()` zeroes out `heldMask`
- **`tests/client/init-game.test.js`**: Keys 1–6 call `selectTool` with correct mask; Escape calls `clearHeldPiece`

---

## Running tests

```
# javascript-games repo
cd games/circuit-siege
npm test

# factory-network-server repo  
cd games/circuit-siege
node room-engine.test.mjs
node server-bridge.test.mjs
node board-catalog.test.mjs
```

Both suites should be fully green after Phase 4a.
