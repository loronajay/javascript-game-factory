import { WEATHER_TYPES } from "../weather.js";

export const MOTHER_NATURE = Object.freeze({
  id: "mother-nature",
  name: "Mother Nature",
  glyph: "\u{1F326}",
  classType: "support",
  actsFirst: true,
  ai: Object.freeze({ threatValue: 20, role: "support", protect: true }),
  tempo: Object.freeze({ agility: 4 }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 6,
    strength: 7,
    defense: 3,
    maxHp: 25,
    maxMp: 100
  }),
  passive: Object.freeze({
    id: "mood-swing-weather-commander",
    name: "Mood Swing / Weather Commander",
    effect: Object.freeze({ type: "weatherCommander", critMpRestore: 10, nextWeatherMove: 1 }),
    description: "Mother Nature must act first. Her last weather persists globally until a new weather is activated; a new weather charges +1 MOVE for her next turn, and a basic-attack crit restores 10 MP.",
    implemented: true
  }),
  weathers: WEATHER_TYPES,
  arts: Object.freeze([
    Object.freeze({
      id: "blizzard",
      name: "Blizzard",
      kind: "active",
      mpCost: 5,
      resolution: "weather",
      selfCast: true,
      weather: "blizzard",
      globalStatus: Object.freeze({ status: "slow", durationTurns: 1, statModifiers: Object.freeze({ moveRange: -1 }) }),
      description: "Activate Blizzard: slow every unit by 1 MOVE for their next activation. Persistent: movement ARTS gain +1 range globally.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["weather", "control"]) })
    }),
    Object.freeze({
      id: "spring-shower",
      name: "Spring Shower",
      kind: "active",
      mpCost: 5,
      resolution: "weather",
      selfCast: true,
      weather: "spring",
      globalHeal: Object.freeze({ amount: 2 }),
      description: "Activate Spring Shower: heal every unit for 2 HP. Persistent: all HP and MP restoration is boosted by 1 globally.",
      implemented: true,
      ai: Object.freeze({ intent: "healAllies", tags: Object.freeze(["weather", "heal"]) })
    }),
    Object.freeze({
      id: "heatwave",
      name: "Heatwave",
      kind: "active",
      mpCost: 5,
      resolution: "weather",
      selfCast: true,
      weather: "heatwave",
      globalStatus: Object.freeze({ status: "empowered", durationTurns: 1, statModifiers: Object.freeze({ strength: 1 }) }),
      description: "Activate Heatwave: grant every unit +1 STR for their next activation. Persistent: crits deal +1 damage and ignite permanent fire under the victim.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["weather", "offense"]) })
    }),
    Object.freeze({
      id: "landscaper",
      name: "Landscaper",
      kind: "active",
      mpCost: 5,
      resolution: "landscaper",
      targeting: Object.freeze({ range: 5 }),
      wall: Object.freeze({ hp: 1 }),
      damage: Object.freeze({ amount: 10, type: "physical" }),
      description: "Push an enemy back 1 tile and raise a wall where they stood. If the push is blocked, deal 10 physical damage instead. No roll.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "thunderstorm",
      name: "Thunderstorm",
      kind: "active",
      mpCost: 5,
      resolution: "weather",
      selfCast: true,
      weather: "thunderstorm",
      globalStatus: Object.freeze({ status: "weather-magic", durationTurns: 1, magicDamageBonus: 1 }),
      description: "Activate Thunderstorm: every unit's magic damage is +1 for their next activation. Persistent: ARTS cost 1 less MP globally.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["weather", "magic"]) })
    })
  ]),
  rageArt: Object.freeze({
    id: "great-flood",
    name: "Great Flood",
    kind: "active",
    mpCost: 50,
    resolution: "greatFlood",
    selfCast: true,
    damage: Object.freeze({ amount: 7, type: "magic" }),
    restore: Object.freeze({ hp: 5 }),
    description: "RAGE: Deal 7 magic damage to every unit, then shuffle all surviving units among their current positions. Mother Nature does not move and restores 5 HP.",
    implemented: true,
    ai: Object.freeze({ intent: "selfBlast", tags: Object.freeze(["rageOnly", "finisher"]) })
  }),
  ragePassive: Object.freeze({
    id: "nature-wrath",
    name: "RAGE",
    kind: "passive",
    mpCost: 0,
    description: "At 5 HP or lower, Great Flood becomes available.",
    implemented: true
  })
});
