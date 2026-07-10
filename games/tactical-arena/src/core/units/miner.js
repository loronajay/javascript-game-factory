export const MINER = Object.freeze({
  id: "miner",
  name: "Miner",
  glyph: "M",
  classType: "ranger",
  ai: Object.freeze({ threatValue: 13, role: "ranged", protect: true }),
  tempo: Object.freeze({ agility: 5 }),
  resource: Object.freeze({ id: "ore", label: "Ore", shortLabel: "ORE", startsAt: 0 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 8,
    defense: 4,
    maxHp: 25,
    maxMp: 25
  }),
  passive: Object.freeze({
    id: "ore-harvester",
    name: "Ore Harvester / Pickaxe",
    effect: Object.freeze({
      type: "oreHarvester",
      resource: "mp",
      fullResourceStats: Object.freeze({ strength: 1, defense: 1 }),
      emptyAttackRange: 1,
      adjacentDamageBonus: 2,
      rangedAttackCost: 1,
      critPerResource: Object.freeze({ per: 5, bonus: 0.01, rageBonus: 0.02 })
    }),
    description: "Gain +1% crit chance for every 5 ore harvested. At max ore, gain +1 STR and +1 DEF. Adjacent basic attacks deal +2 damage. Ranged basic attacks cost 1 ore; at 0 ore, range becomes 1.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "ore-harvest",
      name: "Ore Harvest",
      kind: "active",
      mpCost: 0,
      resolution: "oreHarvest",
      selfCast: true,
      ore: Object.freeze({ min: 2, max: 5, table: Object.freeze([2, 3, 3, 3, 3, 4, 4, 4, 4, 5]) }),
      nextTurnStatus: Object.freeze({ type: "empowered", duration: 2, statModifiers: Object.freeze({ moveRange: 1 }) }),
      replacedByRageArt: "ore-abundance",
      description: "Gather 2-5 ore, usually 3 or 4. On Miner's next turn, gain +1 MOVE.",
      implemented: true,
      ai: Object.freeze({ intent: "recharge", tags: Object.freeze(["setup"]) })
    }),
    Object.freeze({
      id: "headlamp",
      name: "Headlamp",
      kind: "active",
      mpCost: 0,
      resolution: "statusCast",
      targeting: Object.freeze({ range: 1 }),
      effect: Object.freeze({ type: "status", status: "blind", chance: 1, durationTurns: 1 }),
      description: "Blind an adjacent enemy for 1 turn. No roll.",
      implemented: true,
      ai: Object.freeze({ intent: "statusCast", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "shaft-prop",
      name: "Shaft Prop",
      kind: "active",
      mpCost: 3,
      targeting: Object.freeze({ shape: "tilePlacement", radius: 3 }),
      wall: Object.freeze({ hp: 1 }),
      description: "Spend 3 ore to raise a 1-HP wall on an empty tile within 3.",
      implemented: true,
      ai: Object.freeze({ intent: "placeObject", evHints: Object.freeze({ zoneValue: 5, placeNear: "threatenedAlly" }), tags: Object.freeze(["zone", "setup"]) })
    }),
    Object.freeze({
      id: "blasting-cap",
      name: "Blasting Cap",
      kind: "active",
      mpCost: 2,
      resolution: "blastingCap",
      targeting: Object.freeze({ range: 3 }),
      damage: Object.freeze({ type: "true", amount: 3 }),
      splash: Object.freeze({ radius: 1, blockedDamage: 2 }),
      onCrit: Object.freeze({ status: "stun", durationTurns: 1 }),
      description: "Spend 2 ore and roll to hit an enemy within 3. On hit, deal 3 true damage, then push nearby enemies away from the blast tile; blocked enemies take 2 true damage. On crit, stun the initial target for 1 turn.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", evHints: Object.freeze({ splashDamage: 2 }), tags: Object.freeze(["control"]) })
    })
  ]),
  ragePassive: Object.freeze({
    id: "diamond-harvester",
    name: "Diamond Harvester",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ moveRange: 1, strength: 1 }),
      rageEntryRestore: Object.freeze({ mp: 25 })
    }),
    description: "RAGE: Gain +1 MOVE and +1 STR, instantly fill ore to max, and Ore Harvester grants +2% crit chance per 5 ore.",
    implemented: true
  }),
  rageArt: Object.freeze({
    id: "ore-abundance",
    name: "Ore Abundance",
    kind: "active",
    mpCost: 0,
    rageLocked: true,
    resolution: "oreHarvest",
    selfCast: true,
    ore: Object.freeze({ full: true }),
    description: "RAGE: Gather full ore, always filling Miner to max.",
    implemented: true,
    ai: Object.freeze({ intent: "recharge", tags: Object.freeze(["rageOnly", "setup"]) })
  })
});
