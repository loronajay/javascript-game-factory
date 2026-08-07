// In-world overlays: the christmas tree and the staging prompt.
//
// These belong to the race itself rather than to a screen — they are drawn into
// the world every frame the race is visible, including behind the pause and
// results menus. The menu surfaces live in `menus.js` and share their chrome
// from there, which is where `dimWorld` and `menuPanel` come from.

import { STAGING, COUNTDOWN, RUNNING, isTimeAttack } from "../sim/race.js";
import { WORLD } from "./scene.js";
import { dimWorld, menuPanel } from "./menus.js";

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

export function drawStagingPrompt(ctx, race) {
  if (race.phase !== STAGING) {
    return;
  }
  ctx.save();
  dimWorld(ctx);
  ctx.textAlign = "center";
  menuPanel(ctx, WORLD.width / 2 - 270, 272, 540, 160);
  ctx.fillStyle = TEXT;
  ctx.font = '700 27px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("STAGE THE CAR", WORLD.width / 2, 314);
  ctx.fillStyle = "#ff5a2e";
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(objectiveLine(race), WORLD.width / 2, 338);
  ctx.fillStyle = DIM;
  ctx.font = '500 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("SPACE — throttle      ENTER — clutch in      ARROWS — work the gate", WORLD.width / 2, 372);
  ctx.fillStyle = TEXT;
  ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillText("ENTER to stage — then SPACE the moment it turns green", WORLD.width / 2, 404);
  ctx.restore();
}
