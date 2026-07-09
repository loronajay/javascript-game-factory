// Juggernaut — a rebuild-original heavy bruiser (a war-mech). There is NO legacy .sb3
// Juggernaut; these numbers are the user's balance authoring.
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md):
//   • `emptyMpBoost` — a passive that swaps in a stronger stat block AND a magic
//     vulnerability while the unit sits at 0 MP (Bruiser Mode). Folded by
//     getEffectiveStats (the stats) + getSelfMagicVulnerability in rules/combat.js
//     (the +1 magic damage taken).
//   • Line targeting (`lineAny` / `lineEnemy`) — an ability that hits/grabs the FIRST
//     unit contacted along one of the 8 straight rays, capped at range. Geometry lives
//     in getLineTargets (rules/arts.js); Tether Grab pulls that unit, Rocket Punch
//     strikes it (allies block the ray).
//   • Free ARTS while raging (`freeArts` on the rage passive) — resolved centrally by
//     getArtMpCost so every MP gate + spend reads 0 for a raging Juggernaut.
//   • Global healing lockout (`disableHealing: "global"`) — a raging Juggernaut's Null
//     Zone shuts off ALL HP healing on the board, read by isHealingDisabled
//     (rules/combat.js) at every heal site.
//   • Self-sacrifice blast (`selfKill` on a true-damage nukeAura) — Self Destruct wipes
//     nearby enemies and kills the caster.
export const JUGGERNAUT = Object.freeze({
  id: "juggernaut",
  name: "Juggernaut",
  glyph: "\u{1F916}",
  classType: "tank",
  ai: Object.freeze({ threatValue: 15, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 3 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 1,
    strength: 8,
    defense: 7,
    maxHp: 30,
    maxMp: 5
  }),
  // Bruiser Mode: with 0 MP the Juggernaut hits harder and moves faster, but a cracked
  // reactor leaves it soft to magic. Base STR 8 → 10 (+2) and Move 2 → 3 (+1) at 0 MP;
  // it also takes +1 magic damage while empty. Folded generically (no unit hard-code):
  // stats via getEffectiveStats, the magic vulnerability via getSelfMagicVulnerability.
  passive: Object.freeze({
    id: "bruiser-mode",
    name: "Bruiser Mode",
    effect: Object.freeze({
      type: "emptyMpBoost",
      stats: Object.freeze({ strength: 2, moveRange: 1 }),
      magicVulnerability: 1
    }),
    description: "While at 0 MP, base Strength becomes 10 and base Move becomes 3, but the Juggernaut takes 1 extra magic damage.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "tether-grab",
      name: "Tether Grab",
      kind: "active",
      mpCost: 5,
      resolution: "tetherGrab",
      targeting: Object.freeze({ shape: "lineAny", range: 4 }),
      damageType: "magic",
      // Magic damage dealt only when the grabbed unit is an enemy, and only on a landed
      // to-hit roll (an enemy grab rolls like any strike; an ally grab always lands).
      damage: Object.freeze({ type: "magic", amount: 3 }),
      description: "Grab the first ally or enemy in a straight line within 4 and haul them to your side. An enemy also takes 3 magic damage.",
      implemented: true,
      ai: Object.freeze({ intent: "grab", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "rocket-punch",
      name: "Rocket Punch",
      kind: "active",
      mpCost: 5,
      resolution: "rocketPunch",
      targeting: Object.freeze({ shape: "lineEnemy", range: 5 }),
      // A fixed-power physical strike (Defense + Defend still reduce it): rolls to-hit
      // like any attacking ART (a miss lands nothing), then a separate stun roll on a hit.
      damage: Object.freeze({ type: "physical", amount: 10 }),
      effect: Object.freeze({ type: "status", status: "stun", chance: 0.30, durationTurns: 1 }),
      description: "Fire a piston-fist down a straight line within 5 at the first enemy (allies block the shot): 10 physical damage and a 30% chance to stun for 1 turn.",
      implemented: true,
      ai: Object.freeze({ intent: "lineStrike", tags: Object.freeze(["control"]) })
    }),
    Object.freeze({
      id: "recharge",
      name: "Recharge",
      kind: "active",
      mpCost: 0,
      resolution: "recharge",
      selfCast: true,
      // Restore MP; if already full, mend 1 HP instead (blocked by the global heal lock).
      restore: Object.freeze({ mp: 5, hpIfFull: 1 }),
      description: "Vent the reactor: restore 5 MP. If already at full MP, mend 1 HP instead.",
      implemented: true,
      ai: Object.freeze({ intent: "recharge", tags: Object.freeze(["sustain"]) })
    }),
    // Self Destruct is only available while raging (rageLocked), mirroring the Magician's
    // Nuke and Father Time's Rewind. It is a self-centred TRUE-damage blast that also
    // kills the Juggernaut (selfKill).
    Object.freeze({
      id: "self-destruct",
      name: "Self Destruct",
      kind: "active",
      mpCost: 0,
      rageLocked: true,
      selfCast: true,
      resolution: "selfDestruct",
      targeting: Object.freeze({ shape: "nukeAura", radius: 4 }),
      damage: Object.freeze({ type: "true", amount: 10 }),
      selfKill: true,
      description: "RAGE: Overload the core, dealing 10 true damage to every enemy within 4 tiles — at the cost of the Juggernaut's own life.",
      implemented: true,
      ai: Object.freeze({ intent: "selfBlast", evHints: Object.freeze({ minTargets: 2 }), tags: Object.freeze(["finisher", "rageOnly", "sacrifice"]) })
    })
  ]),
  // Null Zone: at 5 HP or lower the Juggernaut goes berserk — +2 STR / +2 MOVE, its ARTS
  // cost no MP (freeArts), and ALL healing on the board is shut off (disableHealing), so
  // it can never be pulled back out of rage. The +2/+2 rides the statModifiers rage fold;
  // freeArts + disableHealing are read by getArtMpCost + isHealingDisabled.
  ragePassive: Object.freeze({
    id: "null-zone",
    name: "Null Zone",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 2, moveRange: 2 }),
      freeArts: true,
      disableHealing: "global"
    }),
    description: "At 5 HP or lower: +2 STR, +2 MOVE, ARTS cost no MP, and all healing on the board is disabled. Self Destruct becomes available.",
    implemented: true
  })
});
