// Dashboard rendering — composites the authored gauge art, drawn last with a
// reset transform.
//
// The faces, needle, gear bezel, and shift-light housing are authored SVGs in
// assets/gauges/. This module only positions and rotates them; the value-to-angle
// maths lives in ui/gauges.js and is unit-tested against the angles actually
// printed on those faces (see tests/gauge-assets.test.js). If the art is
// re-authored with a different sweep, that test fails rather than the needle
// silently lying.
//
// Every draw falls back to a procedural dial when an image has not loaded, so
// the cabinet is playable before the assets resolve and on a cold cache.

import { MPS_TO_MPH, GOOD_RPM_WINDOW } from "../sim/constants.js";
import { FINISHED, isTimeAttack, raceProgress } from "../sim/race.js";
import { needleAngle, gaugeTicks, TACH_SWEEP, SPEEDO_SWEEP, SHIFT_LIGHT_OVER } from "../ui/gauges.js";
import { WORLD, DASH_TOP } from "./scene.js";

const TEXT = "#dfe6ee";
const DIM = "#7c8794";
const ACCENT = "#e8433a";

/** Where each instrument sits. `radius` is half the drawn size of its artwork. */
export const TACH = { cx: 124, cy: 610, radius: 100 };
export const SPEEDO = { cx: 318, cy: 610, radius: 78 };
export const GEAR_PANEL = { cx: 460, cy: 630, size: 96 };
export const SHIFT_STRIP = { x: 412, y: 512, width: 280, height: 42 };
/** `top` is the baseline of the first readout label; nothing may reach into it. */
export const READOUTS = { x: 530, top: 572 };
export const SHIFTER_BOX = { x: 814, y: 516, width: 400, height: 190, padding: 58 };

/** Full-scale ranges. These must agree with the numerals printed on the faces. */
export const TACH_DIAL = { ...TACH_SWEEP, min: 0, max: 8000 };
export const SPEEDO_DIAL = { ...SPEEDO_SWEEP, min: 0, max: 200 };

export const GAUGE_ASSETS = {
  tachFace: "assets/gauges/tachometer_face.svg",
  speedoFace: "assets/gauges/speedometer_face.svg",
  needle: "assets/gauges/gauge_needle.svg",
  gearFrame: "assets/gauges/gear_indicator_frame.svg",
  shiftStrip: "assets/gauges/shift_light_strip.svg",
};

/**
 * The needle artwork is drawn pointing right and pre-rotated to the start of the
 * sweep, so rotating it is always relative to that baked-in offset.
 */
const NEEDLE_ASSET_BASE_ANGLE = Math.PI * 0.75;

/**
 * LED cells as authored in shift_light_strip.svg (640x96 viewBox), with the
 * colour each one lights. Kept as fractions of the artwork so repositioning or
 * resizing the strip cannot desynchronise the lights from their housings.
 */
export const SHIFT_LIGHT_CELLS = [
  { x: 28, colour: "#4ade6a" },
  { x: 102, colour: "#4ade6a" },
  { x: 176, colour: "#4ade6a" },
  { x: 250, colour: "#ffb020" },
  { x: 324, colour: "#ffb020" },
  { x: 398, colour: "#ff3b2d" },
  { x: 472, colour: "#ff3b2d" },
  { x: 546, colour: "#ff3b2d" },
].map((cell) => ({
  colour: cell.colour,
  left: cell.x / 640,
  top: 28 / 96,
  width: 56 / 640,
  height: 40 / 96,
}));

function ready(image) {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

export function drawDashPanel(ctx) {
  const panel = ctx.createLinearGradient(0, DASH_TOP, 0, WORLD.height);
  panel.addColorStop(0, "#242a33");
  panel.addColorStop(0.06, "#161b22");
  panel.addColorStop(1, "#0a0d12");
  ctx.fillStyle = panel;
  ctx.fillRect(0, DASH_TOP, WORLD.width, WORLD.height - DASH_TOP);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(0, DASH_TOP, WORLD.width, 2);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, DASH_TOP + 2, WORLD.width, 3);
}

/** Procedural stand-in used only until the authored face loads. */
function drawFallbackFace(ctx, { cx, cy, radius, dial, majorStep, minorStep, valueDivisor, label }) {
  ctx.save();
  ctx.fillStyle = "#0e1116";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a4045";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tick of gaugeTicks({ ...dial, majorStep, minorStep })) {
    const cos = Math.cos(tick.angle);
    const sin = Math.sin(tick.angle);
    const outer = radius * 0.8;
    const inner = outer - (tick.major ? 12 : 6);
    ctx.strokeStyle = tick.major ? TEXT : DIM;
    ctx.lineWidth = tick.major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + cos * inner, cy + sin * inner);
    ctx.lineTo(cx + cos * outer, cy + sin * outer);
    ctx.stroke();
    if (tick.major) {
      ctx.fillStyle = TEXT;
      ctx.font = `600 ${Math.round(radius * 0.15)}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(String(tick.value / valueDivisor), cx + cos * (inner - 13), cy + sin * (inner - 13));
    }
  }

  ctx.fillStyle = DIM;
  ctx.font = `600 ${Math.round(radius * 0.13)}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(label, cx, cy - radius * 0.38);
  ctx.restore();
}

/** Fallback needle, matching the artwork's silhouette closely enough to read. */
function drawFallbackNeedle(ctx, cx, cy, radius, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.moveTo(radius * 0.78, 0);
  ctx.lineTo(0, -4.5);
  ctx.lineTo(-radius * 0.16, 0);
  ctx.lineTo(0, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#171b1f";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7b8287";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Draws one instrument: authored face, then the needle rotated to the value.
 * The needle is a separate asset so it can spin over any face.
 */
export function drawDial(ctx, images, { cx, cy, radius, dial, value, faceKey, majorStep, minorStep, valueDivisor = 1, label }) {
  const angle = needleAngle(value, dial);
  const face = images?.[faceKey];

  if (ready(face)) {
    ctx.drawImage(face, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    drawFallbackFace(ctx, { cx, cy, radius, dial, majorStep, minorStep, valueDivisor, label });
  }

  if (ready(images?.needle)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle - NEEDLE_ASSET_BASE_ANGLE);
    ctx.drawImage(images.needle, -radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  } else {
    drawFallbackNeedle(ctx, cx, cy, radius, angle);
  }
}

export function drawTachometer(ctx, images, smoothedRpm) {
  drawDial(ctx, images, {
    ...TACH,
    dial: TACH_DIAL,
    value: smoothedRpm,
    faceKey: "tachFace",
    majorStep: 1000,
    minorStep: 500,
    valueDivisor: 1000,
    label: "RPM x1000",
  });
}

export function drawSpeedometer(ctx, images, smoothedSpeedMps) {
  drawDial(ctx, images, {
    ...SPEEDO,
    dial: SPEEDO_DIAL,
    value: smoothedSpeedMps * MPS_TO_MPH,
    faceKey: "speedoFace",
    majorStep: 20,
    minorStep: 10,
    label: "MPH",
  });
}

/**
 * Progressive LED shift light. The bar fills as the engine approaches the shift
 * point, goes solid across the perfect window, and flashes red past it — the same
 * window grading uses, so the light never lies about a shift being available.
 */
export function drawShiftLight(ctx, images, car, rpm, lightState, tick) {
  const { x, y, width, height } = SHIFT_STRIP;

  if (ready(images?.shiftStrip)) {
    ctx.drawImage(images.shiftStrip, x, y, width, height);
  } else {
    ctx.fillStyle = "#12161b";
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 7);
    ctx.fill();
    ctx.strokeStyle = "#3a4045";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const from = car.optimalShiftRpm - GOOD_RPM_WINDOW * 1.8;
  const lit = Math.round(
    Math.max(0, Math.min(1, (rpm - from) / (car.optimalShiftRpm - from))) * SHIFT_LIGHT_CELLS.length,
  );
  const flashing = Math.floor(tick / 5) % 2 === 0;

  ctx.save();
  SHIFT_LIGHT_CELLS.forEach((cell, i) => {
    const on = lightState === SHIFT_LIGHT_OVER ? flashing : i < lit;
    if (!on) {
      return;
    }
    const colour = lightState === SHIFT_LIGHT_OVER ? "#ff2f22" : cell.colour;
    const cx = x + cell.left * width;
    const cy = y + cell.top * height;
    const cw = cell.width * width;
    const ch = cell.height * height;

    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, ch, 3);
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.roundRect(cx - 3, cy - 3, cw + 6, ch + 6, 5);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  });
  ctx.restore();
  // No "SHIFT" caption: a fully lit ramp is the universal signal, and the words
  // collided with the ELAPSED readout directly below the strip.
}

/** Gear numeral inside the authored bezel. */
export function drawGearIndicator(ctx, images, gear, shifting) {
  const { cx, cy, size } = GEAR_PANEL;

  if (ready(images?.gearFrame)) {
    ctx.drawImage(images.gearFrame, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = "#080a0e";
    ctx.beginPath();
    ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 10);
    ctx.fill();
    ctx.strokeStyle = "#596168";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = shifting ? "#ffb020" : TEXT;
  ctx.font = `700 ${Math.round(size * 0.6)}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(shifting ? "-" : String(gear), cx, cy + 2);
  ctx.fillStyle = DIM;
  ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("GEAR", cx, cy + size / 2 + 12);
  ctx.restore();
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${whole}.${String(Math.floor((seconds - whole) * 100)).padStart(2, "0")}`;
}

/**
 * Digital timer, distance readout, and progress bar.
 *
 * Both readouts show the same two quantities in both modes; which one is the
 * *objective* decides which one counts down and what the bar fills against. A
 * time attack has no finish line, so its distance readout is open-ended rather
 * than showing a total the run will never reach.
 */
export function drawReadouts(ctx, race) {
  const x = READOUTS.x;
  const timeAttack = isTimeAttack(race);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = DIM;
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(timeAttack ? "REMAINING" : "ELAPSED", x, 572);
  ctx.fillText("DISTANCE", x, 642);

  const clock = timeAttack
    ? Math.max(0, race.timeLimitSeconds - race.elapsed)
    : (race.finishTime ?? race.elapsed);
  // Red under five seconds, so the buzzer never arrives unannounced.
  const urgent = timeAttack && clock <= 5 && race.phase !== FINISHED;
  ctx.fillStyle = urgent ? "#ff5a2e" : race.finishTime ? "#4ade6a" : TEXT;
  ctx.font = '700 36px "Consolas", "SF Mono", monospace';
  ctx.fillText(`${formatTime(clock)}s`, x, 610);

  ctx.fillStyle = TEXT;
  ctx.font = '600 19px "Consolas", "SF Mono", monospace';
  ctx.fillText(
    timeAttack
      ? `${race.vehicle.distance.toFixed(0)} m`
      : `${Math.min(race.vehicle.distance, race.distanceMetres).toFixed(0)} / ${race.distanceMetres.toFixed(0)} m`,
    x,
    670,
  );

  ctx.fillStyle = "#1d232b";
  ctx.fillRect(x, 682, 240, 8);
  ctx.fillStyle = urgent ? "#ff2f22" : ACCENT;
  ctx.fillRect(x, 682, 240 * raceProgress(race), 8);
  ctx.restore();
}

/**
 * Feedback flash for the last thing the player was graded on — a shift or the
 * launch. `flash` is `{ label, tone }`; the tone keys the colour so launch and
 * shift grades share one treatment.
 */
export const FLASH_COLOURS = {
  perfect: "#4ade6a",
  good: "#8fd3ff",
  poor: "#ffb020",
  missed: "#ff3b2d",
  holeshot: "#4ade6a",
  late: "#ffb020",
  foul: "#ff3b2d",
};

export function drawGradeFlash(ctx, flash, ageSeconds) {
  if (!flash || ageSeconds > 1.4) {
    return;
  }
  const alpha = Math.max(0, 1 - ageSeconds / 1.4);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = FLASH_COLOURS[flash.tone] ?? TEXT;
  ctx.font = '700 42px "Segoe UI", system-ui, sans-serif';
  // Sits in the clear band between the christmas tree and the car's roofline.
  ctx.fillText(flash.label, WORLD.width / 2, 248 - (1 - alpha) * 26);
  ctx.restore();
}
