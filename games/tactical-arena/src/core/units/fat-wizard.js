export const FAT_WIZARD = Object.freeze({
  id: "fat-wizard",
  name: "Fat Wizard",
  glyph: "🪄",
  classType: "mage",
  ai: Object.freeze({ threatValue: 15, role: "caster", protect: true }),
  tempo: Object.freeze({ agility: 4 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 3,
    strength: 7,
    defense: 4,
    maxHp: 30,
    maxMp: 35
  }),
  passive: Object.freeze({
    id: "clumsy",
    name: "Clumsy",
    effect: Object.freeze({ type: "clumsyCast", radius: 1, missMagicDamage: 2, critMagicDamage: 3, surgeHeal: 2 }),
    description: "When Zap! misses, nearby units around the target take 2 magic damage. Zap! crits splash 3 magic damage instead. Surge splashes 2 HP healing around its target on miss, crit, and during RAGE on hit.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "zap",
      name: "Zap!",
      kind: "active",
      mpCost: 5,
      accuracy: 0.93,
      resolution: "fatWizardZap",
      damageType: "magic",
      targeting: Object.freeze({ shape: "single", range: 4 }),
      damage: Object.freeze({ type: "magic", amount: 5 }),
      effect: Object.freeze({ type: "critStatus", status: "silence", durationTurns: 1 }),
      description: "Deal 5 magic damage at range 4. On crit, silence the target for 1 turn. Clumsy splashes nearby units on a miss or crit.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "study",
      name: "Study",
      kind: "active",
      mpCost: 0,
      resolution: "studyTarget",
      targeting: Object.freeze({ shape: "single", range: 5 }),
      effect: Object.freeze({ type: "studyTarget", damageBonus: 1, magicReward: Object.freeze({ hp: 2, mp: 2 }) }),
      description: "Choose one enemy within 5. Fat Wizard deals +1 damage to it, and his magic damage to it restores 2 HP and 2 MP. Unusable until that target falls.",
      implemented: true,
      ai: Object.freeze({ intent: "statusCast", tags: Object.freeze(["setup"]) })
    }),
    Object.freeze({
      id: "surge",
      name: "Surge",
      kind: "active",
      mpCost: 5,
      accuracy: 0.93,
      resolution: "fatWizardSurge",
      targeting: Object.freeze({ shape: "ally", range: 4 }),
      heal: Object.freeze({ amount: 4, critAmount: 5 }),
      description: "Roll to restore 4 HP to one allied unit within 4. On crit, restore 5 HP. Clumsy splashes 2 HP healing around the target on miss, crit, and during RAGE on hit.",
      implemented: true,
      ai: Object.freeze({ intent: "healAlly", tags: Object.freeze(["heal"]) })
    }),
    Object.freeze({
      id: "relay-power",
      name: "Relay Power",
      kind: "active",
      mpCost: 0,
      resolution: "relayPower",
      targeting: Object.freeze({ shape: "ally", range: 5, excludeSelf: true }),
      effect: Object.freeze({ type: "relayPower", hp: 2, mp: 2 }),
      description: "Lose 2 HP and 2 MP to restore 2 HP and 2 MP to an ally within 5.",
      implemented: true,
      ai: Object.freeze({ intent: "healAlly", tags: Object.freeze(["heal", "mp"]) })
    }),
    Object.freeze({
      id: "brothers-in-arms",
      name: "Brothers in Arms",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "teamCompositionStats",
        requiredTypes: Object.freeze(["fat-knight", "fat-cleric", "fat-bowman"]),
        stats: Object.freeze({ strength: 1 }),
        sourceDamage: Object.freeze({ magic: 1 })
      }),
      description: "Gain +1 magic damage and +1 STR if Fat Knight, Fat Cleric, and Fat Bowman are all on Fat Wizard's team.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "lazy-cast",
    name: "Lazy Cast",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      freeSelectedArts: Object.freeze(["zap", "surge"]),
      zapDamageBonus: 3,
      zapCritStatus: Object.freeze({ status: "stun", durationTurns: 1 }),
      zapSplashOnHit: Object.freeze({ amount: 2, critAmount: 3 }),
      surgeSplashOnHit: Object.freeze({ amount: 2 }),
      attackDamageType: "magic"
    }),
    description: "RAGE: basic attacks deal magic damage. Zap! and Surge cost no MP. Zap! gains +3 damage, splashes on hit, and stuns instead of silencing on crit. Surge splashes healing on hit.",
    implemented: true
  })
});
