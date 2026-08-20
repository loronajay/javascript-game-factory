// Every finale dialogue script, built and normalized against every board the finale can be
// on, for every kind of squad.
//
// Why this exists: the finale is the only mission that swaps the board out from under the
// player, and a beat is BUILT from the state that triggered it and RENDERED against whatever
// is on screen. A script that throws during construction or normalization takes the whole
// beat with it — and because `maybeShowCampaignDialogue` fires the beat that reopens a won
// stage, a throw there leaves `pendingStage` set on a board with nothing left to fight.
// That is a soft-lock: the mission cannot advance and the player cannot lose out of it.
//
// So the contract is blunt and covers the whole class: no finale script may EVER throw, and
// none may normalize to an empty script when it is the beat responsible for advancing.
import test from "node:test";
import assert from "node:assert/strict";

import {
  finalBattleBanishScript,
  finalBattleDefeatScript,
  finalBattleDuelScript,
  finalBattleDuelWonScript,
  finalBattleLastStandScript,
  finalBattleMissionOpeningScript,
  finalBattleRageWarningScript,
  finalBattleReachWarningScript,
} from "../src/campaign/missions/the-final-battle/dialogue.js";
import {
  FINAL_BATTLE_DUEL_COUNT,
  advanceFinalBattleStage,
  getFinalBattleRules,
} from "../src/campaign/missions/the-final-battle/stages.js";
import {
  FINAL_BATTLE_MISSION_ID,
  createCampaignMatchConfig,
  prepareCampaignMatchState,
} from "../src/campaign/campaign.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { resolveVictory } from "../src/core/turnEngine.js";
import { normalizeDialogueScript } from "../src/ui/dialogue.js";
import { UNIT_TYPE_KEYS } from "../src/ui/squadModel.js";

const SCRIPTS = Object.freeze({
  finalBattleMissionOpeningScript,
  finalBattleDuelScript,
  finalBattleDuelWonScript,
  finalBattleLastStandScript,
  finalBattleRageWarningScript,
  finalBattleReachWarningScript,
  finalBattleBanishScript,
  finalBattleDefeatScript,
});

// Squads chosen to cover the shapes that actually differ: the default four, the heaviest
// magic/summon kits, the fat roster, and — the one that matters most here — a squad whose
// units carry skins, since the mirror copies the player's skin onto a PLAYER 2 body.
const SQUADS = [
  ["swordsman", "archer", "mystic", "magician"],
  ["summoner", "necromancer", "witch-doctor", "gargoyle"],
  ["fat-knight", "fat-bowman", "fat-cleric", "fat-wizard"],
  ["treant", "clod", "juggernaut", "monk"],
  ["riot-cop", "ronin", "sniper", "angel"],
];

function finalBattleState(squad) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(FINAL_BATTLE_MISSION_ID, squad)),
    FINAL_BATTLE_MISSION_ID,
  );
}

// Every board the finale passes through, in order: the confrontation, the four duels, and
// the last stand.
function everyStage(squad) {
  const boards = [];
  let state = finalBattleState(squad);
  boards.push({ label: "confrontation", state });
  for (let duel = 1; duel <= FINAL_BATTLE_DUEL_COUNT; duel += 1) {
    state = advanceFinalBattleStage(state);
    boards.push({ label: `duel ${duel}`, state });
    // The board as it looks the instant the duel is won — the exact state the duel-won and
    // last-stand beats are built from.
    const won = JSON.parse(JSON.stringify(state));
    won.units.find((unit) => unit.player === 2).hp = 0;
    resolveVictory(won);
    boards.push({ label: `duel ${duel} won`, state: won });
    state = won;
  }
  state = advanceFinalBattleStage(state);
  boards.push({ label: "last stand", state });
  return boards;
}

test("no finale script throws on any board, for any squad", () => {
  for (const squad of SQUADS) {
    for (const { label, state } of everyStage(squad)) {
      for (const [name, build] of Object.entries(SCRIPTS)) {
        let script;
        assert.doesNotThrow(
          () => { script = build(state); },
          `${name} threw while being built on "${label}" with [${squad.join(", ")}]`,
        );
        assert.ok(Array.isArray(script), `${name} must return an array on "${label}"`);
        assert.doesNotThrow(
          () => normalizeDialogueScript(script, state),
          `${name} threw while normalizing on "${label}" with [${squad.join(", ")}]`,
        );
      }
    }
  }
});

// The two beats that carry an `afterAction` are the ones that rebuild the board. If either
// ever normalizes to nothing, `maybeShowCampaignDialogue` bails on the empty script and the
// stage change never runs.
test("the beats that advance a stage are never empty", () => {
  for (const squad of SQUADS) {
    const boards = everyStage(squad);
    for (const { label, state } of boards) {
      const rules = getFinalBattleRules(state);
      if (!rules?.pendingStage) continue;
      const build = rules.stage >= FINAL_BATTLE_DUEL_COUNT
        ? finalBattleLastStandScript
        : finalBattleDuelWonScript;
      const script = normalizeDialogueScript(build(state), state);
      assert.ok(script.length > 0, `the stage-advancing beat was empty on "${label}" with [${squad.join(", ")}]`);
      assert.ok(
        build(state).some((line) => line?.afterAction),
        `the stage-advancing beat on "${label}" carries no afterAction, so nothing rebuilds the board`,
      );
    }
  }
});

// A duel is fought by whatever the player brought, so every draftable type reaches a duel
// board sooner or later. Checked one type at a time rather than only in the sampled squads.
test("every draftable unit can be the duelist without breaking its beats", () => {
  for (const type of UNIT_TYPE_KEYS) {
    if (type === "king") continue; // filtered out of this mission's picker by design
    const filler = UNIT_TYPE_KEYS.filter((other) => other !== type && other !== "king").slice(0, 3);
    const state = advanceFinalBattleStage(finalBattleState([type, ...filler]));
    for (const [name, build] of Object.entries(SCRIPTS)) {
      assert.doesNotThrow(
        () => normalizeDialogueScript(build(state), state),
        `${name} threw with ${type} in the duel`,
      );
    }
  }
});

// The mirror wears the player's skin on a player-2 body — the one place in the game where
// that happens. A skin slug the portrait layer cannot resolve must degrade, not throw.
test("a duelist carrying a skin does not break the mirror's lines", () => {
  const state = advanceFinalBattleStage(finalBattleState(["swordsman", "archer", "mystic", "magician"]));
  for (const skin of ["void-dweller", "fuck-cancer", "not-a-real-skin", "", null]) {
    for (const unit of state.units) unit.skin = skin;
    for (const [name, build] of Object.entries(SCRIPTS)) {
      assert.doesNotThrow(
        () => normalizeDialogueScript(build(state), state),
        `${name} threw with skin ${JSON.stringify(skin)}`,
      );
    }
  }
});
