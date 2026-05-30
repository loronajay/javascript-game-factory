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
      allowedTypes: ["holdToShoot", "speedBoost", "healthPack"],
      weights: {
        holdToShoot: 35,
        speedBoost: 35,
        healthPack: 30
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
      allowedTypes: ["splashShot", "speedBoost", "healthPack"],
      weights: {
        splashShot: 38,
        speedBoost: 42,
        healthPack: 20
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
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack"],
      weights: {
        holdToShoot: 24,
        splashShot: 30,
        speedBoost: 28,
        healthPack: 18
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
      allowedTypes: ["holdToShoot", "splashShot", "healthPack"],
      weights: {
        holdToShoot: 38,
        splashShot: 44,
        healthPack: 18
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
      allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack"],
      weights: {
        holdToShoot: 28,
        splashShot: 32,
        speedBoost: 24,
        healthPack: 16
      }
    },
    enemyRows: [
      { types: ["jammer", "grunt", "guard", "grunt", "jammer"] },
      { types: ["guard", "jammer", "bruiser", "jammer", "guard"] },
      { types: ["bruiser", "guard", "carrier", "guard", "bruiser"] },
      { types: ["carrier", "bruiser", "jammer", "bruiser", "carrier"] },
      { types: ["bruiser", "carrier", "guard", "carrier", "bruiser"] }
    ]
  }
];

export function getStage(index) {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
}

export function hasNextStage(index) {
  return index + 1 < STAGES.length;
}
