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
      maxHp: 26,
      maxMp: 15
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
        effect: Object.freeze({ type: "status", status: "blind", chance: 0.7, durationTurns: null }),
        description: "Attack with a 70% chance to blind the target.",
        implemented: false
      }),
      Object.freeze({
        id: "mage-killer",
        name: "Mage Killer",
        kind: "active",
        mpCost: 5,
        effect: Object.freeze({ type: "status", status: "silence", chance: 0.7, durationTurns: null }),
        description: "Attack with a 70% chance to silence the target.",
        implemented: false
      }),
      Object.freeze({
        id: "life-sap",
        name: "Life Sap",
        kind: "active",
        mpCost: 5,
        effect: Object.freeze({ type: "heal", chance: 0.7, amount: "damageDealt" }),
        description: "Attack with a 70% chance to restore HP based on damage dealt.",
        implemented: false
      })
    ]),
    rageArt: Object.freeze({
      id: "swordsman-rage",
      name: "Quick",
      kind: "passive",
      mpCost: 0,
      description: "At 5 HP or lower, gain +3 MOVE and +1 STR.",
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
    stats.moveRange += 3;
    stats.strength += 1;
  }
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
