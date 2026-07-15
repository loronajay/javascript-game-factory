// Ronin — a rebuild-original melee DUELIST. A wandering swordsman whose kit rewards
// fighting alone and one-on-one: his Wanderer passive stacks bonus damage when no ally
// is near (his or the target's), punishes enemies that whiffed on him, and heals him on a
// critical strike. His ARTS are all self-serving duel tools — a patient guard, a stronger
// blinding cut, a reckless offense trade, a mutual grudge mark, and a thrown finisher.
// RAGE (Final Draw) turns him into a glass cannon: +12 STR but every non-finishing attack
// recoils onto him.
//
// New reusable engine seams introduced here (all data-first, read centrally):
//   • `duelist` passive (rules/combat.js getDuelistDamageBonus / getDuelistCritLifesteal /
//     duelistTracksMisses) — isolation damage, missed-me damage, crit self-heal. The
//     missed-me side rides a per-unit `duelMarks` list the reducer fills when an enemy
//     whiffs on Ronin and spendAndAdvance clears at the end of his turn.
//   • `challenged` status + getChallengeDamageBonus — a mutual "+N vs a specific foe"
//     mark, folded into the physical strike so the forecast stays honest.
//   • `attackRecoil` RAGE flag (reducer attack / artResolvers) — self-damage equal to the
//     damage an attack deals while the enemy team can still fight.
//   • `selfBuff` resolution (artResolvers resolveSelfBuff) — defend and/or apply a timed
//     self status; and `challenge`/`shuriken` resolutions.
export const RONIN = Object.freeze({
  id: "ronin",
  name: "Ronin",
  glyph: "🗡",
  classType: "melee",
  ai: Object.freeze({ threatValue: 13, role: "skirmisher", protect: false }),
  tempo: Object.freeze({ agility: 7 }),
  stats: Object.freeze({
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 5,
    maxHp: 28,
    maxMp: 20
  }),
  passive: Object.freeze({
    id: "wanderer",
    name: "Wanderer",
    effect: Object.freeze({
      type: "duelist",
      isolationRadius: 3,
      isolatedAttackerBonus: 2,
      isolatedTargetBonus: 1,
      missedMeBonus: 1,
      critLifestealFraction: 0.5
    }),
    description:
      "Deal +2 damage while no ally stands within 3 of Ronin, +1 versus enemies with no ally within 3, and +1 to any enemy that missed a roll on Ronin last turn. A critical basic strike heals Ronin for half the damage dealt.",
    implemented: true
  }),
  arts: Object.freeze([
    // Defend now and bank a +1 MOVE for the next turn. `duration: 2` so the empowered
    // buff survives to Ronin's next activation (mirrors Miner's Ore Harvest haste).
    Object.freeze({
      id: "patient-blade",
      name: "Patient Blade",
      kind: "active",
      mpCost: 0,
      resolution: "selfBuff",
      selfCast: true,
      selfBuff: Object.freeze({
        defend: true,
        status: Object.freeze({ type: "empowered", duration: 2, statModifiers: Object.freeze({ moveRange: 1 }) })
      }),
      description: "Defend, and gain +1 MOVE on Ronin's next turn.",
      implemented: true,
      ai: Object.freeze({ intent: "defend", tags: Object.freeze(["defense"]) })
    }),
    // Moonstrike clone with a higher blind chance.
    Object.freeze({
      id: "flashing-steel",
      name: "Flashing Steel",
      kind: "active",
      mpCost: 5,
      accuracy: 0.96,
      targeting: Object.freeze({ range: 1 }),
      effect: Object.freeze({ type: "status", status: "blind", chance: 0.9, durationTurns: 1 }),
      description: "Attack an adjacent enemy with a 90% chance to blind it for 1 turn.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["control"]) })
    }),
    // A reckless offense trade: drop guard for a turn to hit harder and move further.
    // `duration: 2` so the buff/debuff spans the opponent's turn (the exposure) into
    // Ronin's next turn (the payoff).
    Object.freeze({
      id: "broken-oath",
      name: "Broken Oath",
      kind: "active",
      mpCost: 3,
      resolution: "selfBuff",
      selfCast: true,
      selfBuff: Object.freeze({
        status: Object.freeze({
          type: "empowered",
          duration: 2,
          statModifiers: Object.freeze({ defense: -2, moveRange: 1, strength: 1 })
        })
      }),
      description: "Forsake your guard: -2 DEF, but +1 MOVE and +1 STR through Ronin's next turn.",
      implemented: true,
      ai: Object.freeze({ intent: "recharge", tags: Object.freeze(["setup"]) })
    }),
    // A mutual grudge: both Ronin and the challenged enemy deal +2 to each other next turn.
    Object.freeze({
      id: "challenge",
      name: "Challenge",
      kind: "active",
      mpCost: 4,
      resolution: "challenge",
      targeting: Object.freeze({ range: 5 }),
      challenge: Object.freeze({ bonus: 2, durationTurns: 2 }),
      description: "Call out an enemy within 5. Next turn, Ronin deals +2 damage to it and it deals +2 damage to Ronin.",
      implemented: true,
      ai: Object.freeze({ intent: "statusCast", tags: Object.freeze(["control"]) })
    }),
    // A thrown finisher: fixed 3 TRUE damage at range 3, rolling to hit like any attack.
    // `damage.fixed` opts it into the forecast's fixed-true branch so it shows -3, not STR.
    Object.freeze({
      id: "shuriken",
      name: "Shuriken",
      kind: "active",
      mpCost: 3,
      accuracy: 0.96,
      resolution: "shuriken",
      targeting: Object.freeze({ range: 3 }),
      damageType: "true",
      damage: Object.freeze({ type: "true", amount: 3, fixed: true }),
      description: "Throw a shuriken at an enemy within 3, rolling to hit for 3 true damage.",
      implemented: true,
      ai: Object.freeze({ intent: "strike", tags: Object.freeze(["poke"]) })
    })
  ]),
  ragePassive: Object.freeze({
    id: "final-draw",
    name: "Final Draw",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({
      type: "statModifiers",
      stats: Object.freeze({ strength: 12, moveRange: 1 }),
      attackRecoil: true
    }),
    description:
      "At 5 HP or lower: +12 STR and +1 MOVE, but Ronin takes damage equal to the damage he deals with an attack unless it defeats the last enemy unit.",
    implemented: true
  })
});
