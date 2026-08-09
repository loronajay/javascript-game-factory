// The car stereo, drawn.
//
// Canvas only. Every string, every lit segment and every highlighted row
// arrives already decided by `ui/radio-panel.js`; nothing here reads radio
// state, compares a cursor to an index, or knows what a key does.
//
// Two surfaces, one visual language:
//
//   drawRadioScreen — the full head unit on its own screen: display, transport
//     row, volume, repeat lamp, folder slot, and the playlist.
//   drawNowPlaying — the compact panel that appears over the road for a few
//     seconds after you touch the stereo mid-race, then fades. It is an
//     interruption rather than furniture, which is why it is not on the dash
//     proper: the instrument cluster is full, and a permanent strip there would
//     be competing with the shift light for the same glance.
//
// The display is drawn as a lit amber VFD on near-black, matching the dashboard
// gauges rather than the menu chrome — it is meant to read as another instrument
// in the same car, not as another panel in the same menu.

import { WORLD } from "./scene.js";
import { drawMenuBackdrop, menuPanel } from "./menus.js";
import { RADIO_LAYOUT, buttonRect, marqueeOffset, rowRect } from "../ui/radio-panel.js";

/**
 * The backdrop behind the head unit: a night cockpit, its own stereo lit up,
 * with the strip through the windscreen.
 *
 * The screen's furniture is a car stereo, so this is the one backdrop in the
 * cabinet that is *about* the screen it sits behind rather than being scenery.
 * It is authored as a backdrop — already night, its subject down the left and
 * bottom — so it takes almost no hold-back, unlike the menu splash which this
 * screen used to borrow and had to hold at 0.20 to stop it fighting the type.
 */
export const RADIO_SPLASH = "assets/radio-splash.png";

const INK = "#e8e9ee";
const TEXT = "#dfe6ee";
const DIM = "#8b95a2";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";

/** Display glass. Amber-on-black, like the gear bezel two panels over. */
const LCD_BACK = "#0a0805";
const LCD_ON = "#ffb020";
const LCD_DIM = "#8a5f18";
const LCD_GREEN = "#4ade6a";

const SANS = '"Segoe UI", system-ui, sans-serif';
const MONO = '"Consolas", "SF Mono", monospace';

function text(ctx, value, x, y, { size = 15, colour = DIM, weight = "600", align = "left", mono = false } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

/** Trims to fit, with an ellipsis, for the surfaces too small to scroll. */
export function ellipsize(ctx, value, maxWidth) {
  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

/** The recessed glass a display sits behind. */
function lcdWell(ctx, box, { radius = 8 } = {}) {
  ctx.fillStyle = LCD_BACK;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, radius);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,176,32,0.20)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // A faint top-down sheen, so the glass reads as glass rather than as a hole.
  const sheen = ctx.createLinearGradient(0, box.y, 0, box.y + box.height);
  sheen.addColorStop(0, "rgba(255,255,255,0.06)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, radius);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// The display
// ---------------------------------------------------------------------------

/** The message the display shows when there is no music to talk about. */
function drawEmptyDisplay(ctx, view, box) {
  const cx = box.x + box.width / 2;
  const { headline, detail, prompt } = view.lines;
  text(ctx, headline, cx, box.y + 56, { size: 26, colour: LCD_ON, weight: "700", align: "center" });
  if (detail) {
    text(ctx, detail, cx, box.y + 84, { size: 14, colour: LCD_DIM, align: "center" });
  }
  if (prompt) {
    text(ctx, prompt.toUpperCase(), cx, box.y + 114, { size: 14, colour: LCD_GREEN, align: "center" });
  }
}

/**
 * The now-playing readout. The title scrolls only when it does not fit — the
 * overflow is measured here and handed back to the pure timing curve, so the
 * rule stays testable and only the measurement lives on the canvas.
 */
function drawTrackDisplay(ctx, view, box) {
  const pad = 22;
  const inner = box.width - pad * 2;
  const { track, clock } = view;

  text(ctx, `TRACK ${String(view.track.position).padStart(2, "0")} / ${String(view.total).padStart(2, "0")}`,
    box.x + pad, box.y + 30, { size: 13, colour: LCD_DIM, mono: true });
  text(ctx, track.extension, box.x + box.width - pad, box.y + 30, {
    size: 13,
    colour: LCD_DIM,
    align: "right",
    mono: true,
  });

  // Title, clipped to the glass and scrolled if it overruns it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x + pad, box.y + 40, inner, 46);
  ctx.clip();
  ctx.font = `700 32px ${SANS}`;
  const overflow = Math.max(0, ctx.measureText(track.title).width - inner);
  text(ctx, track.title, box.x + pad + marqueeOffset(view.marqueePhase, overflow), box.y + 76, {
    size: 32,
    colour: LCD_ON,
    weight: "700",
  });
  ctx.restore();

  const subtitle = track.artist ?? track.folder ?? "";
  if (subtitle) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x + pad, box.y + 86, inner, 24);
    ctx.clip();
    text(ctx, subtitle, box.x + pad, box.y + 104, { size: 15, colour: LCD_DIM });
    ctx.restore();
  }

  text(ctx, `${clock.elapsed} / ${clock.duration}`, box.x + pad, box.y + box.height - 12, {
    size: 16,
    colour: LCD_ON,
    mono: true,
  });
  text(ctx, view.playing ? "▶ PLAYING" : "▮▮ PAUSED", box.x + box.width - pad, box.y + box.height - 12, {
    size: 14,
    colour: view.playing ? LCD_GREEN : LCD_DIM,
    align: "right",
  });
}

function drawProgress(ctx, view) {
  const bar = RADIO_LAYOUT.progress;
  ctx.fillStyle = "#1d232b";
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.width, bar.height, bar.height / 2);
  ctx.fill();
  if (view.clock.progress <= 0) {
    return;
  }
  ctx.fillStyle = LCD_ON;
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, Math.max(bar.height, bar.width * view.clock.progress), bar.height, bar.height / 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * The five buttons, each captioned with the key that works it. The keys are the
 * whole point of the caption: they are live on every screen, and this faceplate
 * is the only place the game tells the player that `]` skips a track.
 */
function drawTransport(ctx, view) {
  view.buttons.forEach((button, index) => {
    const rect = buttonRect(index);
    const off = button.enabled === false;
    const hot = view.hover?.kind === "button" && view.hover.id === button.id;

    ctx.fillStyle = hot ? "rgba(96,30,14,0.98)" : button.active && !off ? "rgba(74,22,10,0.95)" : "rgba(16,20,26,0.95)";
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 7);
    ctx.fill();
    ctx.strokeStyle = off ? "rgba(150,158,178,0.16)" : hot || button.active ? ACCENT : "rgba(150,158,178,0.34)";
    ctx.lineWidth = hot || button.active ? 2 : 1;
    ctx.stroke();

    const cx = rect.x + rect.width / 2;
    text(ctx, button.label, cx, rect.y + 19, {
      size: 14,
      colour: off ? MUTED : button.active ? INK : TEXT,
      weight: "700",
      align: "center",
    });
    // The key cap needs its descender clear of the button's bottom edge — `[`
    // and `;` both hang below their baseline.
    text(ctx, button.key, cx, rect.y + 34, {
      size: 12,
      colour: off ? MUTED : hot ? INK : LCD_DIM,
      align: "center",
      weight: "700",
      mono: true,
    });
  });
}

function drawVolume(ctx, view) {
  const box = RADIO_LAYOUT.volume;
  const hot = view.hover?.kind === "volume";
  text(ctx, "VOLUME", box.x, box.y + 12, { size: 11, colour: MUTED });
  text(ctx, `${view.volumePercent}%`, box.x + box.width, box.y + 12, {
    size: 11,
    colour: hot ? INK : DIM,
    align: "right",
    mono: true,
  });

  const gap = 4;
  const width = (box.width - gap * (view.volumeSegments.length - 1)) / view.volumeSegments.length;
  view.volumeSegments.forEach((lit, index) => {
    ctx.fillStyle = lit ? LCD_ON : hot ? "#2b333d" : "#1d232b";
    ctx.beginPath();
    ctx.roundRect(box.x + index * (width + gap), box.y + 20, width, 18, 3);
    ctx.fill();
  });
  text(ctx, "click / drag  ·  - =", box.x + box.width, box.y + 52, {
    size: 11,
    colour: hot ? LCD_DIM : MUTED,
    align: "right",
  });
}

function drawLoopLamp(ctx, view) {
  const box = RADIO_LAYOUT.loop;
  ctx.fillStyle = "rgba(16,20,26,0.95)";
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, 7);
  ctx.fill();
  ctx.strokeStyle = view.repeatingOne ? LCD_ON : "rgba(150,158,178,0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  text(ctx, "REPEAT", box.x + 14, box.y + 20, { size: 11, colour: MUTED });
  text(ctx, view.loopLabel, box.x + box.width - 14, box.y + 32, {
    size: 18,
    colour: view.looping ? LCD_ON : MUTED,
    weight: "700",
    align: "right",
    mono: true,
  });
}

function drawFolderSlot(ctx, view) {
  const box = RADIO_LAYOUT.folder;
  const hot = view.hover?.kind === "folder";
  ctx.fillStyle = hot ? "rgba(28,22,16,0.98)" : "rgba(10,13,18,0.95)";
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, 7);
  ctx.fill();
  ctx.strokeStyle = hot ? ACCENT : "rgba(150,158,178,0.24)";
  ctx.lineWidth = hot ? 2 : 1;
  ctx.stroke();

  text(ctx, "SOURCE FOLDER", box.x + 14, box.y + 22, { size: 11, colour: MUTED });
  ctx.font = `600 16px ${SANS}`;
  text(ctx, ellipsize(ctx, view.folderLine, box.width - 28), box.x + 14, box.y + 46, {
    size: 16,
    colour: hot ? INK : TEXT,
  });
  text(ctx, `${view.total} TRACKS`, box.x + 14, box.y + 66, { size: 12, colour: DIM, mono: true });
  text(ctx, "click  ·  F", box.x + box.width - 14, box.y + 66, {
    size: 12,
    colour: hot ? INK : LCD_DIM,
    align: "right",
  });
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

function drawPlaylist(ctx, view) {
  const box = RADIO_LAYOUT.list;
  menuPanel(ctx, box.x, box.y, box.width, box.height);

  text(ctx, "PLAYLIST", box.x + box.padding, box.y + 24, { size: 13, colour: DIM });
  if (view.list.scrollable) {
    text(
      ctx,
      `${view.list.first + 1}–${view.list.first + view.list.rows.length} OF ${view.list.total}`,
      box.x + box.width - box.padding,
      box.y + 24,
      { size: 12, colour: MUTED, align: "right", mono: true },
    );
  }

  if (view.list.rows.length === 0) {
    text(ctx, "—", box.x + box.width / 2, box.y + box.height / 2, { size: 20, colour: MUTED, align: "center" });
    return;
  }

  for (const row of view.list.rows) {
    const rect = rowRect(row.offset);
    const hot = view.hover?.kind === "row" && view.hover.index === row.index;

    if (row.highlighted || hot) {
      ctx.fillStyle = hot ? "rgba(96,30,14,0.9)" : "rgba(74,22,10,0.85)";
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 5);
      ctx.fill();
      ctx.strokeStyle = hot ? ACCENT : "rgba(255,90,46,0.75)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const baseline = rect.y + rect.height / 2 + 5;
    // The playing row keeps its marker whether or not the cursor is on it, so
    // browsing a long folder never loses track of what is actually in the deck.
    if (row.current) {
      text(ctx, view.playing ? "▶" : "▮▮", rect.x + 10, baseline, { size: 12, colour: LCD_ON });
    }
    text(ctx, row.number, rect.x + 34, baseline, { size: 13, colour: MUTED, mono: true });

    const colour = row.current ? LCD_ON : row.highlighted || hot ? INK : TEXT;
    ctx.font = `600 15px ${SANS}`;
    const titleWidth = rect.width - 240;
    text(ctx, ellipsize(ctx, row.title, titleWidth), rect.x + 70, baseline, { size: 15, colour });

    const meta = row.artist ?? row.folder;
    if (meta) {
      ctx.font = `500 13px ${SANS}`;
      text(ctx, ellipsize(ctx, meta, 150), rect.x + rect.width - 12, baseline, {
        size: 13,
        colour: MUTED,
        align: "right",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function drawRadioScreen(ctx, view, { splashImage } = {}) {
  // Near full strength, because this backdrop is authored as one. The scrim is
  // still a shade heavier than the title screen's: the faceplate covers the
  // middle, but the hint lines top and bottom sit straight on the picture.
  drawMenuBackdrop(ctx, splashImage, { alpha: 1, scrim: 0.56 });

  const centre = WORLD.width / 2;
  text(ctx, "SPEED DEMON RADIO", centre, 58, { size: 30, colour: INK, weight: "800", align: "center" });
  text(ctx, "click anything  ·  ESC to go back", centre, 78, { size: 12, colour: MUTED, align: "center" });

  const face = RADIO_LAYOUT.face;
  menuPanel(ctx, face.x, face.y, face.width, face.height);

  const display = RADIO_LAYOUT.display;
  lcdWell(ctx, display);
  if (view.hasTracks) {
    drawTrackDisplay(ctx, view, display);
  } else {
    drawEmptyDisplay(ctx, view, display);
  }

  drawProgress(ctx, view);
  drawTransport(ctx, view);
  drawVolume(ctx, view);
  drawLoopLamp(ctx, view);
  drawFolderSlot(ctx, view);
  drawPlaylist(ctx, view);

  // Spelled out rather than left to the button captions, because these keys work
  // on every screen — including mid-race, where this faceplate is not on show.
  const hint = view.hasTracks
    ? "B prev   P play/pause   N next   0 restart   L repeat   - = volume   F folder   —   these work during a race too"
    : "click the display, or press ENTER, to choose a folder";
  text(ctx, hint, centre, RADIO_LAYOUT.hint.y, { size: 13, colour: DIM, align: "center" });
  if (view.hasTracks) {
    text(ctx, "↑ ↓ browse   ← → jump ten   ENTER or click a row to play it", centre, RADIO_LAYOUT.hint.y - 20, {
      size: 13,
      colour: MUTED,
      align: "center",
    });
  }
}

// ---------------------------------------------------------------------------
// In-race
// ---------------------------------------------------------------------------

/**
 * The compact panel over the road. `alpha` comes from `stripAlpha`, so how long
 * it stays up is a rule in the pure layer rather than a number buried in here.
 */
export function drawNowPlaying(ctx, view, alpha) {
  if (alpha <= 0) {
    return;
  }
  const box = RADIO_LAYOUT.strip;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(8, 11, 16, 0.86)";
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,176,32,0.42)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const pad = 14;
  if (!view.hasTracks) {
    text(ctx, "RADIO", box.x + pad, box.y + 26, { size: 11, colour: MUTED });
    text(ctx, view.lines.headline, box.x + pad, box.y + 48, { size: 16, colour: LCD_DIM, weight: "600" });
    ctx.restore();
    return;
  }

  text(ctx, view.playing ? "▶ RADIO" : "▮▮ RADIO", box.x + pad, box.y + 24, {
    size: 11,
    colour: view.playing ? LCD_GREEN : LCD_DIM,
  });
  text(ctx, `${view.loopLabel}   ${view.volumePercent}%`, box.x + box.width - pad, box.y + 24, {
    size: 11,
    colour: MUTED,
    align: "right",
    mono: true,
  });

  ctx.font = `700 18px ${SANS}`;
  text(ctx, ellipsize(ctx, view.track.title, box.width - pad * 2), box.x + pad, box.y + 48, {
    size: 18,
    colour: LCD_ON,
    weight: "700",
  });

  // A hairline progress rule along the foot, so the strip says how far through
  // the track it is without spending a row on another clock.
  ctx.fillStyle = "rgba(255,176,32,0.22)";
  ctx.fillRect(box.x + pad, box.y + box.height - 12, box.width - pad * 2, 2);
  ctx.fillStyle = LCD_ON;
  ctx.fillRect(box.x + pad, box.y + box.height - 12, (box.width - pad * 2) * view.clock.progress, 2);
  ctx.restore();
}
