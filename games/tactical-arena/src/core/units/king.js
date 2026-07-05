// King — a rebuild-original NON-COMBATANT commander. There is NO legacy .sb3 King
// reference; these numbers are a rebuild balance authoring (the user's spec).
//
// King never moves or attacks. He is a war-table figurehead who issues one global
// COMMAND every turn and reacts to the fate of his squad. Engine seams this unit
// introduced (see UNIT_AUTHORING_GUIDE.md / CLAUDE.md):
//   • actsFirst    — the owner must command the King before any other unit of theirs
//                    can begin its activation (gated in the reducer's beginActivation).
//   • commandOnly  — the King cannot move/attack/defend; his only action is a command
//                    ART (all four are global, 0 MP). His base 0 MOVE stays 0 (the
//                    getEffectiveStats move-clamp respects an immobile baseline).
//   • sustainsVictory:false — a lone King is a loss (he can't win a game), exactly like
//                    a lone Ghoul today (see rules in unitCatalog.sustainsVictory).
//   • the `commander` passive — reactive HP swings driven centrally by the reducer's
//                    applyCommanderReactions: −damagePerAllyFallen to the King and a
//                    +allyRallyHeal to the rest of the squad whenever an ally falls, and
//                    +healPerAllyRevived to the King when a fallen ally is brought back.
//   • the `command` block on each command ART — a data-driven, DYNAMIC one-turn team
//                    buff folded live by getEffectiveStats (getCommandBuffStats) plus the
//                    heal/range bonuses (getCommandHealBonus / getCommandRangeBonus). The
//                    buff scales with the number of allies CURRENTLY in RAGE, so it tracks
//                    the board in real time and expires the instant the King's turn ends.
//
// A command's stat buff is `command.stats`; Strike's base is lifted by `command.prevOverride`
// when the King's PREVIOUS command was the named one (Pursue → Strike gives +3 STR base
// instead of +2). Every buffed value additionally gains +1 per raging ally.
const command = (id, stats, extra = {}) => Object.freeze({ id, stats: Object.freeze(stats), ...extra });

export const KING = Object.freeze({
  id: "king",
  name: "King",
  glyph: "♔",
  classType: "support",
  // A non-combatant commander: he must command first each turn, can only command, and
  // does not sustain victory on his own.
  actsFirst: true,
  commandOnly: true,
  sustainsVictory: false,
  ai: Object.freeze({ threatValue: 22, role: "support", protect: true }),
  stats: Object.freeze({
    moveRange: 0,
    attackRange: 0,
    strength: 0,
    defense: 0,
    maxHp: 30,
    maxMp: 0
  }),
  passive: Object.freeze({
    id: "dictator-spectator",
    name: "Dictator / Spectator",
    effect: Object.freeze({
      type: "commander",
      // The King takes this much damage for every allied unit that falls…
      damagePerAllyFallen: 10,
      // …restores this much HP for every fallen ally that is revived…
      healPerAllyRevived: 10,
      // …and every ally fall rallies the rest of the squad (the King excluded) by this.
      allyRallyHeal: 5
    }),
    description: "The King takes 10 damage whenever an allied unit falls (and the rest of the squad rallies for 5), and restores 10 HP when a fallen ally is revived.",
    implemented: true
  }),
  arts: Object.freeze([
    // A spectator monarch is untouchable by the field's afflictions — this also guarantees
    // he can always issue his mandatory command (a silenced/stunned King would soft-lock
    // his owner's whole turn, since no ally may act until the King commands).
    Object.freeze({
      id: "royal-detachment",
      name: "Royal Detachment",
      kind: "passive",
      mpCost: null,
      effect: Object.freeze({ type: "immunity", statuses: Object.freeze(["blind", "silence", "slow", "stun", "poison"]) }),
      description: "The King cannot be blinded, silenced, slowed, stunned, or poisoned.",
      implemented: true
    }),
    Object.freeze({
      id: "strike",
      name: "Strike!",
      kind: "active",
      mpCost: 0,
      resolution: "command",
      selfCast: true,
      targeting: Object.freeze({ shape: "globalAllies" }),
      command: command("strike", { strength: 2 }, { prevOverride: Object.freeze({ pursue: Object.freeze({ strength: 3 }) }) }),
      description: "Command: allies gain +2 STR this turn (+3 if your last command was Pursue!). +1 STR more per allied unit in RAGE.",
      implemented: true,
      ai: Object.freeze({ intent: "commandBuff", tags: Object.freeze(["buff", "offense"]) })
    }),
    Object.freeze({
      id: "hold",
      name: "Hold!",
      kind: "active",
      mpCost: 0,
      resolution: "command",
      selfCast: true,
      targeting: Object.freeze({ shape: "globalAllies" }),
      command: command("hold", { defense: 1 }, { healBonus: 1 }),
      description: "Command: allies gain +1 DEF and +1 to all healing they receive this turn. Both increase by 1 per allied unit in RAGE.",
      implemented: true,
      ai: Object.freeze({ intent: "commandBuff", tags: Object.freeze(["buff", "defense"]) })
    }),
    Object.freeze({
      id: "pursue",
      name: "Pursue!",
      kind: "active",
      mpCost: 0,
      resolution: "command",
      selfCast: true,
      targeting: Object.freeze({ shape: "globalAllies" }),
      command: command("pursue", { moveRange: 1 }),
      description: "Command: allies gain +1 MOVE this turn. +1 more per allied unit in RAGE.",
      implemented: true,
      ai: Object.freeze({ intent: "commandBuff", tags: Object.freeze(["buff", "mobility"]) })
    }),
    Object.freeze({
      id: "higher-ground",
      name: "Higher Ground!",
      kind: "active",
      mpCost: 0,
      resolution: "command",
      selfCast: true,
      targeting: Object.freeze({ shape: "globalAllies" }),
      command: command("higher-ground", { attackRange: 1 }, { rangeBonus: 1 }),
      description: "Command: allies gain +1 range this turn — attacks AND ARTS, area ARTS included. +1 more per allied unit in RAGE.",
      implemented: true,
      ai: Object.freeze({ intent: "commandBuff", tags: Object.freeze(["buff", "range"]) })
    })
  ])
});
