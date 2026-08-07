// The head unit's geometry and everything it has to say.
//
// PURE. No canvas, no audio element, no folder — this takes a radio state, what
// the deck reports, and what the library knows, and returns a fully shaped view.
// `render/radio.js` draws exactly what it is given and decides nothing, the same
// split as `setup-menu.js` / `render/setup.js`.
//
// The one thing a pure module cannot do here is measure text, so the marquee is
// expressed as a *phase* (0..1) plus `marqueeOffset`, which converts that phase
// into pixels once the renderer knows how far the title actually overflows. The
// timing rule stays testable; only the measurement is left to the canvas.

import {
  LOOP_LABELS,
  LOOP_OFF,
  LOOP_ONE,
  nowPlaying,
  trackCount,
} from "../radio/playlist.js";
import {
  LIBRARY_ERROR,
  LIBRARY_LOCKED,
  LIBRARY_READY,
  LIBRARY_SCANNING,
} from "../radio/library-status.js";

/**
 * Where the head unit sits. Two surfaces: the full faceplate on its own screen,
 * and `strip` — the compact now-playing panel that appears over the road.
 */
export const RADIO_LAYOUT = {
  face: { x: 150, y: 92, width: 980, height: 268 },
  display: { x: 182, y: 124, width: 620, height: 132 },
  progress: { x: 182, y: 272, width: 620, height: 10 },
  buttons: { x: 182, y: 298, width: 620, height: 42, gap: 10 },
  volume: { x: 838, y: 124, width: 260, height: 56 },
  loop: { x: 838, y: 192, width: 260, height: 48 },
  folder: { x: 838, y: 252, width: 260, height: 88 },
  list: { x: 150, y: 392, width: 980, height: 272, header: 34, rowHeight: 30, padding: 12 },
  hint: { y: 700 },
  /** Over the road, clear of the christmas tree and the grade flash. */
  strip: { x: 24, y: 22, width: 380, height: 66 },
};

export const VOLUME_SEGMENTS = 10;

/** How many playlist rows the list box has room for. */
export function visibleRows(list = RADIO_LAYOUT.list) {
  return Math.max(1, Math.floor((list.height - list.header - list.padding) / list.rowHeight));
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * Which slice of a long playlist to show. The cursor is kept centred rather
 * than pinned to an edge, so moving through a folder of three hundred tracks
 * always shows where you are going as well as where you have been.
 */
export function listWindow(total, cursor, visible) {
  if (total <= visible) {
    return 0;
  }
  return clamp(cursor - Math.floor(visible / 2), 0, total - visible);
}

/** `M:SS`, or `H:MM:SS` for anything long enough to need it. */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const whole = Math.floor(seconds);
  const s = String(whole % 60).padStart(2, "0");
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** One full there-and-back scroll of an over-long title, in ticks. */
export const MARQUEE_TICKS = 60 * 9;

export function marqueePhase(tick) {
  const wrapped = (((tick % MARQUEE_TICKS) + MARQUEE_TICKS) % MARQUEE_TICKS);
  return wrapped / MARQUEE_TICKS;
}

/**
 * Phase to pixels. Dwells at both ends so the start and the end of the title are
 * both readable rather than sliding past — a title that never stops moving is a
 * title you have to wait for twice.
 */
export function marqueeOffset(phase, overflow) {
  if (overflow <= 0) {
    return 0;
  }
  const p = clamp(phase, 0, 1);
  if (p < 0.16) {
    return 0;
  }
  if (p < 0.46) {
    return -overflow * ((p - 0.16) / 0.3);
  }
  if (p < 0.62) {
    return -overflow;
  }
  if (p < 0.92) {
    return -overflow * (1 - (p - 0.62) / 0.3);
  }
  return 0;
}

/** How long the now-playing strip stays up after the last thing you did to it. */
export const STRIP_HOLD_SECONDS = 3.2;
export const STRIP_FADE_SECONDS = 0.9;

/**
 * The strip is an interruption, not furniture: it says what changed and then
 * gets out of the way of the road. Full strength while it matters, then a fade.
 */
export function stripAlpha(secondsSinceChange) {
  if (!Number.isFinite(secondsSinceChange) || secondsSinceChange < 0) {
    return 0;
  }
  if (secondsSinceChange <= STRIP_HOLD_SECONDS) {
    return 1;
  }
  const fading = (secondsSinceChange - STRIP_HOLD_SECONDS) / STRIP_FADE_SECONDS;
  return clamp(1 - fading, 0, 1);
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * The transport row. Each button carries the key that works it, on the button,
 * because these keys are otherwise undiscoverable — the faceplate is the only
 * place the player is told that `]` skips a track.
 */
function transportButtons(radio, hasTracks) {
  return [
    { id: "prev", label: "«  PREV", key: "B", active: false, enabled: hasTracks },
    {
      id: "play",
      label: radio.playing ? "▮▮  PAUSE" : "▶  PLAY",
      key: "P",
      active: radio.playing,
      enabled: hasTracks,
    },
    { id: "next", label: "NEXT  »", key: "N", active: false, enabled: hasTracks },
    { id: "restart", label: "↺  RESTART", key: "0", active: false, enabled: hasTracks },
    {
      id: "loop",
      label: LOOP_LABELS[radio.loop],
      key: "L",
      active: radio.loop !== LOOP_OFF,
      enabled: true,
    },
  ];
}

/** Width of one transport button, derived so five always fill the row exactly. */
export function buttonRect(index, box = RADIO_LAYOUT.buttons, count = 5) {
  const width = (box.width - box.gap * (count - 1)) / count;
  return { x: box.x + index * (width + box.gap), y: box.y, width, height: box.height };
}

/** Where a playlist row lands, given its position within the visible window. */
export function rowRect(offset, list = RADIO_LAYOUT.list) {
  return {
    x: list.x + list.padding,
    y: list.y + list.header + offset * list.rowHeight,
    width: list.width - list.padding * 2,
    height: list.rowHeight,
  };
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export const within = (box, x, y) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

/**
 * What is under the pointer, as a target the composition root can act on.
 *
 * Pure, and returns a *description* rather than doing anything: the same target
 * drives the hover highlight on one frame and the click on the next, so the
 * thing you can see is provably the thing you will hit.
 *
 * Kinds:
 *   `button`  — one of the five transport buttons, by id
 *   `row`     — a playlist row, by its index in the whole folder
 *   `volume`  — the volume bar, carrying the level that point represents
 *   `folder`  — the source-folder slot, or the display when there is nothing in it
 */
export function hitRadio(view, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const volume = RADIO_LAYOUT.volume;
  // Only the segment strip, not the labels above and below it.
  const bar = { x: volume.x, y: volume.y + 16, width: volume.width, height: 26 };
  if (within(bar, x, y)) {
    return { kind: "volume", value: clamp((x - bar.x) / bar.width, 0, 1) };
  }

  for (const [index, button] of view.buttons.entries()) {
    if (within(buttonRect(index), x, y)) {
      return button.enabled === false ? null : { kind: "button", id: button.id };
    }
  }

  if (within(RADIO_LAYOUT.folder, x, y)) {
    return { kind: "folder" };
  }
  // With no playlist the display itself is the way in, because that is where the
  // player is already looking when it says there is no folder set.
  if (!view.hasTracks && within(RADIO_LAYOUT.display, x, y)) {
    return { kind: "folder" };
  }

  for (const row of view.list.rows) {
    if (within(rowRect(row.offset), x, y)) {
      return { kind: "row", index: row.index };
    }
  }
  return null;
}

/** What the display should say when there is no music to talk about. */
function libraryLines(library) {
  const name = library.folderName ? library.folderName.toUpperCase() : null;
  switch (library.status) {
    case LIBRARY_SCANNING:
      return { headline: "READING FOLDER…", detail: name ?? "", prompt: null };
    case LIBRARY_LOCKED:
      return {
        headline: "FOLDER LOCKED",
        detail: name ?? "",
        prompt: "click here to reconnect it",
      };
    case LIBRARY_ERROR:
      return {
        headline: "FOLDER UNREADABLE",
        detail: library.message ?? "",
        prompt: "click here to choose another",
      };
    case LIBRARY_READY:
      return {
        headline: "NO AUDIO IN THIS FOLDER",
        detail: name ?? "",
        prompt: "click here to choose another",
      };
    default:
      return {
        headline: "NO FOLDER SET",
        detail: library.supported
          ? "point the stereo at a folder of music"
          : "this browser re-asks for the folder each visit",
        prompt: "click here to choose a folder",
      };
  }
}

/**
 * Everything both radio surfaces need, already shaped.
 *
 * `playback` is what the deck reports (`elapsed`, `duration`, `ready`) and is
 * deliberately not part of radio state — the element owns that clock, and a
 * second copy of it in game state could only drift.
 */
export function radioView(radio, playback, library, { tick = 0, pointer = null } = {}) {
  const total = trackCount(radio);
  const hasTracks = total > 0;
  const track = nowPlaying(radio);
  const visible = visibleRows();
  const first = listWindow(total, radio.cursor, visible);

  const duration = playback?.duration ?? 0;
  const elapsed = Math.min(playback?.elapsed ?? 0, duration || Infinity);

  const rows = [];
  for (let offset = 0; offset < Math.min(visible, total); offset += 1) {
    const index = first + offset;
    const entry = radio.tracks[index];
    rows.push({
      index,
      offset,
      number: String(index + 1).padStart(2, "0"),
      title: entry.title,
      artist: entry.artist,
      folder: entry.folder,
      current: index === radio.index,
      highlighted: index === radio.cursor,
    });
  }

  const view = {
    status: library.status,
    hasTracks,
    folderName: library.folderName,
    folderLine: library.folderName ? library.folderName : "—",
    supported: library.supported,
    lines: hasTracks ? null : libraryLines(library),

    track: track
      ? {
          title: track.title,
          artist: track.artist,
          extension: track.extension.toUpperCase(),
          folder: track.folder,
          position: radio.index + 1,
        }
      : null,
    total,
    playing: radio.playing,
    loop: radio.loop,
    loopLabel: LOOP_LABELS[radio.loop],
    looping: radio.loop !== LOOP_OFF,
    repeatingOne: radio.loop === LOOP_ONE,

    clock: {
      elapsed: formatClock(elapsed),
      duration: playback?.ready ? formatClock(duration) : "--:--",
      progress: duration > 0 ? clamp(elapsed / duration, 0, 1) : 0,
    },

    volume: radio.volume,
    volumePercent: Math.round(radio.volume * 100),
    volumeSegments: Array.from(
      { length: VOLUME_SEGMENTS },
      (_, i) => i < Math.round(radio.volume * VOLUME_SEGMENTS),
    ),

    buttons: transportButtons(radio, hasTracks),
    marqueePhase: marqueePhase(tick),

    list: { rows, first, visible, total, scrollable: total > visible },
  };

  // Resolved from the finished view, so the thing the renderer highlights is
  // provably the same thing a click on that pixel would hit.
  view.hover = pointer ? hitRadio(view, pointer.x, pointer.y) : null;
  return view;
}
