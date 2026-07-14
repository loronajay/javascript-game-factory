export const MONK = Object.freeze({
  id: "monk",
  name: "Monk",
  glyph: "🥋",
  classType: "melee",
  ai: Object.freeze({ threatValue: 13, role: "skirmisher", protect: false }),
  tempo: Object.freeze({ agility: 7 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 1,
    strength: 9,
    defense: 6,
    maxHp: 26,
    maxMp: 25
  }),
  passive: Object.freeze({
    id: "shadow-step",
    name: "Shadow Step",
    effect: Object.freeze({ type: "movementShape", shape: "radius", moveAndUseArts: true }),
    description: "The Monk can move diagonally (movement uses a radius instead of orthogonal pathing) and may move and use an ART in the same activation.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "front-kick",
      name: "Front Kick",
      kind: "active",
      mpCost: 4,
      accuracy: 0.93,
      resolution: "frontKick",
      targeting: Object.freeze({ range: 1 }),
      damage: Object.freeze({ type: "physical", amount: 10, scaleStat: "strength", baseStat: 9 }),
      knockback: Object.freeze({ distance: 3, criticalOnly: true }),
      description: "Kick an enemy within 1 for 10 physical damage, scaling with STR. On critical hit, knock the target back up to 3 straight-line spaces.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "protect",
      name: "Protect",
      kind: "active",
      mpCost: 5,
      resolution: "protectAlly",
      targeting: Object.freeze({ shape: "protectAlly", range: 3 }),
      description: "Move to the near side of an ally within 3 and Defend. The ally also enters Defend, even if they already acted.",
      implemented: true,
      ai: Object.freeze({ intent: "protectAlly", tags: Object.freeze(["defense"]) })
    }),
    Object.freeze({
      id: "heightened-sense",
      name: "Heightened Sense",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "immunity",
        statuses: Object.freeze(["blind"]),
        missingHpStat: Object.freeze({ stat: "strength", per: 5, amount: 1 })
      }),
      description: "The Monk is immune to Blind and gains +1 STR for every 5 HP missing.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "nirvana",
    name: "Nirvana",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ moveRange: 2 }),
      artRangeBonus: 1,
      frontKickAlwaysKnockback: true,
      protectHeal: 2
    }),
    description: "At 5 HP or lower: +2 MOVE, Monk ARTS gain +1 range, Front Kick always knocks back, and Protect restores 2 HP to the ally.",
    implemented: true
  })
});
