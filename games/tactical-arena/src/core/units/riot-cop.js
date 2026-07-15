// Riot Cop — a rebuild-original heavy TANK (a shield-and-baton crowd-control officer).
// There is NO legacy .sb3 Riot Cop; these numbers are the user's balance authoring.
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • Finite ability USES — Stun Gun (5) and Smoke Bomb (3) spend a per-art pool instead
//     of MP. The live counter lives on `unit.abilityUses`; once a pool empties it must sit
//     one full turn empty before restoring to full (`unit.abilityRecharge`, applied in the
//     reducer's beginActivation). Declared by a numeric `uses` on the art; infinite-use
//     arts (Shield Bash / Cover) simply omit it. Rage refills every pool (`refreshResources`).
//   • `riotShield` passive — a defender mitigation read centrally in rules/combat.js: takes
//     1 less from a RANGED basic attack, and nullifies ALL magic damage aimed at him while
//     defending.
//   • `firstCommandOnly` — Lockdown must be this turn's first command (gated in canUseArt).
//
// The +1 DEF ally aura is mechanically the MAIN passive (`allyAura`, the same seam Clod's
// Brick House uses) so getEffectiveStats + the board aura overlay pick it up, but its
// player-facing name/description is "Utility Belt" reserved for the ability-USES resource
// economy — the aura's own explanation is folded into the "Riot Shield" description instead,
// alongside its `kind:"passive"` mitigation effect. Heavy Boots is the third `kind:"passive"`
// art entry, the multi-passive pattern other units use.
export const RIOT_COP = Object.freeze({
  id: "riot-cop",
  name: "Riot Cop",
  glyph: "\u{1F6E1}", // 🛡 shield
  classType: "tank",
  ai: Object.freeze({ threatValue: 15, role: "bruiser", protect: false }),
  tempo: Object.freeze({ agility: 3 }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 1,
    strength: 8,
    defense: 7,
    maxHp: 30,
    maxMp: 0
  }),
  // Utility Belt: mechanically still the +1 DEF proximity aura (allyAura, the same seam
  // Clod's Brick House uses — folded live off positions by getEffectiveStats + drawn as an
  // always-on board zone), but the name/description is reserved for explaining Riot Cop's
  // finite-ability-USES economy (Stun Gun/Smoke Bomb); the DEF aura itself reads under the
  // Riot Shield passive below.
  passive: Object.freeze({
    id: "utility-belt",
    name: "Utility Belt",
    effect: Object.freeze({
      type: "allyAura",
      radius: 1,
      stats: Object.freeze({ defense: 1 })
    }),
    description: "Riot Cop's gear runs on limited charges instead of MP: Stun Gun has 5 uses and Smoke Bomb has 3. A pool that empties must sit dry for one full turn before it recharges to full; reaching RAGE instantly refills every pool.",
    implemented: true
  }),
  arts: Object.freeze([
    // Stun Gun: a 5-use dart. Rolls to-hit for 3 TRUE damage, then rolls for a status —
    // STUN if the target is adjacent (or Riot Cop is raging), otherwise SLOW.
    Object.freeze({
      id: "stun-gun",
      name: "Stun Gun",
      kind: "active",
      mpCost: 0,
      uses: 5,
      accuracy: 0.96,
      targeting: Object.freeze({ range: 3 }),
      damageType: "true",
      damage: Object.freeze({ type: "true", amount: 3, fixed: true }),
      effect: Object.freeze({ type: "status", status: "slow", chance: 0.7, durationTurns: 1 }),
      description: "Fire a stun dart at an enemy within 3 for 3 true damage and slow it 1 turn (roll to hit, roll for status). An adjacent target — or any target while raging — is stunned instead. 5 uses; restores a full turn after running dry.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    // Smoke Bomb: a 3-use gas grenade thrown at a clear tile within 4 (targeted like
    // Thunderous Charge). Rolls for success; on a landed throw, blinds every enemy within
    // a 1-tile radius. No damage.
    Object.freeze({
      id: "smoke-bomb-riot",
      name: "Smoke Bomb",
      kind: "active",
      mpCost: 0,
      uses: 3,
      accuracy: 0.96,
      targeting: Object.freeze({ shape: "targetedBlast", range: 4, radius: 1 }),
      effect: Object.freeze({ type: "status", status: "blind", durationTurns: 1 }),
      description: "Throw a smoke bomb at an empty tile within 4 (roll for success). If it lands, blind every enemy within 1 tile of it for 1 turn. Deals no damage. 3 uses; restores a full turn after running dry.",
      implemented: true,
      ai: Object.freeze({ intent: "targetedBlast", evHints: Object.freeze({ minTargets: 1 }), tags: Object.freeze(["control", "aoe"]) })
    }),
    // Shield Bash: an infinite-use adjacent shove. Rolls to-hit for 8 physical, then pushes
    // the target straight back; a blocked shove deals +1 TRUE instead.
    Object.freeze({
      id: "shield-bash",
      name: "Shield Bash",
      kind: "active",
      mpCost: 0,
      accuracy: 0.96,
      targeting: Object.freeze({ range: 1 }),
      damage: Object.freeze({ type: "physical", amount: 8, fixed: true }),
      blockedDamage: 1,
      description: "Bash an adjacent enemy for 8 physical damage (roll to hit) and push it one tile back. If it has nowhere to go, it takes 1 extra true damage instead. Unlimited uses.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    // Cover: an infinite-use ally swap. Trade places with an adjacent ally and Defend; a
    // badly-wounded rescue also nets Riot Cop +1 STR next turn.
    Object.freeze({
      id: "cover",
      name: "Cover",
      kind: "active",
      mpCost: 0,
      targeting: Object.freeze({ shape: "ally", range: 1 }),
      coverBuff: Object.freeze({ statModifiers: Object.freeze({ strength: 1 }), duration: 2 }),
      description: "Swap places with an adjacent ally and Defend. If the covered ally is below half HP, Riot Cop gains +1 STR on his next turn. Unlimited uses.",
      implemented: true,
      ai: Object.freeze({ intent: "protectAlly", tags: Object.freeze(["defense"]) })
    }),
    // Heavy Boots: a passive Slow immunity (picked up by statusImmunities).
    Object.freeze({
      id: "heavy-boots",
      name: "Heavy Boots",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["slow"]) }),
      description: "Riot Cop cannot be slowed.",
      implemented: true
    }),
    // Riot Shield: the defender mitigation rider (read centrally by rules/combat.js). Its
    // description also covers the +1 DEF ally aura (mechanically the top-level `passive`
    // above, named Utility Belt) since both are "the shield wall" from a player's perspective.
    Object.freeze({
      id: "riot-shield",
      name: "Riot Shield",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({
        type: "riotShield",
        rangedBasicReduction: 1,
        magicNullifyWhileDefending: true
      }),
      description: "Allies within 1 tile of Riot Cop's shield wall gain +1 DEF. Riot Cop himself takes 1 less damage from ranged basic attacks, and completely nullifies magic damage aimed at him while defending.",
      implemented: true
    })
  ]),
  // Lockdown (RAGE passive): +1 STR / +1 MOVE, Stun Gun stuns at ANY range, and reaching
  // rage instantly refreshes every ability use to full.
  ragePassive: Object.freeze({
    id: "lockdown-passive",
    name: "Lockdown",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 1, moveRange: 1 }),
      stunAtAnyRange: true,
      refreshResources: true
    }),
    description: "RAGE: gain +1 STR and +1 MOVE, Stun Gun stuns at any range, and reaching rage refreshes all of Riot Cop's ability uses.",
    implemented: true
  }),
  // Lockdown (RAGE art): a self-centred crackdown that clamps EVERY unit within 3 (allies
  // included, Riot Cop excluded) to 1 MOVE and −2 DEF for a turn. Must be the first command.
  rageArt: Object.freeze({
    id: "lockdown",
    name: "Lockdown",
    kind: "active",
    mpCost: 0,
    rageLocked: true,
    firstCommandOnly: true,
    selfCast: true,
    targeting: Object.freeze({ shape: "nukeAura", radius: 3 }),
    effect: Object.freeze({ durationTurns: 1 }),
    description: "RAGE: crack down on the whole area — every unit within 3 tiles (allies included, not Riot Cop) is slowed to 1 MOVE and loses 2 DEF for 1 turn. Must be your turn's first command.",
    implemented: true,
    ai: Object.freeze({ intent: "statusAoe", evHints: Object.freeze({ minTargets: 1 }), tags: Object.freeze(["rageOnly", "control", "aoe"]) })
  })
});
