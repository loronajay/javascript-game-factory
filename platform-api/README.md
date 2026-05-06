# Platform API

`platform-api/` is the persistent backend for the shared arcade platform.

## Responsibilities

- account creation and authentication
- password reset flows
- profiles and profile photos
- relationships and friend requests
- thoughts, comments, reactions, and shares
- direct messages
- notifications
- activity and metrics
- uploads

## Structure

- `src/server.mjs`: runtime entry point
- `src/app.mjs`: top-level orchestration and route dispatch shell
- `src/http-utils.mjs`: shared request/response helpers
- `src/routes/`: route-family modules for auth, players, thoughts, photos, messages, and notifications
- `src/config.mjs`: environment and config loading
- `src/db/`: data access modules, domain helpers, and SQL migrations
- `src/normalize.mjs`: thin barrel over domain-specific normalize modules
- `src/services/`: service-layer modules such as auth and upload handling
- `tests/`: Node test coverage for API routes, config, migrations, and DB modules

## Current architecture notes

- `src/app.mjs` is no longer the main home for every route family. Keep new API behavior inside the relevant `src/routes/` or `src/db/` seam instead of growing the shell again.
- `src/db/relationships.mjs` and `src/db/thoughts.mjs` now delegate pure shaping rules into `relationships-domain.mjs` and `thoughts-domain.mjs`.
- New backend cleanup should usually preserve these seams rather than re-centralizing behavior in `app.mjs` or `normalize.mjs`.

## Commands

From `platform-api/`:

```txt
npm start
npm run migrate
npm test
```

## Boundary reminder

This folder is the canonical home for durable platform identity and shared social records. Games should integrate with it rather than re-owning account or profile state locally.
