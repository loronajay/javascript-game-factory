export const LITTLE_BROTHER = Object.freeze({
  id: "little-brother",
  name: "Little Brother",
  glyph: "LB",
  classType: "ranger",
  ai: Object.freeze({ threatValue: 14, role: "ranged", protect: true }),
  tempo: Object.freeze({ agility: 5 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 4,
    strength: 8,
    defense: 6,
    maxHp: 25,
    maxMp: 10
  }),
  passive: Object.freeze({
    id: "splash-fire",
    name: "Splash Fire",
    effect: Object.freeze({
      type: "critSplashDamage",
      trigger: "basicCrit",
      damageType: "true",
      amount: 2,
      radius: 1
    }),
    description: "On a critical basic attack, deal 2 true damage to enemies within 1 tile of the original target.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "cannon-fire",
      name: "Cannon Fire",
      kind: "active",
      mpCost: 5,
      targeting: Object.freeze({ shape: "single", range: 5 }),
      damage: Object.freeze({ type: "physical", amount: 10, fixed: true }),
      onCrit: Object.freeze({
        status: "stun",
        durationTurns: 1,
        splash: Object.freeze({ damageType: "true", amount: 2, radius: 1 })
      }),
      description: "Fire a range-5 cannon shot for 10 physical power. Critical hits stun the target for 1 turn and trigger Splash Fire around them.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", evHints: Object.freeze({ splashDamage: 2 }), tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "rechargeable-battery",
      name: "Rechargeable Battery",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "magicDamageMpRestore", amount: 3 }),
      description: "Restore 3 MP whenever Little Brother takes magic damage.",
      implemented: true
    }),
    Object.freeze({
      id: "pissing-contest",
      name: "Pissing Contest",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "globalTypePresenceStats",
        requiredTypes: Object.freeze(["big-brother"]),
        stats: Object.freeze({ attackRange: 1 })
      }),
      description: "Gain +1 range while Big Brother is in play on either team.",
      implemented: true
    }),
    Object.freeze({
      id: "flamethrower",
      name: "Flamethrower",
      kind: "active",
      mpCost: 5,
      targeting: Object.freeze({ shape: "cone", range: 3 }),
      rageRangeBonus: 2,
      damage: Object.freeze({ type: "true", amount: 3 }),
      description: "Deal 3 true damage to enemies in a range-3 cone. While raging, the cone gains +2 range.",
      implemented: true,
      ai: Object.freeze({ intent: "coneAoe", evHints: Object.freeze({ minTargets: 2 }) })
    })
  ]),
  ragePassive: Object.freeze({
    id: "flamespitter",
    name: "Flamespitter",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 2 }),
      basicAttackCone: Object.freeze({ artId: "flamethrower", orthogonalOnly: true })
    }),
    combat: Object.freeze({ criticalBonus: 0.05 }),
    description: "RAGE: Gain +2 STR and +5% crit chance. Flamethrower gains +2 range and casts for free after orthogonal basic attacks.",
    implemented: true
  })
});
