// Car sprite atlas — pure measurement helpers plus the committed manifest for
// the authored sheets.
//
// The authored sheets are near-gridded but not exactly so: twelve rear-view cars
// per sheet, with the frames drifting a few pixels in size and position, so
// slicing by `width / 4` would clip some of them. The background is already
// fully transparent, though, which means no pixel surgery is needed — tight
// source rectangles are enough for `drawImage` to lift a clean car off a sheet.
//
// Every rect below was measured with `framesFromAlpha`, not typed by hand.
// Those helpers stay here so the next authored sheet is measured the same way
// rather than eyeballed — and `tools/measure-frames.mjs` runs the sheets back
// through *this* function rather than a copy, which is what keeps that claim
// true across a re-cut.
//
// **The sheets are cut by `tools/cut-car-sheets.py`, not by a background
// remover.** An online remover produced the first pair, and both of its outputs
// were wrong in ways nothing downstream could recover from: it returned 600x600
// when the generation is 1254x1254, and it left the magenta key smeared through
// every edge pixel, where `garage/paint.js` classified it as `REGION_OTHER` and
// left it alone — so a repainted car came out speckled with pink. Re-cut from
// `assets/car-sheets/source-models-{a,b}.png` when the art changes.

/** Runs of consecutive non-empty counts, as inclusive [start, end] pairs. */
export function bandsFromCounts(counts, minRun = 1) {
  const bands = [];
  let start = null;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] > 0 && start === null) {
      start = i;
    } else if (counts[i] === 0 && start !== null) {
      if (i - start >= minRun) {
        bands.push([start, i - 1]);
      }
      start = null;
    }
  }
  if (start !== null && counts.length - start >= minRun) {
    bands.push([start, counts.length - 1]);
  }
  return bands;
}

/** Per-column tally of pixels at or above `threshold`. */
export function columnCounts(alpha, width, height, threshold) {
  const counts = new Uint32Array(width);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (alpha[rowOffset + x] >= threshold) {
        counts[x] += 1;
      }
    }
  }
  return counts;
}

/** Per-row tally of pixels at or above `threshold`. */
export function rowCounts(alpha, width, height, threshold) {
  const counts = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let total = 0;
    for (let x = 0; x < width; x += 1) {
      if (alpha[rowOffset + x] >= threshold) {
        total += 1;
      }
    }
    counts[y] = total;
  }
  return counts;
}

/**
 * Smallest rectangle inside `rect` containing every pixel at or above
 * `threshold`, or null when the region is empty.
 */
export function tightBounds(alpha, width, rect, threshold) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = rect.sy; y < rect.sy + rect.sh; y += 1) {
    const rowOffset = y * width;
    for (let x = rect.sx; x < rect.sx + rect.sw; x += 1) {
      if (alpha[rowOffset + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return null;
  }
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}

/**
 * Measures every sprite on a sheet by projecting alpha onto both axes, splitting
 * into bands, then taking tight bounds inside each band intersection. Frames come
 * back in row-major order. Cells that turn out empty are skipped, so a ragged
 * final row measures correctly.
 */
export function framesFromAlpha(alpha, width, height, { threshold = 128, minRun = 4 } = {}) {
  const colBands = bandsFromCounts(columnCounts(alpha, width, height, threshold), minRun);
  const rowBands = bandsFromCounts(rowCounts(alpha, width, height, threshold), minRun);

  const frames = [];
  rowBands.forEach(([y0, y1], row) => {
    colBands.forEach(([x0, x1], col) => {
      const bounds = tightBounds(
        alpha,
        width,
        { sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 },
        threshold,
      );
      if (bounds) {
        frames.push({ sx: bounds.sx, sy: bounds.sy, sw: bounds.sw, sh: bounds.sh, col, row });
      }
    });
  });
  return frames;
}

export function frameById(atlas, id) {
  return atlas.frames.find((frame) => frame.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// The committed manifest
// ---------------------------------------------------------------------------
//
// Two 1254x1254 sheets, twelve rear-view cars each: 24 distinct base models.
// That is the generations' native size, and it is not generous — the garage
// preview draws a car at roughly 254x352 before the canvas fit and device pixel
// ratio are applied, so a ~250x346 frame is close to exactly what it asks for.
//
// These replaced an earlier roster of five sheets holding 45 *paints* of one
// body. That is the whole point of the change: colour is no longer baked into
// the sprite, so it cannot be what a car is identified by. Every body here is
// deliberately neutral — measured roof saturation runs 0.006–0.041 across all
// 24 — which is what lets `render/livery.js` tint one to any colour the player
// asks for. A model is the shape; the paint is configuration.
//
// An id therefore names a *model* and is unique across the whole roster rather
// than only within a sheet. A save file and the server's entitlement rows both
// store it, so it has to identify one car on its own, and it must stay stable:
// renaming an id orphans every garage preset and every owned-model row keyed to
// it. Labels are free to change, ids are not.
//
// The `group` is the archetype the model belongs to. The two sheets genuinely
// overlap in subject matter — there are five GT saloons/coupes of the same
// lineage, four Euro sports cars, two muscle cars — so the picker groups them
// rather than presenting 24 flat cells in which several cars look like mistakes.
// Grouping is presentation only; nothing about racing or ownership reads it.

/**
 * Archetypes, in the order the picker walks them. Sizes are uneven on purpose —
 * the roster really does hold five GTs and one of nothing, and padding a group
 * out to a tidy row would mean inventing cars that are not on the sheets.
 */
export const MODEL_GROUPS = [
  { id: "gt", label: "GT" },
  { id: "coupe", label: "Coupe" },
  { id: "euro", label: "Euro" },
  { id: "exotic", label: "Exotic" },
  { id: "wedge", label: "Wedge" },
  { id: "muscle", label: "Muscle" },
  { id: "hatch", label: "Hot Hatch" },
];

export const MODELS_A = {
  id: "models-a",
  src: "assets/car-sheets/models-a.png",
  width: 1254,
  height: 1254,
  frames: [
    { id: "kaido-gts", label: "Kaido GTS", group: "gt", sx: 36, sy: 57, sw: 251, sh: 346 },
    { id: "tsunami-rz", label: "Tsunami RZ", group: "coupe", sx: 342, sy: 65, sw: 254, sh: 339 },
    { id: "shutter-z", label: "Shutter Z", group: "coupe", sx: 645, sy: 64, sw: 252, sh: 339 },
    { id: "meridian-rs", label: "Meridian RS", group: "euro", sx: 946, sy: 81, sw: 264, sh: 319 },
    { id: "monolith-8", label: "Monolith 8", group: "wedge", sx: 35, sy: 485, sw: 250, sh: 330 },
    { id: "zephyr-z", label: "Zephyr Z", group: "coupe", sx: 334, sy: 483, sw: 265, sh: 333 },
    { id: "stallion-gt", label: "Stallion GT", group: "muscle", sx: 642, sy: 475, sw: 258, sh: 348 },
    { id: "aero-rs", label: "Aero RS", group: "euro", sx: 940, sy: 484, sw: 277, sh: 336 },
    { id: "skyward-r", label: "Skyward R", group: "gt", sx: 34, sy: 897, sw: 253, sh: 313 },
    { id: "gravel-stx", label: "Gravel STx", group: "gt", sx: 338, sy: 897, sw: 252, sh: 316 },
    { id: "toro-sv", label: "Toro SV", group: "exotic", sx: 635, sy: 905, sw: 266, sh: 303 },
    { id: "scalpel-r", label: "Scalpel R", group: "hatch", sx: 945, sy: 905, sw: 263, sh: 302 },
  ],
};

export const MODELS_B = {
  id: "models-b",
  src: "assets/car-sheets/models-b.png",
  width: 1254,
  height: 1254,
  frames: [
    { id: "chrono-12", label: "Chrono 12", group: "wedge", sx: 24, sy: 84, sw: 264, sh: 340 },
    { id: "orbit-rz", label: "Orbit RZ", group: "coupe", sx: 345, sy: 71, sw: 247, sh: 355 },
    { id: "vega-qv", label: "Vega QV", group: "exotic", sx: 638, sy: 84, sw: 269, sh: 331 },
    { id: "crest-s", label: "Crest S", group: "euro", sx: 949, sy: 79, sw: 273, sh: 345 },
    { id: "titan-r", label: "Titan R", group: "gt", sx: 21, sy: 464, sw: 269, sh: 358 },
    { id: "cyclone-rz", label: "Cyclone RZ", group: "coupe", sx: 345, sy: 462, sw: 245, sh: 361 },
    { id: "colt-gt", label: "Colt GT", group: "muscle", sx: 642, sy: 468, sw: 257, sh: 362 },
    { id: "ember-rs", label: "Ember RS", group: "hatch", sx: 955, sy: 465, sw: 257, sh: 361 },
    { id: "halo-lt", label: "Halo LT", group: "exotic", sx: 27, sy: 870, sw: 257, sh: 321 },
    { id: "vortex-fd", label: "Vortex FD", group: "coupe", sx: 343, sy: 872, sw: 249, sh: 329 },
    { id: "kaido-r", label: "Kaido R", group: "gt", sx: 648, sy: 867, sw: 247, sh: 332 },
    { id: "crest-turbo", label: "Crest Turbo", group: "euro", sx: 955, sy: 869, sw: 257, sh: 335 },
  ],
};

export const MODEL_SHEETS = [MODELS_A, MODELS_B];

/** The model the game opens with. */
export const DEFAULT_MODEL_ID = "kaido-gts";

export function sheetById(id) {
  return MODEL_SHEETS.find((sheet) => sheet.id === id) ?? null;
}

/**
 * The roster flattened for pickers, for the garage, and for tests that need to
 * sweep every model. Each entry is a frame with its sheet's id and source folded
 * in, so one lookup is enough to draw it.
 */
export function allModels() {
  return MODEL_SHEETS.flatMap((sheet) =>
    sheet.frames.map((frame) => ({ ...frame, sheetId: sheet.id, src: sheet.src })),
  );
}

/**
 * Resolves a model id on its own. Ids are unique across the whole roster, so
 * unlike the paint manifest this replaced there is no sheet to agree with — the
 * id is the whole key, which is exactly what makes it safe to put in a save file
 * and in a server entitlement row.
 */
export function modelById(id) {
  return allModels().find((model) => model.id === id) ?? null;
}

/** The default model, always a real one. */
export function defaultModel() {
  return modelById(DEFAULT_MODEL_ID);
}

/**
 * The roster as the picker shows it: archetypes in `MODEL_GROUPS` order, each
 * carrying its models in roster order. A model whose group is not in the
 * catalog would vanish from the picker entirely, so `tests/car-atlas.test.js`
 * asserts every model lands in exactly one group.
 */
export function modelsByGroup() {
  const models = allModels();
  return MODEL_GROUPS.map((group) => ({
    ...group,
    models: models.filter((model) => model.group === group.id),
  }));
}
