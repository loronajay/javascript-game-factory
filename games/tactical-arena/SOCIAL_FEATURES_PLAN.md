# Tactical Arena Social Features Plan — Friends + Chat

Status: **not started**. This is a build plan for an implementation pass (intended for a
high-effort agent run), not a shipped feature. Update this doc's status line as work lands;
do not append a dated build log here — move durable decisions into the relevant section
instead.

## Goals

- A friends list scoped to Tactical Arena, **fully independent** of the factory-wide
  friends/relationships graph (`js/platform/relationships/`). Two players can be TA-friends
  without being factory-friends, and vice versa.
- Mutual-accept friend requests: send, accept, decline, cancel, remove, block/unblock.
- In-match + lobby chat: ephemeral, live, relayed over the connection that already carries
  lockstep traffic.
- Persistent 1:1 DMs between TA friends, stored server-side so they survive across
  devices/sessions.
- New in-game UI for all of the above (friends panel, DM inbox/thread view, match/lobby
  chat overlay, add-friend entry points).
- **No moderation in v1**: no profanity filter, no chat rate limiting, no report/mute beyond
  ordinary blocking. Can be added later without changing the data model below.

## Explicit non-goals / relationship to the platform layer

- Does **not** read, write, or import `js/platform/relationships/` or the factory-wide
  messages API. Zero shared tables, zero shared code paths. This is a deliberate exception
  to the repo's default "canonical identity/relationships live at the factory layer" stance
  (root `CLAUDE.md`), made explicitly for Tactical Arena.
- Schema and routes are namespaced by `game_slug` so the same backend could support another
  cabinet later without a migration — but only `tactical-arena` wires up client/UI code in
  this pass. Do not build speculative multi-game UI now.
- Still requires a signed-in factory account, the same gate `rankedAccountGate.js` already
  enforces for Ranked. No guest/offline friends or chat.

## Data model (new Postgres tables, new migration)

New migration file: `platform-api/src/db/migrations/024-game-social.sql` (next free number
after `023-ranked-unit-stats.sql`).

### `game_friend_requests`
- `id`, `game_slug`, `requester_player_id`, `recipient_player_id`
- `status`: `pending` / `accepted` / `declined` / `canceled`
- `created_at`, `responded_at`
- Unique constraint on `(game_slug, requester_player_id, recipient_player_id)` where
  `status = 'pending'` to prevent duplicate outstanding requests.

### `game_friendships`
- `id`, `game_slug`, `player_id_a`, `player_id_b` (store the pair in a canonical sorted
  order so a pair is represented once), `created_at`
- Unique constraint on `(game_slug, player_id_a, player_id_b)`.
- Row is created when a request transitions to `accepted`; removing a friend deletes the
  row (hard delete — no soft-delete/history requirement for v1).

### `game_friend_blocks`
- `id`, `game_slug`, `blocker_player_id`, `blocked_player_id`, `created_at`
- Blocking someone must, in the same transaction: decline any pending request between the
  two players, delete any existing friendship row, and prevent either player from sending a
  new request while the block exists.

### `game_direct_messages`
- `id`, `game_slug`, `sender_player_id`, `recipient_player_id`, `body`, `created_at`,
  `read_at` (nullable)
- Index on `(game_slug, recipient_player_id, created_at)` for inbox queries, and a
  conversation-lookup index on the canonical player pair for thread fetches.
- Sending a DM to a non-friend must be rejected server-side (friendship is a precondition,
  not just a UI affordance).

Match/lobby chat is **not persisted** — see the realtime section below. No table for it.

## Backend (`platform-api/src/`)

Follow the existing barrel-over-focused-modules pattern used by `db/ranked.mjs`:

- `db/game-social/game-social-shared.mjs` — `game_slug` validation (allowlist, starting
  with just `tactical-arena`), canonical-pair helpers, shared row shaping.
- `db/game-social/game-friend-requests.mjs` — send / accept / decline / cancel queries.
- `db/game-social/game-friendships.mjs` — list friends, remove friend.
- `db/game-social/game-friend-blocks.mjs` — block / unblock, and a block-check used to gate
  new requests.
- `db/game-social/game-direct-messages.mjs` — send message, list conversation, list
  inbox/unread counts, mark thread read. Enforces the friendship precondition.
- `db/game-social.mjs` — thin re-export barrel (mirrors `db/ranked.mjs`); no behavior here.
- `routes/game-social-routes.mjs` — REST endpoints, all behind the existing signed-in-account
  auth middleware:
  - `POST /api/games/:slug/friends/requests` — send `{ recipientPlayerId }`
  - `POST /api/games/:slug/friends/requests/:id/accept`
  - `POST /api/games/:slug/friends/requests/:id/decline`
  - `DELETE /api/games/:slug/friends/requests/:id` — cancel own pending request
  - `GET /api/games/:slug/friends/requests` — list incoming + outgoing pending
  - `GET /api/games/:slug/friends` — list accepted friends
  - `DELETE /api/games/:slug/friends/:playerId` — remove friend
  - `POST /api/games/:slug/friends/:playerId/block` / `DELETE .../block` — block / unblock
  - `GET /api/games/:slug/messages` — conversation list (most-recent-per-friend summary)
  - `GET /api/games/:slug/messages/:playerId` — thread with one friend
  - `POST /api/games/:slug/messages/:playerId` — send DM `{ body }`
  - `POST /api/games/:slug/messages/:playerId/read` — mark thread read
  - Every route validates `:slug` against the game-slug allowlist so this can't be invoked
    for an unregistered game.
- Extend `platform-api/tests/architecture.test.mjs` to assert `db/game-social/*` never
  imports `db/relationships*`/`db/messages*` modules and vice versa — this is the guard
  that keeps the "fully independent" requirement true over time, not just at launch.

## Game-side client (`games/tactical-arena/src/platform/`)

- `taFriendsClient.js` — fetch wrapper over the friends/requests/blocks endpoints, same
  auth-header/error-shape conventions as `gameProgressClient.js`.
- `taMessagesClient.js` — thread/list/send/read wrapper, with a poll loop for inbox refresh
  while a chat panel is open (reuse the interval-poll approach the factory-wide DMs already
  use — same cadence unless there's a reason to diverge).

## Realtime match/lobby chat (`games/tactical-arena/src/online/`)

Tactical Arena's online transport already relays arbitrary payloads: `onlineClient.js`
sends everything (config, setup, draft picks, ready, commands, hash) through a single
`_lobbyMsg(messageType, value)` envelope over one WebSocket connection that stays open
across both the pre-match lobby and the live match. The server side (`factory-network-server`,
a separate repo) forwards `lobby_message` payloads opaquely by `messageType` — it does not
need to understand chat, so **no server-side change is required** for this piece.

- Add `sendChat(text)` to `onlineClient.js`, calling `_lobbyMsg("ta_chat", text)` (same
  shape as `sendCommand`/`sendReady`).
- Add a `"ta_chat"` case to `_handleLobbyMessage`'s switch that forwards
  `{ senderId, text }` to a new chat callback.
- New pure module `src/online/onlineChatLog.js` — a session-scoped, non-authoritative
  transcript (`{ senderId, text, ts }[]`). This must stay outside the hashed/authoritative
  battle state, per the repo's existing rule that transient session state is never part of
  the deterministic state hash.
- Because the lobby and match share one connection, the same chat channel covers both
  phases without extra wiring.

## New UI (`games/tactical-arena/src/ui/`)

- `taFriendsPanel.js` — friends list, incoming/outgoing requests, add-by-name-or-code,
  block/unblock, remove. Wired into `menuFlow.js` as a new screen alongside the Ranked
  leaderboard.
- `taChatPanel.js` — persistent DM inbox + thread view, built on `taMessagesClient.js`.
- `taMatchChatOverlay.js` — chat box docked in the lobby and battle screens, built on the
  `onlineClient.js` chat callback + `onlineChatLog.js`.
- Add-friend entry points on the post-match results screen and the opponent card in the
  online lobby (this is the "Discovery Vision" pattern already named in the root
  `CLAUDE.md` — game-result and lobby surfaces are first-class discovery paths).
- Each new panel gets a focused `node:test` for its pure view-model/formatting logic, same
  pattern as `onlineLobbyView.js`.

## Testing

- `platform-api`: `node:test` per db module (`game-friend-requests`, `game-friendships`,
  `game-friend-blocks`, `game-direct-messages`), route-level tests, and the extended
  architecture-boundary test.
- `tactical-arena`: `node:test` for `onlineChatLog.js`, `taFriendsClient.js` /
  `taMessagesClient.js` (mocked fetch), and view-model logic in the new UI panels.
- Manual: a live two-tab/two-browser playtest for chat delivery and the friend-request
  round trip before calling this done — this repo's online features are only validated by
  a real client-to-client run, never a single-machine unit-test pass alone.

## Suggested build order

1. Migration + db layer + architecture-boundary test (backend foundation, no routes yet).
2. Routes + platform-api route tests.
3. `taFriendsClient.js` + friends panel UI (no chat yet) — get the friend-request round
   trip working end-to-end first.
4. `taMessagesClient.js` + DM inbox/thread panel.
5. `onlineClient.js` `sendChat`/`ta_chat` handling + `onlineChatLog.js` + match/lobby chat
   overlay.
6. Add-friend entry points on results screen and lobby opponent card.
7. Full `node:test` pass, then a live two-client playtest.

## Open questions for the implementer to decide or raise

- Friend discovery: search by `profileName`, or a share-code like Ranked's private lobby
  codes?
- DM inbox poll cadence — match the factory-wide DM poll interval, or does TA's tighter
  online-focused UI want something faster?
- Should a block also hide that player from Ranked opponent search/matchmaking, or is that
  explicitly out of scope for v1? (Default assumption in this plan: out of scope — a block
  only affects TA friends/chat.)
