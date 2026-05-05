# Javascript Game Factory

This repository is a browser arcade built with vanilla HTML, CSS, and JavaScript. It contains two kinds of code:

- game cabinets under `games/`
- shared platform pages, modules, and API code for identity, profiles, messages, notifications, events, and thoughts

There is no global frontend build step by default. Most surfaces are plain `index.html` entry points that import shared modules from `js/` and styles from `css/`.

## Top-level map

- `games/`: self-contained game cabinets and game design work
- `js/`: shared frontend modules, page wiring, platform contracts, and frontend tests
- `css/`: shared styles for platform pages and shared shell UI
- `images/`: shared non-game assets used across the platform shell
- `platform-api/`: persistent backend API for accounts, profiles, thoughts, relationships, messages, notifications, metrics, and uploads
- `planning-docs/`: cross-cutting plans, architecture notes, and migration handoffs
- route folders such as `activity/`, `gallery/`, `me/`, `messages/`, `notifications/`, `player/`, `search/`, and `thoughts/`: page entry points that usually contain an `index.html`
- `grid-previews/`: preview art used by the game catalog/grid experience

## Working model

- Shared platform identity is owned by the factory shell and `platform-api/`.
- Games can derive match-local or session-local names, but they should not become the home for durable profile ownership.
- Game logic and tests stay with each game when practical.
- Shared social and profile behavior should usually land in `js/platform/`, route-level page modules, or `platform-api/src/`.

## Testing

- Game tests usually live inside the relevant game folder and are run with plain Node commands from that folder.
- Shared frontend tests live in `js/tests/`.
- API tests live in `platform-api/tests/`.

Use the nearest README in a major folder before extending that area. Most of the important ownership boundaries in this repo now have local documentation.
