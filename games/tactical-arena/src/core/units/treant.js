// Treant — a rebuild-original TANK: a rooted grove-guardian built around weather,
// magic protection, and MP/HP economy. There is NO legacy .sb3 Treant; these numbers
// are the user's balance authoring.
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • `weatherAffinity` — a passive that reads the board-wide weather (core/weather.js)
//     and folds a per-weather stat bonus (Snow → +1 DEF, Fire → +2 STR/−1 DEF, Storm →
//     +1 magic damage) via getWeatherAffinityStats in unitCatalog.js, plus a per-turn HP
//     regen in Rain (getWeatherAffinityRestore, ticked in turnEngine.js). It also carries
//     a `fireVulnerability` rider (+1 damage from fire-based abilities and fire-tile ticks),
//     read centrally by getFireVulnerability in rules/combat.js.
//   • `buffShare` — a proximity passive (Verdant Bond): a positive stat-buff STATUS landed
//     on an ally within `radius` also lands on the Treant, applied by applyBuffShareReactions
//     (core/reactions.js), a diff-based post-command hook mirroring Virus's Spread.
//   • `mpRecoveryBuff` — Ether: whenever the Treant's MP goes UP, he banks a +stat buff for
//     his next turn (unit.etherCharged, applied at beginActivation like the Witch Doctor's
//     Rain haste), armed by applyEtherReactions (core/reactions.js).
//   • `positionalDefense` — Deep Roots: +DEF while every living enemy (and/or every living
//     ally) sits inside the Treant's base attack range, folded by positionalDefenseStats in
//     unitCatalog.js.
//   • the `enrich` and `sourceShift` resolutions (core/artResolvers.js), the heal effect's
//     `restore:"mp"` variant (Soul Sap = a Life Sap clone that drinks MP), and the
//     `petrify` rage resolution + the `petrified` incapacitating-but-invulnerable status
//     (invulnerability read by isInvulnerable in rules/statuses.js, the per-turn regen/aura
//     ticked in turnEngine.js's auto-spend path).
//
// The magic-reduction aura (Grove Ward) reuses the Necromancer's `teamDamageReduction`
// seam verbatim; the crit-slow rider reuses the shared `critStatus` (getCritOnHitStatus)
// seam Blacksword/Angel/Virus use, carried on the Verdant Bond passive.
export const TREANT = Object.freeze({
  id: "treant",
  name: "Treant",
  glyph: "\u{1F333}", // 🌳 tree
  classType: "tank",
  ai: Object.freeze({ threatValue: 14, role: "support", protect: true }),
  tempo: Object.freeze({ agility: 3 }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 2,
    strength: 7,
    defense: 6,
    maxHp: 30,
    maxMp: 30
  }),
  // Enchanted Roots: the weather-affinity passive + a fire vulnerability rider. Weather
  // ids map to core/weather.js (spring = rain, blizzard = snow, thunderstorm = storm,
  // heatwave = fire).
  passive: Object.freeze({
    id: "enchanted-roots",
    name: "Enchanted Roots",
    effect: Object.freeze({
      type: "weatherAffinity",
      weathers: Object.freeze({
        spring: Object.freeze({ restorePerTurn: Object.freeze({ hp: 1 }) }),
        blizzard: Object.freeze({ stats: Object.freeze({ defense: 1 }) }),
        thunderstorm: Object.freeze({ magicDamage: 1 }),
        heatwave: Object.freeze({ stats: Object.freeze({ strength: 2, defense: -1 }) })
      }),
      // +1 damage taken from fire-based ARTS and fire-tile ticks (folded in rules/combat.js
      // + turnEngine.js).
      fireVulnerability: 1,
      // A rooted plant-being: immune to poison (folded by statusImmunities alongside any
      // `immunity`-typed passive, the same bundling pattern as Blacksword's Dark Tread).
      immuneStatuses: Object.freeze(["poison"])
    }),
    description: "Weather-attuned: heals 1 HP per turn in Rain, +1 DEF in Snow, +1 magic damage in Thunderstorm, +2 STR / −1 DEF in Fire. Takes +1 damage from fire abilities and fire tiles. Immune to poison.",
    implemented: true
  }),
  arts: Object.freeze([
    // Enrich: a friendly-only power transfer — restore 3 MP to an ally, or 3 HP if that
    // ally is already at full MP. Cannot target self.
    Object.freeze({
      id: "enrich",
      name: "Enrich",
      kind: "active",
      mpCost: 2,
      targeting: Object.freeze({ shape: "ally", range: 5, excludeSelf: true }),
      resolution: "enrich",
      effect: Object.freeze({ mp: 3, hpIfFull: 3 }),
      description: "Spend 2 MP to restore 3 MP to an ally within 5 (not yourself). If that ally is already at full MP, restore 3 HP instead.",
      implemented: true,
      ai: Object.freeze({ intent: "healAlly", tags: Object.freeze(["sustain", "support"]) })
    }),
    // Source Shift: swap the Treant's own HP and MP pools. A finite 3-use resource (Riot
    // Cop's ability-USES seam), and it also costs 1 HP + 1 MP up front.
    Object.freeze({
      id: "source-shift",
      name: "Source Shift",
      kind: "active",
      mpCost: 1,
      hpCost: 1,
      uses: 3,
      selfCast: true,
      resolution: "sourceShift",
      description: "Spend 1 HP and 1 MP to swap the Treant's current HP and MP values. 3 uses; restores a full turn after running dry.",
      implemented: true,
      ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["utility"]) })
    }),
    // Soul Sap: a Life Sap clone (Swordsman) that drinks MP instead of HP — an attack that,
    // on a landed roll, restores half the damage dealt as MP to the Treant.
    Object.freeze({
      id: "soul-sap",
      name: "Soul Sap",
      kind: "active",
      mpCost: 2,
      accuracy: 0.93,
      targeting: Object.freeze({ range: 1 }),
      effect: Object.freeze({ type: "heal", chance: 0.7, amount: "halfDamageDealtRounded", restore: "mp" }),
      description: "Attack an adjacent enemy with a 70% chance to drain half the damage dealt back as MP.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["sustain"]) })
    }),
    // Ether (passive): whenever the Treant recovers MP, he banks +2 STR for his next turn.
    Object.freeze({
      id: "ether",
      name: "Ether",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "mpRecoveryBuff", stats: Object.freeze({ strength: 2 }) }),
      description: "Whenever the Treant recovers MP, he gains +2 STR on his next turn.",
      implemented: true
    }),
    // Deep Roots (passive): +1 DEF while every living enemy is inside the Treant's attack
    // range, +1 DEF while every living ally is, +2 when both hold.
    Object.freeze({
      id: "deep-roots",
      name: "Deep Roots",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "positionalDefense",
        enemyStats: Object.freeze({ defense: 1 }),
        allyStats: Object.freeze({ defense: 1 })
      }),
      description: "+1 DEF while every living enemy is within the Treant's attack range, and +1 DEF while every other living ally is (+2 with both).",
      implemented: true
    }),
    // Grove Ward (passive): the Necromancer's Dead Zone magic-reduction seam — friendly
    // units take 1 less magic damage while the Treant lives.
    Object.freeze({
      id: "grove-ward",
      name: "Grove Ward",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "teamDamageReduction", damageType: "magic", amount: 1 }),
      description: "While the Treant lives, friendly units take 1 less magic damage from all sources.",
      implemented: true
    }),
    // Verdant Bond (passive): shares nearby allies' stat buffs onto the Treant (buffShare),
    // and slows the target of a critical basic attack (the shared crit-status seam).
    Object.freeze({
      id: "verdant-bond",
      name: "Verdant Bond",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "buffShare",
        radius: 2,
        critStatus: Object.freeze({ status: "slow", duration: 1, statModifiers: Object.freeze({ moveRange: -1 }) })
      }),
      description: "When an ally within 2 tiles gains a stat buff, the Treant gains it too. A critical basic attack slows its target by 1 MOVE for 1 turn.",
      implemented: true
    })
  ]),
  // RAGE: Petrify — become an invulnerable, dormant statue for 2 of your turns. Each of
  // those turns the Treant restores 1 HP + 1 MP and pulses that same restore to allies
  // within 2 tiles while draining 1 HP + 1 MP from enemies within 2 tiles. He takes no
  // actions while petrified.
  rageArt: Object.freeze({
    id: "petrify",
    name: "Petrify",
    kind: "active",
    mpCost: 0,
    rageLocked: true,
    selfCast: true,
    resolution: "petrify",
    // Marker for the CPU value hook (evaluate.js buffAlliesValue): a self-preservation
    // ultimate the CPU should reach for while raging.
    selfProtect: true,
    petrify: Object.freeze({
      turns: 2,
      radius: 2,
      selfRestore: Object.freeze({ hp: 1, mp: 1 }),
      allyRestore: Object.freeze({ hp: 1, mp: 1 }),
      enemyDrain: Object.freeze({ hp: 1, mp: 1 })
    }),
    description: "RAGE: root into an invulnerable statue for 2 turns, taking no actions. Each turn, restore 1 HP + 1 MP to yourself and to allies within 2 tiles, and drain 1 HP + 1 MP from enemies within 2 tiles.",
    implemented: true,
    ai: Object.freeze({ intent: "buffAllies", tags: Object.freeze(["rageOnly", "defense"]) })
  })
});
