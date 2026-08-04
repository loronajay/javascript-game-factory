// Ghoul — a summoned board piece, not a roster pick. Raised by the Necromancer's
// Summon Ghoul ART. It is a real unit (occupies a tile, can be attacked and
// killed, blocks movement) but it `summon: true`, so it never activates, never
// takes a turn, and is excluded from the turn loop, victory check, squad picker,
// and match-summary counts (see `takesTurns` in unitCatalog.js).
//
// It carries the Necromancer's base Deathly Aura via the same `enemyAura` passive,
// so summoning extends where the -1 DEF debuff applies. It never rages, so it only
// ever projects the base aura, never the amplified rage version.
//
// A Ghoul never activates, but it still bites: Ghoul Bite is a second `kind:"passive"`
// arts entry (the same multi-passive pattern other units use) carrying a reusable
// `autoStrike` effect — read centrally by `applyAutoStrikeTick` in `turnEngine.js` at
// every turn rollover. It picks ONE random living enemy within `range` (Chebyshev) of
// the Ghoul off the authoritative RNG and deals `damage` true (DEF/Defend-bypassing,
// unrollable) damage, matching the Fire/Time-Steal rollover-tick convention rather than
// costing an activation the Ghoul doesn't have.
//
// Legacy canon (.sb3): 10 HP, DEF 2, carries the aura, takes no turns.
export const GHOUL = Object.freeze({
  id: "ghoul",
  name: "Ghoul",
  glyph: "🦴",
  classType: "summon",
  summon: true,
  ai: Object.freeze({ threatValue: 5, role: "summon", protect: false }),
  stats: Object.freeze({
    moveRange: 1,
    attackRange: 0,
    strength: 0,
    defense: 2,
    maxHp: 10,
    maxMp: 0
  }),
  passive: Object.freeze({
    id: "aura-carrier",
    name: "Aura Carrier",
    effect: Object.freeze({ type: "enemyAura", radius: 3, stats: Object.freeze({ defense: -1 }) }),
    description: "Enemies within 3 tiles of the Ghoul suffer -1 DEF, carrying the Necromancer's Deathly Aura.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "ghoul-bite",
      name: "Ghoul Bite",
      kind: "passive",
      effect: Object.freeze({ type: "autoStrike", damage: 1, damageType: "true", range: 1 }),
      description: "At the start of each turn, the Ghoul bites one random enemy standing directly next to it for 1 true damage.",
      implemented: true
    })
  ])
});
