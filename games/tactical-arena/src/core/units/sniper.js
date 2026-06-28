// Sniper — recovered from the legacy TurboWarp project (stats) and finished in the
// rebuild (its ARTs and RAGE were never completed in the .sb3). See
// LEGACY_TURBOWARP_REFERENCE.md "Sniper — recovered + decided" for the full canon.
//
// This file currently carries the stat block, the Rifle Powered passive, and RAGE.
// The three ARTs (Smoke Bomb, Build Cover, Throw Cigar) land once the tile-object
// engine seam they depend on is in place.
export const SNIPER = Object.freeze({
  id: "sniper",
  name: "Sniper",
  ai: Object.freeze({ threatValue: 13, role: "ranged", protect: true }),
  glyph: "🎯",
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 6,
    strength: 8,
    defense: 3,
    maxHp: 23,
    maxMp: 18
  }),
  passive: Object.freeze({
    id: "rifle-powered",
    name: "Rifle Powered",
    effect: Object.freeze({
      type: "riflePowered",
      // The shot passes through intervening units AND Build Cover walls — the one
      // thing that ignores cover. Read centrally by attackerPierces in rules/combat.js.
      pierce: true,
      // +1 damage on every physical hit, and a hard floor so high DEF can never chip
      // the Sniper below 2 (the legacy Sniper Extra/Minimum Damage Check procedures).
      flatDamage: 1,
      minimumDamage: 2
    }),
    description: "Shots pierce units and walls, deal +1 damage, and never do less than 2.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "smoke-bomb",
      name: "Smoke Bomb",
      kind: "active",
      mpCost: 3,
      resolution: "statusCast",
      effect: Object.freeze({ type: "status", status: "blind", chance: 0.7, durationTurns: 1 }),
      description: "Throw a smoke bomb at one enemy in range: 70% to blind it for 1 turn. No damage. Blocked by walls, not bodies.",
      implemented: true,
      ai: Object.freeze({ intent: "statusCast", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "build-cover",
      name: "Build Cover",
      kind: "active",
      mpCost: 3,
      targeting: Object.freeze({ shape: "tilePlacement", radius: 3 }),
      wall: Object.freeze({ hp: 1 }),
      description: "Raise a 1-HP wall on an empty tile within 3. It blocks movement and line of sight for everyone — except the Sniper's own shots.",
      implemented: true,
      ai: Object.freeze({ intent: "placeObject", evHints: Object.freeze({ zoneValue: 5, placeNear: "threatenedAlly" }), tags: Object.freeze(["zone", "setup"]) })
    }),
    Object.freeze({
      id: "throw-cigar",
      name: "Throw Cigar",
      kind: "active",
      mpCost: 3,
      targeting: Object.freeze({ shape: "tilePlacement", radius: 4, allowOccupied: true }),
      fire: Object.freeze({ turns: 3 }),
      description: "Set a tile within 4 alight. Anyone standing on it takes 1 true damage at each turn rollover for 3 turns.",
      implemented: true,
      ai: Object.freeze({ intent: "placeObject", evHints: Object.freeze({ zoneValue: 6, placeNear: "enemy" }), tags: Object.freeze(["zone"]) })
    })
  ]),
  ragePassive: Object.freeze({
    id: "sniper-rage",
    name: "RAGE Passive",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 1, attackRange: 1, moveRange: 2 })
    }),
    description: "At 5 HP or lower, gain +1 STR, +1 range, and +2 MOVE.",
    implemented: true
  })
});
