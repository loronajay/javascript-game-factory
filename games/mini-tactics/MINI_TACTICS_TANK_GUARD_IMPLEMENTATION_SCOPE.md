# Mini-Tactics — Tank Guard Implementation Scope

## 1. Objective

Implement a Tank-specific **Guard** primary action in Mini-Tactics.

Guard replaces **Defend for Tanks only**. Warriors, Rangers, and Medics retain the existing Defend action unchanged.

The purpose is to give the Tank a clear positional protection role without adding knockback, forced movement, stun, or unrelated stat changes.

This implementation spans both repositories:

1. `javascript-game-factory`
   - Game client
   - Authoritative shared reducer
   - CPU behavior
   - Rendering and UI
   - Online deterministic client state

2. Local `factory-network-server`
   - Mini-Tactics command relay, validation, game adapter, protocol/version checks, or authoritative server rules if any exist there

Do not declare the feature complete after changing only the browser game.

---

## 2. Scope constraints

### In scope

- New Tank Guard action
- Self-Guard as the Tank’s replacement for normal Defend
- Adjacent ally protection
- Attack interception
- Guard status lifecycle
- Human UI and board feedback
- Combat forecast updates
- CPU support
- Online command and protocol support
- Unit, integration, and deterministic replay tests
- Rules/help text updates

### Out of scope

- Knockback
- Taunt
- Stun
- Counterattacks
- Area-of-effect interception
- New unit stats
- New sound assets
- General combat redesign
- Tank movement changes
- Balance changes to damage, HP, range, or healing

The Tank remains at its currently implemented stats for this task, including its current movement value.

---

## 3. Final mechanic contract

### 3.1 Availability

- Guard is available only to a living, unspent Tank during its active activation.
- Guard is a primary action.
- A Tank cannot Guard after attacking or after another primary action.
- A Tank may move first and then Guard.
- A successful Guard immediately finishes the Tank’s activation, matching the current immediate-finish behavior of Defend.
- The Tank may not move after Guard in this implementation.

### 3.2 Legal Guard targets

A Tank may Guard:

1. Itself.
2. One living allied unit on an adjacent tile.

For allied targets:

- Adjacency uses Chebyshev distance 1.
- Orthogonal and diagonal adjacency are both valid.
- The target may belong to another player on the same team in 2v2.
- Enemy units are never legal Guard targets.
- Dead units are never legal Guard targets.
- Non-adjacent allies are never legal Guard targets.

Self-Guard is a deliberate exception to the adjacency rule because the Tank occupies its own tile.

### 3.3 Self-Guard behavior

When the Tank Guards itself:

- It behaves exactly like the Tank using the old Defend action.
- It receives the existing 1-point damage reduction on every incoming hit.
- This protection lasts until the Tank begins its next activation.
- It is not consumed by the first attack.
- No redirection occurs.

### 3.4 Ally-Guard behavior

When the Tank Guards an adjacent ally:

- The first enemy attack declared against that protected ally is redirected to the Tank.
- The interception occurs before the attack roll.
- The attacker rolls only once.
- The original attack must be legal against the originally selected protected unit.
- Range and Ranger line-of-sight are validated against the originally selected unit.
- The redirected attack does not need separate range or line-of-sight validation against the Tank.
- Damage type matchup is recalculated against the Tank as the actual recipient.
  - Example: a Warrior attack redirected from a Medic to a Tank uses the Warrior-versus-Tank damage value.
- The intercepted attack receives the standard 1-point defending reduction.
- The protected ally takes no damage from that attack.
- The Guard is consumed after that one redirected attack.
- Guard is consumed even if the attack misses.
- Guard is consumed even if the resulting damage is zero.
- Direct attacks against a Tank that is guarding an ally do **not** receive the defending reduction. The reduction applies only to the intercepted attack.
- Guard redirects attacks only. It does not redirect healing, status effects, environmental damage, or future area attacks.

### 3.5 Guard lifecycle

An external Guard remains active only while all of the following are true:

- The Tank is alive.
- The protected unit is alive.
- The Tank and protected unit are still adjacent.
- The Tank has not begun its next activation.
- The Guard has not already intercepted an attack.

Guard ends when:

- It intercepts one attack.
- The Tank begins its next activation.
- The Tank dies.
- The protected unit dies.
- Either unit moves and they are no longer adjacent.
- The Tank’s player concedes or the Tank is otherwise removed.

If the protected unit moves but remains adjacent to the Tank, Guard remains active.

### 3.6 Guard stacking

For this version:

- One Tank may guard only one target at a time.
- One unit may have only one external guarding Tank at a time.
- Multiple Tanks may guard different units.
- Attempting to guard a unit already protected by another Tank must be rejected.
- Self-Guard does not conflict with another unit’s external Guard state.

Do not implement chained interception or multiple-Tank priority rules.

---

## 4. Authoritative state model

Add an authoritative, serializable Guard reference to unit state.

Recommended unit field:

```js
guardTargetId: null
```

Rules:

- The field exists on all unit records for a stable schema, but only Tanks may hold a non-null value.
- `guardTargetId === tank.id` means Self-Guard.
- `guardTargetId === ally.id` means the Tank is externally guarding that ally.
- External Guard should not set the Tank’s general `defending` flag.
- Self-Guard should continue using `defending: true` so existing damage logic remains compatible.
- External interception should apply a one-attack defending override during resolution rather than making the Tank generally defending.

Update all state creation, clone, serialization, deserialization, fixtures, and state-hash assumptions.

Bump the authoritative match schema version from `1` to `2`.

The client and server deployment must not silently mix schema-1 and schema-2 Mini-Tactics matches.

---

## 5. New rules module

Create a focused module such as:

```text
games/mini-tactics/src/rules/guard.js
```

Recommended exported helpers:

```js
getLegalGuardTargets(state, tank)
getGuardingTank(state, protectedUnit)
isValidExternalGuard(state, tank, protectedUnit)
clearBrokenGuards(state)
clearGuardsForUnit(state, unitId)
```

Behavior:

- `getLegalGuardTargets` returns the Tank’s own tile plus living same-team adjacent units.
- `getGuardingTank` ignores dead Tanks, stale references, non-Tanks, and non-adjacent relationships.
- Stale Guard relationships must never cause an interception.
- Cleanup helpers operate deterministically and do not depend on DOM state.

The reducer remains the authority. UI helper results are advisory only.

---

## 6. Commands, events, and errors

### 6.1 Command

Add:

```js
GUARD: "GUARD"
```

Command creator:

```js
guard(player, unitId, targetId)
```

Payload:

```js
{
  type: "GUARD",
  player,
  unitId,
  targetId
}
```

### 6.2 Events

Add at minimum:

```js
UNIT_GUARDED
GUARD_INTERCEPTED
```

Recommended event payloads:

```js
{
  type: "UNIT_GUARDED",
  unitId: tank.id,
  targetId: target.id,
  selfGuard: tank.id === target.id
}
```

```js
{
  type: "GUARD_INTERCEPTED",
  tankId: tank.id,
  protectedUnitId: originalTarget.id,
  actorId: attacker.id
}
```

Extend `ATTACK_RESOLVED` so it distinguishes the declared target from the actual damage recipient:

```js
{
  type: "ATTACK_RESOLVED",
  actorId,
  declaredTargetId,
  targetId,          // actual damage recipient
  intercepted,
  guardingTankId,
  roll,
  hit,
  critical,
  damage,
  defended,
  targetHpAfter
}
```

For a normal attack:

```js
declaredTargetId === targetId
intercepted === false
guardingTankId === null
```

For an intercepted attack:

```js
declaredTargetId === protected ally id
targetId === Tank id
intercepted === true
guardingTankId === Tank id
```

### 6.3 Errors

Add explicit errors where useful:

```js
GUARD_TANK_ONLY
TARGET_ALREADY_GUARDED
DEFEND_NOT_AVAILABLE
```

Existing errors may still cover:

- Dead or enemy target: `INVALID_TARGET`
- Non-adjacent target: `TARGET_OUT_OF_RANGE`
- Primary already used: `PRIMARY_ALREADY_USED`

The authoritative reducer must reject a `DEFEND` command issued by a Tank. Guard cannot be bypassed through console commands, stale clients, CPU code, or online payloads.

---

## 7. Reducer implementation

Update the central reducer, not only the controller.

### 7.1 Guard command validation

A Guard command is accepted only when:

- The issuing player is active.
- The activation is open.
- The acting unit matches the activation.
- The acting unit is alive.
- The acting unit is a Tank.
- The primary action has not been used.
- The target exists and is alive.
- The target is the Tank itself or a same-team adjacent unit.
- The external target is not already guarded by another Tank.

On success:

- Clear any previous `guardTargetId` on the acting Tank.
- If self-targeted:
  - Set `guardTargetId = tank.id`.
  - Set `defending = true`.
- If guarding an ally:
  - Set `guardTargetId = target.id`.
  - Set `defending = false`.
- Set `activation.primaryUsed = true`.
- Emit `UNIT_GUARDED`.

The controller will immediately submit `FINISH_ACTIVATION`, matching current Defend behavior.

### 7.2 Activation start

When a Tank begins its next activation:

- Clear its old `guardTargetId`.
- Clear `defending`.
- Then open the new activation.

This expiration must occur authoritatively in the reducer.

### 7.3 Movement cleanup

After any accepted move:

- Re-evaluate all external Guard relationships involving the moved unit.
- Clear any relationship whose Tank and protected unit are no longer adjacent.
- Preserve Guard if the units remain adjacent.
- Self-Guard is unaffected by adjacency cleanup.

### 7.4 Attack interception order

Attack resolution must use this order:

1. Validate the attack against the command’s originally declared target using the existing rules.
2. Resolve whether that declared target currently has a valid guarding Tank.
3. If no valid Guard exists:
   - Resolve normally.
4. If a valid Guard exists:
   - Set the guarding Tank as the actual damage recipient.
   - Clear the Tank’s external `guardTargetId` so the Guard is consumed.
   - Emit `GUARD_INTERCEPTED`.
5. Roll the d6 once.
6. Calculate base damage against the actual recipient.
7. Apply critical damage normally.
8. Apply a 1-point defense reduction when:
   - The actual recipient has normal `defending`, or
   - The attack was externally intercepted.
9. Apply damage to the actual recipient.
10. Emit `ATTACK_RESOLVED` with both declared and actual target IDs.
11. Apply elimination and match-end logic to the actual recipient.

A missed intercepted attack still clears Guard.

### 7.5 Elimination and concede cleanup

Whenever a unit dies or is removed:

- Clear its own `guardTargetId`.
- Clear any Tank relationship that points to that unit.
- Ensure no stale Guard marker remains in authoritative state.

Apply the same cleanup to concession and multiplayer player-removal paths.

---

## 8. Client interaction and HUD

### 8.1 Preserve the existing action layout

Do not add a seventh action button.

Keep the existing action button position and keyboard shortcut:

- Key `4`
- Existing `#defendBtn` may remain as the DOM ID to minimize churn

Dynamic behavior:

- Selected Tank: button label is **Guard**
- Selected Warrior, Ranger, or Medic: button label is **Defend**

### 8.2 Guard targeting mode

Add:

```js
ACTION_MODES.GUARD
```

When a Tank presses Guard:

- Enter Guard targeting mode.
- Highlight:
  - The Tank’s own tile
  - Every legal adjacent allied target
- Allow selecting the Tank itself.
- Allow selection by board unit click or occupied tile click.
- Include Guard in the controller branches that currently treat Attack and Heal clicks as target selection.
- Pressing Escape exits Guard targeting without spending the action.
- If no external ally is available, the Tank itself is still a legal target, so Guard mode always has at least one target.

After a valid target is chosen:

- Dispatch `GUARD`.
- Render the new status.
- Reuse the current defend sound.
- Show a clear message.
- Immediately finish the activation.

Suggested messages:

```text
Tank is guarding itself.
Tank is guarding Medic.
Tank intercepted the attack meant for Medic.
Guard ended because the units separated.
```

The last message is optional if separation cleanup is intentionally silent.

### 8.3 General action copy

Update hard-coded text that currently says:

```text
Attack, heal, or defend.
```

Use wording that remains correct for every unit, such as:

```text
Use a primary action.
```

or dynamic unit-specific text.

---

## 9. Board and status presentation

Guard must be readable without opening the rules modal.

### Minimum board feedback

Self-Guard:

- Reuse the current Defending marker.

External Guard:

- Show a distinct Guard marker on the Tank.
- Show a protected marker on the guarded ally.
- The two markers should visually match.
- A tether line is optional and should not be added if it makes the board noisy.

### HUD feedback

Tank unit card:

```text
Guarding Medic
```

Protected unit card:

```text
Guarded by Tank
```

Self-Guard:

```text
Defending
```

Squad chips should display a Guard/protected state where space permits.

Do not represent an externally guarding Tank as generally Defending, because direct attacks against it do not receive damage reduction.

---

## 10. Combat forecast

Update `ForecastRenderer`.

When the player targets a guarded ally:

- Do not show damage as if the ally will receive it.
- Resolve the current valid guarding Tank.
- Calculate normal-hit and critical damage against the Tank.
- Include the interception’s 1-point reduction.
- Mark the forecast as intercepted.
- Keep the badge anchored to the originally selected target or otherwise make it clear that selecting that unit causes the Tank to receive the hit.

The forecast must not lie about:

- Which unit loses HP
- Tank-specific matchup damage
- Defense reduction
- Lethality

The reducer remains authoritative if Guard state changes between preview and command resolution.

---

## 11. Effects and animation

On `GUARD_INTERCEPTED`:

1. Briefly emphasize the Tank and protected ally.
2. Play the attack animation toward the actual Tank recipient.
3. Roll the die.
4. Apply hit, miss, critical, damage, and death effects to the Tank.
5. Show an interception message.

Do not animate damage on the protected ally.

Local, CPU, and remote-online event animation must use the same actual recipient from `ATTACK_RESOLVED.targetId`.

Update local attack handling that currently assumes the command target is always the damage recipient.

No new sound file is required. Reuse the existing defend/defended-hit audio.

---

## 12. CPU implementation

The CPU must understand Guard. It may not continue issuing `DEFEND` for Tanks.

### Plan generation

Add Guard as a primary plan type:

```js
{ kind: "guard", targetId }
```

For every possible Tank final position:

- Generate Self-Guard.
- Generate Guard plans for every legal adjacent allied unit.
- Do not generate ordinary Defend plans for Tanks.
- Continue generating Defend for other unit types.

### Command expansion

Tank Guard plans emit:

```js
cmd.guard(player, tankId, targetId)
```

### Projection

Projected board state must represent:

- Self-Guard as normal defending.
- External Guard through `guardTargetId`.

### Scoring

The CPU should value external Guard based on:

- Current incoming threat against the protected unit
- Protected unit value
- Bonus for Medic and Ranger
- Bonus for low-HP allies
- Whether the Tank itself is exposed
- Whether the Guard would protect a unit likely to be attacked

Expected behavior:

- Easy may make weak Guard choices through its existing weighted randomness.
- Normal should protect a threatened adjacent ally when it is more valuable than attacking.
- Hard should strongly consider protecting threatened Medics and Rangers.
- Self-Guard remains the fallback when no useful ally Guard exists.

Do not make the CPU always Guard. Attack and kill opportunities must still score competitively.

---

## 13. `factory-network-server` integration

The server repository is local and must be inspected by the implementation agent.

Do not assume that the server is only a transparent WebSocket relay.

### Required discovery

From the local `factory-network-server` repository:

1. Identify the repository root and current branch.
2. Search for:
   - `mini-tactics`
   - Mini-Tactics game IDs
   - Command allowlists
   - Payload schemas
   - Room message validation
   - State hashing
   - Match protocol versions
   - Game-specific reducers or adapters
   - Replay or command-log persistence
3. Trace a Mini-Tactics command from browser send to opponent receive.
4. Determine whether game rules are duplicated server-side.

### Required server changes

If the server has a command whitelist or schema:

- Add `GUARD`.
- Validate `unitId` and `targetId` as the same identifier type used by other commands.
- Preserve command ordering.
- Preserve the full payload without dropping `targetId`.

If the server owns an authoritative reducer or game-specific validator:

- Implement the exact Guard rules from this document there as well.
- Add matching tests.
- Do not allow client and server rule definitions to diverge.

If the server is truly command-agnostic:

- Do not add unnecessary game logic.
- Add or update a relay test proving that a `GUARD` command passes unchanged.
- Document that no production server code change was required and why.

### Protocol compatibility

Guard changes the command vocabulary and authoritative state schema.

Use the existing game/ruleset version mechanism if one exists.

If no compatibility mechanism exists, add a minimal Mini-Tactics ruleset version to the create/join handshake so mismatched clients cannot start a match together.

Recommended version:

```text
mini-tactics ruleset 2
```

A schema-1 client must not enter a schema-2 Guard match and fail later through desynchronization.

Deploy compatible client and server versions together.

---

## 14. Likely `javascript-game-factory` files

The exact implementation may vary, but inspect and update at least:

```text
games/mini-tactics/src/config.js
games/mini-tactics/src/state/gameState.js
games/mini-tactics/src/core/state.js
games/mini-tactics/src/core/commands.js
games/mini-tactics/src/core/events.js
games/mini-tactics/src/core/errors.js
games/mini-tactics/src/core/reducer.js
games/mini-tactics/src/rules/combat.js
games/mini-tactics/src/rules/guard.js
games/mini-tactics/src/game/GameController.js
games/mini-tactics/src/render/hudRenderer.js
games/mini-tactics/src/render/unitRenderer.js
games/mini-tactics/src/render/overlayRenderer.js
games/mini-tactics/src/render/forecastRenderer.js
games/mini-tactics/src/ai/plans.js
games/mini-tactics/src/ai/cpuController.js
games/mini-tactics/src/ai/evaluate.js
games/mini-tactics/src/ui/rulesModal.js
games/mini-tactics/index.html
games/mini-tactics/styles/*
games/mini-tactics/tests/*
```

Keep unrelated refactors out of the patch.

---

## 15. Required tests

### 15.1 Guard legality

- Tank can Guard itself.
- Tank can Guard an orthogonally adjacent ally.
- Tank can Guard a diagonally adjacent ally.
- Tank cannot Guard a non-adjacent ally.
- Tank cannot Guard an enemy.
- Tank cannot Guard a dead unit.
- Non-Tank cannot issue Guard.
- Tank cannot use normal Defend.
- Tank cannot Guard after a primary action.
- Guard counts as the primary action.
- A target already externally guarded by another Tank rejects a second Guard.

### 15.2 Self-Guard

- Self-Guard sets normal defending behavior.
- Every incoming hit is reduced by 1.
- A miss does not remove Self-Guard.
- Multiple attacks before the Tank’s next activation remain reduced.
- Self-Guard clears when the Tank begins its next activation.

### 15.3 External interception

- Attack declared against protected ally damages Tank instead.
- Protected ally HP remains unchanged.
- Warrior-versus-Tank damage is used after interception.
- Critical adds 1 before interception defense reduction.
- Guard is consumed after a hit.
- Guard is consumed after a miss.
- Guard is consumed after zero damage.
- Direct attack against externally guarding Tank gets no Guard reduction.
- Elimination applies to Tank if intercepted damage kills it.
- Match completion is evaluated correctly if the Tank dies.
- `ATTACK_RESOLVED` records declared and actual targets correctly.

### 15.4 Lifecycle

- Guard clears when protected ally moves out of adjacency.
- Guard remains when protected ally moves to another adjacent tile.
- Guard clears when Tank dies.
- Guard clears when protected unit dies.
- Guard clears on concession/removal.
- Guard clears when Tank begins its next activation.
- Serialization round-trip preserves active Guard.
- Clone operations do not alias Guard state.

### 15.5 Ranger interaction

- Ranger line-of-sight and range validate against the protected ally.
- Interception may redirect to an adjacent Tank that was not itself in the Ranger’s original line.
- Units blocking the original shot still make the attack illegal.
- Forecast matches the intercepted Tank damage.

### 15.6 CPU

- CPU never emits `DEFEND` for a Tank.
- CPU can Self-Guard.
- CPU can Guard an adjacent ally.
- Every generated Guard plan is reducer-legal.
- CPU turn cannot stall when Tank has no attack target.
- Deterministic CPU choices remain reproducible from the same state.

### 15.7 Online and server

- `GUARD` command serializes and relays unchanged.
- Both clients apply the same Guard state.
- Intercepted attack produces identical rolls, target IDs, HP, and events on both clients.
- State hashes remain equal after Guard application.
- State hashes remain equal after interception.
- State hashes remain equal after Guard separation cleanup.
- Mismatched ruleset versions are rejected before match start.
- Test online 1v1.
- Test a multi-player configuration with duplicate Tanks.
- Test 2v2 Guard across allied player seats if team mode supports it.

Run:

```bash
npm test
```

in the Mini-Tactics package and the relevant test command in `factory-network-server`.

---

## 16. Manual QA script

1. Start a local match with a Tank and Medic adjacent.
2. Move the Tank, then Guard the Medic.
3. Confirm the action auto-finishes.
4. Confirm Tank and Medic show linked Guard status.
5. Attack the Medic with a Warrior.
6. Confirm the attack animates and damages the Tank.
7. Confirm Warrior-versus-Tank damage is used.
8. Confirm the Medic loses no HP.
9. Confirm external Guard disappears after the attack.
10. Repeat with a miss and confirm Guard is still consumed.
11. Self-Guard the Tank.
12. Attack the Tank twice before its next activation.
13. Confirm both hits receive the normal 1-point reduction.
14. Guard the Medic again, then move the Medic out of adjacency.
15. Confirm Guard ends.
16. Repeat while moving the Medic to a different adjacent tile.
17. Confirm Guard remains.
18. Repeat the core flow in single-player against CPU.
19. Repeat in online play through `factory-network-server`.
20. Verify no state-hash mismatch or rejected remote command occurs.

---

## 17. Acceptance criteria

The work is complete only when all of the following are true:

- Tank shows Guard instead of Defend.
- Other unit classes still show and use Defend.
- Tank can Guard itself.
- Tank can Guard one adjacent same-team unit, including diagonally.
- External Guard redirects exactly one enemy attack.
- External Guard is consumed on hit or miss.
- Self-Guard retains existing Defend duration and behavior.
- Damage is calculated against the actual Tank recipient.
- Direct attacks against an externally guarding Tank are not reduced.
- Separation, death, activation start, and concession clear Guard correctly.
- Board markers and HUD text clearly communicate Guard state.
- Forecast correctly shows interception.
- CPU uses Guard legally and intentionally.
- Local, CPU, hot-seat, and online flows work.
- `factory-network-server` has been inspected and updated or explicitly verified as command-agnostic with tests.
- Client/server ruleset incompatibility is handled before match start.
- All existing tests still pass.
- New Guard tests pass.
- No knockback or unrelated balance changes are included.

---

## 18. Delivery notes

The final agent report must include:

- Files changed in `javascript-game-factory`
- Files changed in `factory-network-server`
- Whether the server is generic relay or contains Mini-Tactics-specific validation/rules
- Protocol or ruleset version changes
- Tests added
- Test commands run and results
- Any unresolved compatibility issue
- A concise manual QA result

Do not report the feature complete if online play was not exercised through the local `factory-network-server`.
