import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertEqual, finish, suite, test } from "./harness.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverMirror = path.resolve(gameRoot, "../../../factory-network-server/games/mini-hoops/shared/scripts");
const files = [
  "sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/launch.js",
  "sim/collision.js", "sim/physics.js", "sim/shot.js", "assets/ball-catalog.js",
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

finish();
