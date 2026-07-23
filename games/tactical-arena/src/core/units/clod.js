// Clod — a rebuild-original heavy TANK (a moss-grown rock golem). There is NO legacy
// .sb3 Clod; these numbers are the user's balance authoring.
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `allyAura` (Brick House) — a PROXIMITY team buff that also feeds the source. Folded
//     centrally by getEffectiveStats: allies within `radius` gain `stats` (+1 DEF), and
//     the SOURCE gains `selfPerAlly` per ally currently in that radius (+1 STR each). It
//     only lasts as long as the allies stand beside him, because the fold reads live
//     positions each call. Also surfaced on the always-on board aura overlay
//     (getAuraSources), faction-tinted, so the zone is visible.
//   • `rockHard` — a defender passive read centrally in rules/combat.js: while DEFENDING,
//     all PHYSICAL damage targeted at Clod is negated to 0 (folded through
//     resolvePhysicalStrike + the fixed-power resolvers, so the forecast stays honest),
//     and each physical strike that lands on him while defending restores `mpOnPhysical`.
//   • `targetedBlast` targeting + the `thunderousCharge` resolution — a RANGE-picked tile
//     within reach (never an enemy-occupied one) that detonates a Chebyshev-radius blast,
//     with a full aim-tile wash + hover footprint preview in the board renderer.
//
// Rock Hard is authored as a `kind:"passive"` entry in `arts` (the same multi-passive
// pattern the Gargoyle's Stone Ward / Heavy use); Brick House is the main `passive`.
export const CLOD = Object.freeze({
  id: "clod",
  name: "Clod",
  glyph: "\u{1FAA8}", // 🪨 rock
  classType: "tank",
  ai: Object.freeze({ threatValue: 15, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 2 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 1,
    strength: 9,
    defense: 8,
    maxHp: 30,
    maxMp: 20
  }),
  // Brick House: a protective aura for the units huddled against him, and the fuller
  // his shadow the harder he swings. +1 DEF to allies within 1 tile; +1 STR to Clod per
  // ally currently sheltered. Both fold live off board positions (allyAura), so the buff
  // evaporates the instant an ally steps away.
  passive: Object.freeze({
    id: "brick-house",
    name: "Brick House",
    effect: Object.freeze({
      type: "allyAura",
      radius: 1,
      stats: Object.freeze({ defense: 1 }),
      selfPerAlly: Object.freeze({ strength: 1 })
    }),
    description: "Allies within 1 tile gain +1 DEF, and Clod gains +1 STR for each ally sheltered — only while they stay directly beside him.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "quake",
      name: "Quake",
      kind: "active",
      mpCost: 5,
      resolution: "quake",
      selfCast: true,
      targeting: Object.freeze({ shape: "nukeAura", radius: 3 }),
      damageType: "magic",
      // Base 3, +1 per enemy the quake catches (computed in resolveQuake). If it catches
      // at least 3 enemies, the MP is refunded.
      damage: Object.freeze({ type: "magic", amount: 3 }),
      refundTargets: 3,
      // The shock loses bite at the very rim: an enemy on the outermost ring (3 tiles away)
      // takes 1 less. Applied per-target by applyBlastEdgeFalloff in resolve + forecast.
      edgeFalloff: 1,
      description: "Slam the ground: every enemy within 3 tiles takes (3 + number of enemies hit) magic damage — 1 less at the farthest edge. If it hits 3 or more enemies, the MP is refunded.",
      implemented: true,
      ai: Object.freeze({ intent: "selfBlast", evHints: Object.freeze({ minTargets: 1 }), tags: Object.freeze(["aoe"]) })
    }),
    Object.freeze({
      id: "stone-throw",
      name: "Stone Throw",
      kind: "active",
      mpCost: 3,
      accuracy: 0.96,
      resolution: "stoneThrow",
      targeting: Object.freeze({ range: 4 }),
      // Fixed power 8 that scales with STR above Clod's base 9 (Brick House can lift it),
      // like the Monk's Front Kick. Rolls to-hit/crit; DEF + Defend still apply.
      damage: Object.freeze({ type: "physical", amount: 8, scaleStat: "strength", baseStat: 9 }),
      // Guaranteed on a landed hit (NO roll): a crit stuns instead of slowing.
      onHit: Object.freeze({ status: "slow", durationTurns: 1, statModifiers: Object.freeze({ moveRange: -1 }) }),
      onCrit: Object.freeze({ status: "stun", durationTurns: 1 }),
      description: "Hurl a boulder at an enemy within 4 for 8 physical damage (scaling with STR), slowing it by 1 for 1 turn. On a critical hit it stuns for 1 turn instead.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    // Rock Hard: an unyielding defensive passive. Braced, Clod shrugs off physical blows
    // entirely and taps the impact for MP. Read centrally by rules/combat.js.
    Object.freeze({
      id: "rock-hard",
      name: "Rock Hard",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "rockHard",
        negatePhysical: true,
        mpOnPhysical: 3
      }),
      description: "While defending, Clod negates all physical damage aimed at him completely, and restores 3 MP each time a physical attack strikes him.",
      implemented: true
    }),
    // Thunderous Charge (RAGE): available only at 5 HP or lower (rageLocked, like the
    // Magician's Nuke). A targeted-tile blast — pick a tile within 4 (not one an enemy
    // stands on), detonating a 2-tile radius: 10 physical + a 1-turn stun to every enemy
    // caught (immune units resist their own stun).
    Object.freeze({
      id: "thunderous-charge",
      name: "Thunderous Charge",
      kind: "active",
      mpCost: 7,
      rageLocked: true,
      resolution: "thunderousCharge",
      targeting: Object.freeze({ shape: "targetedBlast", range: 4, radius: 2 }),
      damage: Object.freeze({ type: "physical", amount: 10 }),
      stun: Object.freeze({ durationTurns: 1 }),
      description: "RAGE: charge a tile within 4 (not one an enemy occupies) and quake a 2-tile radius — 10 physical damage and a 1-turn stun to every enemy caught.",
      implemented: true,
      ai: Object.freeze({ intent: "targetedBlast", evHints: Object.freeze({ minTargets: 1 }), tags: Object.freeze(["finisher", "rageOnly", "control", "aoe"]) })
    })
  ])
});
