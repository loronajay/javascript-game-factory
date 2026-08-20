// Multi-stage campaign battles, at the controller seam.
//
// Two missions fight more than one board inside a single match: Void Ridden Castle (the
// Summoner split) and The Final Battle (four mirror duels, then the last stand). Both work
// the same way — a stage that "should" have ended the match completes normally so the turn
// loop never stalls, flags a pending stage, and is reopened from a dialogue beat.
//
// The engine side of that is covered by the-final-battle.test.js / void-ridden-castle.test.js.
// What is covered HERE is the part that runs after the reducer returns: the two controllers
// commandResolutionController calls, in the order it calls them. A stage win reaches them as
// `phase: "complete"` with a winner, and neither may treat it as the end of the mission.
import test from "node:test";
import assert from "node:assert/strict";

import { createCampaignMatchHooks } from "../src/campaign/campaignMatchHooks.js";
import { createMatchOutcomeController } from "../src/ui/matchOutcomeController.js";
import { createCampaignPresentationController } from "../src/campaign/campaignPresentationController.js";
import {
  CAMPAIGN_PROGRESS_KEY,
  FINAL_BATTLE_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  createCampaignMatchConfig,
  prepareCampaignMatchState,
} from "../src/campaign/campaign.js";
import { createCampaignMeta } from "../src/campaign/campaignMeta.js";
import {
  FINAL_BATTLE_STAGE_LAST_STAND,
  advanceFinalBattleStage,
  getFinalBattleRules,
} from "../src/campaign/missions/the-final-battle/stages.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { resolveVictory } from "../src/core/turnEngine.js";

const SQUAD = ["swordsman", "archer", "mystic", "magician"];

function storageAdapter(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

// Wires the real controllers around a live state the way main.js does, with the collaborators
// that only exist in a browser stubbed out. `dispatchOutcome` replays exactly what
// commandResolutionController does once the reducer has accepted a command.
function harness(missionId, state) {
  const storage = storageAdapter();
  const runtime = {
    state,
    matchConfig: { mode: "campaign" },
    campaignMissionId: missionId,
    campaignMeta: createCampaignMeta(),
    matchStartedAt: 0,
    initialHpByPlayer: {},
    mySeat: 1,
    net: null,
    resultsTimer: null,
    pendingCampaignReward: null,
    resolving: false,
  };
  const log = { results: 0, missionCompletions: 0, dialogues: [] };

  let openDialogue = null;
  const dialogue = {
    isOpen: () => openDialogue !== null,
    // The real dialogue system runs each line's `afterAction` through the presentation
    // controller as the script plays. Replayed here so a beat that drives a stage change
    // actually drives one.
    show: async (script) => {
      log.dialogues.push(script);
      openDialogue = script;
      for (const line of script) {
        if (line?.afterAction) await presentation.handleDialogueLineAction(line.afterAction);
      }
      openDialogue = null;
    },
  };

  const blackout = {
    active: false,
    isActive() { return this.active; },
    async enter() { this.active = true; },
    async exit() { this.active = false; },
    clear() { this.active = false; },
    setCaption() {},
  };

  const presentation = createCampaignPresentationController({
    runtime,
    dialogue,
    blackout,
    effects: { setMetrics: () => {}, shake: () => {} },
    render: () => {},
    announceTurn: () => {},
    sleep: async () => {},
    storage,
  });

  const outcome = createMatchOutcomeController({
    runtime,
    turnFlash: { announce: () => {} },
    menu: { showResults: () => { log.results += 1; } },
    dialogue,
    setMessage: () => {},
    isCpu: () => true,
    storage,
    // Run timers inline so a queued results screen is observable without waiting.
    clock: { setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {} },
    syncGameProgress: () => {},
  });

  const hooks = createCampaignMatchHooks({
    runtime,
    dialogue,
    ensureFinalBattleStageAdvanced: () => presentation.ensureFinalBattleStageAdvanced(),
    maybeStartCpuTurn: () => {},
  });

  async function dispatchOutcome(prevPlayer = 1) {
    hooks.recordCampaignProgressHooks({ player: 1, type: "ATTACK" }, { accepted: true, events: [] }, runtime.state);
    outcome.announceTurnChange(prevPlayer);
    // The dialogue chain is async; let it settle before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  function missionRecorded() {
    const raw = storage.getItem(CAMPAIGN_PROGRESS_KEY);
    if (!raw) return false;
    return (JSON.parse(raw).completedMissions ?? []).includes(missionId);
  }

  return { runtime, log, dispatchOutcome, missionRecorded, storage };
}

function finalBattleState(squad = SQUAD) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(FINAL_BATTLE_MISSION_ID, squad)),
    FINAL_BATTLE_MISSION_ID,
  );
}

// --- The Final Battle -------------------------------------------------------------------

test("winning a mirror duel does not end the mission, show results, or bank a campaign win", async () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  duel.units.find((unit) => unit.player === 2).hp = 0;
  resolveVictory(duel);
  assert.equal(getFinalBattleRules(duel).pendingStage, true, "precondition: the engine flagged a pending stage");

  const h = harness(FINAL_BATTLE_MISSION_ID, duel);
  await h.dispatchOutcome();

  assert.equal(h.log.results, 0, "the results screen must not open between duels");
  assert.equal(h.missionRecorded(), false, "duel 1 must not bank mission 22 as completed");
  assert.equal(h.runtime.campaignMeta.finalBattleDefeatDialogueShown, false,
    "Blacksword's defeat beat belongs to the last stand, not to duel 1");
});

test("winning a mirror duel reopens the match on the next duel's board", async () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  duel.units.find((unit) => unit.player === 2).hp = 0;
  resolveVictory(duel);

  const h = harness(FINAL_BATTLE_MISSION_ID, duel);
  await h.dispatchOutcome();

  assert.equal(h.runtime.state.phase, "playing", "the match has to reopen — the mission is not over");
  assert.equal(h.runtime.state.winner, null);
  assert.equal(getFinalBattleRules(h.runtime.state).stage, 2, "duel 2 is on the board");
  assert.equal(getFinalBattleRules(h.runtime.state).pendingStage, false);
});

test("the whole finale can be played through to the last stand", async () => {
  let state = advanceFinalBattleStage(finalBattleState());
  const h = harness(FINAL_BATTLE_MISSION_ID, state);

  for (let duel = 1; duel <= 4; duel += 1) {
    assert.equal(getFinalBattleRules(h.runtime.state).stage, duel, `duel ${duel} should be on the board`);
    h.runtime.state.units.find((unit) => unit.player === 2).hp = 0;
    resolveVictory(h.runtime.state);
    await h.dispatchOutcome();
  }

  assert.equal(getFinalBattleRules(h.runtime.state).stage, FINAL_BATTLE_STAGE_LAST_STAND);
  assert.equal(h.runtime.state.phase, "playing");
  assert.equal(h.runtime.state.units.filter((unit) => unit.player === 1).length, 4);
  assert.equal(h.log.results, 0, "no results screen anywhere before the last stand");
  assert.equal(h.missionRecorded(), false);
});

test("felling Blacksword on the last stand does end the mission and show results", async () => {
  let state = advanceFinalBattleStage(finalBattleState());
  const h = harness(FINAL_BATTLE_MISSION_ID, state);
  for (let duel = 1; duel <= 4; duel += 1) {
    h.runtime.state.units.find((unit) => unit.player === 2).hp = 0;
    resolveVictory(h.runtime.state);
    await h.dispatchOutcome();
  }

  const boss = h.runtime.state.units.find((unit) => unit.player === 2);
  boss.hp = 0;
  resolveVictory(h.runtime.state);
  await h.dispatchOutcome();

  assert.equal(h.runtime.state.phase, "complete");
  assert.equal(h.runtime.state.winner, 1);
  assert.equal(h.missionRecorded(), true, "the finale is finally banked");
  assert.equal(h.log.results, 1, "and the results screen opens exactly once");
});

test("losing a mirror duel ends the mission immediately — the copy takes your place", async () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  duel.units.find((unit) => unit.player === 1).hp = 0;
  resolveVictory(duel);
  assert.equal(getFinalBattleRules(duel).pendingStage, false, "precondition: a loss flags no next stage");

  const h = harness(FINAL_BATTLE_MISSION_ID, duel);
  await h.dispatchOutcome();

  assert.equal(h.runtime.state.winner, 2);
  assert.equal(h.log.results, 1, "a defeat goes straight to results");
});

// --- Void Ridden Castle -----------------------------------------------------------------
// The same seam, one mission earlier: phase 1 completes with a winner and flags `pendingSplit`.

test("clearing Void Ridden Castle's first phase does not end the mission or show results", async () => {
  const state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(VOID_CASTLE_MISSION_ID, SQUAD)),
    VOID_CASTLE_MISSION_ID,
  );
  for (const unit of state.units) {
    if (unit.player === 2) unit.hp = 0;
  }
  resolveVictory(state);
  assert.equal(state.missionRules.voidCastleTrial.pendingSplit, true, "precondition: the split is pending");

  const h = harness(VOID_CASTLE_MISSION_ID, state);
  await h.dispatchOutcome();

  assert.equal(h.log.results, 0, "the results screen must not open at the split");
  assert.equal(h.missionRecorded(), false, "phase 1 must not bank the mission as completed");
  assert.equal(h.runtime.state.phase, "playing", "the match has to reopen for phase 2");
});

// --- the stage change must survive a broken dialogue -------------------------------------
//
// A won stage clears the board and then relies on a dialogue beat's afterAction to build the
// next one. Campaign has no concede button, so if that beat fails to run, the player is left
// on a board with no opponent and no way out but the main menu. These pin the recovery for
// each way the beat can fail.

// The recovery runs through a promise chain a few links long; drain it rather than guessing
// a tick count.
async function settle(times = 6) {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function stuckDuelState({ reopened = true } = {}) {
  const duel = advanceFinalBattleStage(finalBattleState());
  duel.units.find((unit) => unit.player === 2).hp = 0;
  resolveVictory(duel);
  assert.equal(getFinalBattleRules(duel).pendingStage, true);
  // What recordCampaignProgress does the instant it sees a pending stage: it reverts the
  // engine's win so the match is open again while the beat rebuilds the board.
  if (reopened) {
    duel.phase = "playing";
    duel.winner = null;
  }
  return duel;
}

// A minimal rig with a deliberately broken dialogue system, wired the way main.js wires it.
function brokenDialogueHarness(state, dialogue) {
  const runtime = {
    state,
    matchConfig: { mode: "campaign" },
    campaignMissionId: FINAL_BATTLE_MISSION_ID,
    campaignMeta: createCampaignMeta(),
    resolving: false,
  };
  const presentation = createCampaignPresentationController({
    runtime,
    dialogue,
    blackout: { isActive: () => false, enter: async () => {}, exit: async () => {}, clear: () => {}, setCaption: () => {} },
    effects: { setMetrics: () => {}, shake: () => {} },
    render: () => {},
    announceTurn: () => {},
    sleep: async () => {},
    storage: storageAdapter(),
  });
  const hooks = createCampaignMatchHooks({
    runtime,
    dialogue,
    ensureFinalBattleStageAdvanced: () => presentation.ensureFinalBattleStageAdvanced(),
    maybeStartCpuTurn: () => {},
  });
  return { runtime, hooks };
}

const silentDialogue = { isOpen: () => false, show: async () => {} };

test("a pending stage with no beat left to play still advances", async () => {
  const { runtime, hooks } = brokenDialogueHarness(stuckDuelState(), silentDialogue);
  // Latch both of stage 1's beats so nextCampaignDialogueBeat offers nothing at all — the
  // state a burnt beat leaves behind.
  runtime.campaignMeta.finalBattleStageShown["won-1"] = true;
  runtime.campaignMeta.finalBattleStageShown["intro-1"] = true;

  hooks.maybeShowCampaignDialogue();
  await settle();

  assert.equal(getFinalBattleRules(runtime.state).stage, 2, "the board must be rebuilt even with no beat to play");
  assert.equal(runtime.state.phase, "playing");
});

test("a dialogue that rejects does not strand the stage change", async () => {
  const rejecting = { isOpen: () => false, show: () => Promise.reject(new Error("dialogue failed")) };
  const { runtime, hooks } = brokenDialogueHarness(stuckDuelState(), rejecting);

  hooks.maybeShowCampaignDialogue();
  await settle();

  assert.equal(getFinalBattleRules(runtime.state).stage, 2);
  assert.equal(runtime.state.phase, "playing");
});

test("a dialogue that opens but never plays its afterAction still advances", async () => {
  // The real failure mode behind this: a script that is shown and dismissed (Escape) without
  // its last line's afterAction ever firing.
  const { runtime, hooks } = brokenDialogueHarness(stuckDuelState(), silentDialogue);

  hooks.maybeShowCampaignDialogue();
  await settle();

  assert.equal(getFinalBattleRules(runtime.state).stage, 2);
});

test("a beat is never burnt by a script that throws while being built", async () => {
  const state = stuckDuelState();
  const { runtime, hooks } = brokenDialogueHarness(state, silentDialogue);
  // Latch the duel-won beat so the next beat offered is the duel intro, whose script reads
  // state.units — the one that can be made to blow up the way a stale speaker would.
  runtime.campaignMeta.finalBattleStageShown["won-1"] = true;
  const beforeFlags = { ...runtime.campaignMeta.finalBattleStageShown };

  const original = Object.getOwnPropertyDescriptor(state, "units");
  Object.defineProperty(state, "units", { get() { throw new Error("bad state"); }, configurable: true });
  assert.throws(() => hooks.maybeShowCampaignDialogue(), /bad state/,
    "the original failure must surface rather than being swallowed by the recovery");
  Object.defineProperty(state, "units", original);
  await settle();

  assert.deepEqual(
    runtime.campaignMeta.finalBattleStageShown,
    beforeFlags,
    "a beat that could not be built must remain available to try again",
  );
});

test("a beat that survived a failed build still advances the stage on the next pass", async () => {
  const state = stuckDuelState();
  const { runtime, hooks } = brokenDialogueHarness(state, silentDialogue);
  runtime.campaignMeta.finalBattleStageShown["won-1"] = true;

  const original = Object.getOwnPropertyDescriptor(state, "units");
  Object.defineProperty(state, "units", { get() { throw new Error("bad state"); }, configurable: true });
  assert.throws(() => hooks.maybeShowCampaignDialogue());
  Object.defineProperty(state, "units", original);
  await settle();

  // Nothing was burnt, so the very next command's pass through the hooks recovers the board.
  hooks.maybeShowCampaignDialogue();
  await settle();
  assert.equal(getFinalBattleRules(runtime.state).stage, 2);
});

test("the stage still advances even if the engine's win was never reverted", async () => {
  // The belt-and-braces case: recordCampaignProgress normally reopens the match before the
  // hooks run. If it ever did not, the board must still be rebuilt rather than stranded.
  const { runtime, hooks } = brokenDialogueHarness(stuckDuelState({ reopened: false }), silentDialogue);
  assert.equal(runtime.state.phase, "complete", "precondition: the win was left standing");

  hooks.maybeShowCampaignDialogue();
  await settle();

  assert.equal(getFinalBattleRules(runtime.state).stage, 2);
  assert.equal(runtime.state.phase, "playing");
});
