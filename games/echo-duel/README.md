# Echo Duel

Echo Duel is a 2–6 player online memory duel for Javascript Game Factory.

## Install

Drop this folder at:

```txt
games/echo-duel/
```

The game entry is `index.html`, which imports `initGame()` from root `game.js`.

## Current Build

This version includes:

- Local test match mode.
- Public lobby creation/joining through the new variable-size lobby protocol.
- Private lobby creation with room code.
- Private lobby join by room code.
- 2–6 active players.
- Lobby owner as authoritative gameplay coordinator.
- WASD / mouse / touch input.
- Pattern owner replay + append rules.
- Simultaneous online challenger copy handling.
- Penalty-word elimination.
- Last-active-player win condition.

## Server Requirement

Requires the patched `factory-network-server` with these WebSocket message types:

```txt
create_lobby
join_lobby
find_lobby
update_lobby_settings
start_lobby
leave_lobby
lobby_message
```

The older 1v1 `find_match`, `create_room`, and `join_room` protocol is not used by Echo Duel.

## Architecture

```txt
index.html
style.css
game.js
scripts/
  audio.js
  config.js
  engine.js
  identity.js
  init-game.js
  input.js
  lobby.js
  local-adapter.js
  online.js
  renderer.js
  state.js
  validation.js
```

`engine.js` owns game rules. `online.js` owns WebSocket transport. `init-game.js` coordinates UI, local play, and online host-authoritative state sync.

## Hard Limitation

The network server relays lobby messages but does not validate Echo Duel gameplay. The current online model is host-authoritative, with the lobby owner broadcasting state snapshots. That is acceptable for an arcade prototype but not cheat-resistant ranked play.
