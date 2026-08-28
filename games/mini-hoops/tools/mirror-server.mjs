import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = resolve(gameRoot, "../../../factory-network-server/games/mini-hoops/shared/scripts");
const files = [
  "sim/constants.js", "sim/projection.js", "sim/hoop.js", "sim/hoop-placement.js",
  "sim/launch.js",
  "sim/collision.js", "sim/physics.js", "sim/shot.js",
  "assets/ball-catalog.js", "assets/location-catalog.js",
  // HORSE. The bin, where it may stand, how the shot is solved, and the rules
  // of the word — all adjudicated server-side, so all mirrored.
  // `sim/hoop-placement.js` is up with the hoop rather than down here, because
  // the classic cabinet's own adjudicator now reaches it too — through
  // `hoopAt`'s placed base, which every mode of play shares one copy of.
  "sim/bin-physics.js", "sim/bin-placement.js", "sim/horse-shot.js", "sim/horse.js",
  "sim/trick-shot.js", "sim/trick-shot-target.js", "sim/trick-shot-physics.js",
];

for (const file of files) {
  const target = resolve(serverRoot, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(gameRoot, "scripts", file), target);
  console.log(`mirrored ${file}`);
}
