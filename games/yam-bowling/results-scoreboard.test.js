const assert = require("node:assert/strict");
const test = require("node:test");

const core = {
  MODES: { quick: { name: "Quick Bowl", frames: 3 } },
  notation(rolls, index) {
    const pins = rolls[index];
    if (pins == null) return "";
    if (pins === 10) return "X";
    if (index > 0 && rolls[0] + pins === 10) return "/";
    return String(pins);
  },
};

test("final scoreboard shows every frame, cumulative score, total, and winner", async () => {
  const { buildFinalScoreboardMarkup } = await import("./ui/results-screen.mjs");
  const match = {
    modeId: "quick",
    winnerIds: ["p1"],
    players: [
      {
        id: "p1",
        name: "Hazel Ward",
        frames: [[10], [7, 3], [9, 1, 10]],
        score: { cumulative: [20, 39, 59], total: 59 },
      },
      {
        id: "p2",
        name: "Lumi Vega",
        frames: [[8, 1], [6, 2], [7, 2]],
        score: { cumulative: [9, 17, 26], total: 26 },
      },
    ],
  };

  const html = buildFinalScoreboardMarkup(match, core);

  assert.match(html, /result-score-row is-winner/);
  assert.match(html, /Hazel Ward/);
  assert.match(html, /<i>X<\/i>/);
  assert.match(html, /<i>\/<\/i>/);
  assert.match(html, /<b>39<\/b>/);
  assert.match(html, /result-score-total[^>]*><small>Final<\/small><strong>59<\/strong>/);
  assert.equal((html.match(/class="result-score-frame"/g) || []).length, 6);
});

test("final scoreboard escapes player names and labels tied winners", async () => {
  const { buildFinalScoreboardMarkup } = await import("./ui/results-screen.mjs");
  const match = {
    modeId: "quick",
    winnerIds: ["p1", "p2"],
    players: [
      { id: "p1", name: "<Hazel>", frames: [[], [], []], score: { cumulative: [], total: 0 } },
      { id: "p2", name: "Lumi & Co", frames: [[], [], []], score: { cumulative: [], total: 0 } },
    ],
  };

  const html = buildFinalScoreboardMarkup(match, core);

  assert.doesNotMatch(html, /<Hazel>/);
  assert.match(html, /&lt;Hazel&gt;/);
  assert.match(html, /Lumi &amp; Co/);
  assert.equal((html.match(/Tied first/g) || []).length, 2);
});
