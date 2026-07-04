export const MYSTIC = Object.freeze({
  id: "mystic",
  name: "Mystic",
  glyph: "✨",
  classType: "support",
  ai: Object.freeze({ threatValue: 14, role: "support", protect: true }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 5,
    defense: 3,
    maxHp: 23,
    maxMp: 38
  }),
  passive: Object.freeze({
    id: "anointed",
    name: "Anointed",
    effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["silence"]) }),
    description: "The Mystic is immune to silence.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "pray",
      name: "Pray",
      kind: "active",
      mpCost: 4,
      targeting: Object.freeze({ shape: "selfAura", radius: 3 }),
      effect: Object.freeze({ type: "healAllies", amount: 3, radius: 3 }),
      description: "Heal the Mystic and nearby allies within 3 tiles for 3 HP.",
      implemented: true,
      ai: Object.freeze({ intent: "healAllies" })
    }),
    Object.freeze({
      id: "wish",
      name: "Wish",
      kind: "active",
      mpCost: 2,
      targeting: Object.freeze({ shape: "globalAllies" }),
      effect: Object.freeze({ type: "healAllies", amount: 1, global: true }),
      description: "Heal every living ally for 1 HP, regardless of distance.",
      implemented: true,
      ai: Object.freeze({ intent: "healAllies" })
    }),
    Object.freeze({
      id: "silence",
      name: "Silence",
      kind: "active",
      mpCost: 3,
      resolution: "statusCast",
      effect: Object.freeze({ type: "status", status: "silence", chance: 0.7, durationTurns: 1 }),
      description: "Cast silence at attack range with a 70% effect check. Mystics are immune.",
      implemented: true,
      ai: Object.freeze({ intent: "statusCast", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "guardian",
      name: "Guardian",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "teamAura", stats: Object.freeze({ defense: 1 }) }),
      description: "While the Mystic lives, friendly units gain +1 DEF.",
      implemented: true
    })
  ]),
  rageArt: Object.freeze({
    id: "mystic-rage",
    name: "RAGE Passive",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({ moveRange: 6 }), defending: true }),
    description: "At 5 HP or lower, gain +6 MOVE and passively halve incoming physical and magic damage.",
    implemented: true
  })
});
