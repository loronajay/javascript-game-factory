// Witch Doctor — a dance-caster support built around a persistent STANCE. Its
// "Dancing Man" passive is not a fixed effect: the Witch Doctor's live passive is
// whichever of five stances matches the dance it used most recently. Every dance ART
// fires a one-shot effect AND enters its stance, so the ongoing aura shifts as the
// Witch Doctor dances. `unit.stance` carries the current stance (persists across
// turns like statModifiers); it starts null (no stance) until the first dance.
//
// The per-stance effects live in the `stances` block below and are folded by the
// shared rule seams — NOT hard-coded per unit (see UNIT_AUTHORING_GUIDE.md):
//   • getEffectiveStats folds `stances[stance].stats` (Fire Stance's +1 STR).
//   • rules/stances.js reads the rest: the Rain global heal bonus, the Misfortune
//     global status-chance ×2 (everyone, not just his team), the Black Death magic
//     immunity + global true-damage rollover tick, and the on-attack triggers (Rain's
//     next-turn haste, Spirit's ally MP restore).
//   • the reducer's dance resolvers run each dance's one-shot effect then set stance.
//
// New engine seams this unit introduced:
//   • `stanceSystem` passive + the `stances` data block.
//   • `empowered` — a timed positive-statModifiers buff status (Fire Dance empowers
//     allies, Black Death Dance self-empowers, and Rain's on-attack haste all apply
//     it); getEffectiveStats already folds status.statModifiers generically.
//   • global cleanse (Misfortune Dance) and a global status application (Black Death
//     Dance's blind-everyone).
//
// These numbers are a rebuild balance authoring (the user's spec), not recovered
// .sb3 canon — there is no legacy Witch Doctor reference doc.
export const WITCH_DOCTOR = Object.freeze({
  id: "witch-doctor",
  name: "Witch Doctor",
  glyph: "🪘",
  classType: "support",
  ai: Object.freeze({ threatValue: 15, role: "support", protect: true }),
  tempo: Object.freeze({ agility: 5 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 4,
    strength: 8,
    defense: 3,
    maxHp: 24,
    maxMp: 30
  }),
  passive: Object.freeze({
    id: "dancing-man",
    name: "Dancing Man",
    effect: Object.freeze({ type: "stanceSystem" }),
    description: "The Witch Doctor's passive is the stance of the dance he used most recently — Rain, Fire, Spirit, Misfortune, or Black Death.",
    implemented: true
  }),
  // Per-stance effect data, read by the shared rule seams keyed off `unit.stance`.
  // Keeping this as data (not per-unit code) is what lets getEffectiveStats and
  // rules/stances.js fold stances without teaching every rule about the Witch Doctor.
  stances: Object.freeze({
    rain: Object.freeze({
      name: "Rain Stance",
      // All HP healing (any source, allies AND foes) is increased by this while a
      // living Witch Doctor is in Rain Stance.
      globalHealBonus: 1,
      // On a basic attack, the Witch Doctor gains +2 MOVE on his NEXT turn (applied
      // as a 1-turn `empowered` status at the start of that activation).
      onAttack: Object.freeze({ hasteMove: 2 })
    }),
    fire: Object.freeze({
      name: "Fire Stance",
      // Base STR 8 → 9 while in Fire Stance (folded by getEffectiveStats).
      stats: Object.freeze({ strength: 1 }),
      // The Witch Doctor's crits deal +1 damage in Fire Stance.
      critBonus: 1
    }),
    spirit: Object.freeze({
      name: "Spirit Stance",
      // On a basic attack, allies within 2 tiles restore 3 MP.
      onAttack: Object.freeze({ allyMp: 3, allyMpRadius: 2 })
    }),
    misfortune: Object.freeze({
      name: "Misfortune Stance",
      // Status effects land at ×2 chance GLOBALLY (allies and foes alike) while he is
      // in Misfortune Stance (read by rules/statuses via rules/stances.js).
      globalStatusChanceMultiplier: 2
    }),
    blackDeath: Object.freeze({
      name: "Black Death Stance",
      // The Witch Doctor takes no magic damage in Black Death Stance.
      magicImmune: true,
      // Each turn rollover, every living unit (allies AND foes, the Witch Doctor
      // included) takes this much true damage.
      globalTrueTick: 1
    })
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "rain-dance",
      name: "Rain Dance",
      kind: "active",
      mpCost: 2,
      resolution: "witchDance",
      stance: "rain",
      // Reuses the healAllies effect shape so the CPU planner/projection understand it.
      effect: Object.freeze({ type: "healAllies", amount: 1, global: true }),
      description: "Heal every ally for 1 HP, then enter Rain Stance: all HP healing is +1 globally, and attacking grants the Witch Doctor +2 MOVE next turn.",
      implemented: true,
      ai: Object.freeze({ intent: "healAllies", tags: Object.freeze(["stance"]) })
    }),
    Object.freeze({
      id: "fire-dance",
      name: "Fire Dance",
      kind: "active",
      mpCost: 3,
      resolution: "witchDance",
      // selfCast: no enemy target — resolves the instant the button is pressed, so the
      // team buff is usable even with no enemy in range (Rain Dance stays a healAllies
      // cast, which already has a working "click an ally" affordance).
      selfCast: true,
      stance: "fire",
      // A timed positive buff applied to every ally on cast.
      teamBuff: Object.freeze({ statModifiers: Object.freeze({ strength: 1 }), durationTurns: 1 }),
      description: "Grant every ally +1 STR for 1 turn, then enter Fire Stance: the Witch Doctor's STR becomes 9 and his crits deal +1 damage.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["stance", "buff"]) })
    }),
    Object.freeze({
      id: "spirit-dance",
      name: "Spirit Dance",
      kind: "active",
      mpCost: 0,
      resolution: "witchDance",
      selfCast: true,
      stance: "spirit",
      teamMp: Object.freeze({ amount: 1 }),
      description: "Restore 1 MP to every ally, then enter Spirit Stance: attacking restores 3 MP to allies within 2 tiles.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["stance", "buff"]) })
    }),
    Object.freeze({
      id: "misfortune-dance",
      name: "Misfortune Dance",
      kind: "active",
      mpCost: 5,
      resolution: "witchDance",
      selfCast: true,
      stance: "misfortune",
      cleanse: Object.freeze({ scope: "all" }),
      description: "Remove every status effect from all units (allies and foes), then enter Misfortune Stance: status effects are twice as likely to land for everyone.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["stance", "cleanse"]) })
    }),
    // Black Death Dance is only available while raging (rageLocked), mirroring the
    // Magician's Nuke. RAGE grants no separate stat boost for this unit.
    Object.freeze({
      id: "black-death-dance",
      name: "Black Death Dance",
      kind: "active",
      mpCost: 5,
      rageLocked: true,
      resolution: "witchDance",
      selfCast: true,
      stance: "blackDeath",
      selfBuff: Object.freeze({ statModifiers: Object.freeze({ strength: 2, defense: 1, moveRange: 1 }), durationTurns: 1 }),
      globalStatus: Object.freeze({ status: "blind", durationTurns: 1 }),
      description: "RAGE: Gain +2 STR / +1 DEF / +1 MOVE for 1 turn and blind every unit for 1 turn, then enter Black Death Stance: you are immune to magic, and every unit takes 1 true damage each turn.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["stance", "rageOnly"]) })
    }),
    // Coal Walker: the same fireDamageImmune seam Gargoyle's One With The Flames uses
    // (isFireDamageImmune in rules/combat.js), authored as its own passive ART entry so
    // it stacks alongside the stance-driven Dancing Man passive rather than replacing it.
    Object.freeze({
      id: "coal-walker",
      name: "Coal Walker",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "fireImmunity", fireDamageImmune: true }),
      description: "The Witch Doctor takes no damage from fire-based ARTS or fire tiles.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "witch-doctor-rage",
    name: "RAGE",
    kind: "passive",
    mpCost: 0,
    description: "At 5 HP or lower, the Black Death Dance becomes available.",
    implemented: true
  })
});
