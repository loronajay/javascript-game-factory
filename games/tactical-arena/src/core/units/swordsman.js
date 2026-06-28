export const SWORDSMAN = Object.freeze({
  id: "swordsman",
  name: "Swordsman",
  glyph: "⚔",
  ai: Object.freeze({ threatValue: 10, role: "bruiser", protect: false }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 5,
    maxHp: 25,
    maxMp: 20
  }),
  passive: Object.freeze({
    id: "last-stand",
    name: "Last Stand",
    effect: Object.freeze({ type: "thresholdBoost", hpBelow: 3, stats: Object.freeze({ strength: 3 }) }),
    description: "Below 3 HP, gain +3 STR.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "footwork",
      name: "Footwork",
      kind: "active",
      mpCost: 4,
      extraMove: 3,
      description: "Walk your current MOVE + 3 as unique tiles, passing through enemies for 2 true damage. End on empty ground.",
      implemented: true,
      ai: Object.freeze({ intent: "rush", tags: Object.freeze(["setup"]) })
    }),
    Object.freeze({
      id: "moonstrike",
      name: "Moonstrike",
      kind: "active",
      mpCost: 5,
      effect: Object.freeze({ type: "status", status: "blind", chance: 0.7, durationTurns: 1 }),
      description: "Attack with a 70% chance to blind the target.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "mage-killer",
      name: "Mage Killer",
      kind: "active",
      mpCost: 5,
      effect: Object.freeze({ type: "status", status: "silence", chance: 0.7, durationTurns: 1 }),
      description: "Attack with a 70% chance to silence the target.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "life-sap",
      name: "Life Sap",
      kind: "active",
      mpCost: 5,
      effect: Object.freeze({ type: "heal", chance: 0.7, amount: "halfDamageDealtRounded" }),
      description: "Attack with a 70% chance to restore half the damage dealt, rounded.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["sustain"]) })
    })
  ]),
  rageArt: Object.freeze({
    id: "swordsman-rage",
    name: "Quick",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({ moveRange: 3, strength: 1 }) }),
    description: "At 5 HP or lower, gain +3 MOVE and +1 STR.",
    implemented: true
  })
});
