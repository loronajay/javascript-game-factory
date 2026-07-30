# Shared Frontend JS

This folder contains the shared frontend JavaScript for the arcade shell.

## Layout

- top-level `arcade-*.mjs` files: thin compatibility shims and page-level view modules for routes such as activity, bulletins, events, me, notifications, player, search, and thoughts; most real logic lives in the subsystem folders below
- `platform/`: reusable platform modules, one folder per domain — `api/` (browser clients: `platform-api`, `auth-api`, `auth-token`, `messages-api`, `notifications-api`, and `factory-account-gate`), `identity/`, `storage/`, `profile/`, `metrics/`, `relationships/`, `activity/`, `thoughts/`, `bulletins/`, `events/`, and `ui/` (shared platform widgets, including `online-account-feature-gate.mjs` — the sign-in gate cabinets reuse to disable online buttons for guests)
- `mobile-controller.mts`: the shared on-screen touch controller used by cabinets that need one (`mobile-controller.test.mjs` sits beside it rather than in `tests/`)
- `me-page/`, `player-page/`, `thoughts-page/`, `gallery-page/`, `profile-editor/`, `profile-social/`, and `profile-layout/`: page-specific subsystem modules split into entry, loader, view-model shaping, rendering, wiring, and actions. `profile-layout/` owns the `/me/layout` editor plus the profile layout renderer/normalizer (its `layout-wire.mjs` and `layout-renderer.mjs` are the two largest frontend files)
- `tests/`: shared frontend tests
- `platform-config.mts`, `pixel-text.mts`, and `arcade-input.mts`: the three always-on global scripts (loaded as `<script type="module">` on every page; they attach `__JGF_PLATFORM_API_URL__` / `window.PixelText` / `window.ArcadeInput` and have an ambient contract in `globals.d.ts`). Plus utility files such as `arcade-paths.mts`: shell-wide helpers and configuration

## Source format

- This folder is **TypeScript-sourced**: every module is a `.mts` source that `tsc` emits to a same-named `.mjs` committed in-place (the statically-served site loads the `.mjs`). Edit the `.mts`, then run `npm run build:browser` (emit + `scripts/sync-emitted-mjs.mjs`) to regenerate the `.mjs`. `npm run typecheck:browser` type-checks without emitting. `globals.d.ts` is the permanent ambient declaration for the three global scripts above. The whole non-game codebase is migrated (`strict: true`); only game cabinets remain on plain JS.

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

Shared frontend tests live in `js/tests/` and run with Node's built-in runner from the repo root:

```bash
node --test js/tests/*.test.mjs
```

A few tests sit beside the module they cover instead (`platform/api/platform-api.test.mjs`, `platform/api/factory-account-gate.test.mjs`, `mobile-controller.test.mjs`). There is no test framework — `node:test` + `node:assert` only.
