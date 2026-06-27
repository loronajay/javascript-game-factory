# Jaybox

Jaybox is the shared-screen host shell for a catalog of party games. It does not own any game's rules, economy, phases, scoring, or reconnect authority. Those live in `loronajay/factory-network-server` as registered lobby games. The shell stays game-agnostic and resolves the active game from the lobby's `gameId`; each game's display/controller views, message handling, and input wiring live in a cabinet module under `cabinets/` (see `cabinets/registry.mjs`). Pot of Greed is `gameId: "pot-of-greed"`; Questionable Decisions is `gameId: "questionable-decisions"`.

## Cabinets

- `cabinets/pot-of-greed.mjs` — secret-vault social deduction; controllers pick vault actions and cast votes.
- `cabinets/questionable-decisions.mjs` — trivia on the shared display with phones as controllers. The active player picks a board tile and answers; a wrong answer drops them into a penalty mini-game played on their phone while everyone else watches and reacts. The cabinet is the single source of the wire message names: it receives `qd_public_state` / `qd_private_state` and sends `qd_theme_vote`, `qd_select_tile`, `qd_answer`, `qd_penalty_input`, and `qd_reaction` as `lobby_message` intents. Server-authoritative rules live in `factory-network-server/games/questionable-decisions/server/`.

## Server Contract

The browser client connects to `factory-network-server` over WebSocket and sends lobby intents:

- Display creates the room with `create_lobby`, `gameId: "pot-of-greed"`, and `role: "display"`.
- Controllers join with `join_lobby` and a player display name.
- Display starts the lobby with `start_lobby`.
- Controllers send `lobby_message` intents for `pot_of_greed_vault_action` and `pot_of_greed_vote`.
- Server broadcasts `pot_of_greed_public_state` to the room and `pot_of_greed_private_state` to each controller.

## WebSocket URLs

Production defaults to:

```text
wss://factory-network-server-production.up.railway.app
```

Local development still targets port 3000 when the page is served from `localhost`, `127.0.0.1`, `::1`, or opened as a file:

```text
ws://localhost:3000
```

Use `?server=...` to override the target explicitly:

```text
http://localhost/path/to/games/jaybox/?server=ws://localhost:3000
http://localhost/path/to/games/jaybox/?mode=controller&server=ws://localhost:3000
```

The page also respects `globalThis.JAYBOX_SERVER_URL` when a deployment wants to inject a staging or custom endpoint without changing query strings.
