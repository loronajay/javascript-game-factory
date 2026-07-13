import test from "node:test";
import assert from "node:assert/strict";

import {
  commandFloatFor,
  presentInstantArt,
  weatherFloatFor,
} from "../src/ui/instantArtPresenter.js";

test("King command presentation maps each order to its live buff stat", () => {
  assert.deepEqual(commandFloatFor("strike"), { stat: "strength", suffix: "STR", color: "#ff9a6b" });
  assert.deepEqual(commandFloatFor("higher-ground"), { stat: "attackRange", suffix: "RANGE", color: "#f2d472" });
  assert.equal(commandFloatFor("unknown"), null);
});

test("weather presentation maps authored weather arts to readable floats", () => {
  assert.deepEqual(weatherFloatFor("blizzard"), { label: "-1 MOVE", color: "#70b7ff" });
  assert.deepEqual(weatherFloatFor("thunderstorm"), { label: "+1 MAGIC", color: "#b08cff" });
  assert.equal(weatherFloatFor("great-flood"), null);
});

test("generic healing presentation plays the authored VFX and floats each restored pool", async () => {
  const actor = { id: "mystic", type: "mystic", player: 1, position: { x: 1, y: 1 } };
  const target = { id: "ally", type: "archer", player: 1, position: { x: 2, y: 1 } };
  const calls = [];
  const resolved = {
    artId: "wish",
    healingByTarget: { ally: 2 },
    restoredByTarget: { ally: 1 },
  };

  await presentInstantArt({
    state: { size: 13, units: [actor, target] },
    result: { nextState: { size: 13, units: [actor, target] } },
    resolved,
    actorBefore: actor,
    targetsBefore: [target],
    effects: {
      playAbilityVfx: async (artId, options) => { calls.push(["vfx", artId, options.targets.map((unit) => unit.id)]); },
      floatText: async (_position, text, color) => { calls.push(["float", text, color]); },
    },
    audio: { play() {} },
    revealRoll: async () => {},
    artDefinition: () => null,
    render: () => {},
  });

  assert.deepEqual(calls, [
    ["vfx", "wish", ["ally"]],
    ["float", "+2", "#8cf0a4"],
    ["float", "+1 MP", "#7fd0ff"],
  ]);
});
