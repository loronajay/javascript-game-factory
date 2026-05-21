# Sumorai — Online Play Scope

## Overview

Online 1v1 using the Factory Network server. Same WebSocket relay pattern as Lovers Lost and Illuminauts.
Public matchmaking + private room codes. Both players pick their side (conflict is an error, same as Lovers Lost).
Always Best of 5. Stage is random each round, seeded from the match seed.

---

## Phase Map

```
menu → online_lobby (side_select)
         → online_lobby (main)
               ├─ Find Match → online_lobby (searching) → [match_ready] → online_countdown → game phases
               └─ Play Friend
                     ├─ Create Room → online_lobby (create) → [partner joins] → online_countdown → game phases
                     └─ Join Room → online_lobby (join) → [code entry + join] → online_countdown → game phases

game phases: round_start → active → round_end → round_start (repeat) → match_end → online_result

online_result → Rematch | Menu
```

Disconnect at any point during countdown or game → `online_disconnected` → back to menu.

---

## Side Select

Both players independently pick P1 (Left) or P2 (Right) before entering the queue.
- If both players pick the same side: server sends `SIDE_CONFLICT` → both return to side_select with an error message
- Coordinator defaults are not forced — both sides are truly free-for-all like Lovers Lost

The local player always uses `bindings[onlineSide]` (their configured controls for that side).

---

## Match Settings (Online)

- **Match length**: Always Best of 5 (3 wins needed). No picker.
- **Stage**: Random each round, seeded from the `match_ready` seed + round number.
  - Pool: `['single', 'battlefield', 'moving', 'none']`
  - Deterministic from seed so both clients pick the same stage independently — no settings message needed.

```js
function pickOnlineStage(seed, roundNum) {
  const stages = ['single', 'battlefield', 'battlefield', 'moving', 'none'];
  const idx = Math.abs(Math.floor(seed * 9301 + roundNum * 49297) % stages.length);
  return stages[idx];
}
```

(`battlefield` appears twice to up its weight slightly since it's the most interesting multi-platform stage.)

---

## Sync Model — Input Broadcast + Deterministic Simulation

Sumorai's game logic is fully deterministic. Every function (`applyPhysics`, `resolveHits`, `tickGridlock`, `tickProjectile`) is a pure function of input + state.

**The approach:**
- Both clients run the **full simulation** each tick (including the remote player)
- Each tick, each client serializes and sends their own input snapshot over the wire
- Each client buffers incoming remote inputs
- Before simulating tick N: use remote input if arrived, else repeat last known
- On hit or ring-out: send a `round_end` confirmation; wait for both sides to agree

**Round end confirmation:**
- Both clients independently detect kills/ring-outs (deterministic — they should agree)
- Each sends `{ type: 'round_end', winner: 'p1'|'p2'|'draw' }` when detected
- Both wait for partner's confirmation before calling `triggerRoundEnd`
- If disagreement (rare desync): coordinator's declaration wins; both correct

---

## Protocol Messages

All sent via `room_message`:

| messageType | Direction          | Payload |
|-------------|-------------------|---------|
| `profile`   | both → partner    | `{ playerId, displayName, side }` |
| `input`     | both → partner    | `{ seq, left, right, up, down, attack, dash, projectile, attackJustPressed }` |
| `round_end` | both → partner    | `{ winner: 'p1'|'p2'|'draw' }` |

Input messages fire every game tick (60/s). Payload is 8 booleans + a sequence number.
No settings message needed (match length fixed, stage deterministic from seed).

---

## New Files

```
scripts/
  online.js           ← WebSocket client (copy Lovers Lost pattern, swap gameId to 'sumorai')
  online-identity.js  ← reads loadFactoryProfile(), builds { playerId, displayName }
```

---

## HTML Screens (follow Lovers Lost lobby visual style)

**`screen-online-lobby`** — phases: side_select / main / searching / create / join  
- Side select: P1 Left / P2 Right cards (conflict error shown inline)
- Main: "Find Match" + "Play Friend"
- Searching: "Searching…" + cancel
- Create: room code display + cancel
- Join: room code input + submit + cancel

**`screen-online-countdown`** — draws on canvas using existing round_start banner; shows opponent display name

**`screen-online-result`** — mirrors local `screen-result`; Rematch + Menu; Rematch re-enters countdown

**`screen-online-disconnected`** — "Opponent disconnected" + Menu

---

## game.js Changes

New online state:
```js
let onlineClient          = null;
let onlineSide            = 'p1';
let onlineLobbyPhase      = 'side_select';
let onlineRoomCode        = '';
let onlineClockOffset     = 0;
let onlineStartAt         = 0;
let onlineMatchSeed       = 0;
let onlineRemoteIdentity  = null;
let onlineRemoteInputBuf  = {};     // seq → input snapshot
let onlineRemoteLastInput = null;
let onlineLocalSeq        = 0;
let onlinePendingEnd      = null;   // local's declared round winner
let onlinePartnerEnd      = null;   // partner's declared round winner
let isOnline              = false;
```

`tickActive` / `tickGridlockPhase` online input swap:
```js
const localIn  = input.getSnapshot(bindings[onlineSide]);
const remoteIn = _drainRemoteInput() ?? onlineRemoteLastInput ?? emptyInput;
const p1In = onlineSide === 'p1' ? localIn : remoteIn;
const p2In = onlineSide === 'p2' ? localIn : remoteIn;
onlineClient.sendInput(onlineLocalSeq++, localIn);
```

Stage per round (online):
```js
gameState.platforms = createPlatforms(pickOnlineStage(onlineMatchSeed, gameState.roundNum));
```

---

## Not in Scope for v1

- Rollback netcode — input broadcast + last-known fallback is sufficient
- Latency / ping indicator
- Emotes during match
- Activity feed publish on online result (add later)
- Chat in lobby
