// What the game sounds like: the layer that knows a pocket event means a drop.
//
// The three adapters below it — `audio-engine.js`, `music-player.js`,
// `ambience.js` — know how to make a noise and nothing about pool. The sim above
// it emits contacts and knows nothing about noise. This file is the only place
// the two meet, and it is small on purpose.
//
// EVERY CONTACT IS SCALED BY ITS IMPACT SPEED. `physics.js` reports the closing
// speed of every collision, and that number drives both level and pitch here.
// It is the single thing that makes the table sound like a table rather than a
// sample player: a lag up the rail whispers, a break cracks, and nothing had to
// be authored twice to get there.
//
// A CUSHION IS A QUIET, DARK CLACK. There is one impact recording, and a rail is
// it played softer and pitched down. See the note in `sound-catalog.js` — this
// is where that decision is actually spent.
//
// IT NEVER DECIDES ANYTHING. Whether a foul happened is `rules.js`; this only
// knows that a foul makes the cancel sound.

import { createAmbience } from "./ambience.js";
import { createAudioEngine } from "./audio-engine.js";
import { createMusicPlayer } from "./music-player.js";
import { trackById } from "./music-catalog.js";
import { POCKET_SOUNDS } from "./sound-catalog.js";

/**
 * Impact speed at which a contact is at full level.
 *
 * Below a break, deliberately: most of the shots in a rack are medium-paced, and
 * anchoring the top of the curve at the hardest possible break would leave the
 * ordinary game sounding timid.
 */
const FULL_IMPACT_SPEED = 2.6;

/** Nothing quieter than this is worth a voice. Filters the settling-cluster mush. */
const AUDIBLE_IMPACT_SPEED = 0.09;

/**
 * Map an impact speed onto 0..1.
 *
 * The exponent is below 1 so quiet contacts are still clearly audible — loudness
 * is roughly logarithmic, and a linear map makes every soft shot inaudible and
 * every hard one identical.
 */
function impactLevel(speed) {
  return Math.min(1, Math.pow(Math.max(0, speed) / FULL_IMPACT_SPEED, 0.6));
}

/** A little pitch variation per hit, so repeats do not read as one sample. */
function jitter(spread, random) {
  return 1 + (random() - 0.5) * spread;
}

export function createGameAudio({
  muted = false,
  engine = createAudioEngine({ muted }),
  music = createMusicPlayer({ muted }),
  ambience = createAmbience({ muted }),
  random = Math.random,
} = {}) {
  let isMuted = Boolean(muted);
  /** Alternates the two pocket takes so consecutive pots differ. */
  let pocketTake = 0;

  return {
    /**
     * The first gesture. Brings the context up, starts the room and the music,
     * and begins pulling the effects down.
     *
     * Safe on every gesture after that, and wired that way: it is how audio
     * recovers when a browser refused the first attempt or a phone suspended the
     * tab. Cheap when there is nothing to do.
     */
    unlock() {
      if (!engine.unlock()) {
        // No Web Audio. The music and the room are elements and may still work,
        // so they are still started — a cabinet with no clack but a soundtrack
        // is better than a silent one.
        ambience.start();
        music.start();
        return;
      }
      engine.warm();
      ambience.start();
      music.start();
    },

    // --- the table --------------------------------------------------------

    /** The cue striking the ball. Level tracks the stroke, not the shot's outcome. */
    strike(power = 1) {
      engine.play("stick-hit", {
        gain: 0.35 + 0.65 * Math.min(1, Math.max(0, power)),
        rate: jitter(0.06, random),
      });
    },

    /** Ball on ball. */
    clack(speed) {
      if (speed < AUDIBLE_IMPACT_SPEED) return;
      const level = impactLevel(speed);
      engine.play("clack", {
        gain: 0.18 + 0.82 * level,
        // Harder hits ring a touch brighter, which is true of the real thing.
        rate: jitter(0.08, random) * (0.95 + level * 0.12),
      });
    },

    /** Ball on cushion, or on a pocket jaw. */
    rail(speed) {
      if (speed < AUDIBLE_IMPACT_SPEED * 1.6) return;
      const level = impactLevel(speed);
      engine.play("clack", {
        // Rubber absorbs. Quieter than a ball-on-ball hit of the same speed, and
        // pitched down, which is most of what a cushion does to a clack.
        gain: (0.1 + 0.55 * level) * 0.72,
        rate: jitter(0.07, random) * 0.78,
      });
    },

    /** A ball dropping. Alternates takes; a hanging ball drops silently soft. */
    pocket(speed = 0) {
      const id = POCKET_SOUNDS[pocketTake % POCKET_SOUNDS.length];
      pocketTake++;
      engine.play(id, {
        gain: 0.55 + 0.45 * impactLevel(speed),
        rate: jitter(0.05, random),
        ignoreThrottle: true,
      });
    },

    /** Route a physics event straight through. Keeps the caller's loop trivial. */
    handlePhysics(event) {
      if (!event) return;
      if (event.type === "ball") this.clack(event.speed);
      else if (event.type === "cushion") this.rail(event.speed);
      else if (event.type === "pocket") this.pocket(event.speed);
      else if (event.type === "strike") this.strike(event.power);
    },

    // --- the interface ----------------------------------------------------

    click() {
      engine.play("click");
    },

    /** The table saying no: a foul, a scratch, an illegal placement. */
    reject() {
      engine.play("cancel");
    },

    /**
     * Cut everything ringing on the table.
     *
     * Interface sounds are spared by the engine, because every caller of this is
     * reached by pressing a button and cutting that button's own click sounds
     * exactly like a bug.
     */
    silence() {
      engine.stopAll();
    },

    // --- mixing -----------------------------------------------------------

    isMuted: () => isMuted,

    setMuted(next) {
      isMuted = Boolean(next);
      engine.setMuted(isMuted);
      music.setMuted(isMuted);
      ambience.setMuted(isMuted);
    },

    /** The track playing, for anything that shows it. Null before the first gesture. */
    currentTrack: () => music.currentTrack(),

    /**
     * The same thing, as the name a player would recognise.
     *
     * The id is what the playlist deals in and the title is what a human reads,
     * and resolving between them is a catalog question — so it is answered here
     * rather than by handing the id up to the UI to look up itself.
     */
    currentTrackTitle: () => trackById(music.currentTrack())?.title ?? null,
  };
}
