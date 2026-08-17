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

function perfectFrames() {
  return [
    [10], [10], [10], [10], [10],
    [10], [10], [10], [10], [10, 10, 10],
  ];
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
  const perfect = player("p1", 300, Array(10).fill(300));
  perfect.frames = perfectFrames();
  const match = finishedMatch({
    players: [perfect, player("cpu", 190, [])],
  });

  assert.deepEqual(achievements.detectMatchAchievements({ match, localPlayerId: "p1" }), [
    "perfect-game",
    "clean-card",
    "turkey-club",
  ]);
});

test("clean-card requires a strike or spare in every regulation frame", () => {
  const clean = player("p1", 191, []);
  clean.frames = [
    [10], [8, 2], [10], [7, 3], [9, 1],
    [10], [6, 4], [10], [8, 2], [10, 8, 1],
  ];
  const open = { ...clean, frames: clean.frames.map((frame) => [...frame]) };
  open.frames[6] = [6, 3];

  assert.ok(achievements.detectMatchAchievements({
    match: finishedMatch({ players: [clean, player("cpu", 150)] }),
    localPlayerId: "p1",
  }).includes("clean-card"));
  assert.equal(achievements.detectMatchAchievements({
    match: finishedMatch({ players: [open, player("cpu", 150)] }),
    localPlayerId: "p1",
  }).includes("clean-card"), false);
});

test("turkey-club requires three consecutive strikes, including tenth-frame bonus balls", () => {
  const turkey = player("p1", 180, []);
  turkey.frames = [[6, 3], [10], [10], [10], [8, 1], [7, 2], [10], [9, 0], [8, 1], [10, 10, 10]];
  const near = { ...turkey, frames: turkey.frames.map((frame) => [...frame]) };
  near.frames[3] = [9, 1];
  near.frames[9] = [10, 9, 1];

  assert.ok(achievements.detectMatchAchievements({
    match: finishedMatch({ players: [turkey, player("cpu", 150)] }),
    localPlayerId: "p1",
  }).includes("turkey-club"));
  assert.equal(achievements.detectMatchAchievements({
    match: finishedMatch({ players: [near, player("cpu", 150)] }),
    localPlayerId: "p1",
  }).includes("turkey-club"), false);
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

test("tournament matches are sanctioned for finished-match achievements", () => {
  const perfect = player("p1", 300, Array(10).fill(300));
  perfect.frames = perfectFrames();
  const match = finishedMatch({
    playType: "tournament",
    players: [perfect, player("cpu", 190, [])],
  });
  assert.deepEqual(achievements.detectMatchAchievements({ match, localPlayerId: "p1" }), [
    "perfect-game",
    "clean-card",
    "turkey-club",
  ]);
});
