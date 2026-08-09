// Menu surfaces: the title screen, the mode list, the pause menu, and the
// results card.
//
// Canvas only. Every one of these draws a menu the shell already resolved — the
// highlighted item arrives as `highlighted: true`, so nothing here compares a
// cursor to an index or decides what a key press meant.
//
// The four share one chrome (`menuPanel`, `drawMenuList`, `drawMenuBackdrop`) so
// a fifth screen is a function, not a new visual language. `overlay.js` keeps the
// things drawn *into* the world — the christmas tree and the staging prompt.

import { MPS_TO_MPH } from "../sim/constants.js";
import { isTimeAttack } from "../sim/race.js";
import { LAUNCH_FOUL } from "../sim/launch.js";
import { TONE_RECORD } from "../records/records.js";
import { WORLD, DASH_TOP } from "./scene.js";

const INK = "#e8e9ee";
const TEXT = "#dfe6ee";
const DIM = "#8b95a2";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";

/** Where the shared surfaces sit. Exported so a test can check them fit. */
export const MENU_LAYOUT = {
  // The splash puts its cars across the middle band, so the type sits above and
  // below them rather than in the space between.
  title: {
    wordmark: { y: 148 },
    // Six items now — START, CAMPAIGN, GARAGE, LEADERBOARDS, HOW TO DRIVE,
    // RADIO — so the list starts higher again. It still has to clear the
    // splash's cars above and the legend below, which is what
    // `tests/modules.test.js` checks: adding a seventh item moves this line
    // rather than silently overrunning the legend, exactly as adding the fifth
    // and the sixth did.
    list: { x: WORLD.width / 2 - 170, y: 380, width: 340, itemHeight: 40, gap: 8 },
    controls: { y: 672 },
  },
  modes: { header: { x: 140, y: 128 }, list: { x: 140, y: 216, width: 430, itemHeight: 62, gap: 12 } },
  detail: { x: 630, y: 216, width: 510, height: 300 },
  // Sized around its five items and no larger: it has to clear DASH_TOP so the
  // instrument cluster stays lit underneath a paused race.
  pause: { x: WORLD.width / 2 - 210, y: 150, width: 420, height: 348 },
  results: { x: WORLD.width / 2 - 265, y: 34, width: 530, height: 452 },
};

/**
 * Dims the world behind a modal panel. Without this the panel reads as if it has
 * accidentally landed on top of the car; with it, the overlap is obviously
 * deliberate and the instrument cluster stays fully lit underneath.
 */
export function dimWorld(ctx) {
  ctx.fillStyle = "rgba(4, 6, 9, 0.62)";
  ctx.fillRect(0, 0, WORLD.width, DASH_TOP);
}

export function menuPanel(ctx, x, y, width, height, { live = false } = {}) {
  ctx.fillStyle = "rgba(8, 11, 16, 0.93)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = live ? ACCENT : "#39424e";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function text(ctx, value, x, y, { size = 15, colour = DIM, weight = "600", align = "left", mono = false } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${mono ? '"Consolas", "SF Mono", monospace' : '"Segoe UI", system-ui, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

/** Greedy word wrap. Blurbs are authored copy, so they need to fold cleanly. */
export function wrapText(ctx, value, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of value.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function ready(image) {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

/** The authored splash behind the title and mode screens. */
export const MENU_SPLASH = "assets/menu-splash.png";

/**
 * The picture behind a menu, cropped to cover, with a scrim so text over it
 * never has to fight.
 *
 * `alpha` and `scrim` are arguments because the two backdrops are different
 * kinds of image. `menu-splash.png` is authored as a backdrop — already night,
 * already composed around its empty centre — so it is drawn near full strength.
 * A track aerial is a bright daylight photograph of tarmac, so it needs holding
 * right back before a wordmark can sit on it.
 */
export function drawMenuBackdrop(ctx, image, { alpha = 0.34, scrim = 0.62 } = {}) {
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  if (ready(image)) {
    const scale = Math.max(WORLD.width / image.naturalWidth, WORLD.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, (WORLD.width - width) / 2, (WORLD.height - height) / 2, width, height);
    ctx.restore();
  }

  // Darkest at the top and bottom, where the headings and the hint lines go.
  const wash = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  wash.addColorStop(0, `rgba(6,7,10,${scrim})`);
  wash.addColorStop(0.5, `rgba(6,7,10,${scrim * 0.68})`);
  wash.addColorStop(1, `rgba(6,7,10,${Math.min(1, scrim * 1.22)})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
}

/** The splash backdrop, at the strength the authored art was made for. */
export function drawSplashBackdrop(ctx, image) {
  drawMenuBackdrop(ctx, image, { alpha: 1, scrim: 0.48 });
}

/**
 * A vertical list of menu items. `box` gives the left edge, the first item's top,
 * and the item size; a disabled item still draws, greyed, with its note — the
 * roadmap is worth showing rather than hiding.
 */
export function drawMenuList(ctx, items, box, { centred = false } = {}) {
  items.forEach((item, index) => {
    const y = box.y + index * (box.itemHeight + box.gap);
    const live = item.highlighted;
    // A highlighted item you cannot choose keeps the caret but loses the accent,
    // so the cursor is still findable without the row looking ready to go.
    const locked = item.enabled === false;

    ctx.fillStyle = live && !locked ? "rgba(74,22,10,0.92)" : "rgba(12,15,20,0.88)";
    ctx.beginPath();
    ctx.roundRect(box.x, y, box.width, box.itemHeight, 8);
    ctx.fill();
    ctx.strokeStyle = live ? (locked ? "rgba(150,158,178,0.7)" : ACCENT) : "rgba(150,158,178,0.28)";
    ctx.lineWidth = live ? 2 : 1;
    ctx.stroke();

    // A caret rather than a colour change alone, so the highlight survives a
    // screenshot in greyscale and reads instantly on a dark panel.
    if (live) {
      text(ctx, "▸", box.x + 16, y + box.itemHeight / 2 + 7, { size: 20, colour: locked ? MUTED : ACCENT });
    }

    const colour = item.enabled === false ? MUTED : live ? INK : TEXT;
    const labelY = item.note ? y + box.itemHeight / 2 - 1 : y + box.itemHeight / 2 + 7;
    if (centred) {
      text(ctx, item.label, box.x + box.width / 2, labelY, { size: 19, colour, align: "center" });
    } else {
      text(ctx, item.label, box.x + 40, labelY, { size: 19, colour });
      if (item.note) {
        text(ctx, item.note.toUpperCase(), box.x + 40, y + box.itemHeight / 2 + 19, { size: 11, colour: MUTED });
      }
    }
  });
}

/** Height of a list of `count` items, so a panel can be sized around one. */
export function menuListHeight(count, box) {
  return count * box.itemHeight + Math.max(0, count - 1) * box.gap;
}

/**
 * Where each screen's list of items actually sits.
 *
 * Exported — and derived here rather than written inline in each draw function —
 * because the mouse needs the same geometry the renderer uses. Two copies of a
 * list box is exactly the bug where the row you click is not the row you see.
 */
export function menuListBox(screen) {
  switch (screen) {
    case "title":
      return MENU_LAYOUT.title.list;
    case "modes":
      return MENU_LAYOUT.modes.list;
    case "paused": {
      const box = MENU_LAYOUT.pause;
      return { x: box.x + 30, y: box.y + 104, width: box.width - 60, itemHeight: 40, gap: 6 };
    }
    case "results": {
      const box = MENU_LAYOUT.results;
      return { x: box.x + 40, y: box.y + 302, width: box.width - 80, itemHeight: 40, gap: 8 };
    }
    default:
      return null;
  }
}

/** Which item is under a point, or -1. Pure; the gaps between rows are dead. */
export function hitMenuList(count, box, x, y) {
  if (!box || !Number.isFinite(x) || !Number.isFinite(y) || x < box.x || x > box.x + box.width) {
    return -1;
  }
  const stride = box.itemHeight + box.gap;
  const offset = y - box.y;
  if (offset < 0) {
    return -1;
  }
  const index = Math.floor(offset / stride);
  const inRow = offset - index * stride <= box.itemHeight;
  return index < count && inRow ? index : -1;
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

/**
 * The title screen: the splash, the wordmark, and the way in.
 *
 * Nothing is drawn over the middle of the splash. The art is composed as two
 * cars either side of an empty centre line, so a sprite parked there reads as a
 * third car sitting on the divider — the picture is the hero, and the type
 * stays out of its way, top and bottom.
 *
 * The way in is a real menu list rather than a blinking prompt because there is
 * now more than one of them: the stereo is reachable without starting a race,
 * so that a folder can be set before the first run rather than after it.
 */
export function drawTitleScreen(ctx, { menu, splashImage }) {
  drawSplashBackdrop(ctx, splashImage);

  const centre = WORLD.width / 2;
  const { wordmark, list, controls } = MENU_LAYOUT.title;

  ctx.save();
  ctx.shadowColor = "rgba(255,90,46,0.55)";
  ctx.shadowBlur = 26;
  text(ctx, menu.title, centre, wordmark.y, { size: 78, colour: INK, weight: "800", align: "center" });
  ctx.restore();
  text(ctx, menu.subtitle.toUpperCase(), centre, wordmark.y + 30, {
    size: 15,
    colour: ACCENT,
    align: "center",
  });

  drawMenuList(ctx, menu.items, list, { centred: true });

  // The lower type lands on the splash's tyre smoke rather than on flat colour,
  // so it carries its own shadow instead of relying on the backdrop scrim.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 12;
  // The shift, in order, is the one thing a new player cannot guess: you have to
  // be *off* the gas to declutch, and back *on* it as the clutch bites.
  text(ctx, "EVERY SHIFT:  LIFT off SPACE  ·  SHIFT clutch  ·  ARROWS gate  ·  SPACE again to catch it", centre, controls.y, {
    size: 14,
    colour: "#a7b0bd",
    align: "center",
  });
  // The stereo keys are named here, not shown as a symbol row: B/P/N/L are the
  // reason the transport moved off punctuation, and a hint that still listed the
  // old keycaps would be worse than no hint at all.
  text(ctx, "R restart a run   ESC back   B P N stereo   L repeat   - = volume   F folder", centre, controls.y + 22, {
    size: 13,
    colour: MUTED,
    align: "center",
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Mode select
// ---------------------------------------------------------------------------

/** The mode list, with the highlighted mode explained in the panel beside it. */
export function drawModeSelect(ctx, { menu, splashImage }) {
  drawSplashBackdrop(ctx, splashImage);

  const { header, list } = MENU_LAYOUT.modes;
  text(ctx, menu.title, header.x, header.y, { size: 42, colour: INK, weight: "800" });
  if (menu.subtitle) {
    text(ctx, menu.subtitle.toUpperCase(), header.x, header.y + 26, { size: 13 });
  }

  drawMenuList(ctx, menu.items, list);

  const detail = MENU_LAYOUT.detail;
  const chosen = menu.items.find((item) => item.highlighted);
  menuPanel(ctx, detail.x, detail.y, detail.width, detail.height);
  if (!chosen) {
    return;
  }

  text(ctx, chosen.label, detail.x + 28, detail.y + 52, { size: 26, colour: INK, weight: "700" });
  ctx.fillStyle = chosen.enabled === false ? MUTED : ACCENT;
  ctx.fillRect(detail.x + 28, detail.y + 68, 54, 3);

  ctx.font = '500 16px "Segoe UI", system-ui, sans-serif';
  wrapText(ctx, chosen.blurb ?? "", detail.width - 56).forEach((line, index) => {
    text(ctx, line, detail.x + 28, detail.y + 110 + index * 26, { size: 16, colour: TEXT, weight: "500" });
  });

  // The foot of the panel answers "and then what?" — for a mode you can play,
  // what the setup screen will ask for next; for one you cannot, why not. Never
  // both: a locked mode's options are not a choice you are about to be offered.
  const footer = detail.y + detail.height - 62;
  ctx.fillStyle = "rgba(150,158,178,0.22)";
  ctx.fillRect(detail.x + 28, footer, detail.width - 56, 1);

  if (chosen.enabled === false) {
    text(ctx, chosen.note.toUpperCase(), detail.x + 28, footer + 30, { size: 13, colour: MUTED });
  } else if (chosen.objectiveOptions?.length) {
    text(ctx, chosen.objectiveLabel, detail.x + 28, footer + 22, { size: 12, colour: MUTED });
    text(ctx, chosen.objectiveOptions.join("   ·   "), detail.x + 28, footer + 46, { size: 15, colour: TEXT });
  }
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

export function drawPauseMenu(ctx, menu) {
  const box = MENU_LAYOUT.pause;
  ctx.save();
  dimWorld(ctx);
  menuPanel(ctx, box.x, box.y, box.width, box.height);

  text(ctx, menu.title, box.x + box.width / 2, box.y + 52, {
    size: 30,
    colour: INK,
    weight: "700",
    align: "center",
  });
  if (menu.subtitle) {
    text(ctx, menu.subtitle.toUpperCase(), box.x + box.width / 2, box.y + 76, { size: 12, align: "center" });
  }

  drawMenuList(ctx, menu.items, menuListBox("paused"), { centred: true });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const GRADE_COLOURS = { perfect: "#4ade6a", good: "#8fd3ff", poor: "#ffb020", missed: "#ff3b2d" };
const LAUNCH_COLOURS = { holeshot: "#4ade6a", good: "#8fd3ff", late: "#ffb020", foul: "#ff3b2d" };

/**
 * What the run was worth, headline first. The headline is whatever the mode was
 * measured in — the clock for a distance race, the ground covered for a time
 * attack — so the number the player was chasing is the number they get back.
 */
function headline(race) {
  const mph = (metresPerSecond) => `${(metresPerSecond * MPS_TO_MPH).toFixed(1)} MPH`;
  // A distance race traps at the line, which is also where the car is fastest,
  // so the peak would just restate the trap; a time attack has no line to trap
  // at, so the peak is the speed worth reporting.
  return isTimeAttack(race)
    ? {
        caption: "TIME UP",
        value: `${race.vehicle.distance.toFixed(0)} m`,
        sub: `IN ${race.timeLimitSeconds}s      TOP ${mph(race.topSpeed)}`,
      }
    : {
        caption: "RUN COMPLETE",
        value: `${race.finishTime.toFixed(3)}s`,
        sub: `TRAP ${mph(race.vehicle.speed)}`,
      };
}

/**
 * The personal-best line, between the headline and the launch grade.
 *
 * It sits in the 50px the panel already had spare there rather than lengthening
 * the panel: the results card is sized to clear `DASH_TOP` so the instrument
 * cluster stays lit underneath it, and growing it downward would cover the
 * cluster the run was just driven on.
 *
 * `summary` is null for a run that keeps no record — an online race, or one
 * abandoned before the line — and this draws nothing at all rather than an empty
 * row, so the panel does not gain a blank band in modes that have no bests.
 */
function drawRecordLine(ctx, summary, centre, y) {
  if (!summary) return;
  const tone = summary.tone === TONE_RECORD ? "#f6c453" : DIM;
  text(ctx, `${summary.label}  ${summary.detail}`, centre, y, {
    size: 16,
    colour: tone,
    weight: "700",
    align: "center",
    mono: true,
  });
  // The sign-in note rides under the line rather than beside it: appending it
  // would make a record line and a non-record line different lengths, and the
  // eye reads the jump as the number having changed.
  if (summary.note) {
    text(ctx, summary.note, centre, y + 15, { size: 11, colour: MUTED, align: "center" });
  }
}

/**
 * Where the record band sits inside the results panel: between the headline's
 * `sub` (y+128) and the launch grade (y+178).
 *
 * Those 50px are the entire budget — the panel is sized to clear `DASH_TOP` so
 * the cluster stays lit underneath, so it cannot grow downward — and the band
 * has to hold two lines when a signed-out player sets a best. At y+152 the note
 * printed straight through "RED LIGHT"; y+148 leaves 15px under the note's
 * baseline, which clears an 11px cap height with room to spare.
 */
const RECORD_LINE_Y = 148;

/**
 * How a rival verdict is coloured. Green and red rather than the grade palette,
 * because this is the one line on the card that is about somebody else.
 */
const RIVAL_COLOURS = { win: "#4ade6a", loss: "#ff6b6b", draw: TEXT };

export function drawResults(ctx, race, menu, recordSummary = null, rival = null) {
  const box = MENU_LAYOUT.results;
  const centre = WORLD.width / 2;

  ctx.save();
  dimWorld(ctx);
  menuPanel(ctx, box.x, box.y, box.width, box.height);

  const { caption, value, sub } = headline(race);
  // In a rival race the caption is who won. It costs no layout — "RUN COMPLETE"
  // is decoration, and the result of a race against somebody is the headline of
  // that race — and the margin rides on the `sub` line, which had room beside
  // the trap speed.
  text(ctx, rival ? rival.caption : caption, centre, box.y + 38, {
    size: 22,
    colour: rival ? RIVAL_COLOURS[rival.tone] ?? TEXT : TEXT,
    weight: "700",
    align: "center",
  });
  text(ctx, value, centre, box.y + 98, { size: 52, colour: "#4ade6a", weight: "700", align: "center", mono: true });
  text(ctx, rival?.detail ? `${sub}      ${rival.detail}` : sub, centre, box.y + 128, { size: 14, align: "center" });

  drawRecordLine(ctx, recordSummary, centre, box.y + RECORD_LINE_Y);

  // Launch — the run's other half, and the only place a red light is spelled out.
  const grade = race.launchGrade;
  const launchLabel = grade === LAUNCH_FOUL ? "RED LIGHT" : (grade ?? "no launch").toUpperCase();
  const reaction = race.reactionTime === null ? "" : `   RT ${race.reactionTime.toFixed(3)}s`;
  text(ctx, `${launchLabel}${reaction}`, centre, box.y + 178, {
    size: 18,
    colour: grade ? LAUNCH_COLOURS[grade] : DIM,
    weight: "700",
    align: "center",
  });

  const counts = { perfect: 0, good: 0, poor: 0, missed: 0 };
  for (const shift of race.shifts) {
    counts[shift.grade] += 1;
  }
  const entries = Object.entries(counts);
  const columnWidth = box.width / entries.length;
  entries.forEach(([label, count], index) => {
    const cx = box.x + columnWidth * index + columnWidth / 2;
    text(ctx, String(count), cx, box.y + 232, {
      size: 30,
      colour: count > 0 ? GRADE_COLOURS[label] : "#39424e",
      weight: "700",
      align: "center",
    });
    text(ctx, label.toUpperCase(), cx, box.y + 252, { size: 11, align: "center" });
  });
  text(ctx, `${race.shifts.length} shifts`, centre, box.y + 280, { size: 14, align: "center", weight: "500" });

  drawMenuList(ctx, menu.items, menuListBox("results"), { centred: true });
  ctx.restore();
}
