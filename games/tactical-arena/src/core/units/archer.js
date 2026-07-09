export const ARCHER = Object.freeze({
  id: "archer",
  name: "Archer",
  glyph: "🏹",
  classType: "ranger",
  ai: Object.freeze({ threatValue: 12, role: "ranged", protect: true }),
  tempo: Object.freeze({ agility: 7 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 8,
    defense: 4,
    maxHp: 24,
    maxMp: 22
  }),
  passive: Object.freeze({
    id: "close-shot",
    name: "Close Shot",
    effect: Object.freeze({
      type: "proximityDamage",
      metric: "euclidean",
      bands: Object.freeze([
        Object.freeze({ maxDistance: 1, bonusDamage: 2 }),
        Object.freeze({ maxDistance: 2, bonusDamage: 1 })
      ])
    }),
    description: "Gain +2 damage at direct adjacency, or +1 damage within two tiles.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "volley-shot",
      name: "Volley Shot",
      kind: "active",
      mpCost: 5,
      targeting: Object.freeze({ shape: "cone", range: 5 }),
      damage: Object.freeze({ type: "true", amount: 2 }),
      description: "Select a range-5 cone and deal 2 true damage to every enemy in it. Close Shot bonuses apply by target.",
      implemented: true,
      ai: Object.freeze({ intent: "coneAoe", evHints: Object.freeze({ minTargets: 2 }) })
    }),
    Object.freeze({
      id: "poison-arrow",
      name: "Poison Arrow",
      kind: "active",
      mpCost: 4,
      effect: Object.freeze({ type: "status", status: "poison", chance: 0.6, duration: "permanent", turnStartDamage: 1 }),
      description: "Attack, then apply permanent poison on a 60% effect check.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "leg-shot",
      name: "Leg Shot",
      kind: "active",
      mpCost: 4,
      effect: Object.freeze({
        type: "status",
        status: "slow",
        chance: 0.6,
        durationTurns: 3,
        statModifiers: Object.freeze({ moveRange: -1 })
      }),
      description: "Attack, then apply -1 MOVE Slow for 3 turns on a 60% effect check.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "emblem",
      name: "Emblem",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["poison"]) }),
      description: "The Archer is immune to poison.",
      implemented: true
    })
  ]),
  rageArt: Object.freeze({
    id: "archer-rage",
    name: "RAGE Passive",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({ strength: 1, attackRange: 1 }) }),
    combat: Object.freeze({ neverMiss: true, criticalChance: 0.5 }),
    description: "At 5 HP or lower, gain +1 STR and +1 range, never miss, and gain a 50% critical chance.",
    implemented: true
  })
});
