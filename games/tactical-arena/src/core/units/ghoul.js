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
// Legacy canon (.sb3): 10 HP, DEF 2, carries the aura, takes no turns.
export const GHOUL = Object.freeze({
  id: "ghoul",
  name: "Ghoul",
  glyph: "🦴",
  summon: true,
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
    effect: Object.freeze({ type: "enemyAura", radius: 2, stats: Object.freeze({ defense: -1 }) }),
    description: "Enemies within 2 tiles of the Ghoul suffer -1 DEF, carrying the Necromancer's Deathly Aura.",
    implemented: true
  }),
  arts: Object.freeze([])
});
