import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { TACH_DIAL, SPEEDO_DIAL, GAUGE_ASSETS, SHIFT_LIGHT_CELLS } from "../scripts/render/dashboard.js";

// Contract between the authored gauge art and the code that drives it.
//
// The needle's angle is computed, but the numerals it points at are painted into
// an SVG. Nothing at runtime can detect the two disagreeing — the needle would
// simply point at the wrong number. So the numbers are read back out of the
// artwork here and checked against the dial configuration. Re-authoring a face
// with a different sweep or range fails this suite instead of shipping a gauge
// that lies.

suite("gauge-assets — art and code agree on the scale");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");

const CENTRE = 256; // all faces are authored on a 512x512 canvas

function read(relative) {
  return fs.readFileSync(path.join(gameRoot, relative), "utf8");
}

const degrees = (radians) => (radians * 180) / Math.PI;

/** Angle of a point on the face, unwrapped onto the gauge's 135deg..405deg sweep. */
function faceAngle(x, y) {
  const raw = (degrees(Math.atan2(y - CENTRE, x - CENTRE)) + 360) % 360;
  return raw < 135 ? raw + 360 : raw;
}

/** Printed numerals, in sweep order, with the angle each one sits at. */
function printedLabels(svg) {
  const labels = [];
  const pattern = /<text[^>]*\sx="([-\d.]+)"[^>]*\sy="([-\d.]+)"[^>]*>([^<]*)<\/text>/g;
  for (const match of svg.matchAll(pattern)) {
    const text = match[3].trim();
    if (!/^-?\d+$/.test(text)) {
      continue; // skip legends like "MPH" or "RPM x1000"
    }
    labels.push({ value: Number(text), angle: faceAngle(Number(match[1]), Number(match[2])) });
  }
  return labels.sort((a, b) => a.angle - b.angle);
}

/** Angles of the heavy (major) tick marks, in sweep order. */
function majorTickAngles(svg) {
  const angles = [];
  const pattern = /<line\s+x1="([-\d.]+)"\s+y1="([-\d.]+)"[^>]*stroke-width="4"/g;
  for (const match of svg.matchAll(pattern)) {
    angles.push(faceAngle(Number(match[1]), Number(match[2])));
  }
  return angles.sort((a, b) => a - b);
}

const tach = read(GAUGE_ASSETS.tachFace);
const speedo = read(GAUGE_ASSETS.speedoFace);
const needle = read(GAUGE_ASSETS.needle);
const strip = read(GAUGE_ASSETS.shiftStrip);

// ---------------------------------------------------------------------------
// Every asset the renderer names must exist
// ---------------------------------------------------------------------------

for (const [key, src] of Object.entries(GAUGE_ASSETS)) {
  test(`${key} artwork is present at ${src}`, () => {
    assert(fs.existsSync(path.join(gameRoot, src)), `missing gauge asset: ${src}`);
  });
}

test("every gauge face is authored on the same 512 canvas the renderer assumes", () => {
  for (const svg of [tach, speedo, needle]) {
    assert(/viewBox="0 0 512 512"/.test(svg), "a face was re-authored at a different size");
  }
});

// ---------------------------------------------------------------------------
// Tachometer
// ---------------------------------------------------------------------------

test("the tachometer sweep starts where the code starts it", () => {
  assertClose(majorTickAngles(tach)[0], degrees(TACH_DIAL.startAngle), 0.01);
});

test("the tachometer sweep ends where the code ends it", () => {
  const ticks = majorTickAngles(tach);
  assertClose(ticks[ticks.length - 1], degrees(TACH_DIAL.endAngle), 0.01);
});

test("the tachometer's printed range matches the dial's full scale", () => {
  const labels = printedLabels(tach);
  assertEqual(labels[0].value * 1000, TACH_DIAL.min);
  assertEqual(labels[labels.length - 1].value * 1000, TACH_DIAL.max);
});

test("every tachometer numeral sits where the code would point the needle", () => {
  for (const label of printedLabels(tach)) {
    const expected = degrees(TACH_DIAL.startAngle) +
      (degrees(TACH_DIAL.endAngle) - degrees(TACH_DIAL.startAngle)) *
        ((label.value * 1000 - TACH_DIAL.min) / (TACH_DIAL.max - TACH_DIAL.min));
    assertClose(label.angle, expected, 0.02, `the needle would miss the "${label.value}" numeral`);
  }
});

// ---------------------------------------------------------------------------
// Speedometer
// ---------------------------------------------------------------------------

test("the speedometer shares the tachometer's sweep", () => {
  const ticks = majorTickAngles(speedo);
  assertClose(ticks[0], degrees(SPEEDO_DIAL.startAngle), 0.01);
  assertClose(ticks[ticks.length - 1], degrees(SPEEDO_DIAL.endAngle), 0.01);
});

test("the speedometer's printed range matches the dial's full scale", () => {
  const labels = printedLabels(speedo);
  assertEqual(labels[0].value, SPEEDO_DIAL.min);
  assertEqual(labels[labels.length - 1].value, SPEEDO_DIAL.max);
});

test("every speedometer numeral sits where the code would point the needle", () => {
  for (const label of printedLabels(speedo)) {
    const expected = degrees(SPEEDO_DIAL.startAngle) +
      (degrees(SPEEDO_DIAL.endAngle) - degrees(SPEEDO_DIAL.startAngle)) *
        ((label.value - SPEEDO_DIAL.min) / (SPEEDO_DIAL.max - SPEEDO_DIAL.min));
    assertClose(label.angle, expected, 0.02, `the needle would miss the "${label.value}" numeral`);
  }
});

// ---------------------------------------------------------------------------
// Needle
// ---------------------------------------------------------------------------

test("the needle artwork is pre-rotated to the start of the sweep", () => {
  // The renderer subtracts this baked-in rotation before applying the value
  // angle. If the asset's rotate() changes, the needle picks up a constant
  // offset that no amount of tuning elsewhere will fix.
  const match = needle.match(/rotate\((-?[\d.]+)\s+256\s+256\)/);
  assert(match, "the needle asset must declare its rotation about the hub");
  assertClose(Number(match[1]), degrees(TACH_DIAL.startAngle), 0.01);
});

test("the needle points along positive x before that rotation", () => {
  // The drawn path must extend to the right of the hub, otherwise the baked
  // rotation would be measured from the wrong baseline.
  const match = needle.match(/<path d="M ([\d.]+) ([\d.]+) L ([\d.]+)/);
  assert(match, "expected a needle path");
  assert(Number(match[3]) > CENTRE, "the needle should be drawn pointing right");
});

// ---------------------------------------------------------------------------
// Shift light strip
// ---------------------------------------------------------------------------

test("the code's LED cells line up with the authored housings", () => {
  const housings = [];
  const pattern = /<rect\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"\s+rx="\d+"\s+fill="#/g;
  for (const match of strip.matchAll(pattern)) {
    housings.push({ x: Number(match[1]), width: Number(match[3]), height: Number(match[4]) });
  }

  assertEqual(housings.length, SHIFT_LIGHT_CELLS.length, "LED count drifted from the artwork");
  housings.forEach((housing, i) => {
    assertClose(SHIFT_LIGHT_CELLS[i].left * 640, housing.x, 0.01, `LED ${i} is offset from its housing`);
    assertClose(SHIFT_LIGHT_CELLS[i].width * 640, housing.width, 0.01, `LED ${i} is the wrong width`);
    assertClose(SHIFT_LIGHT_CELLS[i].height * 96, housing.height, 0.01, `LED ${i} is the wrong height`);
  });
});

test("the LED colour ramp runs green then amber then red", () => {
  const colours = SHIFT_LIGHT_CELLS.map((cell) => cell.colour);
  assertEqual(colours[0], "#4ade6a");
  assertEqual(colours[colours.length - 1], "#ff3b2d");
  assert(new Set(colours).size === 3, "expected exactly three ramp colours");
});

finish();
