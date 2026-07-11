// Blacksword — a rebuild-original melee duelist built around tile affinity and a
// resource model that spends HP instead of MP (his MP pool is 0). There is NO legacy
// .sb3 Blacksword reference; these numbers are a rebuild balance authoring (the user's
// spec).
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `darkTread` — a bundled passive read centrally so no rule hard-codes the unit:
//       - `tileAffinityDamage` — +damage vs enemies standing on a dark tile (a bigger
//         bonus when Blacksword is ALSO on one), folded by getTileAffinityDamageBonus in
//         rules/combat.js (so the on-board forecast stays honest).
//       - `tileVulnerability` — +damage TAKEN while Blacksword stands on a light tile,
//         folded into resolvePhysicalStrike / finalizeMagicDamage (rules/combat.js).
//       - `darkTileLifesteal` — heal per enemy damaged while that enemy is on a dark
//         tile, applied by applyDarkTreadLifesteal (core/combatEffects.js) at his damage
//         sites (basic attack + Dark Rush + Dark Tick).
//       - `immuneStatuses` — read by statusImmunities alongside the `immunity`-typed
//         passives, so Dark Tread grants Blind immunity without a second passive entry.
//   • HP-cost ARTS — `art.hpCost` pays the unit's own HP instead of MP; gated in
//     canUseArt/artUsableForPlanning so a costed ART can never suicide him (Banish, an
//     all-HP rage ultimate, opts in via `selfKill` instead).
//   • the rushPath `straightLine` flag — Dark Rush is a Footwork clone restricted to a
//     single orthogonal direction (getRushStepOptions / validateRushPath honor it).
//   • `guaranteedCritCharged` — a one-shot per-unit flag (Dark Ether) that forces the
//     next basic attack to crit on a landed hit (getCritChance returns 1), consumed by
//     the reducer's attack().
//   • the generalized status/affinity burst (`resolution: "statusBurst"`, `condition`) —
//     Dark Tick (blinded enemies) and Banish (enemies on dark tiles) reuse Virus's
//     Poison Tick resolver, now keyed off a condition rather than hardcoded poison.
//
// Darkspread (crit → blind) lives as its own `kind:"passive"` arts entry, the same
// multi-passive pattern Angel's Blessed Arrow / the Necromancer's Dead Zone use, so
// getCritOnHitStatus picks it up centrally.
export const BLACKSWORD = Object.freeze({
  id: "blacksword",
  name: "Blacksword",
  glyph: "\u{1F5E1}", // 🗡 dagger
  classType: "melee",
  ai: Object.freeze({ threatValue: 16, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 6 }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 6,
    maxHp: 30,
    maxMp: 0
  }),
  passive: Object.freeze({
    id: "dark-tread",
    name: "Dark Tread",
    effect: Object.freeze({
      type: "darkTread",
      // Offensive: +damage vs enemies on dark tiles; a bigger bonus when Blacksword is
      // also on a dark tile.
      tileAffinityDamage: Object.freeze({ affinity: "dark", targetBonus: 1, bothBonus: 2 }),
      // Defensive: takes +1 damage while standing on a white/light tile.
      tileVulnerability: Object.freeze({ affinity: "light", amount: 1 }),
      // Sustain: heal per enemy damaged while that enemy stands on a dark tile.
      darkTileLifesteal: Object.freeze({ affinity: "dark", amount: 1 }),
      // Folded by statusImmunities (alongside `immunity`-typed passives).
      immuneStatuses: Object.freeze(["blind"])
    }),
    description: "Heal 1 HP when damaging an enemy on a dark tile. Deal +1 damage to enemies on dark tiles (+2 if Blacksword is also on one). Takes +1 damage while on a white tile. Immune to Blind.",
    implemented: true
  }),
  arts: Object.freeze([
    // Dark Rush — a straight-line Footwork clone that spends HP and deals tile-scaled
    // true damage to enemies it passes through.
    Object.freeze({
      id: "dark-rush",
      name: "Dark Rush",
      kind: "active",
      mpCost: 0,
      hpCost: 2,
      extraMove: 1,
      targeting: Object.freeze({ shape: "rushPath", straightLine: true }),
      contactDamage: Object.freeze({ light: 3, dark: 4, type: "true" }),
      description: "Spend 2 HP to charge MOVE + 1 tiles in a straight orthogonal line, dealing 3 true damage to enemies on light tiles and 4 to enemies on dark tiles you pass through. End on empty ground.",
      implemented: true,
      ai: Object.freeze({ intent: "rush", tags: Object.freeze(["setup", "mobility"]) })
    }),
    // Dark Ether — spend HP to guarantee the next basic attack crits (it can still miss).
    Object.freeze({
      id: "dark-ether",
      name: "Dark Ether",
      kind: "active",
      mpCost: 0,
      hpCost: 2,
      selfCast: true,
      resolution: "darkEther",
      description: "Spend 2 HP to make Blacksword's next basic attack a guaranteed critical (it can still miss).",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["setup", "offense"]) })
    }),
    // Dark Tick — global true damage to every blinded enemy (Virus's Poison Tick, keyed
    // off the blind status instead of poison).
    Object.freeze({
      id: "dark-tick",
      name: "Dark Tick",
      kind: "active",
      mpCost: 0,
      hpCost: 1,
      selfCast: true,
      resolution: "statusBurst",
      condition: Object.freeze({ status: "blind" }),
      requiresConditionEnemy: true,
      damage: Object.freeze({ type: "true", amount: 3 }),
      description: "Spend 1 HP to deal 3 true damage to every blinded enemy anywhere on the board.",
      implemented: true,
      ai: Object.freeze({ intent: "poisonBurst", tags: Object.freeze(["finisher"]) })
    }),
    // Darkspread — crit rider (blind on a critical strike). A passive entry so the Codex
    // names it and getCritOnHitStatus picks it up centrally.
    Object.freeze({
      id: "darkspread",
      name: "Darkspread",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "onCritStatus", critStatus: Object.freeze({ status: "blind", duration: 1 }) }),
      description: "Whenever Blacksword lands a critical strike, the target is blinded for 1 turn.",
      implemented: true
    })
  ]),
  ragePassive: Object.freeze({
    id: "banisher",
    name: "Banisher",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({ strength: 2, moveRange: 1 }) }),
    description: "At 5 HP or lower, gain +2 STR and +1 MOVE.",
    implemented: true
  }),
  // Banish — the RAGE ultimate: spend ALL remaining HP (Blacksword falls, via selfKill)
  // to instantly destroy every enemy standing on a dark tile. Reuses the statusBurst
  // resolver with an affinity condition.
  rageArt: Object.freeze({
    // id is namespaced (`banish-dark`) to avoid colliding with the Magician's "banish"
    // art in the id-keyed ART_RESOLVERS map; the display name stays "Banish".
    id: "banish-dark",
    name: "Banish",
    kind: "active",
    mpCost: 0,
    rageLocked: true,
    selfCast: true,
    selfKill: true,
    costLabel: "All HP",
    resolution: "statusBurst",
    condition: Object.freeze({ affinity: "dark" }),
    requiresConditionEnemy: true,
    damage: Object.freeze({ type: "true", amount: 999 }),
    description: "RAGE: Spend all remaining HP to instantly destroy every enemy standing on a dark tile. Blacksword falls.",
    implemented: true,
    ai: Object.freeze({ intent: "poisonBurst", tags: Object.freeze(["rageOnly", "finisher"]) })
  })
});
