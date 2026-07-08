# Tactical Arena - Relay Battle

Relay Battle is Tactical Arena's persistent turn relay mode: a player submits
their turn, the authoritative match snapshot is saved, and the opponent can
resume later, watch that turn play out, and send their response. If both players
stay connected, the same match can flow continuously like live online play.

The mode should feel like one match with flexible pacing, not a separate
watered-down ruleset.

## Product Intent

Relay Battle is for players who want real tactical matches without needing both
people to sit in the same session until the end. A player can have multiple
active battles, open the one waiting on them, watch the opponent's last turn,
make a decision, and send orders back.

Core promise:

- **Same battle rules:** Relay Battle uses the normal deterministic reducer,
  command validation, seeded RNG, state hashing, squads, skins, maps, and draft
  rules.
- **Flexible tempo:** A match can be live while both players are present, then
  become delayed when one leaves, then become live again if both return.
- **Replay before response:** When a player opens a waiting match, they see the
  opponent's submitted turn animate from the previous snapshot before they act.
- **Phone-friendly loop:** The opponent receives a notification when it is their
  turn, but the first milestone can use an in-game inbox before native push
  notifications exist.

Suggested UI language:

- Mode name: **Relay Battle**
- Submit button: **Send Orders**
- Waiting state: **Awaiting Enemy Orders**
- Resume action: **Replay Enemy Turn**
- Inbox label: **Your Orders**
- Live state: **Both Commanders Online**

## Current Architecture Fit

The existing online stack is already close to what this mode needs:

- `src/online/onlineClient.js` sends accepted core commands through a generic
  WebSocket relay.
- `src/online/onlineSession.js` applies remote commands through the same local
  controller and checks owner-authored state hashes.
- `src/core/state-hash.js` canonicalizes all future-relevant match state,
  including RNG state and board objects.
- `src/core/commands.js` defines serializable command objects.

Relay Battle should preserve this shape, but replace "all clients must be online
to receive each command now" with "the server stores turn packets and snapshots
until the next player resumes."

## Match Tempo Model

Relay Battle has three tempo states:

| State | Meaning |
| --- | --- |
| `live` | Both players are connected to the match. Commands are delivered immediately. |
| `waiting` | A submitted turn is stored and the next player has not responded yet. |
| `replaying` | A returning player is watching the stored command packet animate before acting. |

Important behavior:

- If both players remain in the match after a turn is submitted, the next player
  can act immediately and the battle feels live.
- If the next player is offline, the match becomes `waiting`.
- If a player opens a waiting match, the client replays the stored opponent turn,
  verifies the resulting state hash, then unlocks input.
- If a player disconnects during their own turn, no partial turn is committed
  unless they explicitly send orders.

## Turn Packet

A Relay Battle turn should be stored as a single ordered packet. The packet is
not a rendered video; it is authoritative data that can be replayed by the game.

```json
{
  "matchId": "rb_...",
  "turnId": 12,
  "rulesetVersion": 3,
  "actingPlayer": 1,
  "baseRevision": 48,
  "baseHash": "a1b2c3d4",
  "commands": [
    { "type": "BEGIN_ACTIVATION", "player": 1, "unitId": "p1-swordsman" },
    { "type": "MOVE_UNIT", "player": 1, "unitId": "p1-swordsman", "position": { "x": 6, "y": 4 } },
    { "type": "ATTACK", "player": 1, "actorId": "p1-swordsman", "targetId": "p2-mystic" },
    { "type": "FINISH_ACTIVATION", "player": 1, "unitId": "p1-swordsman" }
  ],
  "resultRevision": 52,
  "resultHash": "e5f6a7b8",
  "submittedAt": "2026-07-07T00:00:00.000Z"
}
```

The exact command count per turn can vary because Tactical Arena already models
activation flow as multiple reducer commands. The packet boundary should be
"the acting player has completed their committed response," not necessarily a
single unit action if the rules later support multi-activation turns.

## Snapshot Record

The backend needs enough state to let either client resume the match without
the opponent being online.

Recommended match record:

```json
{
  "matchId": "rb_...",
  "mode": "relayBattle",
  "rulesetVersion": 3,
  "createdAt": "2026-07-07T00:00:00.000Z",
  "updatedAt": "2026-07-07T00:00:00.000Z",
  "players": [
    { "playerId": "p1", "seat": 1, "displayName": "Commander" },
    { "playerId": "p2", "seat": 2, "displayName": "Commander" }
  ],
  "config": {
    "size": 13,
    "format": "ffa",
    "seed": 123456789,
    "squads": { "1": ["swordsman", "mystic", "paladin", "archer"] },
    "skins": { "1": [null, "summer-vibes", null, null] }
  },
  "currentPlayer": 2,
  "revision": 52,
  "stateHash": "e5f6a7b8",
  "snapshot": {},
  "pendingTurnId": 12,
  "status": "waiting",
  "winner": null
}
```

Storage policy:

- Store the latest full authoritative snapshot for quick resume.
- Store the command packet history for replay, audit, and future shareable match
  playback.
- Keep a compact replay cursor so the client knows which opponent packet the
  local player has already watched.

## Resume Flow

1. Player opens the Relay Battle inbox.
2. Client fetches the match record and any unwatched turn packets.
3. Client builds or loads the last locally acknowledged snapshot.
4. Client verifies the snapshot hash against the server record.
5. Client replays unwatched opponent commands with normal battle animations.
6. Client verifies the resulting hash.
7. If it is now the player's turn, input unlocks and the UI shows **Send Orders**.
8. On submit, the client sends the command packet plus base/result hashes.
9. Server accepts the packet only if the base hash and current player match.
10. Server stores the new snapshot, advances the turn, and notifies the opponent.

## Server Responsibilities

The current relay server can pass live messages, but Relay Battle needs durable
match state. The server does not need to understand unit rules, but it does need
to enforce turn ownership and persistence.

Minimum server responsibilities:

- Create Relay Battle matches.
- Store match config, snapshots, hashes, and command packets.
- Reject a submitted packet if `actingPlayer`, `baseRevision`, or `baseHash` do
  not match the current record.
- Mark the next player as waiting.
- Notify the next player when a turn is ready.
- Support live delivery if both players are currently connected.
- Provide an inbox query for active matches by player.
- Expire abandoned matches after a defined timeout.

Optional later responsibilities:

- Push notification registration and routing.
- Abuse reporting and blocking.
- Ranked/seasonal eligibility.
- Match recovery tooling for desync reports.
- Server-side reducer validation for stronger anti-cheat.

## Client Responsibilities

Minimum client responsibilities:

- New Relay Battle inbox screen.
- Match list states: your turn, waiting, live, finished, expired.
- Resume/replay flow before input unlock.
- Local draft/squad setup for Relay Battle match creation.
- Send Orders flow that packages all commands since the start of the local turn.
- Hash verification and clean error handling when a local snapshot diverges.

Client UX requirements:

- The player should never be dropped directly into an unexplained changed board.
  The opponent turn must be replayed or summarized before input unlocks.
- The player should be able to leave while waiting without conceding.
- A live opponent presence indicator should be visible but not required.
- The match should clearly say whose orders are needed.

## Notifications

Native push notifications are valuable, but they should not be the first
dependency. The feature can ship in layers:

1. **In-game inbox:** Refresh on app open and show waiting matches.
2. **Web/PWA notification:** Browser permission, best effort only.
3. **Native mobile push:** App Store / Play Store build with APNs/FCM.
4. **Email or account notifications:** Optional, mostly for recovery and reengagement.

Notification copy should be short:

- "Your orders are needed in Relay Battle."
- "Enemy orders received. Replay the turn."
- "Both commanders are online. Battle can continue live."

## Distribution Implications

Relay Battle changes the distribution decision because phone notifications and
persistent multiplayer turn storage create live-service obligations.

### Web / PWA

Pros:

- Lowest friction for testing.
- Works well with the current JavaScript game.
- Can prove the inbox and replay loop before platform commitment.

Cons:

- Mobile push support is uneven and permission-sensitive.
- App-like retention is weaker than native store installs.
- Background behavior varies by browser and OS.

### Steam

Pros:

- Strong fit for desktop tactics players.
- Easier desktop packaging and updates.
- Good for live online and ranked presence.

Cons:

- Does not solve "notify my phone" by itself.
- Async phone-first behavior would still need companion web/mobile support.

### App Store / Play Store

Pros:

- Best fit for phone notifications.
- Natural home for "take your turn when ready" play.
- Better retention loop for multiple waiting battles.

Cons:

- Requires native wrapper or mobile port pipeline.
- Adds review, privacy, account, moderation, and notification compliance work.
- Touch UX, screen wake, and background handling must be polished.

Recommended path:

1. Build Relay Battle as a web-backed feature first.
2. Prove the match inbox, resume replay, and send-orders loop.
3. Add web notifications only after the loop is fun.
4. Decide on native mobile or Steam once retention data says which audience is
   actually using it.

## MVP Scope

The first milestone should be deliberately small.

MVP includes:

- Relay Battle match creation for 1v1.
- Persistent match record with latest snapshot and hash.
- Command packet submit/resume.
- In-game inbox.
- Replay opponent turn on resume.
- Manual refresh.
- No native push notifications.
- No ranked integration.
- No server-side battle simulation.

MVP excludes:

- Ranked ladder.
- 4-player Relay Battle.
- Push notifications.
- Spectators.
- Full match sharing.
- Anti-cheat beyond hash/base-turn validation.

## Implementation Phases

### Phase 1 - Local Prototype

Build the full Relay Battle data model locally using browser storage or a mock
repository module. This proves packet boundaries, resume replay, and inbox UI
without backend work.

Deliverables:

- `relayBattle` match mode config.
- Local match repository interface.
- Turn packet builder.
- Resume/replay tests around command packets and state hashes.
- Basic inbox screen.

### Phase 2 - Durable Backend

Move the repository interface to a server API.

Deliverables:

- Create match endpoint.
- Fetch inbox endpoint.
- Fetch match endpoint.
- Submit turn endpoint with base hash validation.
- Store latest snapshot and packet history.
- Live WebSocket delivery when opponent is connected.

### Phase 3 - Presence And Notifications

Add real retention features once the loop works.

Deliverables:

- Player presence in match.
- "Continue live" state when both players are connected.
- Web notifications or native push spike.
- Turn reminder timing and quiet hours.

### Phase 4 - Competitive Rules

Only after the mode is stable, decide if Relay Battle can be ranked.

Considerations:

- Turn timers.
- Vacation/timeout rules.
- Abandon penalties.
- Draft timers.
- Anti-cheat posture.
- Whether async ranked should be separate from live ranked.

## Design Questions To Resolve

- What is the committed turn boundary: one activation, one squad turn, or one
  currently-active player decision chain?
- Can a player review and undo their local actions before pressing **Send Orders**?
- How long can a player hold a turn before timeout?
- Should Relay Battle support casual duplicates, draft uniqueness, or both?
- Should players see opponent online presence before entering the match?
- Should the first version require accounts, room codes, friend invites, or all
  three?
- What is the desync recovery UX: retry replay, reload snapshot, or cancel match?
- Are cosmetics and unlocks evaluated at match start or at resume time?

## Recommendation

Build Relay Battle before native push and before ranked integration. The risky
part is not the notification; it is whether the saved-turn replay loop feels good.
If that loop works, notifications and distribution choices become much easier to
justify.

