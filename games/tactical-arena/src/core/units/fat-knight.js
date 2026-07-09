export const FAT_KNIGHT = Object.freeze({
  id: "fat-knight",
  name: "Fat Knight",
  glyph: "♞",
  classType: "melee",
  ai: Object.freeze({ threatValue: 14, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 3 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 1,
    strength: 10,
    defense: 6,
    maxHp: 30,
    maxMp: 20
  }),
  passive: Object.freeze({
    id: "battle-trauma",
    name: "Battle Trauma",
    effect: Object.freeze({
      type: "magicTrauma",
      magicVulnerability: 1,
      ignoreCriticalDamage: true,
      status: Object.freeze({ type: "battle-trauma", duration: 1, statModifiers: Object.freeze({ strength: 1 }) })
    }),
    description: "Magic damage deals +1 to Fat Knight, but critical hits do not deal increased damage to him. Whenever he takes magic damage, he gains +1 STR for 1 turn (does not stack).",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "stumble",
      name: "Stumble",
      kind: "active",
      mpCost: 3,
      resolution: "rushPath",
      targeting: Object.freeze({ shape: "rushPath" }),
      extraMove: 2,
      contactDamage: 3,
      rageExtraMove: 3,
      description: "Walk your current MOVE + 2 as unique tiles, passing through enemies for 3 true damage. End on empty ground. During RAGE, range increases by 3 and Trample damage also applies.",
      implemented: true,
      ai: Object.freeze({ intent: "rush", tags: Object.freeze(["setup"]) })
    }),
    Object.freeze({
      id: "fart",
      name: "Fart",
      kind: "active",
      mpCost: 2,
      resolution: "shoveAura",
      selfCast: true,
      targeting: Object.freeze({ shape: "selfAura", radius: 1 }),
      damage: Object.freeze({ type: "true", amount: 3 }),
      description: "Push every enemy within 1 tile one orthogonal space away. If blocked by a unit, wall, or arena edge, that enemy takes 3 true damage instead.",
      implemented: true,
      ai: Object.freeze({ intent: "statusAoe", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "thick-boi",
      name: "Thick Boi",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "statusResistOnce" }),
      description: "Once per battle, resist a status effect that would hit Fat Knight.",
      implemented: true
    }),
    Object.freeze({
      id: "brothers-in-arms",
      name: "Brothers in Arms",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "teamCompositionStats",
        requiredTypes: Object.freeze(["fat-wizard", "fat-cleric", "fat-bowman"]),
        stats: Object.freeze({ strength: 1, moveRange: 1 })
      }),
      description: "Gain +1 STR and +1 MOVE if Fat Wizard, Fat Cleric, and Fat Bowman are all on Fat Knight's team.",
      implemented: true
    })
  ]),
  rageArt: Object.freeze({
    id: "trample",
    name: "Trample",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ defense: 2, moveRange: 1 }),
      trampleDamage: 3
    }),
    description: "At 5 HP or lower, gain +2 DEF and +1 MOVE. Fat Knight may move through enemies if he lands on an empty tile; each enemy crossed takes 3 true damage. Stumble gains +3 range and also deals Trample damage.",
    implemented: true
  })
});
