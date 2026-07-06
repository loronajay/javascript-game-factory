// Angel — a rebuild-original holy Ranger (a winged, blindfolded archer). There is NO
// legacy .sb3 Angel reference; these numbers are a rebuild balance authoring (the
// user's spec).
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `blessedAttack` — a passive that changes the unit's BASIC attack damage type
//     (Angel's shots deal magic, so they ignore DEF) and can
//     apply a status on a critical basic attack (Blessed Arrow blinds on a crit).
//     Folded centrally by getBasicAttackDamageType / getCritOnHitStatus (rules/combat.js),
//     so no attack path hard-codes the unit.
//   • `critPerMissingHp` — Inner Strength: a passive crit-chance bonus that scales with
//     the unit's missing HP, folded by getCritChance (rules/combat.js) alongside the
//     rage never-miss/crit overrides.
//   • the `ally` targeting shape — a single friendly-only targeted ART (Anoint), which
//     the board renderer/forecast/handleTile treat like a friendly cousin of Father
//     Time's allyOrEnemy casts.
//   • a tile-affinity filter on healAllies (Elevate) + a heal rider on tilePulse
//     (Heavenseeker): the reducer now heals allies standing on the art's `affinity`
//     tile, reusing the Paladin's Light/Darkseeker tile-pulse plumbing.
//
// Holy Being (status immunity) and Inner Strength both live as `kind:"passive"` entries
// in `arts` — the same multi-passive pattern the Necromancer's Dead Zone and Father
// Time's Father of Time use, so statusImmunities / getCritChance pick them up centrally.
export const ANGEL = Object.freeze({
  id: "angel",
  name: "Angel",
  glyph: "\u{1FABD}",
  classType: "ranger",
  ai: Object.freeze({ threatValue: 15, role: "support", protect: true }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 3,
    defense: 3,
    maxHp: 24,
    maxMp: 37
  }),
  passive: Object.freeze({
    id: "blessed-arrow",
    name: "Blessed Arrow",
    effect: Object.freeze({
      type: "blessedAttack",
      attackDamageType: "magic",
      // A critical basic attack also lands this status on the target (immunity is still
      // respected centrally, so a Paladin/immune target simply resists the blind).
      critStatus: Object.freeze({ status: "blind", duration: 1 })
    }),
    description: "Angel's basic attacks deal magic damage. On a critical basic attack, the target is also blinded for 1 turn.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "anoint",
      name: "Anoint",
      kind: "active",
      mpCost: 5,
      resolution: "anoint",
      // Friendly-only single target (cannot self-cast) — the `ally` targeting shape.
      targeting: Object.freeze({ shape: "ally", range: 5 }),
      effect: Object.freeze({ status: "empowered", statModifiers: Object.freeze({ attackRange: 1 }), durationTurns: 1 }),
      description: "Grant an ally +1 range for 1 turn. Cannot target self.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAlly", tags: Object.freeze(["buff", "range"]) })
    }),
    Object.freeze({
      id: "elevate",
      name: "Elevate",
      kind: "active",
      mpCost: 3,
      // A global heal filtered to allies standing on a white (light) tile.
      effect: Object.freeze({ type: "healAllies", amount: 1, global: true, affinity: "light" }),
      description: "Restore 1 HP to every ally standing on a white tile anywhere on the board.",
      implemented: true,
      ai: Object.freeze({ intent: "healAllies", tags: Object.freeze(["heal"]) })
    }),
    Object.freeze({
      id: "inner-strength",
      name: "Inner Strength",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "critPerMissingHp", per: 3, bonus: 0.015 }),
      description: "Angel gains +1.5% critical chance for every 3 HP he is missing.",
      implemented: true
    }),
    Object.freeze({
      id: "holy-being",
      name: "Holy Being",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["poison", "slow", "blind", "silence", "stun"]) }),
      description: "Angel is immune to all status effects.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "heavens-wrath",
    name: "Heaven's Wrath",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({ strength: 2, moveRange: 2 }) }),
    description: "At 5 HP or lower, gain +2 STR and +2 MOVE.",
    implemented: true
  }),
  // Heavenseeker mirrors the Paladin's Darkseeker (a bonus-action, self-cast tile pulse
  // that does NOT spend the activation) but ALSO heals allies on the same white tiles.
  rageArt: Object.freeze({
    id: "heavenseeker",
    name: "Heavenseeker",
    kind: "active",
    mpCost: 5,
    selfCast: true,
    rageLocked: true,
    bonusActionGroup: "seeker",
    effect: Object.freeze({
      type: "tilePulse",
      affinity: "light",
      amount: 2,
      global: true,
      damageType: "true",
      heal: Object.freeze({ amount: 2 })
    }),
    description: "While raging, allies on a white tile anywhere restore 2 HP and enemies on a white tile take 2 true damage. Does not spend Angel's action.",
    implemented: true,
    ai: Object.freeze({ intent: "tilePulse", tags: Object.freeze(["bonus", "rageOnly"]) })
  })
});
