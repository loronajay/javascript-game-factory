const test = require("node:test");
const assert = require("node:assert/strict");

const achievements = require("./achievement-core.js");

function player(id, total, cumulative = []) {
  return {
    id,
    score: { total, cumulative },
    frames: Array.from({ length: 10 }, () => []),
  };
}

function finishedMatch(overrides = {}) {
  return {
    status: "complete",
    modeId: "classic",
    playType: "campaign",
    winnerIds: ["p1"],
    players: [
      player("p1", 180, [20, 40, 60, 80, 100, 120, 140, 160, 180, 180]),
      player("cpu", 150, [15, 30, 45, 60, 75, 90, 105, 120, 135, 150]),
    ],
    ...overrides,
  };
}

test("perfect-game is earned by a sanctioned regulation 300", () => {
  const match = finishedMatch({
    players: [player("p1", 300, Array(10).fill(300)), player("cpu", 190, [])],
  });

  assert.deepEqual(achievements.detectMatchAchievements({ match, localPlayerId: "p1" }), [
    "perfect-game",
  ]);
});

test("comeback-kid requires a win after trailing by at least 30 entering the tenth", () => {
  const match = finishedMatch({
    players: [
      player("p1", 190, [10, 20, 30, 40, 50, 70, 90, 110, 120, 190]),
      player("cpu", 170, [20, 40, 60, 80, 100, 115, 130, 145, 150, 170]),
    ],
  });

  assert.deepEqual(achievements.detectMatchAchievements({ match, localPlayerId: "p1" }), [
    "comeback-kid",
  ]);
});

test("split-decision requires an exact 7-10 leave followed by a conversion", () => {
  const match = finishedMatch();
  const rolls = [
    { playerId: "p1", frameIndex: 4, rollIndex: 0, standingPinIdsAfter: [7, 10] },
    { playerId: "p1", frameIndex: 4, rollIndex: 1, standingPinIdsAfter: [] },
  ];

  assert.deepEqual(achievements.detectMatchAchievements({ match, localPlayerId: "p1", rolls }), [
    "split-decision",
  ]);
});

test("near misses, local quick play, and unfinished matches grant nothing", () => {
  const nearComeback = finishedMatch({
    players: [
      player("p1", 190, [10, 20, 30, 40, 50, 70, 90, 121, 121, 190]),
      player("cpu", 170, [20, 40, 60, 80, 100, 115, 130, 145, 150, 170]),
    ],
  });
  const nearSplit = [
    { playerId: "p1", frameIndex: 2, rollIndex: 0, standingPinIdsAfter: [7, 9, 10] },
    { playerId: "p1", frameIndex: 2, rollIndex: 1, standingPinIdsAfter: [] },
  ];

  assert.deepEqual(achievements.detectMatchAchievements({ match: nearComeback, localPlayerId: "p1", rolls: nearSplit }), []);
  assert.deepEqual(achievements.detectMatchAchievements({
    match: { ...finishedMatch(), playType: "cpu" },
    localPlayerId: "p1",
  }), []);
  assert.deepEqual(achievements.detectMatchAchievements({
    match: { ...finishedMatch(), status: "playing" },
    localPlayerId: "p1",
  }), []);
});
