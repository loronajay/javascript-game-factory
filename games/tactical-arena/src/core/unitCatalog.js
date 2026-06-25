// Unit definitions are immutable game data. Battle state only stores a unit's
// type and changing runtime values, keeping balance changes separate from rules.
export const UNIT_TYPES = Object.freeze({
  swordsman: Object.freeze({
    id: "swordsman",
    name: "Swordsman",
    glyph: "⚔",
    stats: Object.freeze({
      moveRange: 3,
      attackRange: 1,
      strength: 10,
      defense: 5,
      maxHp: 25,
      maxMp: 20
    }),
    // The passive and RAGE design are intentionally represented now, even
    // though their specific Swordsman rules have not been scoped yet.
    passive: Object.freeze({
      id: "last-stand",
      name: "Last Stand",
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
        implemented: true
      }),
      Object.freeze({
        id: "moonstrike",
        name: "Moonstrike",
        kind: "active",
        mpCost: 5,
        effect: Object.freeze({ type: "status", status: "blind", chance: 0.7, durationTurns: 1 }),
        immuneTypes: Object.freeze(["paladin"]),
        description: "Attack with a 70% chance to blind the target.",
        implemented: true
      }),
      Object.freeze({
        id: "mage-killer",
        name: "Mage Killer",
        kind: "active",
        mpCost: 5,
        effect: Object.freeze({ type: "status", status: "silence", chance: 0.7, durationTurns: 1 }),
        immuneTypes: Object.freeze(["mystic", "paladin"]),
        description: "Attack with a 70% chance to silence the target.",
        implemented: true
      }),
      Object.freeze({
        id: "life-sap",
        name: "Life Sap",
        kind: "active",
        mpCost: 5,
        effect: Object.freeze({ type: "heal", chance: 0.7, amount: "halfDamageDealtRounded" }),
        description: "Attack with a 70% chance to restore half the damage dealt, rounded.",
        implemented: true
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
    }),
  }),
  archer: Object.freeze({
    id: "archer",
    name: "Archer",
    glyph: "🏹",
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
        description: "Select a range-5 cone and deal 2 true damage to every enemy in it.",
        implemented: true
      }),
      Object.freeze({
        id: "poison-arrow",
        name: "Poison Arrow",
        kind: "active",
        mpCost: 4,
        effect: Object.freeze({ type: "status", status: "poison", chance: 0.6, duration: "permanent", turnStartDamage: 1 }),
        immuneTypes: Object.freeze(["archer", "paladin"]),
        description: "Attack, then apply permanent poison on a 60% effect check. Archer and Paladin are immune.",
        implemented: true
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
        immuneTypes: Object.freeze(["paladin"]),
        description: "Attack, then apply -1 MOVE Slow for 3 turns on a 60% effect check. Paladin is immune.",
        implemented: true
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
  })
});

export function getUnitType(type) {
  const definition = UNIT_TYPES[type];
  if (!definition) throw new Error(`Unknown unit type: ${type}`);
  return definition;
}

export function getArt(type, artId) {
  return getUnitType(type).arts.find((art) => art.id === artId) ?? null;
}

export function isRaging(unit) {
  return unit.hp > 0 && unit.hp <= 5;
}

// Runtime modifiers are deliberately numeric and additive. Status effects,
// map auras, and future ARTS can feed this same seam without teaching every
// ability about one another. Per-unit passives apply after external modifiers.
export function getEffectiveStats(unit) {
  const stats = { ...getUnitType(unit.type).stats };
  for (const [name, value] of Object.entries(unit.statModifiers ?? {})) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }

  if (unit.hp > 0 && unit.hp < 3) stats.strength += 3;
  if (isRaging(unit)) {
    for (const [name, value] of Object.entries(getUnitType(unit.type).rageArt.effect?.stats ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  for (const status of unit.statuses ?? []) {
    for (const [name, value] of Object.entries(status.statModifiers ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  stats.moveRange = Math.max(1, stats.moveRange);
  return stats;
}

// This is a presentation/query helper, not permission to activate an ART.
// The reducer still checks action economy, MP, and each ART's own rules.
export function getAvailableArts(unit) {
  const definition = getUnitType(unit.type);
  return isRaging(unit)
    ? [...definition.arts, definition.rageArt]
    : [...definition.arts];
}
