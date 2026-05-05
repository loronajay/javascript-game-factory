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
- `src/app.mjs`: app wiring
- `src/config.mjs`: environment and config loading
- `src/db/`: data access modules and SQL migrations
- `src/services/`: service-layer modules such as auth and upload handling
- `tests/`: Node test coverage for API routes, config, migrations, and DB modules

## Commands

From `platform-api/`:

```txt
npm start
npm run migrate
npm test
```

## Boundary reminder

This folder is the canonical home for durable platform identity and shared social records. Games should integrate with it rather than re-owning account or profile state locally.
