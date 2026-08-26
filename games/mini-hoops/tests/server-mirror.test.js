import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertEqual, finish, suite, test } from "./harness.js";
import { matchConfigSettings } from "../scripts/multiplayer/match-config.js";
import { sanitizeLobbySettings } from "../../../../factory-network-server/src/util.mjs";
import { createMiniHoopsMatchState } from "../../../../factory-network-server/games/mini-hoops/server/mini-hoops-match-engine.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverMirror = path.resolve(gameRoot, "../../../factory-network-server/games/mini-hoops/shared/scripts");
const files = [
  "sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/launch.js",
  "sim/collision.js", "sim/physics.js", "sim/shot.js", "assets/ball-catalog.js",
  // HORSE. The bin, where it may stand, how the shot is solved, and the rules
  // of the word — all adjudicated server-side, so all mirrored.
  "sim/bin-physics.js", "sim/bin-placement.js", "sim/horse-shot.js", "sim/horse.js",
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

finish();
