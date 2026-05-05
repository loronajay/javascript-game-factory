# Shared Frontend JS

This folder contains the shared frontend JavaScript for the arcade shell.

## Layout

- top-level `arcade-*.mjs` files: page-level entry and view modules for routes such as activity, bulletins, events, me, notifications, player, search, and thoughts
- `platform/`: reusable platform modules for API access, identity, profile data, relationships, activity, thoughts, metrics, storage, and events
- `player-page/`, `thoughts-page/`, `gallery-page/`, `profile-editor/`, and `profile-social/`: feature-specific page modules split into loaders, view-model shaping, rendering, and actions
- `tests/`: shared frontend tests
- `platform-config.js` and utility files such as `arcade-paths.mjs` and `pixel-text.js`: shell-wide helpers and configuration

## Working guidance

- Route folders like `me/` or `player/` usually provide the HTML entry point.
- Modules in this folder should own client-side normalization, page wiring, rendering orchestration, and platform API calls.
- Shared identity and social behavior should usually be extracted into `platform/` or page-specific feature folders instead of growing one large route file.

## Tests

Shared frontend tests live in `js/tests/`. Most are run as direct Node test files from the repo root or through targeted local commands used during development.
