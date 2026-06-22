# Isometric Squad Tactics — Platform Conversion Scope

**Status:** Agent handoff scope  
**Working title:** Isometric Squad Tactics  
**Temporary slug:** `isometric-squad-tactics`  
**Target:** Browser game registered to the platform with Single Player, Local Hot Seat, and Online Versus  
**Current baseline:** The existing standalone HTML prototype is the visual and gameplay reference, but its monolithic state and `Math.random()` implementation are not suitable as the final architecture.

---

## 1. Objective

Convert the current playable prototype into a platform-ready two-player tactical game without redesigning the board, units, combat rules, or presentation.

The final v1 must support:

1. Single Player versus CPU
2. Local Hot Seat
3. Online Versus
4. 10×10 and 13×13 board options
5. A proper title/menu/setup/match/results flow
6. Platform result reporting and registration metadata
7. Deterministic, testable gameplay logic shared by every mode

The CPU, hot-seat mode, and online mode must all drive the same core command/rules engine. Do not maintain separate gameplay implementations by mode.

---

## 2. Locked Gameplay Rules

### 2.1 Match structure

- Two players.
- Each player controls four units:
  - Warrior
  - Tank
  - Ranger
  - Medic
- Every unit begins with 10 HP.
- A unit is removed from play at 0 HP.
- A squad turn continues until every living unit belonging to the active player is spent.
- The opposing squad turn then begins.
- The last squad with at least one living unit wins.
- Player 1 begins in v1.
- No draw condition is currently required.

### 2.2 Movement

Movement is orthogonal only.

| Unit | Movement |
|---|---:|
| Warrior | 3 tiles |
| Tank | 2 tiles |
| Ranger | 2 tiles |
| Medic | 2 tiles |

Rules:

- A unit cannot move through or finish on an occupied tile.
- Movement is optional.
- A unit cannot complete an activation by moving alone.
- Every activation must include one primary action:
  - Attack
  - Heal
  - Defend
- Attack or heal may happen before or after movement.
- Defend immediately completes the activation, so any desired movement must happen before defending.
- A unit may move at most once during its activation.

### 2.3 Attack and heal range

Attack and heal range uses Chebyshev distance:

```text
range = max(abs(dx), abs(dy))
```

This means diagonal attacks are legal with no penalty.

| Unit | Range |
|---|---:|
| Warrior attack | 1 |
| Tank attack | 1 |
| Ranger attack | 4 |
| Medic attack | 3 |
| Medic heal | 3 |

Ranger line-of-fire:

- Any living unit between the ranger and the target blocks the shot.
- Friendly and enemy units both block ranger shots.
- The attacker and target cells are excluded from obstruction checks.
- Movement remains orthogonal even though attacks may be diagonal.

### 2.4 Dice

Every attack and heal rolls one six-sided die.

- Roll 1: miss
- Rolls 2–5: normal result
- Roll 6: critical result

Critical attacks add 1 damage.

Medic healing:

- Normal heal: 3 HP
- Critical heal: 4 HP
- Roll 1: heal misses
- Medic may heal itself
- Healing cannot raise HP above 10

### 2.5 Damage

| Attacker | Normal damage |
|---|---:|
| Warrior | 3 |
| Warrior attacking Tank | 2 |
| Tank | 2 |
| Ranger | 2 |
| Ranger attacking Ranger | 3 |
| Medic | 1 |

Critical attack damage is the applicable normal damage plus 1.

### 2.6 Defend

- Defend is a primary action.
- Defend immediately spends the acting unit.
- A defending unit reduces every incoming hit by 1 damage.
- Damage cannot be reduced below 0.
- Defend persists through the opponent’s squad turn.
- Defend expires when that unit is next selected to begin an activation.
- A unit may defend again during that activation.

---

## 3. Required Change: Cancel Move

The existing prototype commits movement immediately. Add a narrow, explicit `Cancel Move` operation.

### 3.1 Player-facing behavior

After a unit moves, but before it attacks, heals, or defends:

- Show or enable a `Cancel Move` button.
- Selecting it returns the unit to the tile where its current activation began.
- The unit remains selected.
- The unit remains unspent.
- The player may choose a different move, take an action without moving, or select a legal action mode.

Do not label this as a general `Undo`. It only cancels the current unspent unit’s movement.

### 3.2 Cancellation is legal only when

```text
activation exists
AND activation.moved == true
AND activation.primaryUsed == false
AND selected unit is not spent
AND no animation or command resolution is locked
```

Cancellation is illegal after:

- Attack
- Heal
- Defend
- Any die roll
- Activation completion
- Turn change
- Match completion

If the unit attacks or heals first and then moves, movement completes the activation immediately. There is no cancel window because the unit is already spent.

### 3.3 State required

```js
activation: {
  unitId,
  origin: { x, y },
  moved: false,
  primaryUsed: false
}
```

Capture `origin` once when the activation begins. Do not overwrite it when movement occurs.

### 3.4 Command

```js
{
  type: "CANCEL_MOVE",
  player: 1,
  unitId: "p1-warrior"
}
```

The rules engine validates the command and restores the activation origin.

### 3.5 Online requirement

`CANCEL_MOVE` must be a server-validated gameplay command. The client must not locally rewrite authoritative position state without receiving the accepted command/event from the server.

### 3.6 Acceptance tests

- Move, cancel, and move to a different legal tile.
- Move, cancel, and attack from the original tile.
- Move, cancel, and defend.
- Move, attack, then cancel is rejected.
- Attack, move, then cancel is rejected because the activation is complete.
- Cancel when no movement occurred is rejected.
- Cancel cannot restore a dead or spent unit.
- Replaying the same command log produces the same restored position.

---

## 4. Screen and Menu Flow

### 4.1 Boot

```text
BOOT
  -> TITLE
```

Boot responsibilities:

- Load game assets.
- Load platform identity/session when available.
- Load saved settings.
- Show a controlled error screen if required platform initialization fails.

### 4.2 Title screen

Required controls:

- Continue to Main Menu
- How to Play
- Settings

Do not place board-size controls or debug controls on the title screen.

### 4.3 Main menu

```text
MAIN MENU
  -> SINGLE PLAYER
  -> HOT SEAT
  -> ONLINE VERSUS
  -> HOW TO PLAY
  -> SETTINGS
```

### 4.4 Single Player setup

Required options:

- Board size:
  - 10×10
  - 13×13
- CPU difficulty:
  - Easy
  - Normal
  - Hard
- Start Match
- Back

v1 assignment:

- Human is Player 1.
- CPU is Player 2.
- Player 1 begins.

Do not add squad construction, alternate rosters, unlocks, campaigns, or progression.

### 4.5 Hot Seat setup

Required options:

- Board size:
  - 10×10
  - 13×13
- Start Match
- Back

At every squad-turn transition, display a blocking handoff overlay:

```text
PLAYER 2 TURN
Press Ready
```

The game has no hidden information, but the overlay prevents the previous player from accidentally beginning the next squad’s activation.

### 4.6 Online Versus menu

Required paths:

```text
ONLINE VERSUS
  -> QUICK MATCH
  -> CREATE PRIVATE MATCH
  -> JOIN PRIVATE MATCH
  -> BACK
```

Quick Match:

- Uses the platform matchmaking path.
- Uses 10×10 in v1 unless the platform queue already supports ruleset filtering.

Create Private Match:

- Host selects 10×10 or 13×13.
- Platform creates a room code.
- Match cannot begin until two players are present.
- Host starts the match.

Join Private Match:

- Enter room code.
- Join lobby.
- Wait for host start.

Do not allow joining a match already in progress.

### 4.7 Match pause/menu

Local and CPU:

- Resume
- How to Play
- Settings
- Restart Match
- Quit to Main Menu

Online:

- Resume
- How to Play
- Settings
- Concede
- Quit is treated through the platform disconnect/concede policy

Online clients must not restart the match independently.

### 4.8 Results

Display:

- Winner
- Winning side
- Mode
- Board size
- Squad turns completed
- Match duration
- Victory reason:
  - Squad eliminated
  - Concede
  - Disconnect/platform termination
  - Timeout, if enabled

Controls:

Local/CPU:

- Rematch
- Main Menu

Online:

- Request Rematch
- Main Menu

An online rematch begins only after both players accept.

---

## 5. Architecture Requirement

The current standalone HTML is a prototype reference, not the final architecture.

Do not continue adding CPU, online networking, and menus directly into one global script.

Use ES modules with a headless core.

Suggested structure:

```text
isometric-squad-tactics/
  index.html
  game.json
  src/
    app.js

    core/
      constants.js
      state.js
      commands.js
      reducer.js
      rules.js
      movement.js
      targeting.js
      line-of-fire.js
      rng.js
      selectors.js
      serialization.js
      state-hash.js

    ai/
      cpu-controller.js
      action-generator.js
      evaluator.js
      search.js

    sessions/
      session-base.js
      local-session.js
      hot-seat-session.js
      cpu-session.js
      online-session.js

    network/
      protocol.js
      online-client.js

    platform/
      platform-bridge.js
      result-publisher.js

    ui/
      screen-manager.js
      input-controller.js
      board-renderer.js
      hud-renderer.js
      animation-controller.js
      modal-controller.js

    screens/
      title-screen.js
      main-menu-screen.js
      single-player-screen.js
      hot-seat-screen.js
      online-screen.js
      lobby-screen.js
      match-screen.js
      results-screen.js
      settings-screen.js
      rules-screen.js

  styles/
    base.css
    menus.css
    match.css
    responsive.css

  tests/
    rules.test.js
    movement.test.js
    targeting.test.js
    cancel-move.test.js
    turn-flow.test.js
    deterministic-rng.test.js
    cpu-legality.test.js
    protocol.test.js
```

A framework is not required. Keep the runtime compatible with the platform’s normal browser-game packaging.

---

## 6. Core State Model

Suggested state:

```js
{
  schemaVersion: 1,
  matchId: null,
  mode: "single" | "hotseat" | "online",
  boardSize: 10,
  phase: "playing" | "complete",
  revision: 0,
  turnNumber: 1,
  currentPlayer: 1,
  units: [],
  activation: null,
  winner: null,
  victoryReason: null,
  rngState: 0,
  eventLog: []
}
```

Unit:

```js
{
  id: "p1-warrior",
  player: 1,
  type: "warrior",
  x: 1,
  y: 8,
  hp: 10,
  maxHp: 10,
  spent: false,
  defending: false
}
```

Activation:

```js
{
  unitId: "p1-warrior",
  origin: { x: 1, y: 8 },
  moved: false,
  primaryUsed: false
}
```

UI-only state such as hover tile, selected menu item, open modal, and animation state must remain outside the authoritative game state.

---

## 7. Command Model

Every game mode submits commands into the same validator/reducer.

Required gameplay commands:

```text
BEGIN_ACTIVATION
MOVE_UNIT
CANCEL_MOVE
ATTACK
HEAL
DEFEND
FINISH_ACTIVATION
CONCEDE
```

Selection and hover do not need to be authoritative commands.

Every command must return either:

```js
{
  accepted: true,
  nextState,
  events
}
```

or:

```js
{
  accepted: false,
  errorCode
}
```

Do not partially mutate state before validation completes.

Useful error codes:

```text
NOT_ACTIVE_PLAYER
MATCH_COMPLETE
UNIT_NOT_FOUND
UNIT_DEAD
UNIT_SPENT
UNIT_NOT_OWNED
ACTIVATION_ALREADY_OPEN
WRONG_ACTIVE_UNIT
MOVE_ALREADY_USED
MOVE_OUT_OF_RANGE
MOVE_BLOCKED
CANCEL_NOT_AVAILABLE
PRIMARY_ALREADY_USED
TARGET_OUT_OF_RANGE
TARGET_BLOCKED
INVALID_TARGET
FINISH_REQUIRES_ACTION
```

---

## 8. Determinism and Dice

The current prototype uses `Math.random()`. That must not remain in authoritative gameplay.

Requirements:

- Local, hot-seat, CPU, replay tests, and online must use deterministic roll resolution.
- The same initial state plus the same accepted command/event sequence must always produce the same final state.
- Rendering and animation timing must never affect dice outcomes.

Recommended model:

### Local/CPU/Hot Seat

- Match engine owns a seeded PRNG.
- The reducer records the resolved roll in the emitted event log.

### Online

- Server owns authoritative roll resolution.
- Client submits an attack/heal intent.
- Server validates it, resolves the roll, applies the command, and broadcasts the accepted event.
- Clients never decide an online die result.
- Include a monotonically increasing `revision` or sequence number.
- Include a state hash after accepted commands for desync detection.

Example accepted attack event:

```js
{
  sequence: 18,
  type: "ATTACK_RESOLVED",
  actorId: "p1-ranger",
  targetId: "p2-ranger",
  roll: 6,
  damage: 4,
  targetHpAfter: 2,
  stateHash: "..."
}
```

---

## 9. CPU Scope

The CPU must use the same legal command API as a human. It cannot mutate state directly or inspect future dice rolls.

### 9.1 CPU turn process

For every unspent living CPU unit:

1. Generate legal activation plans.
2. Evaluate each plan.
3. Choose one according to difficulty.
4. Submit commands through the core engine.
5. Continue until every living CPU unit is spent or the match ends.

An activation plan may include:

```text
move -> attack
move -> heal
move -> defend
attack -> move
heal -> move
attack -> finish
heal -> finish
defend
```

### 9.2 Evaluation priorities

The evaluator should account for:

- Guaranteed kill
- Expected damage
- Critical damage possibility
- Healing value without overheal
- Saving a threatened ally
- Ranger line-of-fire
- Avoiding enemy attack ranges
- Protecting medic and ranger
- Defend value when no useful attack/heal exists
- Moving toward future engagement
- Unit matchup modifiers
- Remaining squad strength
- Exposure to multiple enemy units

Use expected value for planning. Do not roll dice while evaluating hypothetical actions.

### 9.3 Difficulty

Easy:

- Chooses from legal plans with weighted randomness.
- Strong preference for legal attacks and useful heals.
- Limited positional evaluation.
- May make tactically weak choices.
- Must never make illegal choices.

Normal:

- Evaluates all legal plans for the current unit.
- Uses expected damage, heal value, threat exposure, and positioning.
- Chooses a competent one-activation plan.
- Chooses unit activation order using a basic urgency score.

Hard:

- Evaluates activation order across the remaining squad turn.
- Uses beam search rather than unrestricted minimax.
- Scores projected end-of-squad-turn state.
- Uses deterministic tie-breaking from the match seed.
- Does not cheat, inspect future rolls, or receive hidden modifiers.

### 9.4 CPU safety tests

- CPU always finishes its squad turn.
- CPU never activates dead or spent units.
- CPU never exceeds movement range.
- CPU never attacks through a blocking unit with a ranger.
- CPU never heals an enemy or a full-health ally.
- CPU does not loop between selection states.
- CPU behaves correctly with one surviving unit.
- CPU recognizes immediate winning attacks.
- CPU uses defend when no attack, heal, or useful movement exists.

---

## 10. Hot-Seat Session

Hot seat uses the local deterministic engine.

Responsibilities:

- Map local human input to the active player.
- Block input during turn-handoff overlay.
- Clear selected unit and transient targeting state at squad-turn change.
- Never expose stale legal tiles from the previous player.
- Allow restart only through a confirmation dialog.
- Preserve the chosen board size for rematch.

No separate rules implementation is allowed.

---

## 11. Online Session

### 11.1 Authority

Online mode must be server-authoritative.

Client responsibilities:

- Render confirmed state.
- Submit command intents.
- Predict only harmless UI state such as hover and selection.
- Lock duplicate submissions while waiting for command resolution.
- Animate accepted server events.

Server responsibilities:

- Own canonical match state.
- Validate turn ownership.
- Validate every gameplay command.
- Resolve dice.
- Increment sequence/revision.
- Broadcast accepted events/state.
- Reject stale or duplicate commands.
- End the match and report result.

Do not use peer-to-peer authority.

### 11.2 Command envelope

```js
{
  matchId,
  commandId,
  expectedRevision,
  playerId,
  command: {
    type: "MOVE_UNIT",
    unitId: "p1-warrior",
    x: 3,
    y: 7
  }
}
```

Server response:

```js
{
  matchId,
  commandId,
  accepted: true,
  revision: 12,
  events: [],
  stateHash: "..."
}
```

### 11.3 Room and lobby

- Exactly two player seats.
- Five-character private room code if that is the current platform standard.
- Host cannot start without a second player.
- In-progress rooms are not joinable.
- Both clients receive the same board-size/rules configuration from the server.
- Do not trust client-provided side assignment after lobby creation.

### 11.4 Disconnects

Use the platform’s canonical disconnect policy. Do not build a game-specific reconnect system in v1.

The game must:

- Stop accepting commands after match termination.
- Display the platform-provided termination reason.
- Publish only the result confirmed by the server/platform.
- Return cleanly to the online menu or platform shell.

### 11.5 Turn timeout

Public online play needs anti-stall behavior.

Initial v1 rule:

- Configurable 120-second squad-turn timer.
- Timer is server-owned.
- On expiration, every remaining unspent unit on that squad automatically defends in a deterministic order.
- The turn then changes.
- The timeout rule must be visible in How to Play and the online lobby.

This value must remain a configuration constant rather than being embedded throughout the UI and server logic.

---

## 12. Rendering and Input

Preserve the current visual direction:

- Isometric black-and-white board
- Blue Player 1 pieces
- Red Player 2 pieces
- Existing unit silhouettes
- Existing HP bars
- Existing legal move/attack/heal highlighting
- Existing die presentation
- Existing defend indicator
- Existing responsive SVG board approach

Required UI change:

- Add `Cancel Move` to the action controls.
- It is only enabled during the legal cancel window.
- It should be visually distinct from `Finish`.
- After cancellation, movement highlights are not automatically opened; return to normal selected-unit state.

Input requirements:

- Pointer and touch are primary.
- Buttons must not allow text selection during play.
- Board interaction must remain usable on mobile landscape.
- Keyboard/controller support may be added through the platform input layer, but it must not replace pointer/touch support.

Animation is presentation only. Rules state must not depend on an animation finishing successfully.

---

## 13. Platform Registration

Do not finalize public registration under the temporary title unless the title is intentionally retained.

Temporary manifest direction:

```json
{
  "id": "isometric-squad-tactics",
  "slug": "isometric-squad-tactics",
  "title": "Isometric Squad Tactics",
  "version": "1.0.0",
  "entry": "index.html",
  "minPlayers": 1,
  "maxPlayers": 2,
  "modes": ["single-player", "hot-seat", "online-versus"],
  "online": true,
  "orientation": "landscape",
  "input": ["pointer", "touch"],
  "status": "development"
}
```

Adapt field names to the platform’s actual manifest schema rather than inventing a parallel schema.

Required platform handoff items:

- Final title
- Final slug
- Game manifest/registration record
- Square grid preview image
- Entry HTML
- Modular runtime files
- Online capability flag
- Player-count metadata
- Result publishing integration
- Version number
- Basic description and instructions

Suggested result payload:

```js
{
  gameId: "isometric-squad-tactics",
  matchId,
  mode: "single" | "hotseat" | "online",
  boardSize: 10,
  winnerPlayerId,
  loserPlayerId,
  winningSide: 1,
  victoryReason: "squad-eliminated",
  squadTurns: 14,
  durationMs: 386000
}
```

For offline hot seat, platform identity may be absent. Do not fabricate player IDs.

---

## 14. Settings

v1 settings:

- Master volume
- Sound effects volume
- Reduced motion
- Confirm restart/concede
- Rules/help access

Do not add gameplay modifiers to Settings.

Board size and CPU difficulty belong to match setup, not global settings.

---

## 15. Testing Requirements

Core tests must run without DOM, SVG, animation, or network access.

Minimum coverage:

### Rules

- Every movement range
- Orthogonal movement only
- Occupied-tile blocking
- Every attack range
- Diagonal attacks
- Ranger obstruction
- Medic self-heal
- Heal cap
- Damage modifiers
- Critical attack
- Critical heal
- Miss
- Defend reduction
- Defend expiration
- Death at 0 HP
- Win detection
- Turn switching
- Dead units excluded from required activations

### Activation flow

- Move then attack
- Move then heal
- Move then defend
- Attack then move
- Heal then move
- Attack then finish
- Heal then finish
- Move-only finish rejected
- Double move rejected
- Double primary action rejected
- Wrong unit command rejected
- Cancel move cases from Section 3.6

### Determinism

- Same seed and commands produce same rolls and state.
- Serialized state restores without changing legal actions.
- Command replay reproduces final state hash.
- UI animation timing cannot change results.

### Modes

- Hot-seat handoff blocks input.
- CPU finishes legal turns.
- Online rejects commands from the wrong player.
- Online rejects stale revisions.
- Duplicate command IDs are idempotent or rejected safely.
- Disconnect termination cannot be overwritten by a late command.

---

## 16. Implementation Order

### Milestone 0 — Correct the current prototype

- Add `Cancel Move`.
- Preserve all current rules and visuals.
- Add cancel-move tests around the extracted activation logic if extraction begins immediately.

### Milestone 1 — Extract deterministic core

- Move rules/state/commands out of DOM code.
- Replace authoritative `Math.random()`.
- Add headless tests.
- Keep current renderer attached to the new core.

This milestone is mandatory before CPU or online work.

### Milestone 2 — Application and screen flow

- Screen manager
- Title
- Main menu
- Rules
- Settings
- Match setup screens
- Match screen
- Results screen
- Pause flow

### Milestone 3 — Hot Seat

- Setup
- Handoff overlay
- Rematch
- Result handling

### Milestone 4 — CPU

- Easy
- Normal
- Hard
- Legality and termination tests

### Milestone 5 — Online Versus

- Protocol
- Server authority
- Quick Match
- Private rooms
- Lobby
- Command validation
- Server dice
- Timeout
- Disconnect handling
- Results/rematch

### Milestone 6 — Platform packaging

- Final title and slug
- Manifest
- Grid preview
- Result publishing
- Build/import verification
- Mobile landscape QA
- Production registration

---

## 17. Explicit Non-Goals for v1

Do not add:

- More than two players
- More than four units per squad
- Squad customization
- Unit upgrades
- Experience or progression
- Equipment
- Terrain modifiers
- Obstacles or cover
- Alternate maps
- Ranked ladder
- Spectators
- Chat
- Replay viewer UI
- Mid-match reconnect
- Campaign
- Story mode
- Cosmetics
- Monetization
- Additional unit classes
- Balance changes not listed in this scope

The deterministic event log and serialization should make future replay support possible, but a replay viewer is not part of v1.

---

## 18. Definition of Done

The platform conversion is complete when:

- The current game rules are preserved.
- Accidental movement can be canceled only during the legal cancel window.
- All three modes use one shared rules engine.
- The core runs without the DOM and passes automated tests.
- No authoritative gameplay code uses `Math.random()`.
- CPU Easy, Normal, and Hard complete legal matches.
- Hot seat includes safe turn handoff.
- Online state is server-authoritative.
- Online dice are server-resolved.
- Private room and quick-match flows work.
- Match completion and platform result publishing work.
- The game returns cleanly to menus after win, concede, timeout, or disconnect.
- The package is registered under the final title/slug with a grid preview and production entry point.
