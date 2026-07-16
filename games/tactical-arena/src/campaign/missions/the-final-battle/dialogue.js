// --- Mission 22: The Final Battle ----------------------------------------------------
// The party's squad is player-chosen, so no line may ASSUME a speaker is on the board.
// Every party line resolves through a live unit; where the beat belongs to a specific
// character (the first duelist asking what happened), it resolves through THAT unit.
//
// The mission's structure lives in stages.js. What lives here is the talking, and the
// afterActions that drive the blackouts. Three action names are handled by main.js:
//   finalBattleBlackoutDuel   — fade to black, build the next duel, fade back in
//   finalBattleBlackoutStand  — fade to black, build the last stand, fade back in
//   finalBattleBlackoutHold   — fade to black and STAY there (the lines keep coming)

import { firstLivingPlayerUnit } from "../sharedDialogue.js";
import { getUnitType } from "../../../core/unitCatalog.js";
import { finalBattleDuelist, getFinalBattleRules } from "./stages.js";

function blackswordLine(text, extra = {}) {
  return { speaker: "blacksword", type: "blacksword", skin: "void-dweller", side: "right", player: 2, text, ...extra };
}

function partyUnit(state, type) {
  const units = state?.units ?? [];
  return units.find((unit) => unit.player === 1 && unit.hp > 0 && unit.type === type) ??
    firstLivingPlayerUnit(state);
}

function partyLine(state, type, text, extra = {}) {
  const unit = partyUnit(state, type);
  if (!unit) return null;
  return { speakerId: unit.id, side: "left", text, ...extra };
}

// A line spoken by whoever the player put in a given squad slot. The finale leans on this
// hard: slot one is the character who gets dragged into the dark first.
function slotLine(state, slotIndex, text, extra = {}) {
  const rules = getFinalBattleRules(state);
  const type = rules?.duelTypes?.[slotIndex] ?? null;
  const unit = type ? partyUnit(state, type) : firstLivingPlayerUnit(state);
  if (!unit) return null;
  return { speakerId: unit.id, side: "left", text, ...extra };
}

// The unit currently standing in a duel — and, for the mirror's lines, its copy. The copy
// speaks from the right, wearing the player's own skin and answering to the player's own
// nickname (stages.js carries both across), because that is the scene.
function duelistLine(state, text, extra = {}) {
  const unit = finalBattleDuelist(state);
  if (!unit) return null;
  return { speakerId: unit.id, side: "left", text, ...extra };
}

function mirrorLine(state, text, extra = {}) {
  const mirror = (state?.units ?? []).find((unit) => unit.finalBattleMirror);
  if (!mirror) return null;
  return { speakerId: mirror.id, side: "right", player: 2, text, ...extra };
}

function narration(text, extra = {}) {
  return { narration: true, side: "left", text, ...extra };
}

function script(lines) {
  return lines.filter(Boolean);
}

function unitName(type) {
  try {
    return getUnitType(type).name;
  } catch {
    return "your champion";
  }
}

// --- Opening: the confrontation, then the lights go out -------------------------------
// Blacksword does not monologue and he does not duel on demand. He has somewhere to be, and
// the party is a delay. The blackout is him waving a hand.

export function finalBattleMissionOpeningScript(state) {
  return script([
    blackswordLine("Stop there. Let me look at you."),
    blackswordLine("Four of you. Walking into a wound in the world like it's a doorway you own. So you're what this place grew to keep me out. Its guardians."),
    partyLine(state, "swordsman", "We're what's left standing. That's a different thing."),
    slotLine(state, 0, "You don't belong on this side of the gate. Go back through it. Go back to the void."),
    blackswordLine("Or?"),
    partyLine(state, "mystic", "Or we put you back through it."),
    blackswordLine("You'd have to be real to do that.", { afterAction: "finalBattleBlackoutHold" }),
    // Everything from here is spoken on a black screen. The board is gone; so is the party.
    slotLine(state, 0, "...what — what happened to the light? Where is everyone?"),
    slotLine(state, 0, "Guys? GUYS???"),
    blackswordLine("They're where you are. Alone."),
    blackswordLine("Nothing walks out of the void whole, guardian. It comes out doubled — the thing that left, and the thing that stayed. I've spent a very long time being the half that came back."),
    blackswordLine("Now you get to find out which half you are.", { afterAction: "finalBattleBlackoutDuel" }),
  ]);
}

// --- The duels ------------------------------------------------------------------------
// Duel 1 gets the full explanation. Duels 2-4 are short: the player understands the rules
// now, and four identical speeches would kill the pace stone dead. Each gets one line from
// the copy instead, and the copies get less friendly as they go.

const MIRROR_TAUNTS = Object.freeze([
  "You've been carrying that stance wrong for years. I know. I've had to watch.",
  "You already know how this ends. You've always known how you'd lose.",
  "Don't. You'll only make the other one of us do it.",
]);

export function finalBattleDuelScript(state) {
  const rules = getFinalBattleRules(state);
  const stage = rules?.stage ?? 1;
  const duelist = finalBattleDuelist(state);
  const name = duelist ? unitName(duelist.type) : "your champion";
  if (stage === 1) {
    return script([
      narration("The dark peels back. Five paces of stone, and someone standing on the far side of it, wearing your face."),
      duelistLine(state, "That's... that's me. That is ME."),
      mirrorLine(state, "No. I'm the one who came back."),
      blackswordLine("One of you gets to keep being real. Settle it."),
      duelistLine(state, "I've got to play this smart. How do i beat ME?"),
    ]);
  }
  return script([
    narration(`The dark peels back again. The ${name} stands alone, and the ${name} stands opposite.`),
    mirrorLine(state, MIRROR_TAUNTS[(stage - 2) % MIRROR_TAUNTS.length]),
  ]);
}

// Between duels: Blacksword is not impressed, exactly. He is starting to pay attention.
const DUEL_WON_LINES = Object.freeze([
  "The copy fell. Good. The half worth taking is still breathing.",
  "Two have held. The void is sorting cleaner vessels than I was promised.",
  "Three. Keep proving the point. A sharper blade still breaks when I close my hand.",
]);

export function finalBattleDuelWonScript(state) {
  const rules = getFinalBattleRules(state);
  const stage = rules?.stage ?? 1;
  const line = DUEL_WON_LINES[Math.min(stage, DUEL_WON_LINES.length) - 1];
  return script([
    blackswordLine(line, { afterAction: "finalBattleBlackoutDuel" }),
  ]);
}

// The fourth duel is won: the party is put back together for the last stand.

export function finalBattleLastStandScript(state) {
  return script([
    blackswordLine("All four returned."),
    blackswordLine("The gate kept the weaker halves. That only means the pieces I wanted are standing in one place."),
    blackswordLine("I have wasted enough ceremony on shadows.", { afterAction: "finalBattleBlackoutHold" }),
    narration("The dark comes down one last time. It does not feel like his doing. It feels like something is being decided."),
    blackswordLine("If this world insists on hiding behind you, I will remove its guard myself.", { afterAction: "finalBattleBlackoutStand" }),
    partyLine(state, "swordsman", "We're all here."),
    partyLine(state, "mystic", "All of us. Whole. Whatever he took, we took it back."),
    blackswordLine("Then there's more of you to lose."),
    blackswordLine("Feel the pressure of the void. It eats away at your health every turn cycle."),
    blackswordLine("And gravity here answers to me. Come close, and I can shift every body around me with a thought."),
    partyLine(state, "mystic", "The black stones are carrying it. Stand on one and the void will blind you and silence your arts — move back to the white and it lets go."),
  ]);
}

// --- Mid-battle warnings (last stand only) --------------------------------------------
// Void Reach is the thing that kills a party that hasn't noticed it yet. The warning names
// the danger without naming the rule: stop standing next to each other.

export function shouldShowFinalBattleReachWarning(state, { warningShown = false } = {}) {
  if (warningShown) return false;
  const rules = getFinalBattleRules(state);
  if (rules?.stage !== rules?.lastStage) return false;
  // Fires once anyone is down to half of THEIR OWN health — by then the party has taken a
  // couple of swings and the splash is the reason, so the warning lands as an explanation
  // rather than as a prophecy.
  const party = (state?.units ?? []).filter((unit) => unit.player === 1 && unit.hp > 0);
  return party.some((unit) => unit.hp <= getUnitType(unit.type).stats.maxHp / 2);
}

export function finalBattleReachWarningScript(state) {
  return script([
    partyLine(state, "mystic", "Watch where he swings — it doesn't stop at the one he hits. Anyone standing beside them takes it too. SPREAD OUT."),
    blackswordLine("Yes. Spread out. Make me walk."),
  ]);
}

// He reaches RAGE (≤5 HP). Banisher. This is the only warning the player gets before the
// board can be wiped in one action — and it is a real, actionable one: get off the dark.

export function shouldShowFinalBattleRageWarning(state, { warningShown = false } = {}) {
  if (warningShown) return false;
  const rules = getFinalBattleRules(state);
  if (rules?.stage !== rules?.lastStage) return false;
  const boss = (state?.units ?? []).find((unit) => unit.player === 2 && unit.hp > 0);
  return Boolean(boss && boss.hp <= 15);
}

export function finalBattleRageWarningScript(state) {
  return script([
    blackswordLine("There it is. That's the floor. I can feel the gate pulling at my heels."),
    blackswordLine("Fine. If I can't carry your world's strength home, I'll leave it with nothing standing on the black."),
    partyLine(state, "mystic", "The dark tiles — GET OFF THE DARK TILES. He means to take everything on them with him."),
  ]);
}

// --- Banish: he catches all four ------------------------------------------------------
// The loss beat. He does not gloat for long — he is already gone.

export function finalBattleBanishScript(state) {
  return script([
    blackswordLine("All four. On the black. Together."),
    blackswordLine("You should have spread out."),
    narration("He spends every drop of himself at once. The dark tiles go out like snuffed candles, and the guardians of the earth go out with them."),
    blackswordLine("...worth it."),
  ]);
}

// --- The killing blow (plays before the results screen) --------------------------------

export function finalBattleDefeatScript(state) {
  return script([
    blackswordLine("...what."),
    blackswordLine("What ARE you?"),
    partyLine(state, "swordsman", "The ones still standing."),
    blackswordLine("No, I will not end this way. I will never be erased. You have escaped the Dark this time, but I will always inhabit the void, and the void is now always within each of you."),
    blackswordLine("I must leave this wretched place. Its guardians are too powerful. Too — tactical. I can't afford to lose any more strength than you've already taken."),
    narration("He does not retreat so much as fall upward. The blue light of the gate takes him, and the humming stops."),
  ]);
}
