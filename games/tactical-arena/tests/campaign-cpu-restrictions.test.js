// The mission-scoped CPU ART denylists, now that they are their own module.
//
// The Banish gate is the one that matters for the finale: Banish spends every point of
// Blacksword's own HP to erase every enemy standing on a dark tile, so the engine's own
// "any enemy on a dark tile" usability gate would have him throw his life away to take one
// unit with him. He is only allowed to reach for it when it wipes the WHOLE party — which
// is what makes it a threat the player can actually answer by spreading off the dark.
import test from "node:test";
import assert from "node:assert/strict";

import {
  campaignCpuExcludedArtIds,
  finalBattleExcludedArtIds,
  witchDoctorExcludedArtIds,
} from "../src/campaign/campaignCpuRestrictions.js";
import {
  FINAL_BATTLE_MISSION_ID,
  WITCH_DOCTOR_HEAL_CAST_CAP,
  WITCH_DOCTOR_MISSION_ID,
} from "../src/campaign/campaign.js";

// A board whose tile affinities we control directly. Note that getTileAffinity falls back to
// a CHECKERBOARD when a tile has no entry — an unset tile is light or dark by parity, never
// neutral — so every tile under a unit is written explicitly here rather than left to default
// into the very affinity the rule keys on.
function boardWith(partyTiles) {
  const tiles = {};
  const units = partyTiles.map((affinity, index) => {
    const position = { x: index, y: 0 };
    tiles[`${position.x},${position.y}`] = affinity === "dark" ? "dark" : "light";
    return { id: `p1-${index}`, player: 1, hp: 10, position };
  });
  return { size: partyTiles.length + 2, units, tileAffinities: tiles };
}

test("Blacksword is denied Banish unless it takes the whole party with him", () => {
  const partial = boardWith(["dark", "dark", "light", "dark"]);
  assert.deepEqual(finalBattleExcludedArtIds(partial), ["banish-dark"],
    "one unit off the dark is enough to make the trade a bad one");
});

test("Blacksword may cast Banish when every living party member is on the dark", () => {
  const wipe = boardWith(["dark", "dark", "dark", "dark"]);
  assert.equal(finalBattleExcludedArtIds(wipe), null, "a full wipe is the trade he will make");
});

test("dead party members do not count toward the wipe", () => {
  const state = boardWith(["dark", "dark", "dark", "light"]);
  state.units[3].hp = 0; // the one off the dark is already down
  assert.equal(finalBattleExcludedArtIds(state), null,
    "a corpse standing off the dark must not shield the living");
});

test("an empty party never unlocks Banish", () => {
  assert.deepEqual(finalBattleExcludedArtIds({ units: [] }), ["banish-dark"]);
  assert.deepEqual(finalBattleExcludedArtIds(null), ["banish-dark"]);
});

test("Rain Dance is denied only once the heal-stall cap is reached", () => {
  assert.equal(witchDoctorExcludedArtIds(0), null);
  assert.equal(witchDoctorExcludedArtIds(WITCH_DOCTOR_HEAL_CAST_CAP - 1), null);
  assert.deepEqual(witchDoctorExcludedArtIds(WITCH_DOCTOR_HEAL_CAST_CAP), ["rain-dance"]);
  assert.deepEqual(witchDoctorExcludedArtIds(WITCH_DOCTOR_HEAL_CAST_CAP + 5), ["rain-dance"]);
  assert.equal(witchDoctorExcludedArtIds(undefined), null);
});

test("no restriction applies outside campaign, or on a mission that has none", () => {
  const state = boardWith(["dark", "dark", "dark", "dark"]);
  assert.equal(campaignCpuExcludedArtIds({ matchMode: "hotseat", campaignMissionId: FINAL_BATTLE_MISSION_ID, state }), null);
  assert.equal(campaignCpuExcludedArtIds({ matchMode: "online", campaignMissionId: FINAL_BATTLE_MISSION_ID, state }), null);
  assert.equal(campaignCpuExcludedArtIds({ matchMode: "campaign", campaignMissionId: "some-other-mission", state }), null);
  assert.equal(campaignCpuExcludedArtIds({}), null);
});

test("the dispatcher routes each mission to its own rule", () => {
  const partial = boardWith(["dark", "light"]);
  assert.deepEqual(
    campaignCpuExcludedArtIds({ matchMode: "campaign", campaignMissionId: FINAL_BATTLE_MISSION_ID, state: partial }),
    ["banish-dark"],
  );
  assert.deepEqual(
    campaignCpuExcludedArtIds({
      matchMode: "campaign",
      campaignMissionId: WITCH_DOCTOR_MISSION_ID,
      campaignMeta: { witchDoctorHealCastCount: WITCH_DOCTOR_HEAL_CAST_CAP },
    }),
    ["rain-dance"],
  );
});
