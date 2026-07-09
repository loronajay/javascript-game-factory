// Virus — a rebuild-original contagion support caster. There is NO legacy .sb3 Virus;
// these numbers are the user's balance authoring.
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `statusSpread` (Spread) — a passive that PROPAGATES afflictions: whenever an
//     enemy of a living Virus receives a debuff status (from ANY source), that enemy's
//     allies within the spread radius are afflicted with the same status. Applied
//     centrally by `applySpreadReactions` in the reducer (a diff-based post-command
//     hook, like the Nemesis threshold + King commander reactions) reading
//     `getStatusSpreadConfig`, so no single ability hard-codes it. The same passive
//     carries a `critStatus` rider (a critical basic attack poisons the target),
//     picked up centrally by `getCritOnHitStatus` — the same seam Angel's Blessed Arrow
//     crit-blind uses.
//   • `poisonMpRefund` (Growth) — a passive that restores MP each time Virus poisons an
//     enemy, folded by `getPoisonMpRefund` at every Virus poison-application site.
//   • the RAGE `attackStatus` + `guaranteedStatuses` seams — Infectious Affinity makes
//     every landed basic attack poison (guaranteed, read by `getRageAttackStatus`) and
//     forces any poison Virus rolls for to land (read by `getGuaranteedStatuses`).
//   • `poisonBurst` resolution (Poison Tick + Explosion) — a global true-damage strike
//     against every poisoned enemy, with Explosion adding a splash to enemies near a
//     poisoned one plus a `selfKill`, gated by `requiresPoisonedEnemy`.
//
// Gaseous Entity + Growth both live as `kind:"passive"` entries in `arts` — the same
// multi-passive pattern the Necromancer's Dead Zone / Angel's Holy Being use, so
// statusImmunities / the poison-refund fold pick them up centrally.
export const VIRUS = Object.freeze({
  id: "virus",
  name: "Virus",
  glyph: "\u{1F9A0}", // 🦠 microbe
  classType: "mage",
  ai: Object.freeze({ threatValue: 14, role: "support", protect: true }),
  tempo: Object.freeze({ agility: 6 }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 5,
    strength: 6,
    defense: 3,
    maxHp: 25,
    maxMp: 36
  }),
  // Spread: the signature contagion passive, plus the crit-poison rider on basic attacks.
  passive: Object.freeze({
    id: "spread",
    name: "Spread",
    effect: Object.freeze({
      type: "statusSpread",
      radius: 2,
      rageRadiusBonus: 1,
      // Only debuffs spread — buffs (empowered) are deliberately excluded so Virus can
      // never propagate a beneficial status through the enemy line.
      statuses: Object.freeze(["poison", "blind", "silence", "slow", "stun"]),
      // A critical basic attack poisons the struck target (same seam as Angel's crit-blind).
      critStatus: Object.freeze({ status: "poison", duration: "permanent" })
    }),
    description: "When an enemy is afflicted with a status effect, its allies within 2 tiles are afflicted too. A critical basic attack from Virus poisons the target.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "cough",
      name: "Cough",
      kind: "active",
      mpCost: 5,
      damageType: "magic",
      targeting: Object.freeze({ range: 5 }),
      damage: Object.freeze({ type: "magic", amount: 5 }),
      effect: Object.freeze({ type: "status", status: "poison", chance: 0.6, durationTurns: "permanent" }),
      description: "Deal 5 magic damage to a target in range, with a 60% chance to poison.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control", "poison"]) })
    }),
    Object.freeze({
      id: "poison-tick",
      name: "Poison Tick",
      kind: "active",
      mpCost: 2,
      selfCast: true,
      resolution: "poisonBurst",
      damage: Object.freeze({ type: "true", amount: 2 }),
      description: "Deal 2 true damage to every poisoned enemy anywhere on the board.",
      implemented: true,
      ai: Object.freeze({ intent: "poisonBurst", tags: Object.freeze(["poison"]) })
    }),
    Object.freeze({
      id: "smog",
      name: "Smog",
      kind: "active",
      mpCost: 5,
      selfCast: true,
      resolution: "smog",
      // Self-centred blind cloud (radius 2), previewed + confirmed via the nukeAura UI path.
      targeting: Object.freeze({ shape: "nukeAura", radius: 2 }),
      effect: Object.freeze({ type: "status", status: "blind", durationTurns: 1 }),
      description: "Blind every enemy within 2 tiles of Virus. No roll — the cloud always lands.",
      implemented: true,
      ai: Object.freeze({ intent: "statusAoe", tags: Object.freeze(["control"]) })
    }),
    // Gaseous Entity: immune to poison and blind (its own contagion never rebounds on it).
    Object.freeze({
      id: "gaseous-entity",
      name: "Gaseous Entity",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["poison", "blind"]) }),
      description: "Virus is immune to poison and blind.",
      implemented: true
    }),
    // Growth: restore 2 MP whenever Virus poisons an enemy (Cough or a crit/rage basic).
    Object.freeze({
      id: "growth",
      name: "Growth",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "poisonMpRefund", amount: 2 }),
      description: "Whenever Virus poisons an enemy, it restores 2 MP.",
      implemented: true
    })
  ]),
  // Infectious Affinity: no stat change — it upgrades the contagion. Spread reaches 1 tile
  // further (rageRadiusBonus on the Spread passive, gated on isRaging), every basic attack
  // poisons on hit (attackStatus), and any poison Virus rolls for is guaranteed
  // (guaranteedStatuses — Cough can no longer whiff its poison check).
  ragePassive: Object.freeze({
    id: "infectious-affinity",
    name: "Infectious Affinity",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({}),
      attackStatus: Object.freeze({ status: "poison", duration: "permanent" }),
      guaranteedStatuses: Object.freeze(["poison"])
    }),
    description: "At 5 HP or lower: Spread reaches 1 tile further, all poison Virus inflicts is guaranteed, and every basic attack poisons the target on hit.",
    implemented: true
  }),
  // Explosion (RAGE): consume Virus to detonate every poisoned enemy. Unusable with no
  // poisoned enemy on the board (requiresPoisonedEnemy, enforced by canUseArt).
  rageArt: Object.freeze({
    id: "explosion",
    name: "Explosion",
    kind: "active",
    mpCost: 0,
    rageLocked: true,
    selfCast: true,
    selfKill: true,
    requiresPoisonedEnemy: true,
    resolution: "poisonBurst",
    damage: Object.freeze({ type: "true", amount: 10 }),
    splash: Object.freeze({ amount: 5, radius: 2 }),
    description: "RAGE: Deal 10 true damage to every poisoned enemy, and 5 true damage to enemies within 2 tiles of a poisoned enemy. Virus is consumed. Unusable if no enemy is poisoned.",
    implemented: true,
    ai: Object.freeze({ intent: "poisonBurst", evHints: Object.freeze({ minTargets: 1 }), tags: Object.freeze(["rageOnly", "aoe"]) })
  })
});
