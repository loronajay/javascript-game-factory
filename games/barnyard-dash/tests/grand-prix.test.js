import test from "node:test";
import assert from "node:assert/strict";

import { CUPS, GRID_SIZE, POINTS_BY_PLACE, createGrandPrix, grandPrixFinished, grandPrixStandings, grandPrixSummary, nextGrandPrixRace, recordGrandPrixRace, trophyItemId } from "../scripts/grand-prix.js";
import { COURSE_IDS } from "../scripts/sim/courses.js";
import { createRace, raceOrder, stepRace } from "../scripts/sim/race.js";

const PET = { instanceId: "me", speciesId: "pet.corgi", name: "Biscuit", paletteId: "standard", stats: { speed: 50, strength: 50, size: 1 } };

test("every cup races real courses and a win at each class names a trophy", () => {
  assert.equal(CUPS.length, 3);
  for (const cup of CUPS) {
    assert.ok(cup.courses.length >= 3);
    for (const course of cup.courses) assert.ok(COURSE_IDS.includes(course), `${cup.id} races unknown course ${course}`);
    assert.equal(trophyItemId(cup.id, "rookie"), `decor.prop.trophy-${cup.id}-bronze`);
    assert.equal(trophyItemId(cup.id, "champion"), `decor.prop.trophy-${cup.id}-gold`);
  }
});

test("a cup keeps one grid of seven pool rivals for every race; a new run draws a new grid", () => {
  const gp = createGrandPrix({ cupId: "clover-cup", level: "pro", playerPet: PET, seed: "run-1" });
  assert.equal(gp.entrants.length, GRID_SIZE);
  assert.equal(gp.entrants[0].id, "player");
  assert.ok(gp.entrants.slice(1).every((entrant) => entrant.cpu === "pro"));
  const other = createGrandPrix({ cupId: "clover-cup", level: "pro", playerPet: PET, seed: "run-2" });
  assert.notDeepEqual(other.entrants.map(({ id }) => id), gp.entrants.map(({ id }) => id));
});

function score(gp, order) {
  return recordGrandPrixRace(gp, { order, finishedAt: Object.fromEntries(order.map((id, index) => [id, 60 + index])) });
}

test("points follow each race's placings and the table leads with the points leader", () => {
  let gp = createGrandPrix({ cupId: "clover-cup", level: "rookie", playerPet: PET, seed: "t" });
  const ids = gp.entrants.map(({ id }) => id);
  gp = score(gp, ids);
  assert.equal(gp.points.player, POINTS_BY_PLACE[0]);
  const rivalFirst = [ids[1], ids[2], "player", ...ids.slice(3)];
  gp = score(gp, rivalFirst);
  gp = score(gp, rivalFirst);
  assert.equal(grandPrixFinished(gp), true);
  const table = grandPrixStandings(gp);
  assert.equal(table[0].id, ids[1]);
  assert.equal(table[0].points, 8 + 10 + 10);
  assert.equal(table.find((row) => row.player).points, 10 + 6 + 6);
  assert.equal(nextGrandPrixRace(gp), null);
});

test("a pet that does not finish scores nothing, and the next grid starts in reverse table order", () => {
  let gp = createGrandPrix({ cupId: "clover-cup", level: "rookie", playerPet: PET, seed: "t" });
  const ids = gp.entrants.map(({ id }) => id);
  gp = recordGrandPrixRace(gp, { order: ids, finishedAt: { ...Object.fromEntries(ids.map((id) => [id, 50])), player: null } });
  assert.equal(gp.points.player, 0);
  const next = nextGrandPrixRace(gp);
  assert.equal(next.number, 2);
  assert.equal(next.entrants[0].id, "player", "the last-placed pet starts from the front of the grid order");
  assert.equal(next.entrants.at(-1).id, ids[1]);
});

test("a whole cup runs on the real sim and its summary names the player's races and final place", () => {
  let gp = createGrandPrix({ cupId: "clover-cup", level: "rookie", playerPet: PET, seed: "sim" });
  let elapsed = 0;
  while (!grandPrixFinished(gp)) {
    const next = nextGrandPrixRace(gp);
    // The "player" is left undriven, so this is the CPUs' race — the player finishes last or not at all.
    let race = createRace({ track: next.course.track, entrants: next.entrants, countdownSeconds: 0, totalLaps: next.course.laps, seed: next.seed, finishWindowSeconds: 5 });
    while (race.status !== "finished") race = stepRace(race, {}, 1 / 60);
    elapsed += race.elapsed;
    gp = recordGrandPrixRace(gp, { order: raceOrder(race).map(({ id }) => id), finishedAt: Object.fromEntries(race.racers.map((racer) => [racer.id, racer.finishedAt])) });
  }
  const summary = grandPrixSummary(gp, { runId: "run-abc", durationMs: elapsed * 1000 });
  assert.equal(summary.mode, "cup");
  assert.equal(summary.cupId, "clover-cup");
  assert.equal(summary.races.length, 3);
  assert.ok(summary.races.every((race) => race.finished === false && race.place === GRID_SIZE));
  assert.equal(summary.finalPlace, GRID_SIZE);
});
