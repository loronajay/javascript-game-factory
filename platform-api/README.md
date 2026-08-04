# Platform API

`platform-api/` is the persistent backend for the shared arcade platform.

## Responsibilities

**Social platform**

- account creation and authentication
- password reset flows
- profiles, profile photos, and saved profile layouts
- relationships and friend requests
- thoughts, comments, reactions, and shares
- direct messages
- notifications
- activity and metrics
- uploads
- platform administration: bulletins, the event calendar, arcade-grid presentation overrides, the report queue, account suspensions, the admin roster, and an audit log

**Cross-game infrastructure** — the backend is not only the social spine; cabinets depend on it for competitive and commercial state:

- per-game ELO ratings (`/ratings/:gameSlug`), open to any slug matching `[a-z0-9-]{1,60}` with no allowlist, so a new ranked game wires in without a route change
- ranked matchmaking, rendezvous, server-authoritative ranked identity, per-unit stats, liveness/forfeit sweeps, and match history
- cross-game ladder standings and public leaderboards
- per-game social graphs and badges (`db/game-social/`), deliberately separate from the platform-wide `player_relationships` / `direct_messages` tables — a guard test in `tests/architecture.test.mjs` enforces the split
- game progress sync: reward claims, campaign progress with a reset fencing epoch, inventory/consumables, and server-authoritative currency spend
- payments: Stripe Checkout for web and Google Play Billing verification for the packaged Android app, both pricing offers from the server-side catalogs rather than trusting the client

## Structure

This backend is **TypeScript-sourced** (`strict: true`): every `src/**` file is a `.mts` source that `tsc` emits to a same-named `.mjs` committed in-place. Railway runs the emitted output unchanged (`npm start` → `node ./src/server.mjs`), so a deploy needs no config change. Edit the `.mts` source, then `npm run build` (tsc emit + `scripts/sync-emitted-mjs.mjs`) to regenerate the `.mjs`; `npm run typecheck` checks types without emitting. The files below are listed by their run-time `.mjs` names.

- `src/server.mjs`: runtime entry point
- `src/app.mjs`: top-level orchestration and route dispatch shell
- `src/http-utils.mjs`: shared request/response helpers, including the CORS allow-list
- `src/rate-limit.mjs`: in-process per-IP rate limiting; deployment and trust-model limits are documented in `../games/tactical-arena/SECURITY.md`
- `src/config.mjs`: environment and config loading
- `src/email.mjs`: transactional email (password reset) via Resend
- `src/db/`: data access modules, domain helpers, and SQL migrations
- `src/normalize.mjs`: thin barrel over domain-specific normalize modules
- `tests/`: Node test coverage for API routes, config, migrations, services, and DB modules

`src/routes/` — one module per route family:

| Module | Owns |
| --- | --- |
| `auth-routes` | sign-up, sign-in, sessions, password reset |
| `player-routes` | profiles, relationships, friend requests, metrics, activity |
| `thought-routes` | thoughts, comments, reactions, shares |
| `photo-routes` | photo upload, gallery, photo social |
| `message-routes` | direct messages |
| `notification-routes` | notification feed and read state |
| `layout-routes` | saved profile layouts |
| `rating-routes` | per-game ELO ratings (any slug, no allowlist) |
| `ranked-routes` | ranked queue, rendezvous, results, ranked identity, unit stats |
| `ladder-routes` | cross-game standings; dispatched **before** `/players` so the `ladders` suffix is not swallowed |
| `game-progress-routes` | reward claims, campaign progress, currency spend, consumables |
| `game-social-routes` | per-game friends, blocks, player search, in-game profiles, badges |
| `payment-routes` | Stripe Checkout sessions and Play Billing verification |

`src/services/` — service and catalog seams. The `*-catalog` modules are registries: adding a ladder, badge, consumable, avatar, or priced offer is a data edit there, not a route change.

- `auth`, `upload`, `payments`, `play-billing`
- `ladder-catalog`, `game-badge-catalog`, `consumable-catalog`, `valor-catalog`, `ranked-avatar-catalog`

## Current architecture notes

- `src/app.mjs` is no longer the main home for every route family. Keep new API behavior inside the relevant `src/routes/` or `src/db/` seam instead of growing the shell again.
- `src/db/relationships.mjs` and `src/db/thoughts.mjs` delegate pure shaping rules into `relationships-domain.mjs` and `thoughts-domain.mjs`.
- `src/db/ranked.mjs` is a re-export barrel over `ranked-shared` (slug/serialize/stale helpers), `ranked-match` (matchmaking, start, result/ELO resolution, rendezvous), `ranked-profile` (cosmetic identity), and `ranked-queries` (cards, standing, stats, history, leaderboard). `tests/architecture.test.mjs` guards that split.
- `src/db/game-social/` must never read or write `player_relationships` / `direct_messages`. Per-game social graphs are intentionally separate from the platform friends graph, and a guard test enforces it.
- `src/routes/admin-routes.mjs` is the **only** place the admin check happens. It matches the whole `/admin/` prefix, then delegates to `admin-content-routes.mjs` and `admin-moderation-routes.mjs`, neither of which contains authorization logic — so a new admin endpoint added to either is gated by construction. Do not move the check downward, and do not register an `/admin/` path elsewhere in the dispatch chain.
- `src/db/moderation.mjs` holds the only ownership-free deletes in the backend, reachable solely from the gated admin route. The player-facing deletes in `db/thoughts.mjs` / `db/photos.mjs` keep ownership in the SQL predicate and must stay that way — an `asAdmin` flag on those would put every player's ownership guarantee one argument away from being skipped.
- New backend cleanup should usually preserve these seams rather than re-centralizing behavior in `app.mjs` or `normalize.mjs`.

## Security posture

CORS is an allow-list (not origin reflection), JWT verification is pinned to HS256, auth and checkout-session creation are rate-limited per IP, and uploads are validated by magic bytes rather than the client-declared MIME type. For signed-in players the server — not localStorage — is the authority on currency balances and owned entitlements, and premium entitlements can only be granted by Stripe/Play fulfillment, never claimed through the public claims route. The full trust model, invariants, and known limits live in `../games/tactical-arena/SECURITY.md`.

## Commands

From `platform-api/`:

```txt
npm start           # node ./src/server.mjs — runs the emitted output, as Railway does
npm run migrate     # apply src/db/migrations/*.sql
npm test            # node --test ./tests/*.test.mjs
npm run typecheck   # tsc --noEmit
npm run build       # tsc emit + scripts/sync-emitted-mjs.mjs
npm run verify:build  # emit + --check; fails if a committed .mjs is stale
```

Runtime config comes from the environment: `DATABASE_URL` (Railway Postgres), `APP_BASE_URL`, `ALLOWED_ORIGINS`, `ADMIN_EMAILS`, `FOUNDER_EMAIL`, the JWT secret, and the Resend / Cloudinary / Stripe / Play credentials. `APP_BASE_URL` and the CORS allow-list are origin-sensitive and must be changed together with any hosting/domain move.

`ADMIN_EMAILS` is a comma-separated list promoted to admin at boot, after migrations. It only ever **grants** — removing an address does not demote anyone, so a typo cannot strip authority from a live operator; demote through the console instead. The account must already exist, so the first-run order is: sign up on the site, set `ADMIN_EMAILS`, redeploy.

`FOUNDER_EMAIL` is the "Tom" account: every new sign-up is befriended with it automatically (`services/founder.mts`, called from registration). It is deliberately a separate variable from `ADMIN_EMAILS` — granting someone operator authority must not also make them everyone's first friend. Unset means the feature is off. The friendship goes through the normal ledgered path, so it is symmetric, worth the usual +100 friend points, and can be removed by either side like any other. If the address matches no account, or anything else fails, registration still succeeds — the friendship is best-effort by design.

## Boundary reminder

This folder is the canonical home for durable platform identity and shared social records. Games should integrate with it rather than re-owning account or profile state locally.
