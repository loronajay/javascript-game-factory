import test from "node:test";
import assert from "node:assert/strict";

import {
  boardText,
  buildMatchDetailView,
  buildMatchRowView,
  durationText,
  opponentsOf,
  outcomeLabel,
  participantName,
  ratingDeltaText,
} from "../src/ui/rankedMatchDetailModel.js";

// A server match-history contract entry, already shaped to Bob's perspective.
function entry(overrides = {}) {
  return {
    contractVersion: 1,
    matchId: "m1",
    gameSlug: "tactical-arena",
    source: "ranked",
    mode: "ranked-1v1",
    status: "resolved",
    rated: true,
    board: "13x13",
    startedAt: "2026-07-20T00:00:00.000Z",
    endedAt: "2026-07-20T00:12:30.000Z",
    durationMs: 750000,
    turns: 14,
    verified: true,
    viewer: { playerId: "bob", seat: 2, outcome: "loss", ratingBefore: 1210, ratingAfter: 1195, ratingDelta: -15 },
    participants: [
      { playerId: "bob", seat: 2, isViewer: true, displayName: "Bob", title: null, outcome: "loss", ratingBefore: 1210, ratingAfter: 1195, ratingDelta: -15, squad: ["mystic"], unitsTotal: 1, unitsAlive: 0, unitsLost: 1 },
      { playerId: "alice", seat: 1, isViewer: false, displayName: "Alice", title: "War Chief", outcome: "win", ratingBefore: 1200, ratingAfter: 1215, ratingDelta: 15, squad: ["swordsman", "archer"], unitsTotal: 2, unitsAlive: 1, unitsLost: 1 },
    ],
    units: [
      { id: "a1", unitType: "swordsman", seat: 1, playerId: "alice", isViewer: false, alive: true, kills: 0 },
      { id: "a2", unitType: "archer", seat: 1, playerId: "alice", isViewer: false, alive: false, kills: 0 },
      { id: "b1", unitType: "mystic", seat: 2, playerId: "bob", isViewer: true, alive: false, kills: 0 },
    ],
    notes: [],
    ...overrides,
  };
}

test("buildMatchRowView summarizes a row from the server's viewer projection", () => {
  const row = buildMatchRowView(entry());
  assert.equal(row.matchId, "m1");
  assert.equal(row.outcome, "loss");
  assert.equal(row.mark, "L");
  assert.equal(row.deltaText, "-15");
  assert.equal(row.opponentName, "Alice");
  assert.deepEqual(row.squad, ["mystic"], "the row leads with the viewer's own squad");
});

test("buildMatchRowView never invents an outcome the server did not attest", () => {
  const row = buildMatchRowView(entry({ viewer: { playerId: "bob", seat: 2, outcome: null, ratingDelta: null } }));
  assert.equal(row.outcome, "none");
  assert.equal(row.mark, "–");
  assert.equal(row.deltaText, "", "an unknown delta is blank, not 0");
});

test("ratingDeltaText keeps a real zero swing distinct from an unknown one", () => {
  assert.equal(ratingDeltaText(15), "+15");
  assert.equal(ratingDeltaText(-15), "-15");
  assert.equal(ratingDeltaText(0), "0", "a damped repeat-opponent match really did move 0");
  assert.equal(ratingDeltaText(null), "");
  assert.equal(ratingDeltaText(undefined), "");
});

test("buildMatchDetailView lists only the facts the record actually carries", () => {
  const view = buildMatchDetailView(entry());
  assert.equal(view.outcomeLabel, "Defeat");
  assert.deepEqual(view.meta.map((m) => m.label), ["Played", "Length", "Turns", "Board"]);
  assert.equal(view.meta.find((m) => m.label === "Length").value, "12m 30s");
  assert.equal(view.meta.find((m) => m.label === "Board").value, "13 x 13");
  assert.deepEqual(view.rating, { before: 1210, after: 1195, deltaText: "-15", direction: "down" });
});

test("buildMatchDetailView drops meta rows for unknown values instead of showing a dash", () => {
  const view = buildMatchDetailView(entry({ durationMs: null, turns: null, board: null, endedAt: null }));
  assert.deepEqual(view.meta, []);
});

test("buildMatchDetailView splits units onto the side that owned them, viewer first", () => {
  const view = buildMatchDetailView(entry());
  assert.equal(view.sides.length, 2);
  const [me, them] = view.sides;
  assert.equal(me.isViewer, true);
  assert.equal(me.name, "You");
  assert.deepEqual(me.units.map((u) => u.unitType), ["mystic"]);
  assert.equal(me.survivalText, "0/1 survived");
  assert.deepEqual(them.units.map((u) => u.unitType), ["swordsman", "archer"]);
  assert.equal(them.units[0].alive, true);
  assert.equal(them.units[1].alive, false);
  assert.equal(them.name, "Alice");
});

test("buildMatchDetailView falls back to squad names with no survival claim when unverified", () => {
  const view = buildMatchDetailView(entry({
    verified: false,
    units: [],
    notes: [{ code: "board_unverified", text: "Both players did not confirm the same final board." }],
  }));
  assert.equal(view.verified, false);
  const [me] = view.sides;
  assert.deepEqual(me.units.map((u) => u.unitType), ["mystic"]);
  assert.equal(me.units[0].alive, null, "an unattested board must not claim a unit survived");
  assert.equal(view.notes.length, 1);
});

test("buildMatchDetailView marks a voided match unrated with no rating block", () => {
  const view = buildMatchDetailView(entry({
    status: "voided",
    rated: false,
    viewer: { playerId: "bob", seat: 2, outcome: null, ratingBefore: null, ratingAfter: null, ratingDelta: null },
    notes: [{ code: "short_match", text: "This match ended too early to count toward ranked." }],
  }));
  assert.equal(view.rated, false);
  assert.equal(view.rating, null);
  assert.equal(view.outcomeLabel, "No result");
});

test("participantName prefers a ranked tagline over the placeholder profile name", () => {
  assert.equal(participantName({ isViewer: true, displayName: "Bob" }), "You");
  assert.equal(participantName({ displayName: "Commander", title: "War Chief" }), "War Chief");
  assert.equal(participantName({ displayName: "Commander", title: "" }), "Commander");
  assert.equal(participantName({ displayName: "  Alice  " }), "Alice");
  assert.equal(participantName(null), "Commander");
});

test("opponentsOf shows every participant when there is no viewer (spectator view)", () => {
  const spectating = entry({ viewer: null });
  spectating.participants = spectating.participants.map((p) => ({ ...p, isViewer: false }));
  assert.equal(opponentsOf(spectating).length, 2);
  assert.equal(opponentsOf(entry()).length, 1);
});

test("durationText scales from seconds to hours", () => {
  assert.equal(durationText(42000), "42s");
  assert.equal(durationText(750000), "12m 30s");
  assert.equal(durationText(3900000), "1h 05m");
  assert.equal(durationText(null), "");
  assert.equal(durationText(-5), "");
});

test("boardText formats a known size and passes anything else through", () => {
  assert.equal(boardText("15x15"), "15 x 15");
  assert.equal(boardText("weird"), "weird");
  assert.equal(boardText(null), "");
});

test("outcomeLabel and the view reject a malformed entry rather than rendering junk", () => {
  assert.equal(outcomeLabel(null), "No result");
  assert.equal(buildMatchDetailView(null), null);
  assert.equal(buildMatchRowView("nope"), null);
});

test("per-unit kills survive into the detail view now that they are real", () => {
  const view = buildMatchDetailView(entry({
    units: [
      { id: "a1", unitType: "swordsman", seat: 1, playerId: "alice", isViewer: false, alive: true, kills: 2 },
      { id: "a2", unitType: "archer", seat: 1, playerId: "alice", isViewer: false, alive: false, kills: 0 },
      { id: "b1", unitType: "mystic", seat: 2, playerId: "bob", isViewer: true, alive: false, kills: 0 },
    ],
  }));
  const alice = view.sides.find((side) => side.name === "Alice");
  assert.equal(alice.units.find((unit) => unit.id === "a1").kills, 2);
  assert.equal(alice.units.find((unit) => unit.id === "a2").kills, 0);
});

test("an unattested board still claims no kills rather than reporting zero", () => {
  const view = buildMatchDetailView(entry({ verified: false, units: [] }));
  for (const side of view.sides) {
    for (const unit of side.units) {
      assert.equal(unit.kills, null, "no cross-attested board means no kill claim at all");
      assert.equal(unit.alive, null);
    }
  }
});
