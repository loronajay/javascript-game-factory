// The stereo's transport: which track, playing or not, and what happens when
// one runs out.
//
// PURE. Every operation takes a radio state and returns a new one — nothing
// here touches an <audio> element, and nothing here knows how long a track is.
// `stereo.js` is the half that owns the element, and it works by *applying*
// whatever this says rather than by holding a second copy of it.
//
// The one thing a pure reducer cannot express is "seek back to zero", because
// that is an instruction rather than a value. It is carried as `seekToken`: a
// counter that goes up whenever playback should restart from the top, which the
// stereo compares against the last one it acted on. That is what makes RESTART,
// re-selecting the track already playing, and a repeat-one wrap all the same
// operation rather than three special cases in the impure layer.
//
// Manual SKIP wraps in both directions regardless of the loop mode, the way a
// car stereo does; the loop mode governs only what happens when a track ends on
// its own. Those are genuinely different questions and conflating them means
// the last track in a folder swallows a button press.

export const LOOP_OFF = "off";
export const LOOP_ALL = "all";
export const LOOP_ONE = "one";

/** Cycle order for the LOOP button. */
export const LOOP_MODES = [LOOP_OFF, LOOP_ALL, LOOP_ONE];

export const LOOP_LABELS = {
  [LOOP_OFF]: "RPT OFF",
  [LOOP_ALL]: "RPT ALL",
  [LOOP_ONE]: "RPT ONE",
};

export const DEFAULT_VOLUME = 0.55;
export const VOLUME_STEP = 0.05;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function createRadio({ tracks = [], loop = LOOP_ALL, volume = DEFAULT_VOLUME } = {}) {
  return {
    tracks,
    /** The track that is loaded in the deck. -1 when the folder is empty. */
    index: tracks.length > 0 ? 0 : -1,
    /** Where the browse cursor is on the radio screen — not what is playing. */
    cursor: 0,
    playing: false,
    loop: LOOP_MODES.includes(loop) ? loop : LOOP_ALL,
    volume: clamp01(volume),
    seekToken: 0,
  };
}

export function nowPlaying(radio) {
  return radio.tracks[radio.index] ?? null;
}

export function trackCount(radio) {
  return radio.tracks.length;
}

const wrap = (index, count) => ((index % count) + count) % count;

/** Loads a track and starts it from the top. Used by every deliberate move. */
function load(radio, index) {
  if (radio.tracks.length === 0) {
    return radio;
  }
  const next = wrap(index, radio.tracks.length);
  return { ...radio, index: next, cursor: next, playing: true, seekToken: radio.seekToken + 1 };
}

/**
 * A new folder. Loop mode and volume survive, because those are settings the
 * player made about the stereo rather than about the folder.
 */
export function setTracks(radio, tracks) {
  return {
    ...radio,
    tracks,
    index: tracks.length > 0 ? 0 : -1,
    cursor: 0,
    playing: tracks.length > 0,
    seekToken: radio.seekToken + 1,
  };
}

/** Silences the deck without moving it — where an unplayable folder ends up. */
export function stopPlayback(radio) {
  return radio.playing ? { ...radio, playing: false } : radio;
}

export function playPause(radio) {
  if (radio.tracks.length === 0) {
    return radio;
  }
  return { ...radio, playing: !radio.playing };
}

export function nextTrack(radio) {
  return load(radio, radio.index + 1);
}

export function previousTrack(radio) {
  return load(radio, radio.index - 1);
}

/** Same track, from the top. Also un-pauses: RESTART is a play instruction. */
export function restartTrack(radio) {
  return load(radio, radio.index);
}

/** Plays a specific row — the radio screen's ENTER. */
export function selectTrack(radio, index) {
  return load(radio, index);
}

export function playCursor(radio) {
  return selectTrack(radio, radio.cursor);
}

export function cycleLoop(radio) {
  const at = LOOP_MODES.indexOf(radio.loop);
  return { ...radio, loop: LOOP_MODES[(at + 1) % LOOP_MODES.length] };
}

export function setVolume(radio, volume) {
  return { ...radio, volume: clamp01(volume) };
}

export function adjustVolume(radio, delta) {
  // Snapped to the step, then to three decimals. Without both, repeated presses
  // land on values like 0.6000000000000001 — invisible on a display that rounds
  // to whole percent, but it is what gets written to storage and read back.
  const steps = Math.round((radio.volume + delta) / VOLUME_STEP);
  return setVolume(radio, Math.round(steps * VOLUME_STEP * 1000) / 1000);
}

/**
 * The browse cursor on the radio screen. Deliberately does not change what is
 * playing — moving selects, ENTER commits, the same separation the setup screen
 * makes. Nothing wraps: with a folder of a few hundred tracks, a cursor that
 * jumps from the bottom to the top is a cursor you have lost.
 */
export function moveCursor(radio, direction) {
  const count = radio.tracks.length;
  if (count === 0) {
    return radio;
  }
  const step = { up: -1, down: 1, left: -10, right: 10 }[direction];
  if (!step) {
    return radio;
  }
  return { ...radio, cursor: Math.max(0, Math.min(count - 1, radio.cursor + step)) };
}

/**
 * A track ran out on its own. This is the only place the loop mode is consulted:
 *
 *   ONE — the same track again, from the top.
 *   ALL — the next track, wrapping past the end of the folder.
 *   OFF — the next track, and a stop at the end of the folder.
 */
export function trackEnded(radio) {
  if (radio.tracks.length === 0) {
    return radio;
  }
  if (radio.loop === LOOP_ONE) {
    return { ...radio, playing: true, seekToken: radio.seekToken + 1 };
  }
  const last = radio.index >= radio.tracks.length - 1;
  if (last && radio.loop === LOOP_OFF) {
    return { ...radio, playing: false, seekToken: radio.seekToken + 1 };
  }
  return load(radio, radio.index + 1);
}

/**
 * A track the browser could not decode. Steps past it exactly as an ended track
 * would, but never repeats it — a repeat-one on an unplayable file would spin
 * on the same failure forever.
 */
export function trackFailed(radio) {
  if (radio.tracks.length <= 1) {
    return { ...radio, playing: false };
  }
  const last = radio.index >= radio.tracks.length - 1;
  if (last && radio.loop === LOOP_OFF) {
    return { ...radio, playing: false, seekToken: radio.seekToken + 1 };
  }
  return load(radio, radio.index + 1);
}
