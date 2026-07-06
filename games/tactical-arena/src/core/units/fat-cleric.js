// Fat Cleric — a rebuild-original support/healer (a rotund battlefield priestess). There
// is NO legacy .sb3 Fat Cleric; these numbers are the user's balance authoring. She is the
// healer of the "fat" squad (Fat Knight / Fat Wizard / Fat Bowman), and her Brothers in
// Arms passive rewards fielding the whole family.
//
// Engine seams this unit introduced / reuses (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `defendRestore` (Snack Break) — a passive read centrally in the reducer's defend():
//     when she DEFENDS without having moved that activation she restores hp/mp (the HP part
//     honors the global healing lockout).
//   • `healAllies` with a `randomAmount` roll (Hope) — resolveHealAllies now rolls one
//     shared value in [min,max] from the authoritative RNG when randomAmount is present and
//     applies it to every ally in radius; `amount` stays as the expected value the CPU reads.
//   • `cleanse` with `scope: "negative"` (Cleanse) — resolveCleanseAlly now strips only the
//     NEGATIVE statuses (blind/silence/poison/slow/stun) when scoped, leaving buffs intact.
//   • `focusPrayer` resolution (Focus Prayer) — a friendly heal that ROLLS to-hit; on a hit
//     it heals, on a miss the prayer backfires and inflicts a random negative status on the
//     ally for 1 turn instead.
//   • `teamCompositionStats` (Brothers in Arms) — the existing squad-synergy seam: +1 MOVE /
//     +1 DEF while Fat Knight, Fat Wizard, AND Fat Bowman all share her team.
//   • `rageRegen` (Emergency Snacks) — a per-turn RAGE regen fired in beginActivation: +1 HP
//     at the start of each of her turns while raging, +5 MP on the turn the heal lifts her
//     back above the 5-HP rage threshold, capped at 3 procs per battle (counted on
//     unit.emergencySnackCount, a hashed field so online lockstep clients agree).
//
// Brothers in Arms is a kind:"passive" arts entry (the multi-passive pattern the fat
// siblings share); Snack Break is the main `passive` and Emergency Snacks the `ragePassive`.
export const FAT_CLERIC = Object.freeze({
  id: "fat-cleric",
  name: "Fat Cleric",
  glyph: "✚",
  classType: "support",
  ai: Object.freeze({ threatValue: 14, role: "support", protect: true }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 4,
    strength: 7,
    defense: 6,
    maxHp: 30,
    maxMp: 35
  }),
  // Snack Break: a defensive top-up. Bracing (without moving first) lets her nibble —
  // +1 HP / +1 MP. Read centrally by the reducer's defend().
  passive: Object.freeze({
    id: "snack-break",
    name: "Snack Break",
    effect: Object.freeze({ type: "defendRestore", hp: 1, mp: 1 }),
    description: "When Fat Cleric defends without having moved that turn, she restores 1 HP and 1 MP.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "hope",
      name: "Hope",
      kind: "active",
      mpCost: 3,
      targeting: Object.freeze({ shape: "selfAura", radius: 3 }),
      // randomAmount rolls one shared value in [min,max] from the authoritative RNG; amount
      // is the expected value the forecast/CPU projection read.
      effect: Object.freeze({ type: "healAllies", amount: 2, radius: 3, randomAmount: Object.freeze({ min: 1, max: 4 }) }),
      description: "Restore a random 1–4 HP to Fat Cleric and every ally within 3 tiles.",
      implemented: true,
      ai: Object.freeze({ intent: "healAllies", tags: Object.freeze(["heal"]) })
    }),
    Object.freeze({
      id: "cleanse",
      name: "Cleanse",
      kind: "active",
      mpCost: 8,
      resolution: "cleanseAlly",
      targeting: Object.freeze({ shape: "ally", range: 5 }),
      effect: Object.freeze({ type: "cleanse", scope: "negative" }),
      description: "Remove all negative status effects from one allied unit within 5 tiles. Cannot target self.",
      implemented: true,
      ai: Object.freeze({ intent: "cleanseAlly", tags: Object.freeze(["cleanse"]) })
    }),
    Object.freeze({
      id: "focus-prayer",
      name: "Focus Prayer",
      kind: "active",
      mpCost: 5,
      resolution: "focusPrayer",
      targeting: Object.freeze({ shape: "ally", range: 3, excludeSelf: true }),
      heal: Object.freeze({ amount: 5 }),
      // On a MISS the prayer backfires: one random NEGATIVE status on the ally for 1 turn,
      // drawn from a WEIGHTED table (higher weight = more likely). Stun is the rare misfire.
      misfire: Object.freeze({
        durationTurns: 1,
        pool: Object.freeze([
          Object.freeze({ status: "blind", weight: 3 }),
          Object.freeze({ status: "silence", weight: 3 }),
          Object.freeze({ status: "poison", weight: 3 }),
          Object.freeze({ status: "slow", weight: 3 }),
          Object.freeze({ status: "stun", weight: 1 })
        ])
      }),
      description: "Restore 5 HP to an ally within 3 tiles. Roll for it — on a miss the prayer backfires and inflicts a random status on that ally for 1 turn instead.",
      implemented: true,
      ai: Object.freeze({ intent: "healAlly", tags: Object.freeze(["heal"]) })
    }),
    // Brothers in Arms: the fat squad fights better together. +1 MOVE / +1 DEF while the
    // whole family (Fat Knight, Fat Wizard, Fat Bowman) shares her team. A kind:"passive"
    // arts entry picked up by teamCompositionStats in getEffectiveStats.
    Object.freeze({
      id: "brothers-in-arms",
      name: "Brothers in Arms",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "teamCompositionStats",
        requiredTypes: Object.freeze(["fat-knight", "fat-wizard", "fat-bowman"]),
        stats: Object.freeze({ moveRange: 1, defense: 1 })
      }),
      description: "While Fat Knight, Fat Wizard, and Fat Bowman are all on her team, Fat Cleric gains +1 MOVE and +1 DEF.",
      implemented: true
    })
  ]),
  // Emergency Snacks (RAGE): a slow self-regen. At 5 HP or lower she nibbles 1 HP back at
  // the start of each of her turns; the turn a nibble lifts her back over the threshold she
  // also gulps 5 MP. Fires at most 3 times per battle (unit.emergencySnackCount).
  ragePassive: Object.freeze({
    id: "emergency-snacks",
    name: "Emergency Snacks",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "rageRegen", hp: 1, exitMp: 5, maxProcs: 3 }),
    description: "At 5 HP or lower, restore 1 HP at the start of each of Fat Cleric's turns; if that heal lifts her back above 5 HP she also restores 5 MP. Happens at most 3 times per battle.",
    implemented: true
  })
});
