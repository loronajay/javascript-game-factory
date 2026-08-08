// measure-frames.mjs — re-measure the atlas rects after re-cutting the sheets.
//
//     node tools/measure-frames.mjs
//
// Reads the `.alpha` planes `cut-car-sheets.py` writes beside each sheet and
// runs them through `framesFromAlpha` — the same function the cabinet ships, not
// a copy of it. That is the whole point of this script: `car-atlas.js` says every
// rect in the manifest was measured rather than typed, and the only way that
// stays true through a re-cut is for the re-cut to use the real measurer.
//
// It prints manifest rows ready to paste, carrying the existing labels and
// groups across by position. Ids are matched by order and must not be renamed —
// an id is stored in every saved preset and every server entitlement row.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { framesFromAlpha } from "../scripts/assets/car-atlas.js";
import { MODELS_A, MODELS_B } from "../scripts/assets/car-atlas.js";

const here = dirname(fileURLToPath(import.meta.url));
const sheets = join(here, "..", "assets", "car-sheets");

for (const sheet of [MODELS_A, MODELS_B]) {
  const suffix = sheet.id.slice(-1);
  const alpha = readFileSync(join(sheets, `models-${suffix}.alpha`));
  const side = Math.round(Math.sqrt(alpha.length));
  if (side * side !== alpha.length) {
    throw new Error(`models-${suffix}.alpha is ${alpha.length} bytes, not a square sheet`);
  }

  const frames = framesFromAlpha(alpha, side, side);
  if (frames.length !== sheet.frames.length) {
    throw new Error(
      `models-${suffix}: measured ${frames.length} frames but the manifest holds ` +
        `${sheet.frames.length}. Refusing to guess which car is which.`,
    );
  }

  console.log(`\n// ${sheet.id} — ${side}x${side}`);
  console.log(`  width: ${side},`);
  console.log(`  height: ${side},`);
  frames.forEach((frame, index) => {
    const { id, label, group } = sheet.frames[index];
    console.log(
      `    { id: "${id}", label: "${label}", group: "${group}", ` +
        `sx: ${frame.sx}, sy: ${frame.sy}, sw: ${frame.sw}, sh: ${frame.sh} },`,
    );
  });
}
