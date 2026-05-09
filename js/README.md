# Shared Frontend JS

This folder contains the shared frontend JavaScript for the arcade shell.

## Layout

- top-level `arcade-*.mjs` files: thin compatibility shims and page-level view modules for routes such as activity, bulletins, events, me, notifications, player, search, and thoughts; most real logic lives in the subsystem folders below
- `platform/`: reusable platform modules for API access, identity, profile data, relationships, activity, thoughts, metrics, storage, and events
- `me-page/`, `player-page/`, `thoughts-page/`, `gallery-page/`, `profile-editor/`, and `profile-social/`: page-specific subsystem modules split into entry, loader, view-model shaping, rendering, wiring, and actions
- `tests/`: shared frontend tests
- `platform-config.js` and utility files such as `arcade-paths.mjs` and `pixel-text.js`: shell-wide helpers and configuration

## Current architecture notes

- All major page surfaces now have dedicated subsystem folders. `arcade-me.mjs`, `arcade-player.mjs`, and `arcade-thoughts.mjs` are thin compatibility shims; real ownership lives in `me-page/`, `player-page/`, and `thoughts-page/`.
- `me-page/` owns the full `/me` owner-profile surface: `entry.mjs` (boot/auth), `view-model.mjs`, `render.mjs`, `friend-code-actions.mjs`, `wire.mjs`, `page-data.mjs`, `media-actions.mjs`, `friend-navigator.mjs`, `render-sections.mjs`. `arcade-me-view.mjs` stays at root as the HTML template layer.
- `gallery-page/` has explicit viewer seams: `viewer-state.mjs`, `viewer-social.mjs`, `viewer-page-actions.mjs`, and `viewer-page-controller.mjs`.
- `profile-social/` keeps shared thought-card rendering in `social-view-thoughts.mjs`, with shared escape/date helpers in `social-view-shared.mjs`.
- New shared frontend work should land in these subsystem folders, not in top-level `arcade-*.mjs` files.

## Working guidance

- Route folders like `me/` or `player/` usually provide the HTML entry point.
- Modules in this folder should own client-side normalization, page wiring, rendering orchestration, and platform API calls.
- Shared identity and social behavior should usually be extracted into `platform/` or page-specific feature folders instead of growing one large route file.

## Tests

Shared frontend tests live in `js/tests/`. Most are run as direct Node test files from the repo root or through targeted local commands used during development.
