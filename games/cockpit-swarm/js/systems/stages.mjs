export const STAGES = [
  {
    id: "stage_01_line_breaker",
    name: "LINE BREAKER",
    subtitle: "Low armor active-row pressure",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync"],
    behaviorWeights: {
      randomActiveFire: 68,
      threeLaneSync: 32
    },
    allowNextRowSupport: false,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.12,
      allowedTypes: ["holdToShoot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 28,
        speedBoost: 28,
        healthPack: 22,
        overcharge: 22
      }
    },
    enemyRows: [
      { type: "scout" },
      { types: ["scout", "grunt", "scout", "grunt", "scout"] },
      { type: "grunt" },
      { types: ["scout", "grunt", "guard", "grunt", "scout"] },
      { types: ["grunt", "scout", "grunt", "scout", "grunt"] }
    ]
  },

  {
    id: "stage_02_safe_lane",
    name: "SAFE LANE",
    subtitle: "Synchronized lane traps",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane"],
    behaviorWeights: {
      randomActiveFire: 36,
      threeLaneSync: 34,
      allButOneLane: 30
    },
    allowNextRowSupport: false,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.13,
      allowedTypes: ["splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        splashShot: 28,
        speedBoost: 30,
        healthPack: 16,
        overcharge: 26
      }
    },
    enemyRows: [
      { types: ["grunt", "scout", "grunt", "scout", "grunt"] },
      { types: ["grunt", "guard", "grunt", "guard", "grunt"] },
      { types: ["jammer", "grunt", "guard", "grunt", "jammer"] },
      { types: ["guard", "grunt", "jammer", "grunt", "guard"] },
      { types: ["bruiser", "grunt", "guard", "grunt", "bruiser"] }
    ]
  },

  {
    id: "stage_03_crossfire",
    name: "CROSSFIRE",
    subtitle: "Support fire from the next row",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 28,
      threeLaneSync: 25,
      allButOneLane: 20,
      nextRowSupportFire: 27
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 3,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.14,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 20,
        splashShot: 24,
        speedBoost: 22,
        healthPack: 14,
        overcharge: 20
      }
    },
    enemyRows: [
      { types: ["grunt", "jammer", "grunt", "jammer", "grunt"] },
      { types: ["jammer", "guard", "grunt", "guard", "jammer"] },
      { types: ["grunt", "bruiser", "jammer", "bruiser", "grunt"] },
      { types: ["guard", "jammer", "bruiser", "jammer", "guard"] },
      { types: ["bruiser", "guard", "carrier", "guard", "bruiser"] }
    ]
  },

  {
    id: "stage_04_armor_wall",
    name: "ARMOR WALL",
    subtitle: "High-health rows with sync pressure",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane"],
    behaviorWeights: {
      randomActiveFire: 26,
      threeLaneSync: 38,
      allButOneLane: 36
    },
    allowNextRowSupport: false,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.15,
      allowedTypes: ["holdToShoot", "splashShot", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 30,
        splashShot: 34,
        healthPack: 14,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["guard", "grunt", "guard", "grunt", "guard"] },
      { types: ["bruiser", "guard", "grunt", "guard", "bruiser"] },
      { types: ["guard", "bruiser", "jammer", "bruiser", "guard"] },
      { types: ["bruiser", "guard", "carrier", "guard", "bruiser"] },
      { types: ["carrier", "bruiser", "guard", "bruiser", "carrier"] }
    ]
  },

  {
    id: "stage_05_chaos_net",
    name: "CHAOS NET",
    subtitle: "Support fire plus heavy units",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 22,
      threeLaneSync: 28,
      allButOneLane: 25,
      nextRowSupportFire: 25
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 4,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.16,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 22,
        splashShot: 26,
        speedBoost: 18,
        healthPack: 12,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["jammer", "grunt", "guard", "grunt", "jammer"] },
      { types: ["guard", "jammer", "bruiser", "jammer", "guard"] },
      { types: ["bruiser", "guard", "carrier", "guard", "bruiser"] },
      { types: ["carrier", "bruiser", "jammer", "bruiser", "carrier"] },
      { types: ["bruiser", "carrier", "guard", "carrier", "bruiser"] }
    ]
  },

  // ── Act II — post-Boss 01 ─────────────────────────────────────────────────

  {
    id: "stage_06_dead_weight",
    name: "DEAD WEIGHT",
    subtitle: "First vanguard encounter — fewer shooters, harder to clear",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane"],
    behaviorWeights: {
      randomActiveFire: 46,
      threeLaneSync: 34,
      allButOneLane: 20
    },
    allowNextRowSupport: false,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.14,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 24,
        splashShot: 22,
        speedBoost: 20,
        healthPack: 12,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["scout",   "vanguard", "grunt",   "vanguard", "scout"]   },
      { types: ["grunt",   "guard",    "vanguard", "guard",    "grunt"]   },
      { types: ["vanguard","grunt",    "guard",    "grunt",    "vanguard"]},
      { types: ["guard",   "vanguard", "bruiser",  "vanguard", "guard"]   },
      { types: ["vanguard","guard",    "carrier",  "guard",    "vanguard"]}
    ]
  },

  {
    id: "stage_07_static_wall",
    name: "STATIC WALL",
    subtitle: "Dense jammer/bruiser pressure with back-row support",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 28,
      threeLaneSync: 26,
      allButOneLane: 24,
      nextRowSupportFire: 22
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 3,
    powerupRules: {
      enabled: true,
      maxActivePickups: 1,
      spawnOnKillChance: 0.14,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 26,
        splashShot: 26,
        speedBoost: 14,
        healthPack: 12,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["jammer",  "guard",   "jammer",  "guard",   "jammer"]  },
      { types: ["guard",   "bruiser", "jammer",  "bruiser", "guard"]   },
      { types: ["jammer",  "bruiser", "guard",   "bruiser", "jammer"]  },
      { types: ["bruiser", "jammer",  "carrier", "jammer",  "bruiser"] },
      { types: ["carrier", "bruiser", "carrier", "bruiser", "carrier"] }
    ]
  },

  {
    id: "stage_08_iron_veil",
    name: "IRON VEIL",
    subtitle: "Vanguards shield high-value targets; all behaviors active",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 24,
      threeLaneSync: 24,
      allButOneLane: 28,
      nextRowSupportFire: 24
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 4,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.15,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 26,
        splashShot: 26,
        speedBoost: 14,
        healthPack: 10,
        overcharge: 24
      }
    },
    enemyRows: [
      { types: ["guard",   "vanguard", "bruiser", "vanguard", "guard"]   },
      { types: ["vanguard","bruiser",  "guard",   "bruiser",  "vanguard"]},
      { types: ["bruiser", "vanguard", "carrier", "vanguard", "bruiser"] },
      { types: ["vanguard","carrier",  "bruiser", "carrier",  "vanguard"]},
      { types: ["carrier", "bruiser",  "vanguard","bruiser",  "carrier"] }
    ]
  },

  {
    id: "stage_09_titan_rising",
    name: "TITAN RISING",
    subtitle: "First titans — each takes 9 hits while everything else fires",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 22,
      threeLaneSync: 22,
      allButOneLane: 28,
      nextRowSupportFire: 28
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 4,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.16,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 28,
        splashShot: 26,
        speedBoost: 10,
        healthPack: 10,
        overcharge: 26
      }
    },
    enemyRows: [
      { types: ["bruiser", "guard",   "titan",   "guard",   "bruiser"] },
      { types: ["guard",   "carrier", "guard",   "carrier", "guard"]   },
      { types: ["carrier", "bruiser", "titan",   "bruiser", "carrier"] },
      { types: ["titan",   "carrier", "bruiser", "carrier", "titan"]   },
      { types: ["carrier", "titan",   "carrier", "titan",   "carrier"] }
    ]
  },

  {
    id: "stage_10_siege_break",
    name: "SIEGE BREAK",
    subtitle: "Maximum pressure — titans, carriers, and vanguards; back row fires immediately",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 18,
      threeLaneSync: 22,
      allButOneLane: 28,
      nextRowSupportFire: 32
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 5,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.17,
      allowedTypes: ["holdToShoot", "splashShot", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 32,
        splashShot: 32,
        healthPack: 12,
        overcharge: 24
      }
    },
    enemyRows: [
      { types: ["vanguard","bruiser",  "titan",   "bruiser",  "vanguard"]},
      { types: ["titan",   "vanguard", "carrier", "vanguard", "titan"]   },
      { types: ["carrier", "titan",    "bruiser", "titan",    "carrier"] },
      { types: ["titan",   "carrier",  "vanguard","carrier",  "titan"]   },
      { types: ["vanguard","titan",    "carrier", "titan",    "vanguard"]}
    ]
  },

  // ── Act III — post-Boss 02 ────────────────────────────────────────────────

  {
    id: "stage_11_ghost_net",
    name: "GHOST NET",
    subtitle: "Phantoms debut — shooting the phased form curses the cockpit",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire"],
    behaviorWeights: {
      randomActiveFire: 30,
      threeLaneSync: 28,
      allButOneLane: 24,
      nextRowSupportFire: 18
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 3,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.15,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 22,
        splashShot: 22,
        speedBoost: 16,
        healthPack: 18,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["phantom", "grunt",   "phantom",  "grunt",   "phantom"] },
      { types: ["grunt",   "phantom", "guard",    "phantom", "grunt"]   },
      { types: ["phantom", "guard",   "jammer",   "guard",   "phantom"] },
      { types: ["guard",   "jammer",  "bruiser",  "jammer",  "guard"]   },
      { types: ["jammer",  "bruiser", "carrier",  "bruiser", "jammer"]  }
    ]
  },

  {
    id: "stage_12_bloom_field",
    name: "BLOOM FIELD",
    subtitle: "Casters fire slow shells that split into three fragments on approach",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "pincerFire"],
    behaviorWeights: {
      randomActiveFire: 26,
      threeLaneSync: 26,
      allButOneLane: 24,
      pincerFire: 24
    },
    allowNextRowSupport: false,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.15,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 24,
        splashShot: 26,
        speedBoost: 16,
        healthPack: 12,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["caster",  "guard",   "caster",   "guard",   "caster"]  },
      { types: ["guard",   "caster",  "bruiser",  "caster",  "guard"]   },
      { types: ["bruiser", "guard",   "caster",   "guard",   "bruiser"] },
      { types: ["caster",  "bruiser", "carrier",  "bruiser", "caster"]  },
      { types: ["carrier", "caster",  "bruiser",  "caster",  "carrier"] }
    ]
  },

  {
    id: "stage_13_tracer_hunt",
    name: "TRACER HUNT",
    subtitle: "Homing bullets track your position — keep moving",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "pincerFire", "convergeFire"],
    behaviorWeights: {
      randomActiveFire: 20,
      threeLaneSync: 20,
      allButOneLane: 20,
      pincerFire: 22,
      convergeFire: 18
    },
    allowNextRowSupport: false,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.16,
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 20,
        splashShot: 24,
        speedBoost: 22,
        healthPack: 12,
        overcharge: 22
      }
    },
    enemyRows: [
      { types: ["tracer",  "guard",   "tracer",   "guard",   "tracer"]  },
      { types: ["guard",   "tracer",  "caster",   "tracer",  "guard"]   },
      { types: ["tracer",  "bruiser", "tracer",   "bruiser", "tracer"]  },
      { types: ["bruiser", "tracer",  "carrier",  "tracer",  "bruiser"] },
      { types: ["carrier", "bruiser", "tracer",   "bruiser", "carrier"] }
    ]
  },

  {
    id: "stage_14_convergence",
    name: "CONVERGENCE",
    subtitle: "Regenerators anchor the back rows — prioritise or watch them refill",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire", "pincerFire", "convergeFire"],
    behaviorWeights: {
      randomActiveFire: 16,
      threeLaneSync: 18,
      allButOneLane: 18,
      nextRowSupportFire: 18,
      pincerFire: 16,
      convergeFire: 14
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 4,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.16,
      allowedTypes: ["holdToShoot", "splashShot", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 26,
        splashShot: 28,
        healthPack: 22,
        overcharge: 24
      }
    },
    enemyRows: [
      { types: ["phantom",     "tracer",  "caster",  "tracer",  "phantom"]     },
      { types: ["tracer",      "phantom", "bruiser", "phantom", "tracer"]      },
      { types: ["caster",      "bruiser", "phantom", "bruiser", "caster"]      },
      { types: ["regenerator", "caster",  "titan",   "caster",  "regenerator"] },
      { types: ["titan",  "regenerator",  "carrier", "regenerator", "titan"]   }
    ]
  },

  {
    id: "stage_15_voidwatch",
    name: "VOIDWATCH",
    subtitle: "The Overseer watches from the back — its laser fires between waves",
    allowedBehaviors: ["randomActiveFire", "threeLaneSync", "allButOneLane", "nextRowSupportFire", "pincerFire", "convergeFire"],
    behaviorWeights: {
      randomActiveFire: 14,
      threeLaneSync: 16,
      allButOneLane: 18,
      nextRowSupportFire: 20,
      pincerFire: 16,
      convergeFire: 16
    },
    allowNextRowSupport: true,
    nextRowSupportStartsWhenActiveCountAtOrBelow: 5,
    powerupRules: {
      enabled: true,
      maxActivePickups: 2,
      spawnOnKillChance: 0.17,
      allowedTypes: ["holdToShoot", "splashShot", "healthPack", "overcharge"],
      weights: {
        holdToShoot: 28,
        splashShot: 30,
        healthPack: 16,
        overcharge: 26
      }
    },
    enemyRows: [
      { types: ["phantom",  "tracer",   "caster",       "tracer",   "phantom"]  },
      { types: ["tracer",   "caster",   "phantom",      "caster",   "tracer"]   },
      { types: ["caster",   "phantom",  "titan",        "phantom",  "caster"]   },
      { types: ["titan",    "caster",   "regenerator",  "caster",   "titan"]    },
      { types: ["titan",    "phantom",  "overseer",     "phantom",  "titan"]    }
    ]
  }
];

export function getStage(index) {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}

export function hasNextStage(index) {
  return index + 1 < STAGES.length;
}
