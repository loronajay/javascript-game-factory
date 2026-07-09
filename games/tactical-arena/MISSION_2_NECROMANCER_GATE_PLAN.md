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

**No pre-picked squad.** The campaign UI (`menuFlow.js`) now generically
starts every mission with empty squad slots (`emptyCampaignSquad`) and gates
the Start button on `campaignSquadReady()` — the player must explicitly pick
a unit for every slot before a mission can start, regardless of any
`defaultSquad` a mission's data declares. This already applies to mission 1;
mission 2 gets it for free and needs no special-casing. (`defaultSquad` on
`CLOD_MISSION_ID` still exists in `campaign.js` as a fallback the match-config
builder reads if a squad is ever missing, but live play never hits it since
the UI always supplies a fully-chosen squad.) The player has to actually
draft into the right answer, not just accept a hint — squad choice is part
of the puzzle.

## The puzzle (what the player has to figure out)

Two enemy passives create converging pressure, and the intended answer
(**Mystic + Swordsman**, though not stated outright) counters both:

1. **Dead Zone** (Necromancer) — the enemy team takes 1 less magic damage.
   Bringing a mage squad into this fight is a trap; physical is better.
2. **Deathly Aura** (Necromancer) — `enemyAura` debuffs ENEMIES of the
   Necromancer, i.e. the player's own units, -1 DEF within 3 tiles (4 while
   raging). This is a *punishment for closing distance*, not a perk — a
   melee unit fighting the Necromancer up close eats more incoming damage
   the whole time it's adjacent, creating real tension against "just go
   physical." (Do not write this as a benefit to the attacker — it lowers
   the *victim's* defense, and the victim near the Necromancer is the
   player.)
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
compound via Spread. Swordsman is pure physical, untouched by Dead Zone. And
critically: Mystic's **Guardian** passive (`teamAura`, always-on +1 DEF to
allies while Mystic lives) exactly cancels Deathly Aura's -1 DEF — so a
Swordsman fighting the Necromancer at close range with a Mystic nearby takes
*neutral* DEF instead of the penalty every other melee pairing eats. The
puzzle isn't "physical beats magic here" alone; it's "physical only works
cleanly here if you bring the one passive that neutralizes the proximity
tax." Don't state this pairing explicitly in dialogue — the hints below
should let a player *derive* it.

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

Base three (same shape as mission 1, cleanse locked in as canon):
1. `complete` — win.
2. `survive` — both chosen units end alive.
3. **`cleansed`** — win after successfully using a cleanse (Purify or
   equivalent) at least once. This is the mission's signature lesson made
   explicit as a required objective, not left optional. Requires tracking a
   `cleanseUsed` flag off the accepted-command stream in `main.js` (watch
   for a `resolution: "cleanseAlly"` command succeeding).

Bonus:
- **`spread`** — no single status application hit more than 1 of your units
  via Virus's Spread (i.e., keep the squad apart so a poison/slow lands on
  one unit, not both via propagation). Moved from the base three to bonus —
  it's the "mastery" layer on top of the required "know your cure" lesson.
  Needs a new tracked meta counter, e.g. `spreadHitCount`, computed the same
  way mission 1 tracks `clodChargeHitCount` (event-counting hook in
  `main.js`, passed into `evaluateCampaignMission`'s `meta` arg).

(Considered and cut: `noGhoulKill`, win without killing a Ghoul — dropped in
favor of keeping a single, sharply-focused bonus tied to the mission's core
status-pressure theme rather than splitting attention across two unrelated
bonus ideas.)

## Implementation notes (for whoever picks this up)

- `prepareCampaignMatchState` currently early-returns for any
  `missionId !== CLOD_MISSION_ID` — needs a new branch (or a small dispatch
  table keyed by mission id) with its own `positions` map. Suggest a
  graveyard-flavored layout: Necromancer defensive/backline, Virus forward
  enough to threaten but not so far it can't be focused down before it
  poisons both units; player spawn corner should give both a melee unit and
  a ranged/support unit a clean approach without forcing them through Virus's
  Cough range on turn one.
- Manifest entry needs no `defaultSquad` at all — the UI's empty-slot pattern
  (see Premise) means the player always supplies an explicit squad, so there's
  nothing for `createCampaignMatchConfig`'s `selectedSquad ?? mission.defaultSquad
  ?? DEFAULT_SQUAD` fallback to fall through to in practice. Just needs
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
