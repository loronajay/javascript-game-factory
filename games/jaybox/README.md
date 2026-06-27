# Jaybox

Jaybox is the shared-screen client for Pot of Greed. It does not own Pot of Greed rules, economy, phase progression, votes, hidden state, or reconnect authority. Those live in `loronajay/factory-network-server` under the registered lobby game `gameId: "pot-of-greed"`.

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
