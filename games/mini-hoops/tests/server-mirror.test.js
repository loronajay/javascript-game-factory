import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertEqual, finish, suite, test } from "./harness.js";
import { matchConfigSettings } from "../scripts/multiplayer/match-config.js";
import { sanitizeLobbySettings } from "../../../../factory-network-server/src/util.mjs";
import { createMiniHoopsMatchState } from "../../../../factory-network-server/games/mini-hoops/server/mini-hoops-match-engine.mjs";
import {
  applyHorsePlacement,
  applyHorseShot,
  createHorseMatchState,
  sanitizeHorseShot,
  sanitizeHorsePlacement,
} from "../../../../factory-network-server/games/mini-hoops/server/horse-match-engine.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverMirror = path.resolve(gameRoot, "../../../factory-network-server/games/mini-hoops/shared/scripts");
const files = [
  "sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/hoop-placement.js", "sim/launch.js",
  "sim/collision.js", "sim/physics.js", "sim/shot.js", "assets/ball-catalog.js",
  // HORSE. The bin, where it may stand, how the shot is solved, and the rules
  // of the word — all adjudicated server-side, so all mirrored.
  "sim/bin-physics.js", "sim/bin-placement.js", "sim/horse-shot.js", "sim/horse.js",
  // The shot loop the adjudicator runs, rather than a second copy of it.
  "sim/horse-replay.js", "sim/trick-shot.js", "sim/trick-shot-target.js", "sim/trick-shot-physics.js",
];

suite("Factory Network physics mirror");

test("every authoritative physics source exactly matches the cabinet", () => {
  const drifted = files.filter((file) => {
    const browser = fs.readFileSync(path.join(gameRoot, "scripts", file), "utf8");
    const server = fs.readFileSync(path.join(serverMirror, file), "utf8");
    return browser !== server;
  });
  assertEqual(drifted.join(", "), "", "run npm run mirror:server after changing pure shot physics");
});

test("Factory lobby sanitizing preserves the Mini Hoops match config", () => {
  const lobby = {
    roomCode: "HOOPS",
    members: new Set(["socket-a", "socket-b"]),
    memberProfiles: new Map(),
    settings: sanitizeLobbySettings(matchConfigSettings({
      modeId: "circle",
      duration: 60,
      locationId: "warehouse",
      ballId: "paper",
    })),
  };

  const match = createMiniHoopsMatchState(lobby, 2_000);
  assertEqual(match.config.modeId, "circle");
  assertEqual(match.config.duration, 60);
  assertEqual(match.config.locationId, "warehouse");
  assertEqual(match.config.ballId, "paper");
});

test("authoritative HORSE preserves a catalog ball on each shot", () => {
  assertEqual(sanitizeHorseShot({ ballId: "snowball" }).ballId, "snowball");
  assertEqual(sanitizeHorseShot({ ballId: "../../bad" }).ballId, "basketball");
});

test("authoritative HORSE locks a matcher to the setter's ball", () => {
  const lobby = {
    roomCode: "HORSE",
    members: new Set(["socket-a", "socket-b"]),
    memberProfiles: new Map(),
    settings: { word: "PIG" },
  };
  const setup = { x: 0, y: 0.36, z: 0.6, motionId: "still" };
  let state = createHorseMatchState(lobby, 2_000);
  state = applyHorsePlacement(state, "socket-a", setup);
  state = applyHorseShot(
    state,
    "socket-a",
    { power: 0.5, aimX: 480, loft: 1, motionSeconds: 0, expectedShots: 0, ballId: "bowling-ball" },
    3_000,
    () => ({ made: true }),
  );
  assertEqual(state.match.standingShot.ballId, "bowling-ball");

  let adjudicatedBall = "";
  state = applyHorseShot(
    state,
    "socket-b",
    { power: 0.5, aimX: 480, loft: 1, motionSeconds: 0, expectedShots: 1, ballId: "paper" },
    3_100,
    ({ intent }) => { adjudicatedBall = intent.ballId; return { made: false }; },
  );
  assertEqual(adjudicatedBall, "bowling-ball");
  assertEqual(state.lastShot.intent.ballId, "bowling-ball");
});


test("authoritative Horse rejects Lab tools from stale or crafted clients", () => {
  const setup = sanitizeHorsePlacement({ kind: "hoop", motionId: "horizontal", placement: { cx: 480, rimY: 400, z: 0.1 }, pieces: [{ type: "cannon", id: "bad" }], requiredPieces: ["bad"] });
  assertEqual(setup.pieces.length, 0);
  assertEqual(setup.motionId, "horizontal");
  assertEqual(setup.placement.rimY, 400);
  assertEqual(setup.placement.z, undefined);
});

finish();
