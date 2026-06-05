# Build Buddy Canon Implementation Scope

Status: Phase 5 Online Gameplay v1 implemented client-side  
Date: 2026-06-05  
Repository: `javascript-games/games/build-buddy`

## Implementation Status

Phase 1 started on 2026-06-04.
Phase 2 started on 2026-06-04.
Phase 3 started on 2026-06-04.
Phase 4 started on 2026-06-04.
Phase 4.5 stage authoring/readiness pass completed on 2026-06-05.

Current checkpoint: Phase 5 Online Gameplay v1 is implemented client-side on top of the generic Factory Network lobby relay. No `factory-network-server` changes were needed for this slice.

Implemented:

- `js/session.js`
- `tests/session.test.mjs`
- `js/progression.js`
- `tests/progression.test.mjs`
- `js/app-shell.js`
- `js/app-controller.js`
- `js/online-client.js`
- `tests/online-client.test.mjs`
- `js/online-gameplay.js`
- `tests/online-gameplay.test.mjs`
- `js/stages/stage-authoring.js`
- `tests/stage-authoring.test.mjs`
- `js/stages/packs/pack-01/pack-01-stage-stubs.js`
- `tests/app-shell.test.mjs`
- `tests/game-events.test.mjs`
- `tests/stage-registry.test.mjs`
- Browser shell wiring in `index.html`, `css/style.css`, `js/main.js`, and `js/game.js`

Verified:

- `node .\tests\session.test.mjs`
- `node .\tests\progression.test.mjs`
- `node .\tests\app-shell.test.mjs`
- `node .\tests\game-events.test.mjs`
- `node .\tests\stage-registry.test.mjs`
- `node .\tests\online-client.test.mjs`
- `node .\tests\online-gameplay.test.mjs`
- `node .\tests\stage-authoring.test.mjs`
- `node --check .\js\session.js`
- `node --check .\js\progression.js`
- `node --check .\js\app-shell.js`
- `node --check .\js\app-controller.js`
- `node --check .\js\game.js`
- `node --check .\js\online-client.js`
- `node --check .\js\online-gameplay.js`

GDD reconciliation note:

- The Phase 1 session model was rechecked against `BUILD_BUDDY_GDD.md` Sections 1-6, 30-33, and 35.
- Stage result records now use the GDD result shape more closely: `outcome: "clear" | "fail"`, `failReason: "timer"`, Runner/Builder player ids, `runnerDeaths`, `runnerRepositions`, `toolUseCount`, checkpoint usage/reward fields, final stage time, and Builder rule snapshots.
- Timer failure data should use `failReason: "timer"`; UI can display that as `Time Up` / `Stage Failed - Time Up`.

Phase 2 notes:

- The app now starts at a shell menu instead of constructing `Game` directly.
- Local Co-op Run, Practice, and Debug Lab are owned by `js/app-shell.js`.
- `Game` remains a single-stage runtime and reports clear/failure events upward.
- Timer expiry now reports a `timer` stage failure to the shell; `js/session.js` preserves `timer` as the canonical failure reason.
- Debug Lab remains non-canon and launches in hybrid view.
- Practice stage select uses persisted progression unlocks.

Phase 3 notes:

- Pack 01 now registers a complete 10-stage sequence through `js/stages/packs/pack-01/pack-01-manifest.js`.
- Stages 02-10 are authored-baseline runtime stages generated from compact blueprints in `js/stages/packs/pack-01/pack-01-stage-stubs.js`.
- `js/stages/stage-authoring.js` provides a first-pass stage authoring engine: route beats compile into runtime stage records, Builder rule presets keep restrictions data-driven, and pack catalogs are compiled in stage-number order.
- Stage registry tests verify the 10-stage sequence, pack metadata counts, stage-select metadata, cloned runtime stage reads, and distinct authored archetypes/rule variety across stages 02-10.

Phase 4 notes:

- `js/online-client.js` implements the Build Buddy client side of the Factory Network lobby protocol.
- Public search, private lobby create/join, room code normalization, owner/player/ready state, and Factory-owned identity passing are covered by `tests/online-client.test.mjs`.
- Build Buddy still does not own long-term identity or custom auth.

Phase 4.5 notes:

- Added a full real-Pack-01 app-shell test that drives all 10 stages with mixed clear/timer-fail outcomes.
- The full-run test verifies stage advancement, role swapping after every result, timer failure records, and a 10-result run summary.
- The stage catalog is now suitable for Phase 5 sync testing without requiring final polished stage content.

Phase 5 notes:

- Added `js/online-gameplay.js` as the first host-authoritative gameplay sync contract.
- The contract serializes `stage_start`, `runner_input`, `builder_command`, `state_sync`, `stage_result`, and `run_complete` relay payloads.
- Host-only local result recording is enforced by reducer tests; guest clients reject local result writes and reject stage results from non-authority senders.
- Authoritative clear and timer-fail results advance the online session and preserve role swapping across the real 10-stage sequence shape.
- `js/online-client.js` now normalizes outgoing Runner input, Builder commands, and state snapshots through the gameplay contract, and retains incoming stage/state/result/run relay payloads in snapshots for the app layer.
- `js/app-shell.js` can start online gameplay from a ready lobby, apply host stage results/run-complete messages, and route disconnects back to the online lobby.
- `js/game.js` exposes runtime sync hooks for host snapshots, guest snapshot application, remote Runner input, and remote Builder commands.
- `js/app-controller.js` wires lobby start into online gameplay, sends host stage starts/results/state snapshots, sends guest Runner/Builder relay commands, applies host snapshots/results/run-complete messages, and handles disconnect fallback.
- Phase 5 uses the existing generic Factory Network lobby relay; no server repo changes were required.

## Purpose

This document captures the agreed path for moving Build Buddy from engine prototype toward the canon game, while preserving context across future Codex chats. It should be treated as the handoff anchor before implementation work begins.

Build Buddy is not greenfield. It already has:

- A canon GDD in `BUILD_BUDDY_GDD.md`.
- A modular engine baseline in `js/`.
- A pack/stage registry model in `js/stages/`.
- Fixed timestep game loop in `js/main.js`.
- Local view modes: Runner, Builder, Hybrid debug.
- Pack 01 registered as a 10-stage run structure, with Stage 01 authored and Stages 02-10 authored-baseline blueprint stages.

The next work should turn the engine baseline into a game-shaped shell with canon session flow, then online co-op using existing Factory Network patterns, then polish and production features.

## Current Read

The current game is an engine prototype, not yet the real player flow. It starts directly into gameplay and exposes prototype HUD/control panels. The engine already supports much of the core interaction: Runner movement, Builder placement, camera/view routing, stage data, timers, tools, hazards, and goal detection.

The main canon mismatch is that the game currently thinks in terms of a single-stage runtime. The GDD defines a 10-stage co-op run:

- One Runner and one Builder per stage.
- Roles swap after every stage.
- Stage clear/fail is recorded.
- Timeout is a stage failure outcome, not a Runner death label.
- The match continues after failed stages.
- End of run displays 10 stage result cards.

The immediate goal is to add the session/menu layer above the current engine so stage outcomes, roles, practice unlocks, and debug affordances have stable ownership.

## Canon Modes

### Local Co-op Run

Canon mode. Two players share one local machine.

Expected behavior:

- Starts a 10-stage run for a selected pack.
- Assigns Player A / Player B roles.
- Swaps Runner and Builder after every stage.
- Records each stage as cleared or failed.
- Advances after both clear and timeout failure.
- Writes progression unlocks for cleared canon stages.
- Ends with a run results screen.

This is the first canon mode to implement because it validates the session model without online complexity.

### Online Co-op Run

Canon mode. Two players connect through the existing Factory Network server.

Expected behavior:

- Uses existing Factory Network identity and lobby patterns.
- Supports public search and private lobby code.
- Runs the same 10-stage structure as Local Co-op.
- Uses online authority/sync rules, not separate game rules.
- Writes progression/results only from canon online runs when reliable enough.

This should not reinvent auth, matchmaking, profile ownership, or server transport.

### Practice

Non-canon training mode, but player-facing.

Expected behavior:

- Lets players choose stages unlocked by clearing canon modes.
- Does not unlock future stages.
- Does not create canon run results.
- May record local best times or practice clears later, but that is deferred.

Practice should exist because Build Buddy stages will require coordination and rehearsal.

### Debug Lab

Temporary development mode.

Expected behavior:

- Preserves current Hybrid debug affordance.
- Allows free stage select, including locked/unregistered test stages when present.
- Allows Runner, Builder, and Hybrid view toggles.
- May include timer overrides, reset tools, and other test-only controls.
- Never writes progression or canon results.

Debug Lab is intentionally non-canon. It should remain available during development but be visually and structurally separate from player-facing canon modes.

## Recommended First Milestone: Canon Shell v1

Canon Shell v1 should be the first implementation phase. It should avoid art/presentation polish except where needed to make flow understandable.

Deliverables:

- Main menu.
- Mode select.
- Local Co-op Run entry.
- Practice entry with locked-stage handling.
- Debug Lab entry preserving hybrid controls.
- Basic stage result screen.
- Basic run result screen.
- Session state layer that owns mode, pack, stage index, roles, stage results, and progression-write eligibility.

The goal is not to make the game pretty. The goal is to make it rough in the shape of the real game.

## Session Model Scope

Add a tested pure session module before wiring UI.

Suggested module:

- `js/session.js`
- `js/session.test.js`

Suggested session fields:

- `mode`: `local_run`, `online_run`, `practice`, `debug`
- `packId`
- `stageSequence`
- `stageIndex`
- `currentStageId`
- `players`: local ids/display names
- `roles`: current Runner and Builder owner
- `stageResults`: array of per-stage outcomes
- `progressionWritesEnabled`
- `isCanonRun`
- `isComplete`

Suggested pure helpers:

- `createLocalRunSession({ packId, stageSequence, players })`
- `createPracticeSession({ packId, stageId, players })`
- `createDebugSession({ packId, stageId, players })`
- `recordStageClear(session, resultDetails)`
- `recordStageFailure(session, reason, resultDetails)`
- `advanceSession(session)`
- `getCurrentRoles(session)`
- `shouldUnlockStage(session, stageId)`
- `buildRunSummary(session)`

Test expectations:

- Local canon run starts at stage 1.
- Roles swap after every stage, clear or fail.
- Failed stages still advance the run.
- Timeout is recorded as `time_up`, not death.
- Practice does not unlock stages.
- Debug does not unlock stages.
- Run completes after the final stage.
- Stage results preserve pack/stage identity.

## Progression Scope

Add progression after the pure session model exists.

Suggested module:

- `js/progression.js`
- `js/progression.test.js`

Suggested responsibilities:

- Store unlocked practice stages per pack.
- Default unlock should include Pack 01 Stage 01.
- Canon clears unlock the cleared stage for practice, and may unlock the next stage depending on final design.
- Practice/debug never unlock future stages.
- Storage should be local and small for v1, likely `localStorage`.
- Keep Factory profile ownership separate from game-local progression until platform-level durable progression exists.

Open design decision:

- Does clearing Stage N unlock Stage N for replay only, or Stage N+1 for practice? Current user wording says "stages passed in one of the canon modes" are selectable for practice, which implies cleared stages become selectable. If progression gating later requires next-stage unlocks, add that explicitly.

## App Flow Scope

The current `main.js` boots directly into `new Game(canvas)`.

Canon Shell v1 should introduce a small app controller rather than putting menu state inside `Game`.

Suggested ownership:

- `Game`: single-stage runtime engine.
- `Session`: run/practice/debug state and canon rules.
- `App`: screen/menu flow, starts games, receives stage outcomes, advances session.
- `Renderer`: gameplay rendering only.
- Menu DOM/CSS: screen structure and visual states.

Suggested flow:

```text
Main Menu
  -> Local Co-op
       -> Pack Select
       -> Stage Play
       -> Stage Result
       -> next Stage Play ... or Run Result
  -> Online Co-op
       -> Online Lobby
       -> Stage Play
       -> Stage Result
       -> Run Result
  -> Practice
       -> Stage Select
       -> Stage Play
       -> Practice Result / back to Stage Select
  -> Debug Lab
       -> Debug Stage Select
       -> Stage Play with debug controls
```

## Online Pattern: Existing Platform Contracts

Build Buddy online must reuse existing Factory Network patterns.

Server location:

- Production: `wss://factory-network-server-production.up.railway.app`
- Local dev: `ws://localhost:3000` or `ws://127.0.0.1:3000`
- Server folder: `C:\Users\leoja\Desktop\Dad Games\full-games\factory-network-server`

Existing server protocols:

### Newer lobby protocol

Used by games such as Bird Duty and Echo Duel.

Client sends:

- `create_lobby`
- `find_lobby`
- `join_lobby`
- `update_lobby_settings`
- `start_lobby`
- `leave_lobby`
- `lobby_message`

Server events:

- `connected`
- `lobby_joined`
- `lobby_updated`
- `lobby_countdown_started`
- `lobby_started`
- `lobby_left`
- `lobby_player_joined`
- `lobby_player_left`
- `message` with `scope: "lobby"`
- `error`

Build Buddy should start from this protocol because it needs a pre-match lobby for identity, private codes, pack/run settings, ready/start flow, and future voice signaling.

### Older 1v1 room protocol

Used by several duel-style games and still supported.

Client sends:

- `find_match`
- `create_room`
- `join_room`
- `cancel_match`
- `leave_room`
- `room_message`

Server events:

- `connected`
- `queue_status`
- `searching`
- `search_cancelled`
- `room_joined`
- `player_joined`
- `match_ready`
- `message`
- `player_left`
- `error`

The room protocol supports side-aware queues using side pairs:

- `boy` / `girl`
- `alpha` / `beta`
- `p1` / `p2`

Build Buddy probably should not use Runner/Builder as matchmaking sides, because roles swap every stage. If the room protocol is used later, use `p1` / `p2` only as authority/client identity, not permanent gameplay role.

### Circuit Siege exception

`circuit-siege` is special-cased in `factory-network-server`. Build Buddy should not require a server special case for v1. It should ride the generic relay unless later design requires server-authoritative validation.

## Online Client Scope

Suggested module:

- `js/online-client.js`
- `js/online-client.test.js`

Build from the Bird Duty / Echo Duel client shape:

- `resolveWebSocketUrl(locationLike)`
- `sanitizeOnlineIdentity(identity)`
- `createOnlineClient(gameId = "build-buddy")`
- `connect()`
- `setIdentity(identity)`
- `createLobby(settings)`
- `findLobby(settings)`
- `joinLobby(roomCode)`
- `startLobby()`
- `leaveLobby()`
- `sendProfile()`
- `sendInput(input, meta)`
- `sendState(stateSnapshot)`
- `lobbyMessage(messageType, value)`
- `disconnect()`

Build Buddy lobby settings:

- `gameId: "build-buddy"`
- `minPlayers: 2`
- `maxPlayers: 2`
- `private: true/false`
- `settings`: include pack id, run format, and maybe protocol version.

Identity:

- Use Factory identity when available.
- Send `{ playerId, displayName }`.
- Keep display names bounded.
- Do not make Build Buddy the owner of long-term player identity.

## Online Match Authority Scope

Recommended v1:

- Lobby owner / first client is host authority.
- Host runs the authoritative stage simulation.
- Guest sends input/commands.
- Host broadcasts state snapshots and stage outcomes.
- Both clients render local views based on assigned current role.

Why:

- Avoids server changes.
- Avoids deterministic rollback complexity at first.
- Matches the generic relay approach used by other games.
- Lets Build Buddy validate co-op before committing to server-authoritative simulation.

Open technical decision:

- Whether Builder placements are sent as commands only, while Runner input streams continuously.
- Whether guest-side prediction is needed for Runner if guest is Runner.

Likely v1 contract:

```text
lobby_message "profile"
  { playerId, displayName }

lobby_message "ready"
  { ready: true, protocolVersion }

lobby_message "stage_start"
  { runId, stageId, stageIndex, roles, seed, startAt }

lobby_message "runner_input"
  { tick, left, right, up, down, jump, reposition }

lobby_message "builder_command"
  { tick, commandId, toolType, action, gridX, gridY }

lobby_message "state_sync"
  { tick, runner, tools, timerMs, stageStatus }

lobby_message "stage_result"
  { stageId, stageIndex, outcome, reason, elapsedMs, deaths, toolsPlaced }

lobby_message "run_result"
  { runId, packId, results }
```

All message shapes should be normalized and tested before runtime wiring.

## Voice Comms Scope

Voice comms are highly beneficial for Build Buddy because the core loop depends on real-time coordination. However, voice should not be the first online feature.

Recommended timing:

1. Canon shell.
2. Online lobby.
3. Host-authoritative online gameplay.
4. Non-voice coordination tools.
5. WebRTC voice for private lobbies.
6. Public voice only after mute/privacy/reporting UX exists.

Recommended implementation:

- Use WebRTC peer-to-peer audio.
- Use `factory-network-server` only for signaling through `lobby_message`.
- Do not send audio through the Factory Network server.
- Do not record or store audio.

Suggested voice messages:

```text
lobby_message "voice_offer"
lobby_message "voice_answer"
lobby_message "voice_ice_candidate"
lobby_message "voice_state"
```

Client responsibilities:

- Request mic through `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Create `RTCPeerConnection`.
- Exchange offer/answer/ICE through lobby messages.
- Play remote stream through an `<audio autoplay>` element.
- Provide mute/unmute.
- Show permission denied, no mic, connecting, connected, disconnected states.
- Clean up on lobby leave, disconnect, and mode exit.

Risks:

- NAT traversal may require a TURN server for reliable public matchmaking.
- Browser mic permissions require clear user gesture and UI.
- Mobile browser behavior may vary.
- Public matchmaking needs immediate mute and likely report/block considerations.

Recommendation:

- Start with private-lobby voice only.
- Keep Build Buddy playable without voice.
- Add quick pings as a non-voice fallback.

## Non-Voice Coordination Tools

These should come before or alongside online gameplay because they help both voice and no-voice play.

Suggested tools:

- Builder cursor/ghost already visible to Runner.
- Quick ping markers: "go", "wait", "build here", "reset", "checkpoint".
- Short-lived world markers from either role.
- Stage start countdown.
- Stage result recap with clear failure reason.

Pings should be lightweight commands over the same online message layer.

## Phase Plan

### Phase 0: Documentation and Audit

Status: Complete.

Deliverables:

- This scope document.
- Confirm `BUILD_BUDDY_GDD.md` remains source of truth for canon rules.
- Confirm online implementation will reuse Factory Network server patterns.

No code behavior changes required.

### Phase 1: Pure Session and Progression

Status: Complete.

Deliverables:

- `js/session.js`
- `tests/session.test.mjs`
- `js/progression.js`
- `tests/progression.test.mjs`

Done when:

- Run/session rules are tested.
- Role swapping is tested.
- Stage clear/fail advance rules are tested.
- Practice/debug progression isolation is tested.

### Phase 2: Canon Shell v1

Status: Complete.

Deliverables:

- App controller above `Game`.
- Main menu and mode select.
- Local Co-op Run.
- Practice stage select with unlocks.
- Debug Lab preserving current hybrid option.
- Stage result and run result screens.

Done when:

- The game no longer only boots directly into prototype play.
- Local canon runs can advance through available stages.
- Timeout records a stage failure and advances instead of being treated as a death reset.
- Debug mode remains available but non-canon.

### Phase 3: Stage Pack Expansion Baseline

Status: Complete.

Deliverables:

- Enough stage slots/authored baselines to support a 10-stage run structure.
- Pack manifests stay the canonical stage registry.
- Stage select reads from pack/stage metadata.
- Compact stage authoring blueprints compile to runtime stage records.

Done when:

- The run layer can represent 10 stages even if later stages are authored baselines rather than final content.
- No hardcoded single-stage imports return to `game.js`.
- Stage authoring is easy enough to grow a larger catalog without hand-maintaining huge stage objects.

### Phase 4: Online Lobby

Status: Complete for Phase 5 entry.

Deliverables:

- Build Buddy online client using Factory Network lobby protocol.
- Public `find_lobby`.
- Private `create_lobby` / `join_lobby`.
- Identity passing from Factory profile.
- Lobby status, room code, player list, owner/start behavior.

Done when:

- Two browser clients can join the same Build Buddy lobby.
- Lobby messages can exchange profile/ready state.
- No custom auth layer exists in Build Buddy.

### Phase 4.5: Full-Run and Stage Authoring Readiness

Status: Complete.

Deliverables:

- Stage authoring helper for compact blueprints and Builder rule presets.
- Pack 01 stages 02-10 converted from generic generated stubs to distinct authored-baseline archetypes.
- Full 10-stage shell test using the real Pack 01 registry.
- Mixed clear/timer-fail flow coverage.

Done when:

- Pack 01 can run through all 10 registered stages.
- Clear and timer failure both advance to the next stage.
- Roles swap after every result.
- Final run summary contains 10 stage results.
- The stage data is ready for online sync testing even though final stage polish remains a later content pass.

### Phase 5: Online Gameplay v1

Status: Complete for client-side v1.

Deliverables:

- Host-authoritative stage runtime.
- Runner input serialization.
- Builder command serialization.
- Host state snapshots.
- Stage result sync.
- Role swap sync.
- Disconnect handling.

Done when:

- Two clients can complete or fail a stage together.
- Roles swap after stage result.
- Guest cannot write canon outcomes independently of host authority.

### Phase 6: Coordination and Voice

Deliverables:

- Quick pings.
- Private-lobby WebRTC voice prototype.
- Mute/unmute.
- Voice connection status.
- Permission failure fallback.

Done when:

- Private lobby players can talk peer-to-peer where browser/network conditions allow.
- Voice uses Factory Network only for signaling.
- Game remains playable when voice fails.

### Phase 7: Production Polish

Deliverables:

- Real menu art direction.
- Better HUD and results cards.
- Audio/music pass.
- Stage content pass.
- Mobile/touch review.
- Accessibility and privacy polish.
- Public voice policy decision if still desired.

## Handoff Notes for Future Codex Chats

When resuming after context clear:

1. Read `AGENTS.md` instructions from the user/context.
2. Read `BUILD_BUDDY_GDD.md`.
3. Read this document.
4. Inspect current `git status --short`.
5. Treat Phase 5 as the next implementation phase unless newer notes say otherwise.
6. Follow TDD for implementation phases.
7. Do not touch unrelated dirty files outside `games/build-buddy`.

Important constraints:

- No external dependencies without explicit approval.
- Game cabinets remain vanilla HTML/CSS/JS.
- Prefer small modules with one clear job.
- Keep `Game` focused on single-stage gameplay.
- Keep session/progression/menu/online concerns outside `Game`.
- Preserve Debug Lab as a development affordance, but keep it non-canon.
- Reuse Factory Network server patterns for online.
- Do not create a Build Buddy-owned long-term identity system.

## Open Decisions

- Should practice unlock only cleared stages, or also the next stage after a clear?
- Should Local Co-op Run support two local names before gameplay?
- Should online public search auto-start when two players join, or require both players to ready?
- Should online authority always be lobby owner, or always server join order client 1?
- How much guest-side prediction is required when guest is Runner?
- Should public matchmaking voice default off until moderation/reporting exists?

Resolved for Phase 5 entry:

- Pack 01 uses authored-baseline blueprints for stages 02-10; final stage polish remains a later content pass.

## Immediate Next Recommendation

Start Phase 5: Online Gameplay v1.

Recommended first slice:

1. Define the online gameplay message contract for `stage_start`, Runner input, Builder commands, host snapshots, `stage_result`, and `run_complete`.
2. Add tests for host-only stage result authority and guest result rejection.
3. Start from a single-stage online runtime sync, but keep the real 10-stage Pack 01 sequence in the tests.
4. Verify both clear and timer failure advance the online session and swap roles.
5. Keep `Game` as the single-stage runtime; put online authority, serialization, and session advancement outside it.
