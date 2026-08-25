import { assert, assertDeepEqual, assertEqual, test, finish, suite } from "./harness.js";
import {
  LOCAL_DUEL_COMPLETE,
  LOCAL_DUEL_PASS,
  completeHotseatTurn,
  createHotseatDuel,
} from "../scripts/multiplayer/hotseat-duel.js";
import {
  DEFAULT_MATCH_CONFIG,
  normalizeMatchConfig,
  sameMatchConfig,
} from "../scripts/multiplayer/match-config.js";

suite("multiplayer match rules");

test("a hotseat duel passes the configured court to player two", () => {
  const duel = createHotseatDuel({
    ...DEFAULT_MATCH_CONFIG,
    modeId: "circle",
    duration: 30,
    locationId: "bedroom",
    ballId: "basketball",
  });

  const next = completeHotseatTurn(duel, { score: 8, shots: 7, made: 4 });
  assertEqual(next.phase, LOCAL_DUEL_PASS);
  assertEqual(next.activePlayerIndex, 1);
  assertEqual(next.players[0].score, 8);
  assertEqual(next.config.modeId, "circle");
});

test("a hotseat duel declares the higher server-shaped score and supports a draw", () => {
  const duel = createHotseatDuel(DEFAULT_MATCH_CONFIG);
  completeHotseatTurn(duel, { score: 6, shots: 5, made: 3 });
  const result = completeHotseatTurn(duel, { score: 4, shots: 6, made: 2 });
  assertEqual(result.phase, LOCAL_DUEL_COMPLETE);
  assertDeepEqual(result.winnerIndexes, [0]);

  const tied = createHotseatDuel(DEFAULT_MATCH_CONFIG);
  completeHotseatTurn(tied, { score: 6 });
  completeHotseatTurn(tied, { score: 6 });
  assertDeepEqual(tied.winnerIndexes, [0, 1]);
});

test("match config accepts only shipped competitive settings", () => {
  const config = normalizeMatchConfig({
    modeId: "not-a-hoop",
    duration: 999,
    locationId: "outside",
    ballId: "brick",
  });
  assertDeepEqual(config, DEFAULT_MATCH_CONFIG);
  assert(sameMatchConfig(config, normalizeMatchConfig(config)));
});

finish();
