// Father Time — a time-themed support/controller. There is NO legacy .sb3 Father
// Time reference; these numbers are a rebuild balance authoring (the user's spec).
//
// Engine seams this unit introduced (see UNIT_AUTHORING_GUIDE.md):
//   • `damageAura` — a proximity aura that deals damage each turn rollover to nearby
//     ENEMIES and refunds MP to its source (Time Steal). Applied by applyTimeStealTick
//     in the reducer, beside the fire/black-death rollover ticks; its radius also feeds
//     the always-on board aura overlay (getAuraSources).
//   • `linkedStatMods` — SOURCE-LINKED persistent stat modifiers on a unit
//     (`{ sourceId, stats }`), folded by getEffectiveStats only while the source lives.
//     Age places these; they last "until Father Time is defeated" with no cleanup path
//     — the fold simply stops when the source dies.
//   • revive — Rewind returns a fallen ally to the board (resolveRewind). Corpses stay
//     in state.units, so the target is found by id.
//
// Two passives: Time Steal is the main `passive`; Father of Time (Stun/Slow immunity)
// lives as a `kind:"passive"` entry in `arts` so rules/statuses.js picks it up through
// statusImmunities (same pattern as the Necromancer's Dead Zone).
export const FATHER_TIME = Object.freeze({
  id: "father-time",
  name: "Father Time",
  glyph: "⏳",
  ai: Object.freeze({ threatValue: 16, role: "support", protect: true }),
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 7,
    defense: 3,
    maxHp: 25,
    maxMp: 40
  }),
  passive: Object.freeze({
    id: "time-steal",
    name: "Time Steal",
    effect: Object.freeze({
      type: "damageAura",
      radius: 2,
      amount: 1,
      damageType: "true",
      // MP refunded to Father Time per point of Time Steal damage dealt.
      refundMpPerDamage: 1
    }),
    description: "Each turn, enemies within 2 tiles take 1 true damage, and Father Time restores 1 MP for every point dealt.",
    implemented: true
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "father-of-time",
      name: "Father of Time",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["stun", "slow"]) }),
      description: "Father Time is immune to Stun and Slow.",
      implemented: true
    }),
    Object.freeze({
      id: "age",
      name: "Age",
      kind: "active",
      mpCost: 5,
      resolution: "age",
      targeting: Object.freeze({ shape: "allyOrEnemy" }),
      // Amount granted to an ally / drained from an enemy on the chosen stat. The sign
      // is decided by target team in resolveAge; the stat (strength|defense) rides on
      // the command from the stat-picker UI (defaults to strength).
      effect: Object.freeze({ type: "linkedStatMod", amount: 1 }),
      description: "Grant an ally +1 STR or +1 DEF, or drain an enemy's STR or DEF by 1 — lasting until Father Time is defeated.",
      implemented: true,
      ai: Object.freeze({ intent: "statBuff", tags: Object.freeze(["buff", "control"]) })
    }),
    Object.freeze({
      id: "time-stretch",
      name: "Time Stretch",
      kind: "active",
      mpCost: 5,
      resolution: "timeStretch",
      targeting: Object.freeze({ shape: "allyOrEnemy" }),
      // Ally → a timed +MOVE `empowered` buff; enemy → a timed -MOVE `slow`. Reuses the
      // existing status lifecycle (empowered from the Witch Doctor, slow from Leg Shot).
      ally: Object.freeze({ status: "empowered", statModifiers: Object.freeze({ moveRange: 1 }), durationTurns: 1 }),
      enemy: Object.freeze({ status: "slow", statModifiers: Object.freeze({ moveRange: -1 }), durationTurns: 1 }),
      description: "Grant an ally +1 MOVE for 1 turn, or slow an enemy by 1 MOVE for 1 turn.",
      implemented: true,
      ai: Object.freeze({ intent: "hasten", tags: Object.freeze(["buff", "control"]) })
    }),
    // Rewind is only available while raging (rageLocked), mirroring the Magician's Nuke
    // and the Witch Doctor's Black Death Dance.
    Object.freeze({
      id: "rewind",
      name: "Rewind",
      kind: "active",
      mpCost: 20,
      rageLocked: true,
      resolution: "rewind",
      targeting: Object.freeze({ shape: "revive", radius: 3 }),
      description: "RAGE: Bring a fallen ally back onto a tile within 3, fully healed with statuses cleared. Their MP is not restored.",
      implemented: true,
      ai: Object.freeze({ intent: "revive", tags: Object.freeze(["revive", "rageOnly"]) })
    })
  ]),
  ragePassive: Object.freeze({
    id: "father-time-rage",
    name: "RAGE",
    kind: "passive",
    mpCost: 0,
    description: "At 5 HP or lower, Rewind becomes available.",
    implemented: true
  })
});
