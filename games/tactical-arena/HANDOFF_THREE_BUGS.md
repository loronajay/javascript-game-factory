# Handoff: three Tactical Arena bug fixes

Context: `games/tactical-arena`. Turn-based isometric tactics. Authoritative state is
mutated ONLY by `src/core/reducer.js` (clone-and-return). View/render/input live in
`src/main.js`. Tests: `node --test tests/*.test.js` (npm shim is broken in this
sandbox — use the direct node command). Baseline was 576/576 green.

⚠️ The working tree already had uncommitted edits across `reducer.js`, `main.js`,
`forecastRenderer.js`, `hud.js`, several tests, etc. when this handoff was written, and
`reducer.js` was being changed live (a `trampleMoveCancelLocked` move-cancel lock was
just added). Re-read each file before editing; anchor edits to the function names below,
not line numbers, and keep the existing trample cancel-lock intact.

Add/extend a test per fix and run the full suite before finishing.

---

## Bug 1 — Fat Bowman loses her Planted (stationaryStrength) STR bonus when a move is undone

**Symptom:** Fat Bowman's "Planted" passive grants +1 STR per turn started without moving
(`stationaryStrength`, capped 4). Confirming a move correctly zeroes it. But the Undo Move
button (`CANCEL_MOVE`) restores position/`moved` WITHOUT restoring the bonus, so undoing a
move permanently eats the STR you'd banked.

**Root cause (`src/core/reducer.js`):**
- `moveUnit(...)`: `if (stationaryStrengthEffect(unit)) unit.stationaryStrength = 0;`
  zeroes the counter but never records the pre-move value.
- `cancelMove(...)`: restores `unit.position = activation.origin` and
  `activation.moved = false`, but does nothing to `stationaryStrength`.

`stationaryStrengthEffect(unit)` already exists (finds the `stationaryStrength` art
effect). `getEffectiveStats` folds `unit.stationaryStrength` into STR. `cancelMove` is
gated so it can only run before the primary is spent (`PRIMARY_ALREADY_USED`) and only
after a move (`CANCEL_NOT_AVAILABLE`), and there is now also a trample cancel-lock — leave
all those guards as-is.

**Fix:** snapshot the counter on the activation object when the move commits, hand it back
on cancel.

In `moveUnit`, replace the zeroing line with:
```js
if (stationaryStrengthEffect(unit)) {
  next.activation.stationaryStrengthBeforeMove = unit.stationaryStrength ?? 0;
  unit.stationaryStrength = 0;
}
```

In `cancelMove`, after `next.activation.moved = false;`, add:
```js
if (Number.isFinite(next.activation.stationaryStrengthBeforeMove) && stationaryStrengthEffect(unit)) {
  unit.stationaryStrength = next.activation.stationaryStrengthBeforeMove;
  delete next.activation.stationaryStrengthBeforeMove;
}
```

Notes:
- `cloneState` shallow-spreads `state.activation`, so the extra numeric field carries
  through clones fine.
- `state-hash.js` `canonicalActivation` only serializes named activation fields, so this
  new field does NOT enter the hash — no lockstep impact. `unit.stationaryStrength` IS in
  the unit hash, and `cancelMove` is a broadcast/replayed command, so both online clients
  restore identically. Good.

**Test (`tests/fat-bowman.test.js`):** begin Fat Bowman's activation (she banks the
Planted +1), move her, assert effective STR dropped by 1, `cancelMove`, assert effective
STR is back to the banked value and `stationaryStrength` is restored.

---

## Bug 2 — Stumble (Fat Knight) shows a damage-forecast badge; it should behave like Footwork

**Symptom:** Selecting Stumble paints the over-head damage-forecast numbers on enemies.
Footwork (the Swordsman path art it's modeled on) does not. They should match — path/rush
arts do per-tile TRUE contact damage, not a single-target strike, so a forecast badge is
wrong/misleading.

**Root cause:** Footwork uses its own input mode (`mode === "footwork"`), which the
forecast renderer never triggers on. Stumble uses `mode === "art:stumble"` (dispatched via
the generic `mode.startsWith("art:")` + `targeting.shape === "rushPath"` branch in
`src/main.js` `handleTile`). `renderForecast` in `src/ui/forecastRenderer.js` fires for any
`art:` mode whose art passes `isForecastableStrikeArt(art)` — and `rushPath` is NOT in that
function's excluded-shape list, so Stumble slips through.

**Fix (`src/ui/forecastRenderer.js`):** add `"rushPath"` to the excluded `targeting.shape`
list inside `isForecastableStrikeArt`:
```js
!["cone", "globalAllies", "nukeAura", "placement", "selfAura", "tilePlacement",
  "protectAlly", "ally", "targetedBlast", "rushPath"].includes(art.targeting?.shape)
```
(That array may already have been touched by the in-flight edits — just ensure `rushPath`
ends up in it.)

**Test (`tests/forecast-renderer.test.js`):** assert `isForecastableStrikeArt` returns
false for an art with `targeting.shape === "rushPath"` (or drive `renderForecast` with a
Fat Knight in `art:stumble` mode and assert zero `.forecast-badge` nodes are produced).

---

## Bug 3 — Focus Prayer (Fat Cleric) does the roll internally but no roll is shown

**Symptom:** Focus Prayer is supposed to roll to-hit (hit = heal 5; miss = backfire into a
random negative status). The reducer DOES roll — but the player sees no HIT/MISS roll
reveal on a successful heal, so it feels like there's no roll.

**Root cause:** `resolveFocusPrayer` in `src/core/reducer.js` calls `rollToHit(...)`
correctly. But the presentation in `src/main.js` `resolveInstantArt` has no dedicated
`focus-prayer` branch:
- On a HIT the event carries `healingByTarget`, so it falls into the generic
  `else if (resolved?.healingByTarget && actorBefore)` branch → plays the heal VFX + float,
  but NEVER calls `effects.rollReveal(...)`. That's the missing roll.
- On a MISS the event carries `effect` (no `healingByTarget`), so it lands in the generic
  `else if (resolved?.effect && actorBefore)` branch, which does a rollReveal for the
  *status* application — so a miss looks rolled, a hit doesn't. Inconsistent.

**Fix, part A (`src/core/reducer.js`, `resolveFocusPrayer`):** expose the swing on the
event so the UI can reveal it. Change the event construction to include the roll outcome:
```js
const event = { type: "ART_RESOLVED", artId: art.id, actorId: actor.id,
                targetId: target.id, mpCost: cost, missed: swing.missed,
                critical: swing.critical };
```
(`rollToHit` returns `{ missed, critical, ... }`.) Do NOT add a `hit` key — a fat-cleric
test asserts `!("hit" in ev)` to prove Focus Prayer routes through the instant path, not
the rolled-strike path. `missed`/`critical` are new keys and safe.

**Fix, part B (`src/main.js`, `resolveInstantArt`):** add a dedicated `focus-prayer`
branch BEFORE the generic `healingByTarget`/`effect` branches, mirroring how `tether-grab`
/ `rocket-punch` reveal their roll:
```js
} else if (resolved?.artId === "focus-prayer" && actorBefore) {
  const metrics = createBoardMetrics(state.size);
  const targetBefore = targetsBefore[0];
  await effects.rollReveal({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) });
  if (!resolved.missed) {
    // Landed prayer: heal VFX + float the amount healed.
    await effects.playAbilityVfx("focus-prayer", { actor: actorBefore, targets: targetsBefore });
    const healed = resolved.healingByTarget?.[targetBefore?.id] ?? 0;
    if (targetBefore && healed > 0) {
      await effects.floatText(unitCenter(metrics, targetBefore), `+${healed}`, "#8cf0a4");
    }
  } else if (targetBefore && resolved.effect?.attempted) {
    // Backfire: reveal the inflicted status (or RESISTED), then play/float it.
    const statusLabel = resolved.effect.status?.toUpperCase() ?? "STATUS";
    await effects.rollReveal(
      { missed: !resolved.effect.applied, critical: false },
      resolved.effect.applied ? statusLabel : "RESISTED"
    );
    if (resolved.effect.applied) {
      await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, target: targetBefore, effect: resolved.effect });
      await effects.floatText(unitCenter(metrics, targetBefore), statusLabel, "#c89cff");
    }
  }
}
```
`focus-prayer`'s VFX recipe is `healPulse` (see `tests/fat-cleric.test.js` — it asserts
`getAbilityVfx("focus-prayer").type === "healPulse"`), so `playAbilityVfx("focus-prayer", …)`
is valid. `targetsBefore` is derived from the event's `targetId`, so `targetsBefore[0]` is
the ally.

**Test (`tests/fat-cleric.test.js`):** on a hit, assert the `ART_RESOLVED` event now has
`missed === false`; on a miss, `missed === true`. (Reducer-level; the reveal itself is
presentation.) Keep the existing `!("hit" in ev)` assertion passing.

---

## Verify
```
cd games/tactical-arena
node --test tests/*.test.js
```
Expect green (baseline 576/576 plus any new assertions). For a visual sanity check of
bugs 2 & 3, use `sandbox.html` served over http + a headless Chrome screenshot (see the
game's CLAUDE.md "Dev / QA tools" and the headless-screenshot memory) — place a Fat Knight
and select Stumble (no forecast badges), and place a Fat Cleric + a wounded ally and cast
Focus Prayer (a HIT/MISS roll token should flash).
