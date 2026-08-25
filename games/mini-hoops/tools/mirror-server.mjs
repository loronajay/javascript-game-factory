import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = resolve(gameRoot, "../../../factory-network-server/games/mini-hoops/shared/scripts");
const files = [
  "sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/launch.js",
  "sim/collision.js", "sim/physics.js", "sim/shot.js", "assets/ball-catalog.js",
];

for (const file of files) {
  const target = resolve(serverRoot, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(gameRoot, "scripts", file), target);
  console.log(`mirrored ${file}`);
}
