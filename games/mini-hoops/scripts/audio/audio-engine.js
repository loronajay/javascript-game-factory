// The only file in the cabinet that touches the Web Audio API.
//
// Same role `store/local-storage.js` plays for persistence: one adapter, so the
// rest of the cabinet talks about sounds rather than about buffers, gain nodes
// and autoplay policy. `tests/modules.test.js` enforces that.
//
// Four decisions shape it:
//
// IT IS LAZY, AND IT NEVER THROWS. No AudioContext exists until the player's
// first gesture, because browsers refuse to start one before that and a context
// created at load is a context stuck suspended. If the API is missing, a fetch
// 404s, or a decode fails, every call becomes a no-op — a broken sound file must
// never take the game down with it.
//
// IT IS NON-BLOCKING, like `assets/loader.js`. Nothing waits on audio. A sound
// asked for before its buffer has decoded is played the moment it arrives, and
// the game has already carried on.
//
// IT CATCHES UP. A sound flagged `catchUp` that had to wait for its decode is
// started that much further INTO the file rather than late, so the countdown
// stays welded to the clock even on the first run of a cold cache. Only the
// countdown wants this; skipping into a 40ms bounce transient would eat it.
//
// IT MIXES BY ROW. Every level and every trim comes from `sound-catalog.js`.
// This file knows how to play a sound, never which sound to play or how loud it
// should sit against the others.

import { soundById, soundIds, soundPath } from "./sound-catalog.js";

/** Gain ramp on a deliberate stop. Long enough to avoid a click, short enough to feel immediate. */
const STOP_FADE_SECONDS = 0.03;

export function createAudioEngine({ muted = false } = {}) {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  /** Decoded buffers by sound id. A null entry is a permanent failure, never retried. */
  const buffers = new Map();
  /** In-flight decodes by sound id, so two early plays share one fetch. */
  const pending = new Map();
  /** Live voices, so the cabinet can silence itself on demand. */
  const voices = new Set();
  /** Last start time per sound id, for the per-row throttle. */
  const lastPlayed = new Map();

  let isMuted = Boolean(muted);
  let unavailable = false;

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  /**
   * Bring the context up, creating it on first call.
   *
   * Must be called from inside a user gesture the first time, or the context is
   * born suspended. Safe to call on every gesture after that — resuming a
   * running context is free, and it is what recovers audio after a phone has
   * suspended the tab.
   */
  function unlock() {
    if (unavailable) return false;
    if (!ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) {
        unavailable = true;
        return false;
      }
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : 1;
        master.connect(ctx.destination);
      } catch {
        unavailable = true;
        return false;
      }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return true;
  }

  /** Fetch and decode a sound, once. Resolves to a buffer or null. */
  function load(id) {
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (pending.has(id)) return pending.get(id);
    if (!ctx) return Promise.resolve(null);

    const path = soundPath(id);
    if (!path) {
      buffers.set(id, null);
      return Promise.resolve(null);
    }

    const work = fetch(path)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${path}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        buffers.set(id, buffer);
        return buffer;
      })
      .catch(() => {
        // Remembered as a permanent failure, so a missing file costs one request
        // rather than one per bounce.
        buffers.set(id, null);
        return null;
      })
      .finally(() => pending.delete(id));

    pending.set(id, work);
    return work;
  }

  // ---------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------

  /**
   * Play a sound.
   *
   * @param id             a row in `sound-catalog.js`
   * @param gain           multiplier on the row's baseline level
   * @param rate           playback rate; it shifts pitch too, which is the point
   * @param offset         extra seconds into the file, on top of the row's trim
   * @param catchUp        if the buffer had to decode first, start that much
   *                       further in rather than that much late
   * @param ignoreThrottle bypass the row's `minInterval`
   * @returns a handle with `stop()`. Never null, even when nothing sounds.
   */
  function play(id, { gain = 1, rate = 1, offset = 0, catchUp = false, ignoreThrottle = false } = {}) {
    const row = soundById(id);
    if (!row || unavailable || !ctx || isMuted) return silentHandle();

    const now = ctx.currentTime;
    if (!ignoreThrottle && row.minInterval > 0 && now - (lastPlayed.get(id) ?? -Infinity) < row.minInterval) {
      return silentHandle();
    }
    lastPlayed.set(id, now);

    const handle = { row, source: null, gainNode: null, cancelled: false, stop: () => {} };
    handle.stop = () => stopVoice(handle);
    const requestedAt = now;

    const start = (buffer) => {
      if (!buffer || handle.cancelled || !ctx || isMuted) return;

      const lateness = catchUp ? Math.max(0, ctx.currentTime - requestedAt) : 0;
      const from = Math.max(0, row.offset + offset + lateness);
      if (from >= buffer.duration) return;

      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.playbackRate.value = rate;

      const level = ctx.createGain();
      level.gain.value = Math.max(0, row.gain * gain);

      node.connect(level);
      level.connect(master);
      node.addEventListener("ended", () => {
        voices.delete(handle);
        try {
          node.disconnect();
          level.disconnect();
        } catch {
          /* already torn down */
        }
      });

      handle.source = node;
      handle.gainNode = level;
      voices.add(handle);
      node.start(0, from);
    };

    const ready = buffers.get(id);
    if (ready !== undefined) start(ready);
    else load(id).then(start);

    return handle;
  }

  /** Fade a voice out and stop it. Safe twice, and safe on a voice that never started. */
  function stopVoice(handle) {
    handle.cancelled = true;
    const { source, gainNode } = handle;
    voices.delete(handle);
    if (!source || !gainNode || !ctx) return;
    try {
      const end = ctx.currentTime + STOP_FADE_SECONDS;
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.setValueAtTime(gainNode.gain.value, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, end);
      source.stop(end);
    } catch {
      /* already stopped */
    }
  }

  /** A handle for a sound that did not play, so callers never have to null-check. */
  function silentHandle() {
    return { stop() {}, cancelled: true, source: null, gainNode: null };
  }

  return {
    unlock,
    play,

    /**
     * Start fetching everything.
     *
     * Called once the context exists — which is to say from the first gesture —
     * so the first bounce of the first run is not also the first request.
     */
    warm() {
      if (!ctx || unavailable) return;
      for (const id of soundIds()) load(id);
    },

    /**
     * Silence the court.
     *
     * Interface sounds are deliberately spared: every caller of this is reached
     * by pressing a button, and cutting that button's own click is the sound of
     * a bug even when the silence itself is correct.
     */
    stopAll() {
      for (const handle of [...voices]) {
        if (!handle.row?.ui) stopVoice(handle);
      }
    },

    isMuted() {
      return isMuted;
    },

    /**
     * Mute cuts the master AND silences what is already sounding — a mute that
     * let a five-second crowd cheer play itself out is not a mute.
     */
    setMuted(next) {
      isMuted = Boolean(next);
      // Mute is the exception: it silences the click too, because a mute that
      // still made a noise when you pressed it would be telling you it failed.
      if (isMuted) stopEverything();
      if (master && ctx) master.gain.setTargetAtTime(isMuted ? 0 : 1, ctx.currentTime, 0.01);
    },
  };

  function stopEverything() {
    for (const handle of [...voices]) stopVoice(handle);
  }
}
