export const PALADIN = Object.freeze({
  id: "paladin",
  name: "Paladin",
  ai: Object.freeze({ threatValue: 12, role: "bruiser", protect: false }),
  glyph: "🛡️",
  classType: "melee",
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 5,
    maxHp: 26,
    maxMp: 24
  }),
  passive: Object.freeze({
    id: "hand-of-life",
    name: "Hand of Life",
    effect: Object.freeze({
      type: "physicalDamageHealAura",
      radius: 2,
      fraction: 0.5,
      rounding: "floor"
    }),
    description: "When the Paladin deals physical damage, allies within 2 tiles heal for half the damage dealt, rounded down.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "lightseeker",
      name: "Lightseeker",
      kind: "active",
      mpCost: 4,
      selfCast: true,
      bonusActionGroup: "seeker",
      effect: Object.freeze({ type: "tilePulse", affinity: "light", amount: 1, range: 5 }),
      description: "Deal 1 true damage to every enemy within 5 tiles standing on a light tile. Does not spend the Paladin's action.",
      implemented: true,
      ai: Object.freeze({ intent: "tilePulse", tags: Object.freeze(["bonus"]) })
    }),
    Object.freeze({
      id: "chosen",
      name: "Chosen",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "immunity",
        statuses: Object.freeze(["poison", "slow", "blind", "silence", "stun"])
      }),
      description: "The Paladin is immune to poison, slow, blind, silence, and stun.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "heavens-realm",
    name: "Heaven's Realm",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 2, attackRange: 1 }),
      tileStrikeBonus: Object.freeze({ affinity: "light", amount: 2 })
    }),
    description: "At 5 HP or lower, gain +2 STR and +1 range. Physical strikes deal +2 damage if the Paladin and target are both on light tiles.",
    implemented: true
  }),
  rageArt: Object.freeze({
    id: "darkseeker",
    name: "Darkseeker",
    kind: "active",
    mpCost: 4,
    selfCast: true,
    rageLocked: true,
    bonusActionGroup: "seeker",
    effect: Object.freeze({ type: "tilePulse", affinity: "dark", amount: 2, global: true }),
    description: "While raging, deal 2 true damage to every enemy on a dark tile anywhere on the board. Does not spend the Paladin's action.",
    implemented: true,
    ai: Object.freeze({ intent: "tilePulse", tags: Object.freeze(["bonus", "rageOnly"]) })
  })
});
