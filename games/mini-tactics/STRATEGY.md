# Mini-Tactics — Strategy & Reference

The canonical, full-length reference. The in-game **How to Play** overlay
(`index.html` `#rulesModal`, three tabs) is a condensed surface of this document.
Numbers here mirror `src/config.js` (ranges/HP) and `src/rules/combat.js`
`getBaseDamage` (damage, including matchup exceptions). If you retune balance,
update both.

---

## Unit cheat sheet

Every piece starts at **10 HP**. Movement is orthogonal; attack range includes
diagonals with no penalty.

| Unit | Move | Atk range | Damage | Notes |
|------|:----:|:---------:|--------|-------|
| ⚔ Warrior | 3 | 1 | **3** (2 vs Tank) | Fastest unit and hardest melee hitter; the closer. |
| ⬢ Tank | 2 | 1 | **2** | Takes only 2 from the Warrior. The wall and lane-blocker. |
| ➶ Ranger | 2 | 4 | **2** (3 vs Ranger) | Sniper. Shots are blocked by any piece in the line, including allies. |
| ✚ Medic | 2 | 3 | Heal **3** (crit 4) | Heals self or any ally; can also attack for 1. |

**Dice (d6):** roll **1 misses**, roll **6 crits**. Crit attacks add +1 damage;
crit heals restore 4 instead of 3. So the spread is 1/6 miss, 4/6 normal, 1/6 crit.

**Defend:** reduces each incoming hit by 1 (down to zero) and expires when the
defending piece is next selected to act.

**Activation:** each living piece acts once per squad turn. A move must be paired
with an attack, heal, or defend — a move alone is illegal. Cancel Move undoes an
uncommitted move before any primary action resolves.

---

## The core math: why focus fire is everything

Expected value per activation (1/6 miss, 4/6 normal, 1/6 crit):

- **Medic heal:** (4·3 + 1·4) / 6 = **2.67 HP/turn**
- **Warrior attack:** (4·3 + 1·4) / 6 = **2.67 HP/turn**

These are deliberately equal — one medic exactly cancels one warrior on a single
target. That's why **one** attacker into a healed target is a stalemate.

The break point is the squad: a squad has four activations per turn but only **one**
medic. Three attackers onto one target is roughly:

- warrior 2.67 + tank 2.0 + ranger 2.0 = **6.67 EV damage**
- minus one full medic heal (2.67) = **~4 net damage/turn** → a 10-HP unit dies in
  ~2.5 turns even if the medic pours everything into saving it.

And squads activate as a **block** (attacker squad fully, then defender squad), so
your damage lands *before* the enemy medic heals. Damage that kills a unit this turn
can never be healed — heal is strong against chip and useless against burst.

**Takeaway:** concentrate. Spreading damage across the enemy squad just feeds the
medic. Pick one target and commit enough attackers to out-damage the heal — or to
simply kill it outright in one turn.

---

## Advanced tips

1. **Focus fire beats heals.** A medic restores ~2.67/turn — about one warrior's
   worth. Put two or more attackers on the same target so the heal can't keep pace.

2. **Burst before they heal.** Because turns resolve as a block, set up kills that
   land in a single turn. Chipping a unit you can't finish just gets undone.

3. **Respect the type matchups.**
   - Warrior deals only 2 to Tanks — send warriors at Rangers/Medics/Warriors, and
     leave the Tank to be ground down by someone else (or ignored).
   - Tank takes reduced warrior damage and blocks tiles — use it to gatekeep chokes
     and screen your backline.
   - Ranger deals +1 specifically to an enemy Ranger — it's a built-in counter-sniper.
     Trade rangers with your ranger, not your warrior.

4. **Kill or pin the Medic.** A medic that only one attacker can reach is effectively
   unkillable (one attacker ≤2.67 EV ≤ 2.67 self-heal). To remove it you need two
   threats on a range-3 unit that wants to sit at the back — or threaten two separate
   targets so its single heal can't cover both.

5. **Line of sight is a resource.** Ranger shots stop on the first body in the line,
   including your own pieces. Keep your ranger's lanes clear, and deliberately stand
   units in the enemy ranger's lanes to deny its shots.

6. **Defend the chip, not the crit.** Defend removes a flat 1. That's huge against a
   Tank (2→1), Ranger (2→1), or Medic poke (1→0), and minor against a Warrior (3→2).
   Time it to cover the opponent's whole upcoming turn — it lasts until your unit next
   acts, so defending late in your turn maximizes coverage.

7. **Threat = move + reach.** A warrior threatens any tile within move 3 + reach 1 = 4.
   Track each enemy's full move-plus-reach box and keep fragile units (ranger, medic)
   outside *all* of them, not just outside the unit's current tile. Diagonals count, so
   threat zones are squares, not plus-shapes.

8. **Order your activations.** Within a squad turn, act on certainty first — take a
   guaranteed kill or a clean shot before committing flexible units, so later
   activations can react to the board the earlier ones created.

9. **Scout with Cancel Move.** Move a unit to reveal its highlights and line of sight,
   read the resulting position, and Cancel if the angle is wrong. It returns the piece
   unspent — free board reading before you commit an activation.

---

## Balance note (for designers)

The numbers are tuned so heal EV equals warrior EV, making focus fire — not raw
stat-checking — the deciding skill. The known risk vector is **stall**, not heal
power: when attackers can't concentrate (big board, low player counts, cautious
play, or a kiting medic), the heal economy never breaks and games drag. The AI's
`THREAT_CAP` / anti-stall invariant in `src/ai/` exists for exactly this reason. If
healing ever feels oppressive, prefer positional levers (e.g. no heal-after-move,
reduced self-heal) over cutting the heal amount.
