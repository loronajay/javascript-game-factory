# Echo Duel Server Authority Handoff V2

## Purpose

This is the implementation-ready v2 handoff for moving Echo Duel from a host-authoritative prototype to a server-authoritative game.

The original handoff diagnosed the right problem, but it bundled too many migrations together at once. This v2 keeps the same strategic direction while tightening scope, preserving current gameplay rules, and sequencing the work into safer passes.

This doc now serves as the implementation record for that migration plus the checklist for any optional cleanup that still remains.

## Current Status

Phase 1 is implemented across the Echo Duel client and the local `factory-network-server` repo:

- authoritative match state lives on the server
- Echo Duel clients consume authoritative `match_state` / playback / ended payloads
- stale authoritative sync sequences are rejected client-side
- duplicate authoritative inputs are deduped with per-input ids
- pre-start input requests are ignored until the scheduled start time
- live-match disconnect consequences are server-owned

Phase 2 lobby hardening is also implemented in the current local server/client pair:

- minimum players enable start instead of auto-starting
- only the lobby owner can start
- full or started lobbies reject joins
- public search filters non-joinable lobbies
- settings lock once startup begins
- lobby ownership transfers before kickoff
- pre-start countdowns can cancel cleanly back to an open lobby
- empty lobbies clean up

What remains from this doc is optional Phase 3 cleanup only unless future feature work reopens the protocol.

## Rules To Preserve

- Echo Duel supports 2-6 active players.
- One active pattern driver exists at a time.
- The pattern starts at 4 inputs.
- The driver adds 2 inputs when the chain grows.
- Pattern growth is `4 -> 6 -> 8 -> 10`.
- The pattern cap is 10 inputs.
- The chain grows only when all active challengers successfully copy the sequence.
- If any challenger fails, failed challengers receive letters and the same driver starts a fresh 4-input pattern.
- If the driver fails their own replay, they lose control and receive no letter.
- Challenger copy attempts happen simultaneously.
- Signal playback happens before copy.
- During playback, the full signal is shown visually and audibly.
- During copy, the visible signal disappears.
- At the 10-input cap, if all challengers succeed, the fastest successful challenger takes control next.
- Penalty word behavior is intentionally correct and out of scope.

## Current Reality

The live Echo Duel client still works like this:

- Generic lobby messages create/join/start the room.
- One client acts as host authority.
- The host validates inputs locally.
- The host advances phases locally.
- The host broadcasts `state_sync` snapshots to everyone else.
- Non-host clients mostly render snapshots and submit inputs.

That means the migration target is not just "server authority" in the abstract. It is a very specific replacement of the host-owned match engine and snapshot broadcaster.

## Main Problem

The host-authoritative model still creates predictable structural risk:

- host disconnect can end or corrupt the match
- host lag or tab throttling can delay authoritative phase changes
- a modified host client can cheat
- stale or delayed messages can mutate the wrong turn if client/server guards diverge
- disconnect handling is harder because one player owns match truth

For prototype play this was acceptable. For a stable online arcade game, the server should own match truth.

## Scope Strategy

Do not implement this as one giant rewrite.

This work should be delivered in phased passes:

1. Phase 1: move match authority to the server while preserving the current lobby contract as much as possible
2. Phase 2: harden lobby lifecycle and joinability rules
3. Phase 3: optionally rename protocol messages and reorganize the server code once the behavior is stable

Protocol renaming and server folder cleanup are explicitly not on the critical path for Phase 1.

## Non-Goals

Do not work on:

- penalty word behavior changes
- new mechanics
- ranked play
- anti-cheat beyond basic server authority
- spectator mode
- progression/cosmetics
- chat
- rematch design
- UI redesign beyond what the migration strictly requires

## Ownership Model

Keep these concepts separate everywhere:

```txt
serverClientId = server-assigned websocket connection id
lobbyOwnerId   = player allowed to control lobby settings and request start
driverId       = active pattern driver in the current turn
matchId        = authoritative active match id
turnId         = monotonic turn id
phaseId        = monotonic phase id
syncSeq        = monotonic authoritative state sequence
```

Avoid ambiguous names like `ownerId` without context.

## Phase 1

### Goal

Move Echo Duel match truth to the server without forcing a full lobby/protocol redesign in the same pass.

### Phase 1 Server Owns

- current match state
- current driver
- authoritative sequence
- phase transitions
- playback timing
- challenger copy validation
- driver replay validation
- letter awards
- eliminations
- winner selection
- disconnect consequences during a live match

### Phase 1 Client Owns

- rendering
- local button/input UX
- tones and animations
- showing server-approved playback and result state
- submitting input requests

### Phase 1 Compatibility Rule

Keep the existing Echo Duel lobby transport if possible:

```txt
create_lobby
join_lobby
find_lobby
update_lobby_settings
start_lobby
leave_lobby
lobby_message
```

For Phase 1, it is acceptable to keep these transport names and change only what `lobby_message` or server-side routing does internally, as long as the server becomes authoritative for gameplay.

Do not force a simultaneous switch to `echo_*` message names in the same pass unless the server implementation truly requires it.

### Phase 1 Match Phases

Preserve the current conceptual phase set:

```txt
owner_create_initial
owner_replay
owner_append
signal_playback
challenger_copy
match_ended
```

`result_reveal` is optional. Do not introduce it unless the server implementation actually needs a distinct settled phase.

### Phase 1 Input Rules

Server accepts driver input only when:

- sender is `driverId`
- sender is active and not eliminated
- phase is `owner_create_initial`, `owner_replay`, or `owner_append`
- input is one of `W/A/S/D`
- `turnId` matches
- `phaseId` matches

Server accepts challenger input only when:

- sender is active and not eliminated
- sender is not `driverId`
- phase is `challenger_copy`
- input is one of `W/A/S/D`
- `turnId` matches
- `phaseId` matches

All other inputs must be ignored or rejected by the server.

### Phase 1 Playback Rule

The server owns playback timing.

The server should broadcast enough playback metadata for clients to render the sequence deterministically:

```txt
playbackId
sequence
turnId
phaseId
stepMs
gapMs
holdMs
startedAt or remainingMs/startDelayMs
```

Clients may animate locally, but they must not decide when authoritative playback ends.

### Phase 1 Chain Resolution Rule

Resolve copy phases in this order:

1. settle every challenger result
2. award letters to all failed challengers
3. mark new eliminations
4. check winner condition
5. if all active challengers succeeded and length is below 10, same driver continues and the chain grows
6. if any active challenger failed, same driver restarts a fresh 4-input pattern
7. if all active challengers succeeded at length 10, fastest successful challenger takes control next

Do not short-circuit on the first failure.

### Phase 1 Disconnect Rule

Preserve the current 1v1 product behavior:

- if a disconnect happens during a live 1v1 match, close the match rather than awarding a cheap win

For 3+ player matches:

- if the driver disconnects, remove them, pick the next valid driver, bump `turnId` and `phaseId`, and reset to a fresh 4-input pattern
- if a challenger disconnects during copy, remove them from unresolved copy participants and resolve immediately if they were the last unresolved challenger
- if only one active player remains in a 3+ player match, declare that player the winner

This preserves current intent while still making disconnect behavior deterministic.

### Phase 1 Acceptance Criteria

Phase 1 is done when:

- the host client no longer decides authoritative match truth
- the host client no longer broadcasts authoritative `state_sync` snapshots as the source of truth
- server-side validation guards phase/turn/input legality
- driver failure, challenger failure, elimination, and winner selection are server-owned
- live-match disconnect handling is server-owned
- current game rules still behave the same from the player point of view

## Phase 2

### Goal

Harden lobby lifecycle behavior after server-owned gameplay is stable.

### Lobby Rules To Enforce

- minimum players should enable start, not auto-start
- only `lobbyOwnerId` can request start
- non-joinable lobbies must be filtered from public search
- full lobbies must reject joins
- started or active lobbies must reject joins
- settings lock once the lobby is starting or in-match
- lobby ownership transfers cleanly before the match if the lobby owner leaves
- empty lobbies are deleted cleanly

### Lobby State Compatibility Rule

The current client has real countdown/start behavior based on `countdown`, `started`, and `startAt`.

Because of that, Phase 2 must choose one of these explicitly:

1. Preserve visible countdown semantics.
   Keep a state or payload shape equivalent to the current countdown contract so the client can keep rendering the pre-start countdown cleanly.

2. Remove the visible countdown intentionally.
   If this path is chosen, update the client UX and remove all countdown-specific assumptions in one deliberate pass.

Do not silently replace `countdown` with `starting` unless the client mapping is spelled out and updated everywhere.

### Phase 2 Acceptance Criteria

Phase 2 is done when:

- reaching minimum players only enables start
- the lobby does not auto-start on minimum join
- the start request is idempotent
- joinability is consistent across public search, direct join, and late join attempts
- lobby owner reassignment works before match start
- empty lobbies are cleaned up from all paths

## Phase 3

### Goal

Clean up naming and server organization after behavior is already stable.

### Optional Protocol Cleanup

If desired later, move Echo Duel onto explicit game-specific messages such as:

```txt
echo_create_lobby
echo_join_lobby
echo_find_lobby
echo_update_lobby_settings
echo_start_lobby
echo_leave_lobby
echo_submit_input
```

This is a cleanup and clarity pass, not the critical functionality pass.

### Optional Server Structure

Preferred target:

```txt
server.js
games/
  echo-duel/
    echo-duel-state.js
    echo-duel-engine.js
    echo-duel-protocol.js
    echo-duel-validation.js
```

If the server remains single-file temporarily, keep Echo Duel logic isolated from legacy 1v1 handlers.

## Legacy Compatibility Requirement

Do not break legacy 1v1 games.

These must keep working:

```txt
create_room
join_room
find_match
room_message
match_ready
```

Echo Duel should not force a redesign of the older 1v1 protocol.

## Testing Matrix

### Match Authority

- driver creates initial 4-input pattern
- driver replay success
- driver replay failure passes control with no letter
- all challengers succeed and chain grows
- one challenger fails and only failed challengers get letters
- multiple challengers fail in the same copy phase
- growth clamps at 10
- at 10, fastest successful challenger takes control next
- last active player wins in 3+ player matches

### Disconnects

- driver disconnect during create
- driver disconnect during replay
- driver disconnect during append
- driver disconnect during playback
- challenger disconnect during copy
- challenger disconnect during playback
- live 1v1 disconnect closes the match instead of awarding a free win
- 3+ player disconnect path settles correctly and does not stall the round

### Lobby

- minimum reached enables start but does not auto-start
- non-owner cannot start
- full lobby rejects join
- in-match lobby rejects join
- public search ignores non-joinable lobbies
- lobby owner disconnect before match transfers ownership
- empty lobby cleanup works

### Networking

- stale phase input is rejected
- stale turn input is rejected
- duplicate input does not double-count
- duplicate start request does not start two matches
- stale snapshots or messages do not rewind client state

## Short Version

Implement this in phases.

First, replace host-owned match authority with server-owned match authority while keeping the current lobby contract as stable as possible.

Second, harden lobby lifecycle and joinability behavior.

Third, clean up protocol names and server structure if still desired.

Preserve the current 10-cap control-pass rule and preserve the current 1v1 disconnect behavior that closes the match instead of awarding a cheap win.
