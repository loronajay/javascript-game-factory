// The driving coach's two surfaces.
//
// A step the player has to *do* gets a strip low over the road, clear of the
// christmas tree, the grade flash and the catch bar — it must not cover the
// things it is telling them to look at. A step the player has to *read* gets a
// panel over a dimmed, frozen world, because there is nothing to watch.
//
// Geometry only; every word comes from `ui/coach.js`.

import { WORLD } from "./scene.js";
import { dimWorld, menuPanel } from "./menus.js";
import { inputHintsFor, mobileCoachLine } from "../mobile-ui.js";

const INK = "#f2f5f8";
const TEXT = "#dfe6ee";
const DIM = "#8b95a2";
const ACCENT = "#ff5a2e";

/**
 * Both surfaces, exported so `tests/modules.test.js` can check them against the
 * words `ui/coach.js` actually holds rather than against an eyeballed screenshot.
 *
 * The strip sits low over the road: below the catch bar, above the instrument
 * cluster. It covers the car, which is the right trade — during a lesson the
 * player's eyes are on the tachometer, the gate and the catch bar, not on the
 * bodywork. It is sized for exactly `maxLines`; a step with one more would put
 * text on the dashboard.
 */
export const COACH_LAYOUT = {
  strip: { x: 214, y: 370, width: 852, height: 122 },
  stripText: { counter: 22, title: 48, firstLine: 72, lineHeight: 21, maxLines: 3 },
  panel: { x: 250, y: 214, width: 780, height: 282 },
  panelText: { counter: 40, title: 86, firstLine: 134, lineHeight: 30, maxLines: 3, hint: 248 },
};

const STRIP = COACH_LAYOUT.strip;
const PANEL = COACH_LAYOUT.panel;

function centred(ctx, message, x, y, { size, colour = TEXT, weight = "500" }) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(message, x, y);
}

function stepCounter(ctx, view, x, y) {
  centred(ctx, `STEP ${view.index} / ${view.total}`, x, y, { size: 12, colour: DIM, weight: "600" });
}

export function drawCoachPanel(ctx, view, { mobile = false } = {}) {
  if (!view) {
    return;
  }
  const centre = WORLD.width / 2;

  ctx.save();
  ctx.textAlign = "center";

  if (view.holding) {
    const metrics = COACH_LAYOUT.panelText;
    dimWorld(ctx);
    menuPanel(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height);
    stepCounter(ctx, view, centre, PANEL.y + metrics.counter);
    centred(ctx, view.title, centre, PANEL.y + metrics.title, { size: 32, colour: INK, weight: "800" });
    view.lines.slice(0, metrics.maxLines).forEach((line, index) => {
      centred(ctx, mobile ? mobileCoachLine(line) : line, centre, PANEL.y + metrics.firstLine + index * metrics.lineHeight, { size: 17 });
    });
    centred(ctx, inputHintsFor("coach", { mobile }).continue, centre, PANEL.y + metrics.hint, {
      size: 15,
      colour: ACCENT,
      weight: "700",
    });
    ctx.restore();
    return;
  }

  const metrics = COACH_LAYOUT.stripText;
  menuPanel(ctx, STRIP.x, STRIP.y, STRIP.width, STRIP.height, { live: Boolean(view.hint) });
  stepCounter(ctx, view, centre, STRIP.y + metrics.counter);
  centred(ctx, view.title, centre, STRIP.y + metrics.title, { size: 22, colour: INK, weight: "700" });
  // A hint replaces the last line rather than being added below it. The strip
  // must not change height under the player — that moves the text they were
  // halfway through reading.
  const lines = view.hint ? [...view.lines.slice(0, -1), view.hint] : view.lines;
  lines.slice(0, metrics.maxLines).forEach((line, index) => {
    centred(ctx, mobile ? mobileCoachLine(line) : line, centre, STRIP.y + metrics.firstLine + index * metrics.lineHeight, {
      size: 15,
      colour: view.hint && index === lines.length - 1 ? ACCENT : DIM,
      weight: view.hint && index === lines.length - 1 ? "700" : "500",
    });
  });
  ctx.restore();
}
