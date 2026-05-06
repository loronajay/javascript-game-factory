# Circuit Siege Debug Demo v0.5

This is a modular debug prototype.

Open `index.html` through a local server. Because the demo uses ES modules and fetches `data/board.json`, some browsers block it when opened directly from the filesystem.

Example:

```bash
cd Circuit_Siege_Debug_Demo_v0_2
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Notes

- This is not final competitive UI.
- Route hover is intentionally enabled as a debug cheat.
- The board, state, renderer, tools, route table, and log are split into modules.
- The board panel has independent overflow and zoom controls so it does not force the entire page layout apart.

## v0.5 changes

- Event log moved below the board.
- Main layout now uses two columns: tools + board.
- Routes reduced from 5 repair edits to 3 repair edits.
- Each route still keeps at least one hole and one refactorable tile.

## v0.5 changes

- Readability pass on the board layout.
- Reduced excessive overlap and long tangled sections.
- Routes still use non-linear source-to-terminal mapping.
- Repair slots are placed away from overlap-heavy cells where possible.
- Still 3 edits per route.

## v0.5 changes

- Added a toolbar checkbox to enable/disable route-hover cheat behavior.
- When disabled, hovering lines/slots no longer highlights full routes.
- Core editing and route resolution behavior is unchanged.
