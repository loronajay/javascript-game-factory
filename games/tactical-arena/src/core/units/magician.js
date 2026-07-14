export const MAGICIAN = Object.freeze({
  id: "magician",
  name: "Magician",
  ai: Object.freeze({ threatValue: 13, role: "caster", protect: true }),
  tempo: Object.freeze({ agility: 5 }),
  glyph: "✦",
  classType: "mage",
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 6,
    defense: 3,
    maxHp: 23,
    maxMp: 40
  }),
  // Magic Pipe: every 3 activations the Magician completes without using Spark or
  // Banish, restore 10 MP. Using either spell resets the counter.
  passive: Object.freeze({
    id: "magic-pipe",
    name: "Magic Pipe",
    effect: Object.freeze({ type: "mpRegen", interval: 3, amount: 10 }),
    description: "Every 3 activations completed without using Spark or Banish, restore 10 MP.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "spark",
      name: "Spark",
      kind: "active",
      mpCost: 4,
      accuracy: 0.93,
      damageType: "magic",
      description: "Hurl a bolt of magic at a target in range. Deals magic damage, ignoring DEF.",
      implemented: true,
      ai: Object.freeze({ intent: "strike" })
    }),
    Object.freeze({
      id: "flee",
      name: "Flee",
      kind: "active",
      mpCost: 5,
      resolution: "flee",
      targeting: Object.freeze({ shape: "flee" }),
      description: "Teleport to any empty tile within Move+2 tiles. Spends this unit's activation.",
      implemented: true,
      ai: Object.freeze({ intent: "reposition", evHints: Object.freeze({ purpose: "escape" }), tags: Object.freeze(["escape"]) })
    }),
    Object.freeze({
      id: "banish",
      name: "Banish",
      kind: "active",
      mpCost: 8,
      accuracy: 0.93,
      damageType: "magic",
      effect: Object.freeze({ type: "status", status: "silence", chance: 0.75, durationTurns: 1 }),
      description: "Strike a target with arcane force for magic damage, then silence them for 1 turn on a 75% check.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    // Nuke is only available while raging (rageLocked). Deals heavy magic damage
    // to all enemies within 3 tiles centered on the Magician.
    Object.freeze({
      id: "nuke",
      name: "Nuke",
      kind: "active",
      mpCost: 16,
      rageLocked: true,
      selfCast: true,
      targeting: Object.freeze({ shape: "nukeAura", radius: 3 }),
      damage: Object.freeze({ type: "magic", amount: 12 }),
      description: "RAGE: Detonate a burst of arcane energy, dealing 12 magic damage to all enemies within 3 tiles.",
      implemented: true,
      ai: Object.freeze({ intent: "selfBlast", evHints: Object.freeze({ minTargets: 2 }), tags: Object.freeze(["finisher", "rageOnly"]) })
    })
  ]),
  rageArt: Object.freeze({
    id: "magician-rage",
    name: "RAGE",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ attackDamageType: "magic" }),
    description: "At 5 HP or lower, basic attacks deal magic damage and the Nuke ART becomes available.",
    implemented: true
  })
});
