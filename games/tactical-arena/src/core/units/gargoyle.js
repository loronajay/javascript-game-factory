// Gargoyle — a rebuild-original heavy TANK (a living-statue bruiser). There is NO
// legacy .sb3 Gargoyle; these numbers are the user's balance authoring.
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `stoneBody` — a defensive passive bundling three central behaviours, all read
//     off passive data so no rule hard-codes the unit:
//       - `meleeDefendRetaliation` — while DEFENDING, a landed MELEE attack returns
//         this much TRUE damage to the attacker (reducer's attack()).
//       - `displacementImmune` + `displacementRetaliation` — a pull/knockback ART
//         (Tether Grab, Front Kick knockback) can never move the Gargoyle, and the
//         displacer takes `displacementRetaliation` TRUE damage (guarded at each
//         displacement site in the reducer via rules/combat.js predicates).
//       - `reflectStatus` — a status TARGETED at the Gargoyle is instead issued to
//         the offender (reducer's status-application sites via rules/statuses.js
//         reflectsStatus). Paired with the full status immunity below so a global
//         status (Black Death Dance) is simply resisted.
//   • `moveCap` (Heavy) — a passive that clamps effective Move at a hard ceiling,
//     regardless of speed buffs (folded by getEffectiveStats).
//   • `flightMove` targeting + the `flight` resolution — a self-reposition (Chebyshev,
//     diagonal allowed, distance = effective Move + 1) that then deals a small TRUE
//     blast to enemies around the landing tile.
//   • `lineBurst` targeting + the `pyroclasm` resolution — a self-centred burst that
//     hits EVERY enemy standing on any of the 8 straight rays within range.
//   • Volcanic Rage's `freePyroclasm` — when the Gargoyle enters rage it erupts a free
//     (0 MP) Pyroclasm immediately, then does it again every N raging activations at
//     the START of its activation and still takes its full turn (counted on
//     `unit.volcanicCounter`).
//
// Stone immunity + Heavy both live as `kind:"passive"` entries in `arts` — the same
// multi-passive pattern the Necromancer's Dead Zone and Angel's Holy Being use, so
// statusImmunities / the moveCap fold pick them up centrally.
export const GARGOYLE = Object.freeze({
  id: "gargoyle",
  name: "Gargoyle",
  glyph: "\u{1F5FF}", // 🗿 stone figure
  classType: "tank",
  ai: Object.freeze({ threatValue: 15, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 2 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 1,
    strength: 9,
    defense: 7,
    maxHp: 30,
    maxMp: 20
  }),
  // Stone Body: the signature defensive passive. Thorns while defending, total
  // displacement immunity (with a bite back), and status reflection.
  passive: Object.freeze({
    id: "stone-body",
    name: "Stone Body",
    effect: Object.freeze({
      type: "stoneBody",
      meleeDefendRetaliation: 1,
      displacementImmune: true,
      displacementRetaliation: 2,
      reflectStatus: true
    }),
    description: "While defending, a melee attacker takes 1 true damage. The Gargoyle cannot be pulled or knocked back — a displacement ART returns 2 true damage to the offender. A status effect targeted at the Gargoyle is issued to the offender instead.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "flight",
      name: "Flight",
      kind: "active",
      mpCost: 3,
      resolution: "flight",
      // Distance scales with Move (effective Move + 1); Heavy caps it, so 3 Move → 4.
      targeting: Object.freeze({ shape: "flightMove", moveBonus: 1 }),
      damage: Object.freeze({ type: "true", amount: 2 }),
      blastRadius: 1,
      description: "Fly up to (Move + 1) spaces in any direction (diagonals allowed), then deal 2 true damage to every enemy within 1 tile of where you land.",
      implemented: true,
      ai: Object.freeze({ intent: "flightStrike", evHints: Object.freeze({ minTargets: 1 }), tags: Object.freeze(["reposition", "aoe"]) })
    }),
    Object.freeze({
      id: "pyroclasm",
      name: "Pyroclasm",
      kind: "active",
      mpCost: 5,
      resolution: "pyroclasm",
      selfCast: true,
      targeting: Object.freeze({ shape: "lineBurst", range: 3 }),
      damageType: "magic",
      damage: Object.freeze({ type: "magic", amount: 5, affinity: "fire" }),
      description: "Erupt lines of fire from all 8 directions: 5 magic damage to every enemy standing on a line within range. (Volcanic Rage: +2 range.)",
      implemented: true,
      ai: Object.freeze({ intent: "lineBurst", evHints: Object.freeze({ minTargets: 2 }), tags: Object.freeze(["aoe"]) })
    }),
    Object.freeze({
      id: "one-with-the-flames",
      name: "One With The Flames",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "fireImmunity",
        fireDamageImmune: true,
        critCreatesFire: Object.freeze({ kind: "fire", permanent: true })
      }),
      description: "The Gargoyle takes no damage from fire-based ARTS or fire tiles. Whenever the Gargoyle crits with a basic attack, the target's tile becomes permanent fire.",
      implemented: true
    }),
    // Heavy: a hard Move ceiling that no speed buff can exceed (folded by getEffectiveStats).
    Object.freeze({
      id: "heavy",
      name: "Heavy",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "moveCap", maxMoveRange: 3 }),
      description: "The Gargoyle's Move can never exceed 3, regardless of speed buffs.",
      implemented: true
    }),
    // Stone immunity: immune to every status (a targeted status is reflected — see the
    // Stone Body passive; a global status is simply resisted here).
    Object.freeze({
      id: "stone-ward",
      name: "Stone Ward",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["poison", "slow", "blind", "silence", "stun"]) }),
      description: "The Gargoyle is immune to all status effects.",
      implemented: true
    })
  ]),
  // Volcanic Rage: at 5 HP or lower the Gargoyle is +2 DEF, ALWAYS defending (and still
  // takes full turns), Pyroclasm gains +2 range, entering rage immediately erupts a
  // free Pyroclasm, and every 3rd raging activation after that erupts again before
  // acting. The +2 DEF rides the statModifiers rage fold; `defending` is read by
  // isDefending; `artRangeBonus` by getRageArtRangeBonus; `freePyroclasm` by the reducer.
  ragePassive: Object.freeze({
    id: "volcanic-rage",
    name: "Volcanic Rage",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ defense: 2 }),
      defending: true,
      artRangeBonus: 2,
      freePyroclasm: Object.freeze({ artId: "pyroclasm", every: 3 })
    }),
    description: "At 5 HP or lower: +2 DEF, always defending (and still acts), Pyroclasm gains +2 range, entering rage erupts a free Pyroclasm immediately, and every 3rd turn after that erupts again before acting.",
    implemented: true
  })
});
