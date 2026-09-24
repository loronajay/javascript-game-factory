// What a decided match files with the platform for tickets, and when.
//
// The payout itself is the server's (platform-api's shark-hall-ticket-rewards);
// this is the cabinet's half: which matches are reported at all, what facts
// they carry, and that one match is filed exactly once.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, assertDeepEqual, assertEqual, finish, suite, test } from "./harness.js";
import { buildTicketResult } from "../scripts/match/ticket-result.js";
import { createTicketReporter } from "../scripts/store/ticket-reporter.js";

suite("tickets — what a decided match reports");

const cpuSnapshot = (overrides = {}) => ({ mode: "cpu", difficulty: "sharp", ...overrides });
const onlineSnapshot = (overrides = {}) => ({
  mode: "online",
  raceTo: 3,
  mySeat: 1,
  seats: [
    { seat: 0, wins: 2, connected: true },
    { seat: 1, wins: 3, connected: true },
  ],
  ...overrides,
});

test("a CPU rack reports one rack, the difficulty, and who took it", () => {
  const won = buildTicketResult({ snapshot: cpuSnapshot(), winnerSeat: 0, resultId: "shark-a-12345678", durationMs: 181_500.9, strokes: 17 });
  assertDeepEqual(won, {
    resultId: "shark-a-12345678",
    strokes: 17,
    durationMs: 181_500,
    mode: "cpu",
    difficulty: "sharp",
    raceTo: 1,
    outcome: "win",
    myRacks: 1,
    opponentRacks: 0,
  });
  const lost = buildTicketResult({ snapshot: cpuSnapshot(), winnerSeat: 1, resultId: "shark-a-12345678", durationMs: 60_000, strokes: 9 });
  assertEqual(lost.outcome, "loss");
  assertEqual(lost.opponentRacks, 1);
});

test("an online race reports this seat's side of the score", () => {
  const payload = buildTicketResult({ snapshot: onlineSnapshot(), winnerSeat: 1, resultId: "shark-b-12345678", durationMs: 700_000, strokes: 80 });
  assertEqual(payload.mode, "online");
  assertEqual(payload.outcome, "win");
  assertEqual(payload.myRacks, 3);
  assertEqual(payload.opponentRacks, 2);
  assertEqual(payload.raceTo, 3);
  assert(!("difficulty" in payload), "online has no difficulty");
});

test("a table the other seat walked out of is not reported", () => {
  const walked = onlineSnapshot({ seats: [{ seat: 0, wins: 1, connected: false }, { seat: 1, wins: 3, connected: true }] });
  assertEqual(buildTicketResult({ snapshot: walked, winnerSeat: 1, resultId: "shark-b-12345678", durationMs: 700_000, strokes: 40 }), null);
});

test("hotseat, an unknown seat and a missing id report nothing", () => {
  const args = { winnerSeat: 0, resultId: "shark-c-12345678", durationMs: 60_000, strokes: 9 };
  assertEqual(buildTicketResult({ ...args, snapshot: { mode: "hotseat" } }), null);
  assertEqual(buildTicketResult({ ...args, snapshot: cpuSnapshot(), winnerSeat: null }), null);
  assertEqual(buildTicketResult({ ...args, snapshot: cpuSnapshot(), resultId: null }), null);
  assertEqual(buildTicketResult({ ...args, snapshot: onlineSnapshot({ mySeat: -1 }) }), null);
});

test("nothing in the payload names an amount", () => {
  const payload = buildTicketResult({ snapshot: cpuSnapshot(), winnerSeat: 0, resultId: "shark-a-12345678", durationMs: 60_000, strokes: 9 });
  for (const key of ["tickets", "reward", "amount", "payout"]) assert(!(key in payload), `payload names ${key}`);
});

suite("tickets — one match, one filing");

function harness() {
  const filed = [];
  let clock = 1_000;
  let ids = 0;
  const reporter = createTicketReporter({
    reporter: { report: (slug, payload) => filed.push({ slug, payload }) },
    mintId: (prefix) => `${prefix}-id-${String(++ids).padStart(8, "0")}`,
    now: () => clock,
  });
  return { reporter, filed, advance: (ms) => { clock += ms; } };
}

test("a match carries its id, clock and strokes to the one filing", () => {
  const { reporter, filed, advance } = harness();
  reporter.begin();
  reporter.stroke();
  reporter.stroke();
  advance(42_000);
  reporter.finish((facts) => ({ ...facts }));
  assertDeepEqual(filed, [{ slug: "shark-hall", payload: { resultId: "shark-id-00000001", durationMs: 42_000, strokes: 2 } }]);
  assertEqual(reporter.active, false);
});

test("a second win without a new match files nothing", () => {
  const { reporter, filed } = harness();
  reporter.begin();
  reporter.finish((facts) => facts);
  reporter.finish((facts) => facts);
  reporter.stroke();
  assertEqual(filed.length, 1);
});

test("a restart abandons the rack under way and starts a fresh id", () => {
  const { reporter, filed } = harness();
  reporter.begin();
  reporter.stroke();
  reporter.begin();
  reporter.finish((facts) => facts);
  assertEqual(filed[0].payload.resultId, "shark-id-00000002");
  assertEqual(filed[0].payload.strokes, 0);
});

test("a match the builder declines is spent and not filed", () => {
  const { reporter, filed } = harness();
  reporter.begin();
  reporter.finish(() => null);
  assertEqual(filed.length, 0);
  assertEqual(reporter.active, false);
});

test("the page loads the platform config, or nothing is filed off localhost", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert(html.includes('src="../../js/platform-config.mjs"'), "index.html must load js/platform-config.mjs");
});

finish();
