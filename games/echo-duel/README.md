# Echo Duel

Echo Duel is a 2-6 player online memory duel for Javascript Game Factory.

## Entry Point

Drop the game at:

```txt
games/echo-duel/
```

The browser entry is `index.html`, which imports `initGame()` from root `game.js`.

## What The Client Currently Supports

- Public lobby creation and find/join flow through the variable-size lobby protocol.
- Private room creation and join by room code.
- 2-6 active players.
- WASD, mouse, and touch input.
- Driver create, replay, append, and simultaneous challenger copy rules.
- Penalty-word elimination and last-active-player win condition.
- Screen-state transitions instead of hard page-swap hiding.
- Modular CSS theming under `styles/`.
- Server-authoritative online play through the Echo Duel path in `factory-network-server`, with the older host-client fallback still present in the client for compatibility.

## Network Contract

Echo Duel expects the patched `factory-network-server` lobby transport with these WebSocket message types:

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

## Current Authority Model

The client supports two online authority paths:

- `host-client`: one client still owns the live match state and broadcasts snapshots.
- `server`: the server sends authoritative match payloads and the client renders them.

Echo Duel now targets the `server` path by default when the patched `factory-network-server` Echo Duel handlers are present. The handoff doc in `ECHO_DUEL_SERVER_AUTHORITY_HANDOFF_V2.md` is now mostly a completion record plus optional Phase 3 cleanup notes.

## Structure

```txt
index.html
style.css
game.js
scripts/
  audio.js
  authority-sync.js
  button-bindings.js
  config.js
  engine.js
  identity.js
  init-game.js
  input.js
  lobby.js
  local-adapter.js
  match-view-state.js
  online-lobby-view-state.js
  online-runtime-state.js
  online-session-controller.js
  online-session-state.js
  online.js
  renderer.js
  state.js
  validation.js
styles/
  base.css
  end-screen.css
  forms.css
  lobby.css
  match.css
  menu.css
  shell.css
  tokens.css
  transitions.css
```

## Module Ownership

- `engine.js` owns match rules and phase transitions.
- `state.js` owns state creation, cloning, and network hydration/serialization.
- `online.js` owns WebSocket transport.
- `online-session-controller.js` owns online lifecycle, callbacks, and lobby-to-match orchestration.
- `renderer.js` owns DOM rendering.
- `match-view-state.js` and `online-lobby-view-state.js` own pure UI/view-model decisions.
- `styles/` owns the visual system in focused CSS modules.

## Notes

- Menu music and presentation polish live entirely on the client side.
- `local-adapter.js` is still present, but the current shipped menu flow is online-first.
- Local regression test scripts may exist in a developer workspace, but they are not part of the shipped game folder.
- The server-authority handoff doc remains intentionally separate so the authority migration and any optional protocol cleanup stay documented outside the shipped client files.
