export const BIG_BROTHER = Object.freeze({
  id: "big-brother",
  name: "Big Brother",
  glyph: "\u{1F9BE}", // 🦾 mechanical arm
  classType: "tank",
  ai: Object.freeze({ threatValue: 15, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 2 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 3,
    strength: 2,
    defense: 8,
    maxHp: 30,
    maxMp: 5
  }),
  passive: Object.freeze({
    id: "super-magnet",
    name: "Super Magnet",
    effect: Object.freeze({
      type: "magneticAttack",
      attackDamageType: "true",
      basicAttackRayOnly: true,
      noCriticalDamage: true,
      critPull: Object.freeze({ status: "stun", durationTurns: 1 })
    }),
    description: "Basic attacks must target an enemy on one of the 8 straight rays. Big Brother attacks deal true damage and do not gain crit damage; basic crits pull the target adjacent and stun for 1 turn.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "force-tug",
      name: "Force Tug",
      kind: "active",
      mpCost: 5,
      accuracy: 0.96,
      resolution: "forceTug",
      targeting: Object.freeze({ range: 3 }),
      damageType: "true",
      effect: Object.freeze({ type: "status", status: "slow", chance: 0.7, durationTurns: 3 }),
      critEffect: Object.freeze({ type: "status", status: "stun", chance: 0.7, durationTurns: 1 }),
      description: "Range 3 attack for true damage, then roll to Slow. On a crit, roll to Stun for 1 turn instead. A missed attack stops the ability.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "force-push",
      name: "Force Push",
      kind: "active",
      mpCost: 5,
      resolution: "forcePush",
      selfCast: true,
      targeting: Object.freeze({ shape: "selfAura", radius: 1 }),
      damage: Object.freeze({ type: "true", amount: 2 }),
      description: "Push every adjacent unit, ally or enemy, 1 tile away. Blocked units take 2 true damage.",
      implemented: true,
      ai: Object.freeze({ intent: "statusAoe", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "polarity-shift",
      name: "Polarity Shift",
      kind: "active",
      mpCost: 5,
      resolution: "polarityShift",
      selfCast: true,
      description: "Toggle a global polarity shift: HP restores become MP restores, and MP restores become HP restores.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["setup"]) })
    }),
    Object.freeze({
      id: "recharge",
      name: "Recharge",
      kind: "active",
      mpCost: 0,
      resolution: "recharge",
      selfCast: true,
      restore: Object.freeze({ mp: 5, hpIfFull: 1, bypassPolarity: true }),
      nextTurnStatus: Object.freeze({ type: "empowered", duration: 2, statModifiers: Object.freeze({ moveRange: 1 }) }),
      description: "Restore 5 MP. If already at 5 MP, restore 1 HP instead and gain +1 MOVE on Big Brother's next turn. This restore ignores Polarity Shift.",
      implemented: true,
      ai: Object.freeze({ intent: "recharge", tags: Object.freeze(["sustain"]) })
    }),
    Object.freeze({
      id: "magnetic-field",
      name: "Magnetic Field",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "healingLockoutAura", radius: 1, excludeSelf: true }),
      description: "Units standing within 1 tile of Big Brother cannot be healed. Big Brother can still be healed.",
      implemented: true
    }),
    Object.freeze({
      id: "pissing-contest",
      name: "Pissing Contest",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "globalTypePresenceStats",
        requiredTypes: Object.freeze(["little-brother"]),
        stats: Object.freeze({ strength: 1 })
      }),
      description: "Gain +1 STR while any living Little Brother is in play, on either team.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "rogue-mech",
    name: "Rogue Mech",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 3, moveRange: 1 }),
      freeArts: true
    }),
    description: "RAGE: Gain +3 STR and +1 MOVE. Big Brother's ARTS cost no MP.",
    implemented: true
  })
});
