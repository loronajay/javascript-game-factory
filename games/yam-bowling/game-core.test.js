const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  MODES,
  CPU_LEVELS,
  createMatch,
  recordRoll,
  scoreFrames,
  pinsStandingForTurn,
  createCpuShot,
  CPU_NAMES,
  chooseCpuName,
} = require("./game-core.js");

const players = [
  { id: "p1", name: "Player 1", characterSlug: "daisy-monroe", skinId: "swimsuit", type: "human" },
  { id: "p2", name: "Player 2", characterSlug: "nia-brooks", type: "human" },
];

describe("bowling scoring", () => {
  test("scores a perfect ten-frame game as 300", () => {
    assert.equal(scoreFrames(Array.from({ length: 10 }, (_, i) => i === 9 ? [10, 10, 10] : [10])).total, 300);
  });

  test("scores open frames, spares, and delayed bonuses", () => {
    const score = scoreFrames([[7, 2], [5, 5], [6, 1], ...Array.from({ length: 7 }, () => [0, 0])]);
    assert.equal(score.cumulative[0], 9);
    assert.equal(score.cumulative[1], 25);
    assert.equal(score.total, 32);
  });

  test("leaves unresolved strike bonuses out of the displayed total", () => {
    assert.deepEqual(scoreFrames([[10]]), {
      total: 0,
      cumulative: [null],
    });
  });
});

describe("local match turns", () => {
  test("keeps each player's equipped skin in match state", () => {
    const match = createMatch({ modeId: "quick", playType: "hotseat", players });
    assert.equal(match.players[0].skinId, "swimsuit");
    assert.equal(match.players[1].skinId, "canon");
  });

  test("hands a completed frame to the next hotseat player", () => {
    let match = createMatch({ modeId: "quick", playType: "hotseat", players });
    match = recordRoll(match, 10);
    assert.equal(match.activePlayer, 1);
    assert.equal(match.frameIndex, 0);
    assert.deepEqual(match.players[0].frames[0], [10]);

    match = recordRoll(match, 4);
    assert.equal(pinsStandingForTurn(match), 6);
    match = recordRoll(match, 6);
    assert.equal(match.activePlayer, 0);
    assert.equal(match.frameIndex, 1);
  });

  test("grants final-frame bonus balls and then declares a winner", () => {
    let match = createMatch({ modeId: "quick", playType: "hotseat", players });
    for (let frame = 0; frame < 2; frame += 1) {
      match = recordRoll(match, 0); match = recordRoll(match, 0);
      match = recordRoll(match, 0); match = recordRoll(match, 0);
    }
    match = recordRoll(match, 10);
    assert.equal(match.activePlayer, 0);
    assert.equal(pinsStandingForTurn(match), 10);
    match = recordRoll(match, 10);
    match = recordRoll(match, 10);
    assert.equal(match.activePlayer, 1);
    match = recordRoll(match, 4);
    match = recordRoll(match, 2);

    assert.equal(match.status, "complete");
    assert.deepEqual(match.winnerIds, ["p1"]);
    assert.equal(match.players[0].score.total, 30);
  });

  test("rejects rolls that exceed the pins still standing", () => {
    let match = createMatch({ modeId: "quick", playType: "hotseat", players });
    match = recordRoll(match, 7);
    assert.throws(() => recordRoll(match, 4), /standing/i);
  });
});

describe("modes and CPU planning", () => {
  test("offers short and regulation-length matches", () => {
    assert.equal(MODES.quick.frames, 3);
    assert.equal(MODES.classic.frames, 10);
    assert.ok(CPU_LEVELS.casual);
    assert.ok(CPU_LEVELS.pro);
  });

  test("creates bounded, deterministic CPU setup from an injected random source", () => {
    const shot = createCpuShot({ levelId: "pro", standingPins: 10, random: () => 0.5 });
    assert.deepEqual(shot, { position: -0.08, aim: 0.12, hook: -0.2, power: 0.91 });

    const noisy = createCpuShot({ levelId: "casual", standingPins: 4, random: () => 1 });
    assert.ok(noisy.position >= -0.46 && noisy.position <= 0.46);
    assert.ok(noisy.aim >= -0.45 && noisy.aim <= 0.45);
    assert.ok(noisy.hook >= -1 && noisy.hook <= 1);
    assert.ok(noisy.power >= 0.55 && noisy.power <= 1);
  });

  test("offers a large, unique pool of Yam-spun CPU names", () => {
    assert.ok(CPU_NAMES.length >= 50);
    assert.equal(new Set(CPU_NAMES).size, CPU_NAMES.length);
    assert.ok(CPU_NAMES.includes("Yamantha"));
    assert.ok(CPU_NAMES.includes("Yammy"));
    assert.ok(CPU_NAMES.every((name) => typeof name === "string" && name.trim().length > 0));
  });

  test("keeps masculine name spins out of the all-female CPU roster", () => {
    const masculineSpins = [
      "Yamuel", "Yamothy", "Yamjamin", "Yamason", "Yamatthew", "Yamichael",
      "Yamathan", "Yamicholas", "Yamavid", "Yamoseph", "Yamilliam", "Yamichard",
      "Yamthony", "Yamstopher", "Yamlexander", "Yamthaniel", "Yamatrick",
    ];
    assert.deepEqual(CPU_NAMES.filter((name) => masculineSpins.includes(name)), []);
  });

  test("chooses CPU names deterministically from an injected random source", () => {
    assert.equal(chooseCpuName(() => 0), CPU_NAMES[0]);
    assert.equal(chooseCpuName(() => 0.5), CPU_NAMES[Math.floor(CPU_NAMES.length / 2)]);
    assert.equal(chooseCpuName(() => 0.999999), CPU_NAMES.at(-1));
  });
});
