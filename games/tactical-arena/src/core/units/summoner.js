export const SUMMONER = Object.freeze({
  id: "summoner",
  name: "Summoner",
  ai: Object.freeze({ threatValue: 15, role: "caster", protect: true }),
  tempo: Object.freeze({ agility: 5 }),
  glyph: "✥",
  classType: "mage",
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 6,
    defense: 4,
    maxHp: 23,
    maxMp: 100
  }),
  passive: Object.freeze({
    id: "soul-shuffle",
    name: "Soul Shuffle",
    effect: Object.freeze({ type: "soulShuffle", choices: 5, excludeSelf: true, excludeLastGhost: true, redirectGhostSelfRestore: true }),
    description: "Summon and Beckon offer five shuffled non-Summoner units, excluding the last ghost used. A ghost's self-restoration is redirected to the Summoner.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "summon",
      name: "Summon",
      kind: "active",
      mpCost: 5,
      resolution: "summonGhost",
      targeting: Object.freeze({ shape: "placement", radius: 3 }),
      description: "Choose an empty tile within 3, then call one unit from a fresh Soul Shuffle as a ghost. The ghost immediately takes one full turn, then dissipates.",
      implemented: true,
      ai: Object.freeze({ intent: "summon", evHints: Object.freeze({ placeNear: "enemy" }), tags: Object.freeze(["tempo", "summon"]) })
    }),
    Object.freeze({
      id: "dematerialize",
      name: "Dematerialize",
      kind: "active",
      mpCost: 5,
      resolution: "flee",
      targeting: Object.freeze({ shape: "flee" }),
      description: "Teleport to any empty tile within Move+2 tiles. Spends this unit's activation.",
      implemented: true,
      ai: Object.freeze({ intent: "reposition", evHints: Object.freeze({ purpose: "escape" }), tags: Object.freeze(["escape"]) })
    })
  ]),
  rageArt: Object.freeze({
    id: "beckon",
    name: "Beckon",
    kind: "active",
    mpCost: 20,
    rageLocked: true,
    resolution: "summonGhost",
    targeting: Object.freeze({ shape: "placement", radius: 3 }),
    description: "RAGE: Choose an empty tile within 3, then call one unit from a fresh Soul Shuffle as a ghost. The ghost immediately takes one full turn, then dissipates.",
    implemented: true,
    ai: Object.freeze({ intent: "summon", evHints: Object.freeze({ placeNear: "enemy" }), tags: Object.freeze(["tempo", "summon", "rageOnly"]) })
  }),
  ragePassive: Object.freeze({
    id: "disturbed-spirit",
    name: "Disturbed Spirit",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({}), moveAndUseArts: true }),
    description: "At 5 HP or lower, may move and use one ART in the same activation.",
    implemented: true
  })
});
