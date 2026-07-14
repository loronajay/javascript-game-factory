import test from "node:test";
import assert from "node:assert/strict";

import {
  artCalloutLabel,
  createBattleEventPresenter,
  eventSoundKeys,
} from "../src/ui/battleEventPresenter.js";

test("event sound routing leaves VFX-managed arts to their animation", () => {
  assert.deepEqual(eventSoundKeys({ type: "ART_RESOLVED", artId: "nuke" }), []);
  assert.deepEqual(eventSoundKeys({ type: "ART_RESOLVED", artId: "pray", healingByTarget: { ally: 3 } }), []);
});

test("event sound routing describes ordinary movement, defense, healing, and ranged arts", () => {
  assert.deepEqual(eventSoundKeys({ type: "UNIT_MOVED" }), ["unitMove"]);
  assert.deepEqual(eventSoundKeys({ type: "UNIT_DEFENDED" }), ["defend"]);
  assert.deepEqual(eventSoundKeys({ type: "ART_RESOLVED", artId: "renew", healingByTarget: { ally: 3 } }), ["heal"]);
  assert.deepEqual(eventSoundKeys({ type: "ART_RESOLVED", artId: "volley-shot" }), ["arrowHit"]);
  assert.deepEqual(eventSoundKeys({ type: "ART_RESOLVED", artId: "aimed-shot" }, { actorType: "archer" }), ["arrowAirborne", "arrowHit"]);
});

test("rolled events do not double-play their impact sound", () => {
  assert.deepEqual(eventSoundKeys({ type: "ART_RESOLVED", artId: "spark", hit: true }), []);
});

test("art callouts prefer mission aliases and otherwise humanize unknown ids", () => {
  assert.equal(artCalloutLabel({ fakeArtNames: { "dark-rush": "No Escape" } }, "dark-rush"), "No Escape");
  assert.equal(artCalloutLabel(null, "dark-rush"), "Dark Rush");
});

test("passive restore events show the passive callout and resource float", async () => {
  const calls = [];
  const state = {
    size: 13,
    units: [
      { id: "mag", type: "magician", player: 1, hp: 10, mp: 20, position: { x: 2, y: 2 } },
    ],
  };
  const presenter = createBattleEventPresenter({
    audio: { play() {} },
    effects: {
      artCallout: (unit, label) => { calls.push(["callout", unit.id, label]); },
      floatText: async (_position, text, color) => { calls.push(["float", text, color]); },
    },
    getState: () => state,
  });

  await presenter.playRolloverFx([{
    type: "PASSIVE_RESTORE",
    unitId: "mag",
    sourceId: "mag",
    passiveId: "magic-pipe",
    passiveName: "Magic Pipe",
    mpRestored: 10,
    hpRestored: 0,
  }]);

  assert.deepEqual(calls, [
    ["callout", "mag", "Magic Pipe"],
    ["float", "+10 MP", "#7fd0ff"],
  ]);
});

test("rage MP restore events show resource float text", async () => {
  const floats = [];
  const state = {
    size: 13,
    units: [
      { id: "mystic", type: "mystic", player: 1, hp: 5, mp: 25, position: { x: 2, y: 2 } },
    ],
  };
  const presenter = createBattleEventPresenter({
    audio: { play() {} },
    effects: {
      floatText: async (_position, text, color) => { floats.push([text, color]); },
    },
    getState: () => state,
  });

  await presenter.playRolloverFx([{
    type: "RAGE_REGENERATE",
    unitId: "mystic",
    hpRestored: 0,
    mpRestored: 15,
  }]);

  assert.deepEqual(floats, [["+15 MP", "#8cc8ff"]]);
});

test("blocking reaction VFX owns and releases the presenter's busy state", async () => {
  let finishVfx;
  let idleCalls = 0;
  const vfx = new Promise((resolve) => { finishVfx = resolve; });
  const state = {
    size: 13,
    currentPlayer: 1,
    units: [
      { id: "nemesis", type: "nemesis", player: 1, hp: 10, position: { x: 1, y: 1 } },
      { id: "target", type: "swordsman", player: 2, hp: 4, position: { x: 2, y: 1 } },
    ],
  };
  const presenter = createBattleEventPresenter({
    audio: { play() {} },
    effects: {
      deathBurst() {},
      floatText() {},
      playAbilityVfx: () => vfx,
    },
    getState: () => state,
    onIdle: () => { idleCalls += 1; },
  });

  const presentation = presenter.playRolloverFx([{
    type: "DARK_PULSE_AUTO",
    actorId: "nemesis",
    targetIds: ["target"],
    damageByTarget: { target: 1 },
  }]);

  assert.equal(presenter.isBusy(), true);
  finishVfx();
  await presentation;
  assert.equal(presenter.isBusy(), false);
  assert.equal(idleCalls, 1);
});
