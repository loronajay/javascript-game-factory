// What the shipped car sheets have to be true of, checked against their pixels.
//
// These sheets have been cut badly once already. An online background remover
// produced the first pair and did two things nothing downstream could recover
// from: it halved the resolution, and it left the magenta chroma key smeared
// through every edge pixel. The second one is the nasty one, because it is
// invisible until a player picks a colour — `garage/paint.js` classifies a
// magenta pixel as `REGION_OTHER`, the tint pass skips it by design, and it
// survives into the game as a pink speckle on an otherwise red car.
//
// Nothing at runtime can notice any of that, which is the same argument
// `gauge-assets.test.js` makes about the printed gauge faces. So it is asserted
// here, off the real bytes, and `tools/cut-car-sheets.py` is what makes it pass.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { suite, test, assert, finish } from "./harness.js";
import { readPng } from "./png.js";
import { MODEL_SHEETS, allModels } from "../scripts/assets/car-atlas.js";
import { classifyPixel, REGION_OTHER, saturationOf } from "../scripts/garage/paint.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const sheets = MODEL_SHEETS.map((sheet) => ({
  sheet,
  image: readPng(readFileSync(join(root, sheet.src))),
}));

/**
 * The signature of chroma residue: red and blue both clear of green, and
 * saturated enough to read as a colour rather than as grey. The bodies are
 * neutral and the only saturated art on the sheets is red (the harnesses and the
 * lamp lenses), so nothing legitimate can trip this.
 */
function isMagenta(r, g, b) {
  return r > g + 18 && b > g + 18 && saturationOf(r, g, b) > 0.12;
}

suite("car sheets — the shipped pixels");

test("each sheet is the size the manifest says it is", () => {
  for (const { sheet, image } of sheets) {
    assert(
      image.width === sheet.width && image.height === sheet.height,
      `${sheet.id} is ${image.width}x${image.height}, manifest says ${sheet.width}x${sheet.height}`,
    );
  }
});

test("no magenta survives the chroma key", () => {
  // Zero, not "few": every one of these is a pink speckle on a painted car, and
  // a budget above zero is a budget someone will spend.
  for (const { sheet, image } of sheets) {
    let magenta = 0;
    let first = null;
    for (let i = 0; i < image.pixels.length; i += 4) {
      if (image.pixels[i + 3] === 0) continue;
      const [r, g, b] = [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
      if (isMagenta(r, g, b)) {
        magenta += 1;
        if (!first) {
          const pixel = i / 4;
          first = `(${pixel % image.width},${Math.floor(pixel / image.width)}) rgb(${r},${g},${b})`;
        }
      }
    }
    assert(
      magenta === 0,
      `${sheet.id} has ${magenta} magenta pixels left by the key, first at ${first}. ` +
        `Re-cut with tools/cut-car-sheets.py rather than a background remover.`,
    );
  }
});

test("the tint pass would leave no saturated pixel behind on a body panel", () => {
  // The failure this guards is narrower than the one above and outlives it: any
  // saturated pixel the classifier drops into REGION_OTHER is a pixel that keeps
  // its original colour while everything around it is repainted. Chroma residue
  // is one source; a pre-coloured sheet would be another.
  for (const { sheet, image } of sheets) {
    let stranded = 0;
    for (const model of sheet.frames) {
      for (let y = 0; y < model.sh; y += 1) {
        const yFraction = y / model.sh;
        for (let x = 0; x < model.sw; x += 1) {
          const i = ((model.sy + y) * image.width + (model.sx + x)) * 4;
          if (image.pixels[i + 3] < 250) continue;
          const [r, g, b] = [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
          // Bright and saturated but classified as "leave alone" is the shape of
          // the bug. Dark pixels are the outline and the tyres, which are meant
          // to survive a repaint untouched.
          if (
            classifyPixel(r, g, b, yFraction) === REGION_OTHER
            && saturationOf(r, g, b) > 0.35
            && Math.max(r, g, b) > 110
          ) {
            stranded += 1;
          }
        }
      }
    }
    // A handful across 12 cars is art (a badge, a reflector); a rash is a bad cut.
    assert(stranded < 200, `${sheet.id} strands ${stranded} saturated pixels outside the tint pass`);
  }
});

test("the bodies are still neutral enough for the classifier to find them", () => {
  // `garage/paint.js` decides what is paintable from the pixel itself, which only
  // works while the bodies ship in neutral silver. This is the check that would
  // fail first if a future sheet arrived pre-coloured — at which point the fix is
  // a painted mask channel, not looser thresholds.
  for (const model of allModels()) {
    const { image } = sheets.find(({ sheet }) => sheet.id === model.sheetId);
    let body = 0;
    let opaque = 0;
    for (let y = 0; y < model.sh; y += 1) {
      const yFraction = y / model.sh;
      for (let x = 0; x < model.sw; x += 1) {
        const i = ((model.sy + y) * image.width + (model.sx + x)) * 4;
        if (image.pixels[i + 3] < 250) continue;
        opaque += 1;
        if (classifyPixel(image.pixels[i], image.pixels[i + 1], image.pixels[i + 2], yFraction)
          === "body") {
          body += 1;
        }
      }
    }
    const share = body / opaque;
    assert(share > 0.4, `${model.id} is only ${(share * 100).toFixed(1)}% paintable bodywork`);
  }
});

test("every frame rect is tight against the art it names", () => {
  // A rect that has drifted off its car is the failure mode of re-cutting the
  // sheets, and it shows up as a clipped nose or a neighbour's mirror in frame.
  for (const model of allModels()) {
    const { image } = sheets.find(({ sheet }) => sheet.id === model.sheetId);
    const opaqueAt = (x, y) => image.pixels[((model.sy + y) * image.width + (model.sx + x)) * 4 + 3] >= 128;

    const edges = { top: false, bottom: false, left: false, right: false };
    for (let x = 0; x < model.sw; x += 1) {
      if (opaqueAt(x, 0)) edges.top = true;
      if (opaqueAt(x, model.sh - 1)) edges.bottom = true;
    }
    for (let y = 0; y < model.sh; y += 1) {
      if (opaqueAt(0, y)) edges.left = true;
      if (opaqueAt(model.sw - 1, y)) edges.right = true;
    }
    for (const [side, touched] of Object.entries(edges)) {
      assert(touched, `${model.id}'s rect has slack on the ${side} — it is not tight to the car`);
    }

    // And nothing opaque immediately outside it, which would be a clipped car.
    const clear = (x, y) => {
      const sx = model.sx + x;
      const sy = model.sy + y;
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) return true;
      return image.pixels[(sy * image.width + sx) * 4 + 3] < 128;
    };
    for (let x = -1; x <= model.sw; x += 1) {
      assert(clear(x, -1) && clear(x, model.sh), `${model.id} is clipped top or bottom`);
    }
    for (let y = -1; y <= model.sh; y += 1) {
      assert(clear(-1, y) && clear(model.sw, y), `${model.id} is clipped left or right`);
    }
  }
});

test("a frame is big enough for the garage preview to draw it without inventing pixels", () => {
  // The preview box is 536x482 with 120/130 of padding, so a car is drawn at
  // roughly 254x352 before the canvas fit and device pixel ratio are applied.
  // A frame smaller than that is upscaled, which is exactly the regression that
  // shipping a 600x600 sheet caused.
  const PREVIEW_HEIGHT = 352;
  for (const model of allModels()) {
    assert(
      model.sh >= PREVIEW_HEIGHT * 0.85,
      `${model.id} is only ${model.sh}px tall; the garage preview draws it at ~${PREVIEW_HEIGHT}px`,
    );
  }
});

finish();
