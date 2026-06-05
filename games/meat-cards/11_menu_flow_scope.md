# Meat Cards — Menu Flow Scope

This document captures the agreed menu flow architecture so work can resume after a context clear.

## Current State (Before This Work)

- `dev/game-board.html` is acting as the game entry point — it boots directly into a live match using hardcoded player configs (Player One = meat_deck, Player Two = useless_deck).
- There is no `index.html`, no menu, no mode select, no deck select, and no results screen.
- The game board engine is solid and should not change during this pass.

---

## Target: What We Are Building

A proper `index.html` entry point with a menu flow that drives the player through mode select, deck select, and into the game board, then to a results screen.

---

## Screen Map

```
index.html
  └── app.mjs  (screen router)
        ├── MainMenuScreen
        │     ├── VS CPU              [LOCKED — greyed out]
        │     ├── Online Multiplayer  [LOCKED — greyed out]
        │     ├── Debug               [ACTIVE — skips to game board]
        │     ├── How to Play         [ACTIVE — rules reference screen]
        │     └── Settings            [LOCKED — placeholder]
        │
        ├── DeckSelectScreen          (reached from VS CPU or Online when unlocked)
        │     ├── Blind Pick          (both players pick simultaneously; same deck allowed)
        │     └── Draft Pick          (coin toss → alternating picks; no bans until more decks)
        │
        ├── GameBoardScreen           (existing game-board-app.mjs, wrapped in screen shell)
        │
        ├── HowToPlayScreen           (rules reference)
        │
        └── ResultsScreen
              ├── Stats panel         (turns played, monsters killed, damage dealt, cards played, stars spent)
              ├── Rematch button      (same decks, new match)
              └── Main Menu button
```

---

## Mode Notes

### Debug (active now)
- Skips menu entirely.
- Boots a match using hardcoded configs same as `dev/game-board.html` does today.
- Will be removed when online mode ships.
- Player configs: Player One = meat_deck, Player Two = useless_deck.

### VS CPU (locked)
- Not playable yet. Button exists on main menu but is visually greyed out and non-interactive.
- Will eventually flow: Main Menu → Deck Select → Game Board (CPU opponent).

### Online Multiplayer (locked)
- Not playable yet. Button exists on main menu but is visually greyed out and non-interactive.
- Will eventually flow: Main Menu → Public/Private Lobby → Deck Select → Game Board.
- Online scope is intentionally deferred — do not start building it during this pass.

---

## Deck Select Modes

### Blind Pick
- Both players pick a deck without seeing each other's choice.
- Same deck is allowed (both can pick Meat Deck, for example).
- In the current hotseat/debug context this is academic but the UI should support it.

### Draft Pick
- A coin toss determines who picks first.
- Players alternate picks.
- No bans until the card pool grows — with only 2 decks, banning is skipped.
- Draft pick is designed to scale to a larger pool; the ban phase is a no-op for now.

---

## Identity

Follows the same factory pattern as Lovers Lost and Battleshits:
- Player name is read from the platform identity module.
- No extra name entry screen in this flow.
- In debug mode, fall back to "Player One" / "Player Two" if no factory identity is present.

---

## Results Screen

Shown after the game engine signals a win condition.

Stats to surface (from engine state):
- Winner name
- Turns played
- Monsters killed (per player)
- Total damage dealt (per player)
- Cards played (per player)
- Stars spent (per player)

Actions:
- **Rematch** — same deck assignments, new match, goes straight back to game board.
- **Main Menu** — returns to main menu screen.

---

## File Structure

```
games/meat-cards/
  index.html                        ← new entry point (replaces dev/game-board.html role)
  src/
    app.mjs                         ← screen router; owns mount/unmount lifecycle
    ui/
      menu/
        main-menu.mjs               ← main menu screen
        how-to-play.mjs             ← rules reference screen
        deck-select.mjs             ← blind pick + draft pick UI
        results-screen.mjs          ← post-match stats + rematch/menu buttons
        menu.css                    ← shared menu styles
      scene/                        ← existing game board scene (no changes this pass)
    game-board-app.mjs              ← existing (no changes this pass)
```

---

## app.mjs Responsibilities

- Owns a single root container (`#appRoot`).
- Knows which screen is active and unmounts the previous one before mounting the next.
- Exposes a `navigate(screenName, params)` function that each screen calls to transition.
- Does not contain any game logic or rendering logic itself.

Transitions:
- `main-menu` → `how-to-play` (back returns to `main-menu`)
- `main-menu` → `debug` → `game-board` (skips deck select)
- `main-menu` → `vs-cpu` → `deck-select` → `game-board` (when unlocked)
- `game-board` → `results`
- `results` → `game-board` (rematch)
- `results` → `main-menu`

---

## What Does NOT Change This Pass

- `src/engine/` — no changes.
- `src/data/` — no changes.
- `src/ui/scene/` — no changes.
- `src/game-board-app.mjs` — no changes; it receives a root container and player configs from `app.mjs`.
- `dev/game-board.html` — keep as a dev shortcut; does not need to be deleted.
- All existing tests must continue to pass.

---

## Engine Signal: How the Game Board Tells app.mjs the Match Ended

`bootGameBoard` currently has no win-condition callback. That needs to be added.

The engine already tracks player HP. When a player reaches 0 HP, the game board app needs to:
1. Detect the win condition after any state mutation.
2. Call an `onMatchEnd(result)` callback passed in by `app.mjs`.
3. `result` shape: `{ winnerId, stats: { turnsPlayed, byPlayer: { [playerId]: { monstersKilled, damageDealt, cardsPlayed, starsSpent } } } }`.

`app.mjs` receives this callback result and navigates to the results screen.

---

## Build Order

1. `index.html` — bare shell, loads `app.mjs`.
2. `src/app.mjs` — screen router with navigate().
3. `src/ui/menu/main-menu.mjs` + `menu.css` — main menu with all buttons (locked ones greyed).
4. Debug path wired: main menu Debug button → game board (hardcoded configs).
5. `src/ui/menu/how-to-play.mjs` — static rules reference screen.
6. Win-condition callback added to `game-board-app.mjs`.
7. `src/ui/menu/results-screen.mjs` — stats display, rematch, main menu.
8. `src/ui/menu/deck-select.mjs` — blind pick + draft pick UI (wired to VS CPU path).
9. VS CPU path wired end-to-end (deck select → game board → results).

---

## Acceptance Criteria

- `index.html` is the canonical entry point for the game.
- Main menu renders with correct locked/unlocked button states.
- Debug button drops directly into a live match.
- How to Play screen is reachable and dismissable.
- A completed match (either player at 0 HP) transitions to the results screen automatically.
- Results screen shows all stats and both action buttons work correctly.
- Rematch restarts with the same deck assignments without returning to the menu.
- All existing engine and scene tests still pass.
