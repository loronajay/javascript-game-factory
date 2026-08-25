// The only file in the cabinet that streams audio through an <audio> element.
//
// The second adapter in the audio layer, beside `audio-engine.js`, and the split
// is on purpose. The engine decodes short WAVs into memory so they can be fired
// at any instant with no latency; a five-minute MP3 put through the same path
// would be tens of megabytes of PCM held for a sound that is never triggered,
// never overlapped and never needs to start on a frame boundary. Streaming is
// what an element is good at, so music uses one.
//
// It obeys the same three rules as the engine:
//
// IT IS LAZY. Nothing is created and nothing is fetched until `start()` is called
// from inside a user gesture. Muted at boot means no element and no download at
// all, so a player who has silenced the cabinet is not made to pay for a
// soundtrack they will not hear.
//
// IT NEVER THROWS. A missing file, a codec the browser will not take, or an
// autoplay rejection all end the same way: quiet. `play()` returning a rejected
// promise is normal, not exceptional — it is what a browser does when it decides
// the gesture did not count — so it is caught and the next gesture simply tries
// again.
//
// IT KNOWS NOTHING ABOUT THE GAME. It is handed a playlist and asked to keep it
// running. Which track comes next is `playlist.js`; whether music should be
// playing at all is `game-audio.js`.

import { MUSIC_GAIN, trackIds, trackPath } from "./music-catalog.js";
import { createPlaylist } from "./playlist.js";

export function createMusicPlayer({ muted = false, playlist = createPlaylist({ ids: trackIds() }) } = {}) {
  /** @type {HTMLAudioElement | null} */
  let element = null;
  let isMuted = Boolean(muted);
  let unavailable = false;
  // Whether the player WANTS music. Separate from whether a track is actually
  // sounding, because a browser can refuse the first `play()` and we retry on
  // the next gesture rather than giving up.
  let wanted = false;

  function ensureElement() {
    if (element || unavailable) return element;
    const Ctor = globalThis.Audio;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    try {
      element = new Ctor();
      element.volume = MUSIC_GAIN;
      element.preload = "none";
      // One track at a time is loaded and one is queued by hand at its end, so
      // the element itself never loops — looping is the playlist's job, and the
      // element looping would strand the cabinet on whichever track came first.
      element.loop = false;
      element.addEventListener("ended", () => {
        playlist.advance();
        cue();
      });
      // A track that fails to load must not take the soundtrack down with it:
      // skip to the next one rather than sitting on a broken source forever.
      // Gated on a real `MediaError`, because swapping `src` at the end of a
      // track can raise an event for the load that was abandoned — and treating
      // that as a failure would skip a track every time one finished.
      element.addEventListener("error", () => {
        if (!wanted || !element.error) return;
        playlist.advance();
        cue();
      });
    } catch {
      unavailable = true;
      element = null;
    }
    return element;
  }

  /** Point the element at the current track and start it from the top. */
  function cue() {
    const node = ensureElement();
    const path = trackPath(playlist.current());
    if (!node || !path || !wanted || isMuted) return;
    node.src = path;
    resume();
  }

  /** Start, or pick back up, whatever is already cued. */
  function resume() {
    const node = element;
    if (!node || !wanted || isMuted || !node.src) return;
    node.play?.().catch(() => {
      /* Autoplay refused, or the source is unplayable. The next gesture retries. */
    });
  }

  return {
    /**
     * Begin the soundtrack. Safe to call on every gesture.
     *
     * The first call cues the first track of the shuffled order; later ones are
     * how playback recovers after a browser refused it or a phone suspended the
     * tab, which is why this is wired to the same gesture as the engine's unlock
     * rather than run once at boot.
     */
    start() {
      // The element is created here rather than at the first `cue()` so a
      // browser without an `Audio` constructor never sets `wanted` and never
      // claims to be playing a track it cannot play.
      if (isMuted || !ensureElement()) return;
      if (!wanted) {
        wanted = true;
        cue();
        return;
      }
      resume();
    },

    /**
     * Mute pauses rather than stops.
     *
     * Position is kept, so unmuting drops back into the same track where it left
     * off instead of restarting it — muting for a phone call should not cost the
     * player their place in the album.
     */
    setMuted(next) {
      isMuted = Boolean(next);
      if (isMuted) element?.pause?.();
      else resume();
    },

    /** The track currently cued, or null before the first gesture. */
    currentTrack: () => (wanted ? playlist.current() : null),
  };
}
