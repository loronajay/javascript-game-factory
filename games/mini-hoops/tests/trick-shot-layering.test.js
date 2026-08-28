import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, finish } from "./harness.js";

suite("trick-shot lab — tool layering");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderer = fs.readFileSync(path.join(root, "scripts", "render", "trick-shot.js"), "utf8");

test("the ball, the target, the pads and the launchers share one far-to-near pass", () => {
  const frame = renderer.slice(renderer.indexOf("export function renderTrickShotFrame"));
  const pieceEntities = frame.indexOf("const entities = pieces.map((piece)");
  const ballEntity = frame.indexOf("drawBallEntity(ctx, view)");
  const entitySort = frame.indexOf("entities.sort(");
  const entityDraw = frame.indexOf("for (const entity of entities)");

  assert(pieceEntities >= 0, "sandbox tools must participate in the same depth list as the ball");
  assert(ballEntity > pieceEntities, "the ball is an entity in that same list, not a separate pass");
  assert(pieceEntities < entitySort && entitySort < entityDraw, "pieces must be sorted before anything is painted");
  assert(!frame.includes("drawForegroundSandboxPieces("), "a final foreground pass would put every pad over the ball again");
});

test("a bin target joins that pass split at its own mouth, like the rim and the net", () => {
  const frame = renderer.slice(renderer.indexOf("export function renderTrickShotFrame"));
  assert(frame.includes("drawBinBody(ctx, bin, binImage)"), "the bin's body has to be an entity");
  assert(
    frame.includes("z: bin.z - bin.mouthRadius") && frame.includes("drawBinLip(ctx, bin, binImage)"),
    "the near lip has to sort a mouth-radius nearer than the body, so a ball dropping in goes behind it",
  );
  // Exactly one target is ever drawn: two would be two ways to finish one shot.
  assert(frame.includes("target?.hoop || null") && frame.includes("target?.bin || null"));
});

finish();
