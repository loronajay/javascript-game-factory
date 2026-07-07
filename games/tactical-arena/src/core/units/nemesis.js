export const NEMESIS = Object.freeze({
  id: "nemesis",
  name: "Nemesis",
  glyph: "N",
  classType: "mage",
  ai: Object.freeze({ threatValue: 16, role: "caster", protect: true }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 5,
    strength: 7,
    defense: 2,
    maxHp: 25,
    maxMp: 45
  }),
  passive: Object.freeze({
    id: "realm-of-magic",
    name: "Realm of Magic",
    effect: Object.freeze({ type: "teamMagicSupport", magicDamage: 1, mpCostReduction: 1, minMpCost: 1 }),
    description: "While Nemesis lives, allied magic damage gains +1 and allied MP costs are reduced by 1, to a minimum of 1.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "dark-pulse",
      name: "Dark Pulse",
      kind: "active",
      mpCost: 5,
      resolution: "darkPulse",
      selfCast: true,
      damage: Object.freeze({ type: "magic", amount: 5 }),
      targeting: Object.freeze({ shape: "darkPulse", range: Infinity }),
      description: "Scatter dark balls in all 8 straight lines. Each ray hits the first unit contacted: enemies take 5 magic damage and allies heal 1 HP. Refund the MP cost if 4 targets are hit. When Nemesis drops below 20, 15, 10, and 5 HP, Dark Pulse auto-casts for no MP cost.",
      implemented: true,
      ai: Object.freeze({ intent: "lineBurst", evHints: Object.freeze({ minTargets: 2 }), tags: Object.freeze(["aoe", "heal"]) })
    }),
    Object.freeze({
      id: "realm-traversal",
      name: "Realm Traversal",
      kind: "active",
      mpCost: 0,
      resolution: "realmTraversal",
      selfCast: true,
      description: "Charge the next Nemesis turn: that turn may move and still cast Dark Pulse. Locks until the charged turn ends.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAlly", tags: Object.freeze(["selfBuff"]) })
    }),
    Object.freeze({
      id: "nullify",
      name: "Nullify",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["silence"]), damageTypes: Object.freeze(["magic"]) }),
      description: "Nemesis is immune to silence and magic damage.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "regenerate",
    name: "Regenerate",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "rageEntryRestore", hp: 5, mp: 15 }),
    description: "RAGE: Upon reaching rage status, instantly restore 5 HP and 15 MP.",
    implemented: true
  })
});
