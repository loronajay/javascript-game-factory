# Questionable Decisions

`questionable-decisions/` is a docs-first multiplayer trivia and penalty mini-game project.

## Current status

- `GDD.md` defines the base game, platform boundaries, and server-authoritative rules.
- `IMPLEMENTATION_PLAN.md` tracks the planned build-out.
- `mini-games/` contains the individual penalty-game concepts used when a player misses a trivia question.
- `index.html` now boots a modular browser prototype through `js/main.js`.
- `tests/` contains Node test coverage for the prototype structure and core game rules.

## Folder intent

This folder is now the playable prototype home for the cabinet. Keep the main trivia board, penalty-game selection, and cabinet integration in this folder, while preserving each mini-game spec as a clear design reference.

## App structure

- `js/data/` owns seed content for the current prototype.
- `js/core/` owns state creation, selectors, game rules, and the DOM controller.
- `js/render/` owns HTML rendering helpers and screen templates.
- `css/` owns the game-show presentation layer.

## Local checks

Run the test suite:

```powershell
node --test
```

Serve the module app over localhost before opening it in a browser:

```powershell
node scripts/serve-static.mjs
```
