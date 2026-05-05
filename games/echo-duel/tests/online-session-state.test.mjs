import { PHASES } from "../scripts/config.js";
import {
  shouldCloseMatchToMenuOnPlayerLeft,
  shouldPreserveResultsScreen,
  shouldResetStartRequest,
} from "../scripts/online-session-state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

console.log("\necho-duel online-session-state");

test("preserves the ended screen for server-authoritative online matches after match over", () => {
  assertEq(shouldPreserveResultsScreen({
    authorityMode: "server",
    state: { mode: "online", phase: PHASES.MATCH_OVER },
  }), true);
});

test("does not preserve the ended screen before the match is over", () => {
  assertEq(shouldPreserveResultsScreen({
    authorityMode: "server",
    state: { mode: "online", phase: PHASES.CHALLENGER_COPY },
  }), false);
});

test("does not preserve the ended screen for non-authoritative or local sessions", () => {
  assertEq(shouldPreserveResultsScreen({
    authorityMode: "host-client",
    state: { mode: "online", phase: PHASES.MATCH_OVER },
  }), false);

  assertEq(shouldPreserveResultsScreen({
    authorityMode: "server",
    state: { mode: "local", phase: PHASES.MATCH_OVER },
  }), false);
});

test("resets the start request flag when the lobby is ended or the match is over", () => {
  assertEq(shouldResetStartRequest({
    lobbyStatus: "ended",
    state: { mode: "online", phase: PHASES.OWNER_CREATE_INITIAL },
  }), true);

  assertEq(shouldResetStartRequest({
    lobbyStatus: "started",
    state: { mode: "online", phase: PHASES.MATCH_OVER },
  }), true);

  assertEq(shouldResetStartRequest({
    lobbyStatus: "open",
    state: { mode: "online", phase: PHASES.OWNER_CREATE_INITIAL },
  }), false);
});

test("closes a server-authoritative 1v1 match back to menu when one player remains", () => {
  assertEq(shouldCloseMatchToMenuOnPlayerLeft({
    authorityMode: "server",
    onlineStarted: true,
    payload: { playerCount: 1 },
    state: { mode: "online", phase: PHASES.CHALLENGER_COPY },
  }), true);
});

test("does not auto-close after player-left events outside the live 1v1 case", () => {
  assertEq(shouldCloseMatchToMenuOnPlayerLeft({
    authorityMode: "server",
    onlineStarted: false,
    payload: { playerCount: 1 },
    state: { mode: "online", phase: PHASES.CHALLENGER_COPY },
  }), false);

  assertEq(shouldCloseMatchToMenuOnPlayerLeft({
    authorityMode: "server",
    onlineStarted: true,
    payload: { playerCount: 2 },
    state: { mode: "online", phase: PHASES.CHALLENGER_COPY },
  }), false);

  assertEq(shouldCloseMatchToMenuOnPlayerLeft({
    authorityMode: "host-client",
    onlineStarted: true,
    payload: { playerCount: 1 },
    state: { mode: "online", phase: PHASES.CHALLENGER_COPY },
  }), false);

  assertEq(shouldCloseMatchToMenuOnPlayerLeft({
    authorityMode: "server",
    onlineStarted: true,
    payload: { playerCount: 1 },
    state: { mode: "online", phase: PHASES.MATCH_OVER },
  }), false);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
