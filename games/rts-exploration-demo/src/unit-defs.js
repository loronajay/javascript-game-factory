export const UNIT_DEFS = Object.freeze({
  scout: Object.freeze({
    id: 'scout',
    name: 'Scout',
    role: 'recon',

    body: Object.freeze({
      radius: 9,
      selectionRadius: 16,
    }),

    vitals: Object.freeze({
      maxHp: 35,
    }),

    movement: Object.freeze({
      moveSpeed: 150,
      turnSpeed: 12,
      acceleration: 900,
      stopDistance: 4,
    }),

    vision: Object.freeze({
      sightRange: 288,
      revealRange: 288,
    }),

    combat: Object.freeze({
      canAttack: false,
      attackDelivery: 'none',
      damageType: 'none',
      targetMode: 'none',

      attackRange: 0,
      acquireRange: 0,
      leashRange: 0,

      baseDamage: 0,
      attackCooldown: 0,
      windupTime: 0,
      recoveryTime: 0,
    }),

    defenses: Object.freeze({
      armor: 0,
      magicResist: 0,
    }),

    tags: Object.freeze(['organic', 'light', 'scout', 'recon']),
  }),

  grunt: Object.freeze({
    id: 'grunt',
    name: 'Grunt',
    role: 'basic_melee',

    body: Object.freeze({
      radius: 10,
      selectionRadius: 17,
    }),

    vitals: Object.freeze({
      maxHp: 70,
    }),

    movement: Object.freeze({
      moveSpeed: 116,
      turnSpeed: 8,
      acceleration: 700,
      stopDistance: 5,
    }),

    vision: Object.freeze({
      sightRange: 160,
      revealRange: 160,
    }),

    combat: Object.freeze({
      canAttack: true,
      attackDelivery: 'melee',
      damageType: 'physical',
      targetMode: 'single',

      attackRange: 34,
      acquireRange: 140,
      leashRange: 220,

      baseDamage: 8,
      attackCooldown: 0.85,
      windupTime: 0.18,
      recoveryTime: 0.12,
    }),

    defenses: Object.freeze({
      armor: 1,
      magicResist: 0,
    }),

    tags: Object.freeze(['organic', 'light', 'combat', 'melee', 'physical']),
  }),

  drifter: Object.freeze({
    id: 'drifter',
    name: 'Drifter',
    role: 'wandering_neutral',

    body: Object.freeze({
      radius: 19,
      selectionRadius: 27,
    }),

    vitals: Object.freeze({
      maxHp: 120,
    }),

    movement: Object.freeze({
      moveSpeed: 65,
      turnSpeed: 6,
      acceleration: 500,
      stopDistance: 5,
    }),

    vision: Object.freeze({
      sightRange: 120,
      revealRange: 0,
    }),

    combat: Object.freeze({
      canAttack: true,
      attackDelivery: 'melee',
      damageType: 'physical',
      targetMode: 'single',

      attackRange: 32,
      acquireRange: 90,
      leashRange: 150,

      baseDamage: 5,
      attackCooldown: 1.1,
      windupTime: 0.22,
      recoveryTime: 0.18,
    }),

    defenses: Object.freeze({
      armor: 0,
      magicResist: 0,
    }),

    onDeathRewards: Object.freeze([]),
    tags: Object.freeze(['neutral', 'organic', 'creature', 'melee', 'drifter']),
  }),
});

export function getUnitDef(type) {
  const def = UNIT_DEFS[type];
  if (!def) throw new Error(`Unknown unit type: ${type}`);
  return def;
}
