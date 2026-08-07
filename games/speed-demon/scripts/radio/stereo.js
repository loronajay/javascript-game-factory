// The deck: one <audio> element, driven by whatever `playlist.js` says.
//
// This is the impure half of the radio, and it is deliberately dumb. It holds
// no opinion about what should play next — it is handed a desired state every
// frame and makes the element match it. All of the *rules* (wrapping, repeat
// modes, what a finished track does) live in the pure reducer, so the two can
// never disagree about which track is loaded.
//
// `AudioClass` is injectable for exactly the reason `audio.js` injects it: the
// apply-a-state-to-an-element logic is where the fiddly bugs live (double
// `play()` calls, seeking an element that has no metadata yet, a stale source
// outliving the track that owned it) and none of that needs a browser to test.

/**
 * Browsers reject `play()` until the page has had a trusted interaction, and
 * reject it again if the element is torn down mid-promise. Neither is an error
 * worth surfacing: the next keypress re-applies the same state.
 */
function swallow(result) {
  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
}

export function createStereo({ AudioClass = globalThis.Audio, onEnded = () => {}, onFailed = () => {} } = {}) {
  if (typeof AudioClass !== "function") {
    return {
      apply() {},
      playback: () => ({ elapsed: 0, duration: 0, ready: false }),
      destroy() {},
    };
  }

  const element = new AudioClass();
  element.preload = "auto";
  element.volume = 0;
  // The loop mode is honoured by the reducer, never by the element: letting the
  // element loop would suppress the `ended` event, and then repeat-one would be
  // a state the pure layer could not see.
  element.loop = false;

  let src = null;
  let seekToken = null;
  let volume = null;
  // `apply` runs every tick, and until the page has had its first trusted
  // interaction every `play()` is rejected. Without a backoff that is sixty
  // rejected promises a second; with it, the first attempt is still immediate
  // and the retries settle to twice a second until the browser relents.
  let playCooldown = 0;
  const PLAY_RETRY_TICKS = 30;

  const handleEnded = () => onEnded();
  const handleError = () => {
    if (src !== null) {
      onFailed();
    }
  };
  element.addEventListener?.("ended", handleEnded);
  element.addEventListener?.("error", handleError);

  /** Seeking an element with no metadata yet throws in some browsers. */
  function rewind() {
    try {
      element.currentTime = 0;
    } catch {
      // The element will start at zero on its own once it can.
    }
  }

  return {
    /**
     * Makes the element match the requested state. Safe to call every frame —
     * every branch below is a no-op when nothing has changed, which is what
     * keeps this out of the way of the fixed-timestep loop.
     *
     * `src` being null is normal, not an error: the object URL for a track is
     * fetched asynchronously, so there is a gap between the reducer selecting a
     * track and there being anything to play.
     */
    apply({ src: nextSrc = null, playing = false, volume: nextVolume = 0, seekToken: nextSeek = 0 } = {}) {
      if (nextSrc !== src) {
        src = nextSrc;
        if (src === null) {
          element.pause();
          element.removeAttribute?.("src");
        } else {
          element.src = src;
        }
        // A freshly loaded source already starts at zero, so the pending seek is
        // considered served — otherwise every track change would seek twice.
        seekToken = nextSeek;
        playCooldown = 0; // a deliberate track change waits for no backoff
      } else if (nextSeek !== seekToken) {
        seekToken = nextSeek;
        playCooldown = 0;
        rewind();
      }

      if (nextVolume !== volume) {
        volume = nextVolume;
        element.volume = Math.max(0, Math.min(1, nextVolume));
      }

      if (src === null) {
        return;
      }
      if (playing && element.paused) {
        if (playCooldown > 0) {
          playCooldown -= 1;
        } else {
          playCooldown = PLAY_RETRY_TICKS;
          swallow(element.play());
        }
      } else if (!playing && !element.paused) {
        element.pause();
        playCooldown = 0;
      } else {
        playCooldown = 0;
      }
    },

    /**
     * What the element is actually doing, for the display. Read rather than
     * stored: the element owns the clock, and a copy of it in game state would
     * be one more thing that can drift.
     */
    playback() {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      return {
        elapsed: Number.isFinite(element.currentTime) ? element.currentTime : 0,
        duration,
        ready: duration > 0,
      };
    },

    destroy() {
      element.removeEventListener?.("ended", handleEnded);
      element.removeEventListener?.("error", handleError);
      element.pause();
    },
  };
}
