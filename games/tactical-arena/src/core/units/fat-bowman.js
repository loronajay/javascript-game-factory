// Fat Bowman - a rebuild-original ranger and the fourth member of the fat squad.
// Her kit is mostly shot modifiers:
//   * Heavy Handed is folded by rules/combat.js as distance-scaled physical damage.
//   * Curve Shot is a normal physical strike with unit-piercing line of sight.
//   * Dragonsbane is a normal strike with two poison rolls, crit-guaranteed.
//   * Planted stores its STR counter on the unit and is folded by getEffectiveStats.
//   * Desperation Shot is a RAGE one-shot stat buff consumed by basic/ART attacks.
export const FAT_BOWMAN = Object.freeze({
  id: "fat-bowman",
  name: "Fat Bowman",
  glyph: "🏹",
  classType: "ranger",
  ai: Object.freeze({ threatValue: 14, role: "ranged", protect: true }),
  tempo: Object.freeze({ agility: 4 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 4,
    strength: 7,
    defense: 5,
    maxHp: 30,
    maxMp: 25
  }),
  passive: Object.freeze({
    id: "heavy-handed",
    name: "Heavy Handed",
    effect: Object.freeze({
      type: "rangeDamageCurve",
      metric: "chebyshev",
      neutralDistance: 2,
      minimumDamage: 1
    }),
    description: "Physical shots deal -1 damage adjacent, normal damage at 2 range, +1 at 3 range, +2 at 4 range, and continue scaling with range buffs.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "curve-shot",
      name: "Curve Shot",
      kind: "active",
      mpCost: 3,
      targeting: Object.freeze({ shape: "single" }),
      effect: Object.freeze({ type: "piercingStrike", pierceUnits: true }),
      description: "Shoot a normal physical attack that can pass through units.",
      implemented: true,
      ai: Object.freeze({ intent: "strike" })
    }),
    Object.freeze({
      id: "dragonsbane",
      name: "Dragonsbane",
      kind: "active",
      mpCost: 5,
      targeting: Object.freeze({ shape: "single" }),
      effect: Object.freeze({
        type: "status",
        status: "poison",
        chance: 0.6,
        duration: "permanent",
        turnStartDamage: 1,
        rolls: 2,
        criticalGuarantees: true
      }),
      description: "Shoot a normal physical attack at Fat Bowman's attack range, then roll twice to poison. Critical hits guarantee the poison unless the target is immune.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "planted",
      name: "Planted",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "stationaryStrength", amount: 1, max: 4 }),
      description: "Each turn Fat Bowman starts without having moved builds +1 STR, up to +4. Confirming a move clears the bonus and restarts the climb.",
      implemented: true
    }),
    Object.freeze({
      id: "brothers-in-arms",
      name: "Brothers in Arms",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "teamCompositionStats",
        requiredTypes: Object.freeze(["fat-knight", "fat-wizard", "fat-cleric"]),
        stats: Object.freeze({ attackRange: 1 })
      }),
      description: "Gain +1 RANGE if Fat Knight, Fat Wizard, and Fat Cleric are all on Fat Bowman's team.",
      implemented: true
    })
  ]),
  rageArt: Object.freeze({
    id: "desperation-shot",
    name: "Desperation Shot",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "oneShotStatModifiers",
      stats: Object.freeze({ strength: 4, attackRange: 1 }),
      skipNextActivation: true
    }),
    description: "At 5 HP or lower, Fat Bowman's next basic attack, Curve Shot, or Dragonsbane gains +4 STR and +1 RANGE. After using it, she skips her next turn. Leaving and re-entering RAGE restores the shot.",
    implemented: true
  })
});
