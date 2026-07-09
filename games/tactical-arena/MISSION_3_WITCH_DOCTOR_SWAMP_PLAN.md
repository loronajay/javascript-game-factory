# Campaign Mission 3 — "Cursed Swamp of the Witch Doctor" — Beat Plan

Status: **designed, not yet implemented.** No manifest stub exists yet — this doc
is the spec to add against once Mission 2 ("Necromancer's Gate",
`MISSION_2_NECROMANCER_GATE_PLAN.md`) is implemented and its mission-id
dispatch generalization lands (see Implementation notes). Mirrors the shape
of both prior mission docs; read `src/campaign/campaign.js` (Clod's live
implementation) before implementing, and read Mission 2's plan doc for the
dispatch-table note this mission also depends on.

## Premise

A solo duel, not a squad fight. The player picks **one** unit
(`playerSlots: 1`) and walks it through a gauntlet of pre-placed **Ghouls**
and **permanently lit fire tiles** to reach the **Witch Doctor** waiting at
the far side, then wins the encounter as a straight 1v1 duel.

Enemy squad: **Witch Doctor** (the only commander — required for victory)
plus several hand-placed **Ghoul** obstacles that guard the swamp. Reward:
`rewardUnits: ["witch-doctor"]`.

**No unit unlocked from a later mission is assumed here** — the intended
answer, like Mission 1 and 2, is a **base-roster** unit (Swordsman, Archer,
Mystic, Magician, Paladin are always available; Sniper and everything else
is behind its own later unlock and isn't in play yet). This mission's
intended pick is the **Archer**.

Board: suggest **15×15** — the biggest campaign board yet, needed for a
gauntlet with real length. Mission 1 was 11, Mission 2 was 13.

**No curated `defaultSquad`**, same rule as Mission 2 — unit choice is the
puzzle, so don't pre-select a "correct" pick.

## The puzzle (what the player has to figure out)

The swamp is built from two hazards that reuse existing engine rules in a
new combination, and the Archer's kit is the one already in the roster that
answers both cleanly.

1. **Ghouls are the maze walls.** There's no dedicated wall geometry in this
   mission — hand-placed Ghouls do double duty as the maze structure, for
   free, off two rules that already exist:
   - They **occupy tiles**, so `getLegalMoves` already treats them as
     impassable the same as any unit — a cluster of Ghouls blocks a
     corridor just by standing in it.
   - They **block physical ranged line of sight.** `isShotBlocked`
     (`rules/combat.js`) already stops any physical strike — basic attacks,
     Poison Arrow, Leg Shot — if *any* unit, friend or foe, stands between
     attacker and target. A Ghoul standing between the Archer and the Witch
     Doctor doesn't just occupy space, it blinds the Archer's straight shot
     entirely (`TARGET_OBSTRUCTED`).
2. **Fire tiles are the hazard, not the structure.** Fire tiles don't block
   movement or LOS (`applyFireTick` never gates either) — they only punish
   standing on them, 1 true damage per turn rollover, and (per the mission
   spec) never expire (`permanent: true`, already supported by the engine —
   see Implementation notes). Ring them around the Ghoul clusters so the
   "walk around the blocker instead of clearing it" option costs HP instead
   of being free.
3. **The Archer's Volley Shot is the answer to the body-block wall.** Per
   the CLAUDE.md targeting model, Volley Shot's cone is **true damage** and
   is explicitly *not* gated by `isShotBlocked` (only `(damageType ??
   "physical") === "physical"` targeted ARTs are) — it reaches through
   bodies. A Ghoul blocking the direct line to the Witch Doctor can be
   cleared (or just chipped through, since the cone catches everyone in it)
   from range without ever closing distance into fire or bite range. A
   player who only tries basic attacks/Poison Arrow/Leg Shot down a blocked
   corridor gets `TARGET_OBSTRUCTED` and has to re-think the approach —
   that rejection *is* the lesson landing.
4. **Ghoul Bite and Deathly Aura punish getting close instead.** Same as
   Mission 2's Ghoul/Necromancer pairing: each Ghoul within 3 tiles applies
   its own `-1 DEF` (stacks per source — flanked by two Ghouls is -2 DEF),
   and any Ghoul within 1 tile has a chance to bite for 1 true damage at
   turn rollover. The Archer's 5-range attack and 5-range Volley cone mean
   she never has to be adjacent to a Ghoul at all if the lane is read
   correctly — staying at range isn't just a damage-type choice here, it's
   what keeps the aura/bite hazard from ever mattering.
5. **Clearing a Ghoul is meant to be a real option, not a grind.** These
   Ghouls are set to **5 HP** for this mission (base roster Ghoul is 10 —
   see Implementation notes), specifically so a single decisive hit —
   Archer basic attack at STR 8 vs. Ghoul DEF 2, or a Volley Shot tick —
   can drop one in the same turn it's engaged. The choice is meant to stay
   "clear the blocker now" vs. "route around it," both one-turn-ish costs;
   it should never come down to "spend three turns whittling a wall down,"
   which would just make routing the only real answer and flatten the
   puzzle.
6. **No backup, no cleanse.** It's a solo unit — nothing heals a poor
   positioning choice away. The Archer's own Emblem passive (poison
   immunity) isn't relevant here (this mission doesn't poison), so the pick
   is really about range + Volley Shot's unblockable cone, not a status
   answer.

**Why this isn't "just bring a tank":** a melee unit still has to physically
displace or walk around every Ghoul it meets (no ranged option to clear a
blocker from a distance) and still eats the DEF stacking and bite chip the
entire time it's adjacent, with no true-damage tool of its own to answer a
blocked line. The lesson is specifically about **using a ranged, true-damage
AoE to solve a line-of-sight problem instead of just closing distance into
every hazard the level offers** — a tool the Archer already has, that a
melee pick simply doesn't.

## Dialogue beats (condition-triggered, same pattern as
`clodMissionOpeningScript` / `shouldShowClodRageWarning`)

**Beat 1 — opening script** (fires on match start):
- Witch Doctor taunts from deep in the swamp — something about the fire
  being old friends with him, never named as immunity outright ("the flame
  and I go way back").
- A player-side speaker line notes the things guarding this place stand
  shoulder to shoulder, and a straight shot won't always find a straight
  line — a body-block hint without naming the mechanic.

**Beat 2 — first fire damage taken by the player's unit** (new trigger,
gate on a `fireWarningShown` flag, mirrors `shouldShowClodRageWarning`'s
state-diff style; hook off the existing `FIRE_DAMAGE` event stream):
- Short line: the swamp doesn't care whose side you're on, but *some*
  things standing in it clearly don't feel it at all — a direct hint at
  Coal Walker without naming the passive.

**Beat 3 — first shot rejected as blocked** (`TARGET_OBSTRUCTED` on a
player command, gate on `blockedShotWarningShown`):
- Line noting an arrow doesn't turn corners, but a wider spread might not
  care what's standing in the way — nudges toward Volley Shot without
  naming it.

**Beat 4 — first Ghoul Bite landed on the player's unit** (hook off the
existing `AUTO_STRIKE` event stream, gate on `ghoulWarningShown`):
- Line noting the things guarding this place get meaner up close — a
  distance/spacing hint.

**Beat 5 — Witch Doctor enters RAGE (≤5 HP, Black Death Dance unlocks)**:
- Warning that whatever he's about to dance is going to put the whole swamp
  in the dark for a moment — a blind-incoming tell, same "don't dawdle near
  a RAGE trigger" beat as Mission 1's Thunderous Charge warning and Mission
  2's aura-widen warning, third mechanic in the same slot.

## Objectives / stars (mirrors `evaluateCampaignMission`'s shape)

Base three:
1. `complete` — win the duel.
2. `survive` — the chosen unit ends the mission alive (there's only one, so
   this is a flat "don't die").
3. **`unburned`** — win having taken fire-tile damage **zero** times. This
   is the mission's signature terrain lesson made explicit and required,
   not optional: it's directly gradeable off the existing `FIRE_DAMAGE`
   event stream (filter to `unit.player === 1`), no new resolver needed.
   Requires a `fireDamageTakenCount` meta counter, computed the same way
   Mission 1 tracks `clodChargeHitCount` — an event-counting hook in
   `main.js`, passed into `evaluateCampaignMission`'s `meta` arg.

Bonus:
- **`sharpshooter`** — win having never had a physical attack/ART rejected
  as blocked (`errorCode === "TARGET_OBSTRUCTED"` on a player-issued
  command, tracked as an `obstructedShotCount` meta counter incremented in
  `main.js`'s dispatch wrapper, the same place errorCodes already surface
  to the UI). This is the mission's real mastery layer — it rewards reading
  a blocked lane *before* attempting it (via Volley Shot or repositioning),
  not just recovering after the rejection.
- **`unbitten`** — win having taken zero Ghoul Bite hits (`AUTO_STRIKE`
  events filtered to `unit.player === 1`), a `ghoulBiteTakenCount` counter
  built the same way. Reinforces "stay at range," the same role `spread`
  plays in Mission 2.

## Implementation notes (for whoever picks this up)

- **Depends on Mission 2 landing first**, specifically its dispatch-table
  note: `prepareCampaignMatchState` currently early-returns for any
  `missionId !== CLOD_MISSION_ID`. Mission 2's plan already calls for
  generalizing this to a mission-id-keyed table (or a per-mission branch);
  extend that same table for Mission 3 rather than re-special-casing the
  early return a second time. Same applies to `evaluateCampaignMission`.
- **Fire tiles:** set `state.tileObjects[positionKey({x, y})] = { kind:
  "fire", permanent: true }` directly in the mission's prepare function for
  every hazard tile — the engine already honors `permanent` in
  `applyFireTick` (`turnEngine.js`, `if (obj.permanent) continue;` skips the
  countdown/expiry entirely), no engine change needed. `positionKey` is
  exported from `rules/movement.js` and formats as `"x,y"`, matching the key
  `applyFireTick` splits on.
- **No wall tileObjects in this mission** — Ghoul bodies are the maze
  structure (see puzzle point 1), so there's nothing to author or test on
  the destructible-wall path. Keep it that way unless the fire/Ghoul-only
  gauntlet plays too flat in practice; `attackWall`/wall tileObjects exist
  and would slot in later without new engine work if needed.
- **Ghouls:** construct them the same way `createSummon` does in
  `artResolvers.js` (id/type/player/team/position/hp/mp all set, `summon:
  true`) but with `summonerId` simply omitted/`null`, and **`hp: 5`** instead
  of the base `GHOUL.stats.maxHp` (10) — since these are hand-authored, one-
  off board pieces rather than squad units run through the normal
  half-HP-on-campaign-entry path, just set the lower HP directly at
  construction rather than adding a general Ghoul-HP-override knob. Leave
  `maxHp` itself untouched (still 10) so HP-bar/percentage rendering doesn't
  need special-casing — only the starting `hp` value is lowered. Confirmed
  safe: the
  rage-borrow check in `unitCatalog.js` (`if (!raging &&
  source.summonerId && ...)`) short-circuits cleanly with no summoner, and
  nothing else in `plans.js`/`artResolvers.js`'s active-summon-cap logic
  fires without a live Necromancer actor issuing the check. They'll sit at
  permanent base-radius (3-tile) Deathly Aura and normal Ghoul Bite, exactly
  as intended for static hazards. Double-check `takesTurns` /
  squad-summary / victory-condition exclusion still holds for a
  summoner-less Ghoul before shipping (should — those all key off
  `unit.summon`, not `summonerId`) but it's worth a real headless smoke test
  since this is the first time a Ghoul exists with no Necromancer on the
  board at all.
- **Layout authoring:** plain `positions` map like Mission 1/2, but larger —
  hand-place the Witch Doctor at the far side, Ghoul clusters at the
  natural chokepoints between spawn and him, fire tiles filling the "go
  around" tiles so the direct (blocked) line and the detour are both
  costly in different currencies (a rejected shot vs. burn damage), forcing
  an actual Volley Shot decision rather than a free walk-around. Sketch the
  layout in the sandbox tool (`sandbox.html`) first — it already supports
  placing units and fire and exporting the scenario as JSON, which drops
  straight into a `tests/campaign.test.js` fixture.
- **Manifest entry:** `defaultSquad` omitted, `playerSlots: 1`,
  `enemySquad` for match-config purposes should probably just be
  `["witch-doctor"]` (the Ghouls are hand-placed board dressing via
  `prepareCampaignMatchState`, not part of the drafted `squads[2]` list —
  confirm this split doesn't fight `createCampaignMatchConfig`'s squad
  building, which currently assumes `enemySquad` is the full enemy roster;
  may need the same kind of positions-map override Mission 1 uses to
  relocate/re-stat units, extended to *add* extra non-squad units to
  `match.units` rather than just repositioning existing ones — this is new
  relative to Mission 1/2 and is the trickiest implementation piece here).
  `size: 15`, `rewardUnits: ["witch-doctor"]`, `unitType: "witch-doctor"`,
  `requiredStars`: suggest 4 (partial-clear gate across the two prior
  missions' combined 6 possible stars), plus `position`/`routeFrom`/
  `routeTo` map coordinates once the campaign map layout extends past
  Mission 2's node.
- Reuse `enqueueUnitUnlockAnnouncements` as-is for the Witch Doctor unlock
  screen.
- Tests to extend: `tests/campaign.test.js` (layout/positions, permanent-
  fire placement, summoner-less Ghoul behavior, dialogue triggers),
  `tests/campaign-results.test.js` (star grading for `unburned`/
  `sharpshooter`/`unbitten`).
