import { firstLivingPlayerUnit } from "../sharedDialogue.js";

// --- Mission 21: Void Ridden Castle -------------------------------------------------
// The party's squad is player-chosen, so no in-battle line may ASSUME a speaker is on the
// board. Every party line resolves through a live unit: the named type if it was drafted,
// otherwise whoever is still standing.

function partyUnit(state, type) {
  const units = state?.units ?? [];
  return units.find((unit) => unit.player === 1 && unit.hp > 0 && unit.type === type) ??
    firstLivingPlayerUnit(state);
}

function summonerLine(text, extra = {}) {
  return { speaker: "summoner", type: "summoner", skin: "void-dweller", side: "right", player: 2, text, ...extra };
}

function nemesisLine(text, extra = {}) {
  return { speaker: "nemesis", type: "nemesis", side: "right", player: 2, text, ...extra };
}

function partyLine(state, type, text, extra = {}) {
  const unit = partyUnit(state, type);
  if (!unit) return null;
  return { speakerId: unit.id, side: "left", text, ...extra };
}

function script(lines) {
  return lines.filter(Boolean);
}

function livingNemesis(state) {
  return (state?.units ?? []).filter((unit) => unit.player === 2 && unit.type === "nemesis" && unit.hp > 0);
}

// --- Opening ------------------------------------------------------------------------
// One Nemesis greets the party; the afterAction reveals the other two, so the split is
// something the player watches happen rather than something they are told about.

export function voidCastleMissionOpeningScript(state) {
  return script([
    nemesisLine("This far in, and still making noise. It hardly matters. Your screams will never reach an ear.", {
      afterAction: "voidCastleNemesisSplit",
    }),
    partyLine(state, "swordsman", "There are three of them now. There was one of them a moment ago."),
    nemesisLine("There was always three. You were only permitted to see one."),
    summonerLine("Stand where you are, Nemesis. Let them come to us. I have waited a long time for a room this full."),
    partyLine(state, "mystic", "He is behind them. He has put a wall of Nemesis between himself and every one of us."),
    partyLine(state, "swordsman", "Then we take the wall down first. Careful — a cornered Nemesis is a worse Nemesis."),
  ]);
}

// --- Mid-battle: Nemesis approaching RAGE -------------------------------------------
// Also the mission's second star. The warning names the danger without naming the rule.

export function shouldShowVoidCastleNemesisRageWarning(state, { warningShown = false } = {}) {
  if (warningShown) return false;
  return livingNemesis(state).some((unit) => unit.hp <= 9);
}

export function voidCastleNemesisRageWarningScript(state) {
  return script([
    partyLine(state, "mystic", "One of them is close to breaking. Do not leave it there — a Nemesis that gets desperate comes back stronger than it left."),
    nemesisLine("Desperate. What a small word for it."),
  ]);
}

// --- The split: phase 1 ends, phase 2 begins ----------------------------------------
// This fires on the blow that SHOULD have won the match. resolveVictory flags it, main.js
// reverts the win, and these two afterActions rebuild the board mid-conversation: the
// Summoner comes apart into four, and the party is put back on its feet.
//
// Nothing here says "one of them is real" or "listen to what the ghosts call their ARTS."
// The player is shown four Summoners and left to work out the rest.

export function voidCastleSplitScript(state) {
  return script([
    summonerLine("No."),
    summonerLine("You have spent your whole climb believing that a thing dies when you strike it hard enough. It will not happen like this."),
    summonerLine("Not to me. Not here.", { afterAction: "voidCastleSummonerSplit" }),
    partyLine(state, "swordsman", "Four. He came apart into four."),
    summonerLine("Whichever of us you were fighting, you are not fighting him anymore."),
    partyLine(state, "mystic", "Stay standing. All of you — STAY STANDING.", { afterAction: "voidCastlePartyHeal" }),
    partyLine(state, "mystic", "That is everything I had. Hold the ground you took — it is the only thing we carried out of the first fight."),
  ]);
}

// --- Post-match (plays on the overworld, after the results screen) -------------------

export function voidCastleDefeatScript(state) {
  return script([
    summonerLine("...clever. You found me."),
    partyLine(state, "swordsman", "Stay down."),
  ]);
}
