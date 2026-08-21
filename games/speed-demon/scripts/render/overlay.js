// In-world overlays: the christmas tree and the staging prompt.
//
// These belong to the race itself rather than to a screen — they are drawn into
// the world every frame the race is visible, including behind the pause and
// results menus. The menu surfaces live in `menus.js` and share their chrome
// from there, which is where `dimWorld` and `menuPanel` come from.

import { CATCH_CLEAN_SECONDS, CATCH_LOOSE_SECONDS } from "../sim/constants.js";
import { STAGING, COUNTDOWN, RUNNING, isTimeAttack } from "../sim/race.js";
import { WORLD } from "./scene.js";
import { dimWorld, menuPanel } from "./menus.js";
import { inputHintsFor } from "../mobile-ui.js";

const TEXT = "#dfe6ee";
const DIM = "#8b95a2";

/**
 * A drag-strip christmas tree: three ambers then green. `countdown` counts down
 * in seconds, so the lit bulb is derived from it rather than from a separate
 * animation clock.
 */
export function drawChristmasTree(ctx, race) {
  // Stays up briefly after the green so the player can read their own start.
  const justLaunched = race.phase === RUNNING && race.elapsed < 1.6;
  if (race.phase !== COUNTDOWN && race.phase !== STAGING && !justLaunched) {
    return;
  }

  // Sized to sit entirely in the sky band, above the horizon.
  const cx = WORLD.width / 2;
  const top = 28;
  const radius = 12;
  const gap = 30;

  ctx.save();
  ctx.fillStyle = "rgba(8, 11, 16, 0.8)";
  ctx.beginPath();
  ctx.roundRect(cx - 28, top - 21, 56, gap * 5 + 32, 9);
  ctx.fill();
  ctx.strokeStyle = "#39424e";
  ctx.lineWidth = 2;
  ctx.stroke();

  const staged = race.phase === COUNTDOWN;
  const green = race.phase === RUNNING;
  const fouled = race.falseStart;
  // Amber bulbs light one at a time as the countdown burns down.
  const ambersLit = staged ? Math.max(0, 3 - Math.ceil(race.countdown)) + 1 : 0;

  const bulbs = [
    { colour: "#3fa9f5", on: true },
    { colour: "#ffb020", on: staged && ambersLit >= 1 },
    { colour: "#ffb020", on: staged && ambersLit >= 2 },
    { colour: "#ffb020", on: staged && ambersLit >= 3 },
    { colour: "#2ee86a", on: green && !fouled },
    // The bottom bulb is the red light. It only exists when someone jumps.
    { colour: "#ff2f22", on: fouled },
  ];

  bulbs.forEach((bulb, i) => {
    const y = top + i * gap;
    ctx.fillStyle = bulb.on ? bulb.colour : "#191e25";
    ctx.beginPath();
    ctx.arc(cx, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (bulb.on) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(cx, y, 2, cx, y, radius * 2.6);
      glow.addColorStop(0, bulb.colour);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, y, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  ctx.restore();
}

/**
 * What the player is about to race for, in the words of the objective. The
 * staging prompt is the last thing on screen before the tree, so it is the right
 * place to confirm the run rather than leaving the mode implicit.
 */
function objectiveLine(race) {
  return isTimeAttack(race)
    ? `TIME ATTACK — ${race.timeLimitSeconds} SECONDS`
    : `${race.distanceMetres.toFixed(0)} METRES`;
}

// ---------------------------------------------------------------------------
// The driver cue: the two moments a shift asks for the player's right foot
// ---------------------------------------------------------------------------

/** How long before the clutch bites the catch bar comes up. */
const CATCH_LEAD_SECONDS = 0.5;
const CUE_Y = 306;
const BAR = { width: 260, height: 11, y: 322 };

function cueWord(ctx, word, colour, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.fillStyle = colour;
  ctx.font = '800 34px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 14;
  ctx.fillText(word, WORLD.width / 2, CUE_Y);
  ctx.restore();
}

/**
 * The catch window drawn as it runs: the clean band, and a marker sweeping into
 * it. The bar is what teaches the timing — a word alone tells the player they
 * were late without ever showing them by how much.
 */
function catchBar(ctx, offsetSeconds) {
  const left = WORLD.width / 2 - BAR.width / 2;
  const span = CATCH_LOOSE_SECONDS * 2;
  const atSecond = (seconds) => left + ((seconds + CATCH_LOOSE_SECONDS) / span) * BAR.width;

  ctx.save();
  ctx.fillStyle = "rgba(8, 11, 16, 0.72)";
  ctx.beginPath();
  ctx.roundRect(left, BAR.y, BAR.width, BAR.height, BAR.height / 2);
  ctx.fill();

  const cleanLeft = atSecond(-CATCH_CLEAN_SECONDS);
  ctx.fillStyle = "rgba(74, 222, 106, 0.55)";
  ctx.beginPath();
  ctx.roundRect(cleanLeft, BAR.y, atSecond(CATCH_CLEAN_SECONDS) - cleanLeft, BAR.height, BAR.height / 2);
  ctx.fill();

  const x = Math.max(left, Math.min(left + BAR.width, atSecond(offsetSeconds)));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 1.5, BAR.y - 4, 3, BAR.height + 8);
  ctx.restore();
}

/**
 * What the player's right foot should be doing, and only when it is doing the
 * wrong thing. Two moments, and neither of them is a permanent instrument:
 *
 *   LIFT — the clutch has been asked for and the gas is still down, so nothing
 *          has happened yet. This only ever appears when the player got it
 *          wrong, which is what makes it teach rather than nag.
 *   GAS  — the gate is done and the clutch is about to bite. Getting back on
 *          the throttle here is the last input of the shift and the last thing
 *          that can still cost a grade.
 */
export function drawDriverCue(ctx, race) {
  if (race.phase !== RUNNING) {
    return;
  }

  if (race.shiftArmed) {
    // Pulses, because it is waiting on the player rather than on a clock.
    const pulse = 0.72 + 0.28 * Math.sin(race.elapsed * 14);
    cueWord(ctx, "LIFT", "#ffb020", pulse);
    return;
  }

  const pending = race.pendingShift;
  if (!pending || race.throttleHeld) {
    return;
  }
  const offset = race.elapsed - pending.clutchAt;
  if (offset < -CATCH_LEAD_SECONDS) {
    return;
  }
  // Fades up as the bite approaches so the word arrives before the window does.
  const alpha = offset < 0 ? Math.min(1, 1 - (-offset - 0.14) / (CATCH_LEAD_SECONDS - 0.14)) : 1;
  cueWord(ctx, "GAS", offset > CATCH_CLEAN_SECONDS ? "#ff5a2e" : "#4ade6a", Math.max(0.35, alpha));
  catchBar(ctx, offset);
}

export function drawStagingPrompt(ctx, race, { mobile = false } = {}) {
  if (race.phase !== STAGING) {
    return;
  }
  ctx.save();
  dimWorld(ctx);
  ctx.textAlign = "center";
  menuPanel(ctx, WORLD.width / 2 - 290, 250, 580, 204);
  ctx.fillStyle = TEXT;
  ctx.font = '700 27px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("STAGE THE CAR", WORLD.width / 2, 292);
  ctx.fillStyle = "#ff5a2e";
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(objectiveLine(race), WORLD.width / 2, 316);

  // The shift spelled out in order, because it is three inputs and the middle
  // one is the only one a player would guess. A driver who holds the throttle
  // through the gate never gets the clutch in at all.
  ctx.fillStyle = TEXT;
  ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
  const hints = inputHintsFor("staging", { mobile });
  ctx.fillText(hints.steps, WORLD.width / 2, 350);
  ctx.fillStyle = DIM;
  ctx.font = '500 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(hints.detail1, WORLD.width / 2, 376);
  ctx.fillText(hints.detail2, WORLD.width / 2, 398);
  ctx.fillStyle = TEXT;
  ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(hints.action, WORLD.width / 2, 430);
  ctx.restore();
}
