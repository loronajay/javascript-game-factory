# Campaign Mission 2 — "Necromancer's Gate" — Beat Plan

Status: **designed, not yet implemented.** Manifest stub already exists in
`src/campaign/campaign.js` (`NECROMANCER_MISSION_ID = "necromancer-rise"`,
`comingSoon: true`). This doc is the spec to implement against once the
session limit resets. Mirrors the shape of `CLOD_MISSION_ID` ("Clod on the
Ridge") — read that mission's code in `campaign.js` before implementing;
this doc only calls out what's new/different for mission 2.

## Premise

Enemy squad: **Necromancer + Virus**. Only the Necromancer is a reward
(`rewardUnits: ["necromancer"]`) — Virus is not up for unlock here; it's
already-available roster, playing a pure antagonist role.

Board: **13×13** (bigger than mission 1's 11, to give room for aura/spread
radii and kiting).

**No curated `defaultSquad`.** Mission 1 accidentally telegraphed its answer
by pre-selecting the "correct" duo. For mission 2, leave `defaultSquad`
unset so `createCampaignMatchConfig` falls through to the generic global
default — the player has to actually draft into the right answer, not just
accept a hint. Squad choice is part of the puzzle.

## The puzzle (what the player has to figure out)

Two enemy passives create converging pressure, and the intended answer
(**Mystic + Swordsman**, though not stated outright) counters both:

1. **Dead Zone** (Necromancer) — the enemy team takes 1 less magic damage.
   Bringing a mage squad into this fight is a trap; physical is better.
2. **Deathly Aura** (Necromancer) — enemies within 3 tiles (4 while raging)
   suffer -1 DEF. Fighting up close with physical damage gets *better*, not
   worse, reinforcing the same answer from a second angle.
3. **Spread** (Virus) — any debuff landed on an enemy (poison, blind,
   silence, slow, stun) auto-propagates to that enemy's allies within 2
   tiles. Standing your squad close together turns one status hit into two.
4. **Status pressure, two flavors:**
   - Virus's Cough (60% poison, permanent) and crit-poison rider are the
     primary threat — poison is permanent until cleansed, so it's a ticking
     clock, not a one-off chip.
   - Necromancer's Wither (70% chance, -1 MOVE Slow, 3 turns) adds
     kiting pressure — a slowed unit can't disengage from Deathly Aura or
     close distance on its own turn.
5. **Ghoul Bite** — if the Necromancer summons, the Ghoul pokes 1 true
   damage/turn to whoever lingers nearby. Reinforces mission 1's "a summon
   isn't the objective" lesson from a new angle (chip pressure, not a wall).

**Why Mystic + Swordsman answers all of it:** Purify (Mystic, 8 MP, cleanse
all statuses on one ally within 5) directly answers poison/slow before they
compound via Spread. Swordsman is pure physical, untouched by Dead Zone, and
benefits from Deathly Aura's DEF drop up close. Don't state this pairing
explicitly in dialogue — the hints below should let a player *derive* it.

## Dialogue beats (condition-triggered, same pattern as
`clodMissionOpeningScript` / `shouldShowClodRageWarning`)

**Beat 1 — opening script** (fires on match start, mirrors
`clodMissionOpeningScript`):
- Necromancer taunts about magic dying at the gate (Dead Zone hint, oblique).
- Virus taunts about infection spreading through a tight formation (Spread
  hint — "keep your friends close and I'll thank you for it").
- A player-side speaker line flags that something here punishes clustering,
  and that whatever cures a curse might matter more than raw damage this
  time — a nudge toward Purify without naming it.

**Beat 2 — first status landed on a player unit** (new trigger condition,
mirrors `shouldShowClodRageWarning`'s state-diff style — fire once, gate on
a `statusWarningShown` flag):
- Short line noting the status will spread to anyone standing close, and
  that letting it stack turns into real trouble — reinforces spacing +
  cleanse-before-it-spreads without being explicit about which unit cleanses.

**Beat 3 — first Summon Ghoul** (new trigger, detect a new `ghoul` unit
appearing with `summonerId` set to the Necromancer):
- Line reminding the player the summon isn't the win condition, but it will
  keep hitting for chip damage if you park next to it.

**Beat 4 — Necromancer enters RAGE** (aura widens 3→4, Dark Bomb scales
with it via `matchAuraRadius`):
- Warning that the aura just got bigger and Dark Bomb will now catch more
  ground than before — same "don't dawdle near a RAGE trigger" beat as
  mission 1's Thunderous Charge warning, different mechanic.

## Objectives / stars (mirrors `evaluateCampaignMission`'s shape)

Base three (same as mission 1):
1. `complete` — win.
2. `survive` — both chosen units end alive.
3. **New spacing objective:** `spread` — no single status application should
   hit more than 1 of your units via Virus's Spread (i.e., keep the squad
   apart so a poison/slow lands on one unit, not both via propagation).
   Needs a new tracked meta counter, e.g. `spreadHitCount`, computed the
   same way mission 1 tracks `clodChargeHitCount` (event-counting hook in
   `main.js`, passed into `evaluateCampaignMission`'s `meta` arg).

Bonus (pick one, lean toward the second — cheaper to compute and it
reinforces the "kill the commander, not the summon" lesson from a fresh
angle):
- `cleansed` — win after successfully using a cleanse (Purify or
  equivalent) at least once. Requires tracking a `cleanseUsed` flag off the
  accepted-command stream in `main.js` (watch for a `resolution:
  "cleanseAlly"` command succeeding).
- `noGhoulKill` — win without killing a Ghoul (post-match check: no unit
  with `type === "ghoul"` and `hp <= 0` in `state.units`). Simple, no new
  live-tracking needed — computable entirely from final `state`.

## Implementation notes (for whoever picks this up)

- `prepareCampaignMatchState` currently early-returns for any
  `missionId !== CLOD_MISSION_ID` — needs a new branch (or a small dispatch
  table keyed by mission id) with its own `positions` map. Suggest a
  graveyard-flavored layout: Necromancer defensive/backline, Virus forward
  enough to threaten but not so far it can't be focused down before it
  poisons both units; player spawn corner should give both a melee unit and
  a ranged/support unit a clean approach without forcing them through Virus's
  Cough range on turn one.
- Manifest entry needs `defaultSquad` **omitted** (not just empty array —
  confirm `createCampaignMatchConfig`'s `selectedSquad ?? mission.defaultSquad
  ?? DEFAULT_SQUAD` fallback behaves correctly with the key absent),
  `enemySquad: ["necromancer", "virus"]`, `size: 13`, plus `position`/
  `routeFrom`/`routeTo` map coordinates (already stubbed, just needs real
  coords once the campaign map layout is decided).
- `evaluateCampaignMission` needs a new mission-aware branch (it currently
  hardcodes the Clod-specific `clod`/`clodChargeHitCount` objective checks)
  — either branch on `missionId` or generalize the objective list to be
  mission-data-driven. Given only 2 missions exist today, branching is fine;
  don't over-abstract yet.
- Reuse `enqueueUnitUnlockAnnouncements` as-is for the Necromancer unlock
  screen — no changes needed there.
- Tests to extend: `tests/campaign.test.js` (new mission's positions/
  objectives/dialogue triggers), `tests/campaign-results.test.js` (star
  grading for the new objective set).
