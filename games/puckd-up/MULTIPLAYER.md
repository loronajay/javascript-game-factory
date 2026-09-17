# Puck'd Up — online implementation handoff

## Completed: registration and lobby preparation

- Public identity: puckd-up. Catalog order 17; preserve the supplied preview art.
- Solo/CPU remains guest-accessible. Online entry uses the existing shared
  Player Factory gate, then /auth/me for current account id and profile name.
- Factory Network v2 messages: find_lobby, create_lobby with private: true,
  join_lobby with gameId and five-character roomCode, leave_lobby.
- Searches/creates send minPlayers: 2, maxPlayers: 2 and exactly
  settings: { protocolVersion: 1, targetScore: 7 }. Cosmetics/venues do not
  fragment Quick Search. CPU difficulty is never a matchmaking setting.
- The server registry points to the puckd-up game definition. Generic server
  modules remain game-agnostic. Optional gameId validation on joins prevents
  wrong-game room codes while preserving legacy code-only joins.
- No automatic match start: server canStart is false; gameplay relay is blocked.
  Client also refuses unexpected lobby_started events. A full room is a staged
  pairing, not a playable online match.
- Cancel invalidates pending auth and socket callbacks; timeouts and disconnects
  reset the flow. Leave/Back/navigation release the seat. No reconnect token is
  persisted for a lobby-only preview.

## Completed: synchronized air hockey (server-authoritative)

Implemented as server-owned physics (`server/authority.js`) with client paddle
input only and interpolated remote/puck state (`scripts/online/sync.js`). The
pure sim boundary is mirrored into factory-network-server through
`server/mirror-manifest.mjs`; `npm run test:network` runs `sync-server.mjs
--check` then the real-socket contract test, and
`tests/online-authority.test.js` / `tests/online-sync.test.js` cover the sim and
reconciliation. `canStart` gates on two seats + matching `protocolVersion` +
both seats ready; gameplay messages before start are rejected. Rematch,
reconnect grace, and authoritative forfeit on disconnect are wired. Server and
client match gates were removed together once `cabinet npm test`, `npm run
test:network`, and `factory-network-server npm test` all passed.

### Presentation model (2026-09-16 smoothness pass)

Playtesting reported the puck passing through paddles and a generally "off"
feel. Four causes were found and fixed together; both repos deploy together
(`PROTOCOL_VERSION` 4).

- **Time-frame gap.** The local paddle is predicted (one round trip ahead of
  the server) while the puck was interpolated two snapshot intervals *behind*
  it, so a striking player watched the puck arrive ~RTT + 66 ms after their
  paddle had swept through. The puck is now carried *forward* from the newest
  snapshot by the measured round trip (`scripts/online/puck-predictor.js`) —
  ballistic motion with Cannon-shaped damping, rail reflection, the same swept
  mallet contact and strike boost the authority runs, against the local
  paddle's own recent prediction trail and the remote paddle run to the target
  its velocity names. A strike lands on the striker's screen when it lands on
  the server. The RTT is measured from acknowledged commands (window minimum);
  the horizon caps at 150 ms and freezes there on a stall.
- **Corrections popped.** Every snapshot is now blended in: the difference
  between what was shown and what the new prediction says is carried as a
  visual offset that decays over ~40 ms, for puck, remote paddle and the
  reconciled local paddle alike. A serve/goal-sized jump snaps instead.
- **Bunched inputs were dropped.** The authority rejected any command within
  two ticks of the last, and WebSocket coalescing delivers 60 Hz commands in
  pairs, so the server paddle was stuck on stale targets. Inputs are budgeted
  (token bucket, `INPUT_BURST`) rather than spaced. The client also predicts
  with the target the server will *hold* for each command, not the fresher
  per-tick pointer, so replay matches the authority to the tick.
- **Snapshot cadence.** 30 Hz off an 8 ms timer's wall-clock remainder produced
  32/40 ms alternating gaps; snapshots are now 60 Hz paced by simulation
  ticks, and each carries only the last second of events instead of the whole
  64-event ring (which was most of the bandwidth).

The sync layer is still presentation-only: nothing predicted is sent, and no
goal, cooldown or result is decided on a client.

Still deferred: Player Factory records. Online matches remain casual and write
nothing to platform-api — see the section below before adding any record,
ladder, or ranked stakes.

### Original design notes (retained for reference)

Recommended authority model: server-owned physics with client paddle prediction
and interpolated remote state. Do not assume Cannon produces deterministic
cross-browser lockstep simply because the cabinet has a fixed step.

1. Extract/mirror the current pure simulation boundary with a checked manifest
   or golden replay. Preserve the 240 Hz tick, 29 m/s cap, swept contacts, goal
   geometry, first-to-seven, face-off and celebration delays. Resolve the pinned
   Cannon runtime on the server without silently adding a new dependency.
2. Define authenticated seat bindings, stable matchId, protocol/build version,
   server tick and input sequence. A browser-supplied playerId/displayName is
   unverified display metadata today. Never let that identity award records.
3. Accept bounded paddle intent only; enforce the legal half-table, speed,
   strike cooldown and input rate server-side. Clients never author puck state,
   goals, final scores, timestamps or winners.
4. Publish authoritative snapshots at a tested bounded cadence (start by
   evaluating 30 Hz), with local paddle prediction/reconciliation and remote
   interpolation. Keep existing 240 Hz CPU gameplay unaffected.
5. Define host-independent start, both-seat readiness, cancellation, rematch,
   disconnect grace/rejoin and authoritative forfeits. Tab hiding may stop
   local input/presentation; it must not pause the shared match unilaterally.
6. Prove two-client behavior at multiple rendering rates under latency, jitter,
   loss, reconnect and stale input. Test mirrored seat coordinates and both
   goal directions. Browser playtesting supplements, not replaces, the harness.
7. Remove the server/client match gates together only after those tests pass.

## Player Factory records (not implemented)

Keep all durable data in platform-api, not cabinet localStorage or Factory
Network's ephemeral Maps. The existing GET /ratings/:slug/:playerId can read a
Puck'd Up record already; no extra rating allowlist or database is needed for
that read. No ladder or ranking is advertised before competitive play exists.

Before writing results, establish an authenticated server-to-platform reporting
contract with exactly-once matchId semantics and retry handling. Bind both
account ids at match start; derive winners/scores on the server. Protect the
generic client-reporting endpoint for this slug if using server attestation.
Do not treat the existing client-attested POST /ratings/:slug as proof that a
match occurred. Decide casual/ranked stakes explicitly; casual lobbies should
not silently change competitive ELO. CPU results never count as online wins.

Report authoritative match completion/forfeit once to the platform, then let
platform-owned ratings, records and activity projections consume it. Repeated
packets, remounts and reconnects must not duplicate wins or activity.

## Verification and rollout

Cabinet: npm test; npm run test:network (requires sibling factory-network-server).
Server: npm test, including npm run test:puckd-up.
Platform: npm run build:browser and catalog tests after catalog changes.

Verified locally: guest CPU start, sign-in gate, Quick Search and private join
across two browser fixture clients, host transfer, cleanup, and real-socket
integration with 0/80/200 ms added RTT. No live account or production result was
used. These checks prove lobby flow, not synchronized gameplay.

Deploy Factory Network FIRST, then the platform catalog/cabinet together.
An old server treats an unknown gameId as a generic relay and lacks this game's
match-start gate. This work is local and does not itself publish either repo.
