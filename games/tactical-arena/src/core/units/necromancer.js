// Necromancer — a midline debuffer-summoner caster. Recovered from the legacy
// TurboWarp project (HP 23 / Move 3 / Range 5 / STR 6 / DEF 3 / MP 36; Deathly
// Aura + Dead Zone passives; Summon Ghoul / Dark Bomb / Wither arts). The aura
// (Chebyshev radius 3) and the ghoul are confirmed canon from the .sb3; the
// per-art MP/damage numbers below are rebuild balance choices, since the legacy
// combat-roll model is itself a rebuild override (see LEGACY_TURBOWARP_REFERENCE).
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md):
//   • `enemyAura` — a debuff aura that lowers nearby ENEMIES' stats, folded by
//     getEffectiveStats. A raging Necromancer amplifies it via the nested
//     `effect.enemyAura` block on its ragePassive. The Ghoul carries the same
//     base aura, so summoning extends the Necromancer's reach.
//   • `teamDamageReduction` — Dead Zone: while the host lives, its team takes
//     less damage of a type (magic), applied in the magic-damage paths.
//   • `summonUnit` — Summon Ghoul places a real board piece that takes no turns.
export const NECROMANCER = Object.freeze({
  id: "necromancer",
  name: "Necromancer",
  ai: Object.freeze({ threatValue: 13, role: "controller", protect: true }),
  tempo: Object.freeze({ agility: 5 }),
  glyph: "☠",
  classType: "mage",
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 5,
    strength: 6,
    defense: 3,
    maxHp: 23,
    maxMp: 36
  }),
  passive: Object.freeze({
    id: "deathly-aura",
    name: "Deathly Aura",
    effect: Object.freeze({ type: "enemyAura", radius: 3, stats: Object.freeze({ defense: -1 }) }),
    description: "Enemies within 3 tiles of the Necromancer suffer -1 DEF.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "wither",
      name: "Wither",
      kind: "active",
      mpCost: 4,
      damageType: "magic",
      effect: Object.freeze({
        type: "status",
        status: "slow",
        chance: 0.7,
        durationTurns: 3,
        statModifiers: Object.freeze({ moveRange: -1 })
      }),
      description: "Curse a target for magic damage, then apply -1 MOVE Slow for 3 turns on a 70% check. Paladins are immune.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "dark-bomb",
      name: "Dark Bomb",
      kind: "active",
      mpCost: 6,
      selfCast: true,
      targeting: Object.freeze({ shape: "nukeAura", radius: 3, matchAuraRadius: true }),
      damage: Object.freeze({ type: "magic", amount: 5 }),
      description: "Detonate dark energy, dealing 5 magic damage to every enemy within the Necromancer's Deathly Aura.",
      implemented: true,
      ai: Object.freeze({ intent: "selfBlast", evHints: Object.freeze({ minTargets: 2 }) })
    }),
    Object.freeze({
      id: "summon-ghoul",
      name: "Summon Ghoul",
      kind: "active",
      mpCost: 8,
      resolution: "summon",
      targeting: Object.freeze({ shape: "placement", radius: 2 }),
      summon: Object.freeze({ type: "ghoul", maxActive: 2 }),
      description: "Raise a Ghoul on an empty tile within 2 tiles. It has 10 HP, takes no turns, and carries the Deathly Aura. Up to two Ghouls at a time.",
      implemented: true,
      ai: Object.freeze({ intent: "summon", evHints: Object.freeze({ placeNear: "enemy" }), tags: Object.freeze(["zone"]) })
    }),
    Object.freeze({
      id: "dead-zone",
      name: "Dead Zone",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "teamDamageReduction", damageType: "magic", amount: 1 }),
      description: "While the Necromancer lives, friendly units take 1 less magic damage from all sources.",
      implemented: true
    })
  ]),
  // RAGE: self +1 MOVE (statModifiers, folded by getEffectiveStats) plus an
  // amplified Deathly Aura (the nested enemyAura block, folded by enemyAuraStats
  // only while the source is raging). Total aura while raging: -2 DEF, -1 STR,
  // -1 MOVE to enemies in range. RAGE also widens the aura's reach by 1 (radius
  // 3 -> 4); that +1 is applied centrally by `auraRadius` in unitCatalog.js and
  // it extends any Ghoul this Necromancer raised, not just the Necromancer itself
  // — so the `radius: 3` below is the base, not the raging value.
  ragePassive: Object.freeze({
    id: "necromancer-rage",
    name: "Grave Wrath",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ moveRange: 1 }),
      enemyAura: Object.freeze({ radius: 3, stats: Object.freeze({ defense: -1, strength: -1, moveRange: -1 }) })
    }),
    description: "At 5 HP or lower, gain +1 MOVE and the Deathly Aura reaches 1 tile further (radius 4) while also sapping enemies' STR and MOVE by 1 (total -2 DEF, -1 STR, -1 MOVE within 4 tiles). The wider reach extends to your Ghoul too.",
    implemented: true
  })
});
