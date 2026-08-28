import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, finish } from "./harness.js";

suite("trick-shot lab — tool layering");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderer = fs.readFileSync(path.join(root, "scripts", "render", "trick-shot.js"), "utf8");

test("pads and launchers are painted after the final furniture mask", () => {
  const frame = renderer.slice(renderer.indexOf("export function renderTrickShotFrame"));
  const finalFurnitureMask = frame.lastIndexOf("drawRoomOccluders(");
  const foregroundTools = frame.indexOf("drawForegroundSandboxPieces(");

  assert(finalFurnitureMask >= 0, "the ball and hoop still need room occlusion");
  assert(foregroundTools > finalFurnitureMask, "interactive tools must remain visible above painted furniture");
});

finish();
