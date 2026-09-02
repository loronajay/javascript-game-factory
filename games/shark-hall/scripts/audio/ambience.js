// The room.
//
// A single looping bed of hall tone under everything — the third adapter in the
// audio layer, and the reason there are three rather than two.
//
// WHY NOT THE ENGINE. `hall-ambience.mp3` is four hundred kilobytes of
// continuous tone. Decoding it into an AudioBuffer the way `audio-engine.js`
// decodes the clack would hold tens of megabytes of PCM for a sound that starts
// once, never overlaps and never has to land on a frame boundary. Streaming is
// what an element is for.
//
// WHY NOT THE MUSIC PLAYER. Because it is not a track. It never advances, it
// never ends, it sits far below the music, and it should keep running across
// menu, rack and result while the soundtrack does its own thing. Folding it into
// the playlist would put the room in the shuffle.
//
// It obeys the same rules as its two siblings: lazy — nothing is created or
// fetched until a gesture; and it never throws — a missing file, a codec the
// browser refuses, or a rejected autoplay all end the same way, quietly.

/** The bed, and how far under everything else it sits. */
const AMBIENCE_PATH = "assets/sounds/sfx/hall-ambience.mp3";

/**
 * Deliberately very low. Room tone is felt rather than heard; at any level where
 * you can pick it out of the mix it has stopped being a room and become a noise.
 */
export const AMBIENCE_GAIN = 0.18;

/** Seconds to fade in on start, so the room arrives rather than switching on. */
const FADE_SECONDS = 1.6;
const FADE_TICK_MS = 60;

export function createAmbience({ muted = false } = {}) {
  /** @type {HTMLAudioElement | null} */
  let element = null;
  let isMuted = Boolean(muted);
  let unavailable = false;
  let wanted = false;
  let fadeTimer = null;

  function ensureElement() {
    if (element || unavailable) return element;
    const Ctor = globalThis.Audio;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    try {
      element = new Ctor();
      element.loop = true;
      element.preload = "none";
      element.volume = 0;
      element.src = AMBIENCE_PATH;
    } catch {
      unavailable = true;
      element = null;
    }
    return element;
  }

  /**
   * Ramp the element's volume by hand.
   *
   * An <audio> element has no gain node to schedule against, so the fade is a
   * timer. Crude, and completely adequate for a bed that changes level twice in
   * a session.
   */
  function fadeTo(target, seconds = FADE_SECONDS) {
    if (!element) return;
    if (fadeTimer !== null) clearInterval(fadeTimer);
    const from = element.volume;
    const steps = Math.max(1, Math.round((seconds * 1000) / FADE_TICK_MS));
    let step = 0;
    fadeTimer = setInterval(() => {
      step++;
      if (!element) return stopFade();
      const t = Math.min(1, step / steps);
      element.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t >= 1) {
        stopFade();
        if (target === 0) element.pause?.();
      }
    }, FADE_TICK_MS);
  }

  function stopFade() {
    if (fadeTimer !== null) clearInterval(fadeTimer);
    fadeTimer = null;
  }

  return {
    /**
     * Open the room. Safe to call on every gesture.
     *
     * Later calls are how the bed recovers after a browser refused it or a phone
     * suspended the tab, which is why this is wired to the same gesture as the
     * engine's unlock rather than run once at boot.
     */
    start() {
      if (isMuted) return;
      const node = ensureElement();
      if (!node) return;
      wanted = true;
      node.play?.().catch(() => {
        /* Autoplay refused, or unplayable. The next gesture retries. */
      });
      fadeTo(AMBIENCE_GAIN);
    },

    /** Mute pauses rather than stops, so unmuting does not restart the loop. */
    setMuted(next) {
      isMuted = Boolean(next);
      if (!element) return;
      if (isMuted) {
        stopFade();
        element.volume = 0;
        element.pause?.();
      } else if (wanted) {
        element.play?.().catch(() => {});
        fadeTo(AMBIENCE_GAIN, 0.4);
      }
    },

    /** Whether the room is meant to be running. */
    isOpen: () => wanted && !isMuted,
  };
}
