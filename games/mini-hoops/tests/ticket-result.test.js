import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { buildTicketResult } from "../scripts/multiplayer/ticket-result.js";
import { createRun, recordMade, recordShot, runSummary } from "../scripts/sim/run.js";

suite("ticket result — what the cabinet files with the platform");

function playedRun() {
  const run = createRun({ duration: 30, modeId: "circle", locationId: "gym", ballId: "classic" });
  for (let i = 0; i < 9; i += 1) recordShot(run);
  for (let i = 0; i < 5; i += 1) recordMade(run);
  return runSummary(run);
}

test("a solo run reports its round, not its score", () => {
  const payload = buildTicketResult({ playMode: "solo", summary: playedRun(), resultId: "hoops-abc-12345678", durationMs: 34_210.7 });
  assertEqual(JSON.stringify(payload), JSON.stringify({
    resultId: "hoops-abc-12345678",
    hoopMode: "circle",
    roundSeconds: 30,
    shots: 9,
    made: 5,
    durationMs: 34_210,
    mode: "solo",
  }));
});

test("an online duel reports its outcome; a forfeit reports nothing", () => {
  const base = { playMode: "online", summary: playedRun(), resultId: "hoops-abc-12345678", durationMs: 40_000 };
  assertEqual(buildTicketResult({ ...base, outcome: "draw" }).outcome, "draw");
  assertEqual(buildTicketResult({ ...base, outcome: "win" }).mode, "online");
  assertEqual(buildTicketResult({ ...base, outcome: "win", forfeit: true }), null);
  assertEqual(buildTicketResult({ ...base }), null);
});

test("hotseat and a missing id report nothing", () => {
  assertEqual(buildTicketResult({ playMode: "hotseat", summary: playedRun(), resultId: "hoops-abc-12345678", durationMs: 40_000 }), null);
  assertEqual(buildTicketResult({ playMode: "solo", summary: playedRun(), resultId: null, durationMs: 40_000 }), null);
});

test("nothing in the payload names an amount", () => {
  const payload = buildTicketResult({ playMode: "solo", summary: playedRun(), resultId: "hoops-abc-12345678", durationMs: 40_000 });
  for (const key of ["tickets", "reward", "amount", "score"]) assert(!(key in payload), `payload names ${key}`);
});

finish();
