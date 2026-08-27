// What the game SOUNDS LIKE: the seam between things that happen and sounds
// that play.
//
// The engine below it knows how to play a buffer and nothing else; the catalog
// beside it knows which file and how loud. This file knows that a made basket
// swishes, that a third one in a row brings the crowd up, and that the countdown
// has to be started three seconds early to land its last beat on zero.
//
// It sits under `init-game.js` rather than inside it because these are decisions
// with reasons, and the composition root is meant to own ORDER, not rules. It
// sits above the sim rather than inside it because the sim is pure: `run.js`
// does not know a speaker exists, and a replayed run must not make noise.
//
// THE SOUNDTRACK IS NOT PART OF THE ROUND. It starts on the first gesture and
// then plays across menus, setup, the court, the pause card and the results, and
// only the mute switch stops it. That is a deliberate exception to `silence()`:
// pausing freezes the *court*, and a soundtrack that cut out every time a player
// opened the pause card and restarted its track on resume would be five songs
// chopped into fragments. Music is the room, not the game.
//
// THE COUNTDOWN IS THE ONLY THING HERE WITH STATE. Everything else is a fire and
// forget. The countdown sample is four beats a second apart, so it cannot be
// triggered at zero — it is armed when the clock reaches three, seeked to
// wherever in the file that moment actually falls, and torn down again the
// instant the clock stops for any reason. Pausing mid-countdown and resuming
// re-arms it at the right place, because the arm offset is computed from
// `remaining` every time rather than assumed to be zero.

import { ON_FIRE_STREAK } from "../sim/constants.js";
import { createAudioEngine } from "./audio-engine.js";
import { createMusicPlayer } from "./music-player.js";
import { COUNTDOWN_LEAD_SECONDS, ballAudio } from "./sound-catalog.js";

/**
 * A floor contact is reported once per physics substep, so a rolling ball
 * reports one every 8ms. What separates a bounce from a roll is that a bounce
 * leaves the floor: `collision.js` sets a positive `vy` for one and exactly zero
 * for the other. This is the floor of that, with margin for the gravity applied
 * in the substeps after the bounce inside the same tick.
 */
const BOUNCE_MIN_SPEED = 0.1;

/** Bounce speed that plays at full level. Anything faster is clamped, not louder. */
const BOUNCE_LOUD_SPEED = 2.2;

export function createGameAudio({
  muted = false,
  engine = createAudioEngine({ muted }),
  music = createMusicPlayer({ muted }),
} = {}) {
  /** The live countdown voice, or null. */
  let countdown = null;

  /**
   * How loud a body impact is, from how fast the ball left the floor.
   *
   * Scaled on the square root rather than linearly: loudness is closer to
   * logarithmic in energy, and a linear map makes every soft bounce inaudible
   * and every hard one identical.
   */
  function impactGain(speed) {
    const t = Math.min(1, Math.max(0, (speed - BOUNCE_MIN_SPEED) / (BOUNCE_LOUD_SPEED - BOUNCE_MIN_SPEED)));
    return 0.25 + 0.75 * Math.sqrt(t);
  }

  function cancelCountdown() {
    countdown?.stop();
    countdown = null;
  }

  return {
    /**
     * Called from every user gesture. The first one creates the context — which
     * browsers only allow from inside a gesture — and starts pulling the files
     * down; later ones recover a context a mobile browser has suspended.
     */
    unlock() {
      if (engine.unlock()) engine.warm();
      // Same gesture, same reason: a browser will not let either the context or
      // the element make a sound until the player has touched something.
      music.start();
    },

    isMuted: () => engine.isMuted(),

    setMuted(next) {
      if (next) cancelCountdown();
      engine.setMuted(next);
      music.setMuted(next);
    },

    /** The track playing, or null before the first gesture. Exposed for anything that shows it. */
    currentTrack: () => music.currentTrack(),

    /** Every button in the cabinet, wired in one place by the composition root. */
    click() {
      engine.play("click");
    },

    // -------------------------------------------------------------------
    // The round
    // -------------------------------------------------------------------

    /**
     * A run is beginning.
     *
     * The countdown is torn down because a stale one would beep against the new
     * clock. Nothing else is: this runs from inside the press of a button, so a
     * blanket `stopAll` here cuts off that button's own click, and the celebration
     * still ringing from the last run is a crowd that has not sat down yet rather
     * than a bug. The paths that genuinely need silence — pausing, and leaving
     * the court — call `silence()` and get it.
     */
    runStarted() {
      cancelCountdown();
      engine.play("start");
    },

    /**
     * Keep the countdown welded to the clock. Called every tick of a live run.
     *
     * @param remaining seconds left
     * @param running   whether the clock is actually counting
     */
    clock(remaining, running) {
      const wantsCountdown = running && remaining > 0 && remaining <= COUNTDOWN_LEAD_SECONDS;
      if (!wantsCountdown) {
        cancelCountdown();
        return;
      }
      if (countdown) return;
      // Seek to the point in the sample that corresponds to *now*. Armed on the
      // first tick under three seconds this is a few milliseconds; armed on a
      // resume it can be most of the file, and it still lands on the beat.
      countdown = engine.play("countdown", {
        offset: COUNTDOWN_LEAD_SECONDS - remaining,
        catchUp: true,
        ignoreThrottle: true,
      });
    },

    /**
     * The clock has run out.
     *
     * The countdown is torn down first on purpose: its own fourth beat falls
     * exactly here, and the buzzer is that beat. Two of them at once is mush.
     */
    buzzer() {
      cancelCountdown();
      engine.play("buzzer");
    },

    /** Pause, quit, or leaving the screen. Freeze means silence. */
    silence() {
      cancelCountdown();
      engine.stopAll();
    },

    // -------------------------------------------------------------------
    // The shot
    // -------------------------------------------------------------------

    /** The ball has left the hand. Only some balls have a sound for this. */
    released(ballId) {
      const release = ballAudio(ballId).release;
      if (release) engine.play(release);
    },

    /**
     * One physics contact.
     *
     * `speed` is the ball's vertical speed after the contact resolved, and is
     * only consulted for the floor — where it is the difference between a bounce
     * and the tail of a roll that reports a contact every substep forever.
     */
    contact(name, { ballId, speed = 0 } = {}) {
      const ball = ballAudio(ballId);
      if (name === "rim") {
        // A ball carrying its own rim recording plays it straight: the sample IS
        // that ball on that metal, so colouring it with the apparatus modifiers
        // meant for the shared one would be correcting a thing already correct.
        if (ball.rim) engine.play(ball.rim);
        else engine.play("rim", { gain: ball.apparatusGain, rate: ball.apparatusRate });
      } else if (name === "bin-rim") {
        // A bin lip is plastic where the classic rim is steel, and the whole of
        // that difference is carried here rather than in a new recording: the
        // same apparatus sample, quieter and pitched well down, is a knock
        // instead of a ring. A ball that brings its OWN rim sound — the bowling
        // ball does — is not given it here, because that recording is sixteen
        // pounds of resin on a steel hoop and this is a wastebasket.
        engine.play("rim", { gain: ball.apparatusGain * 0.42, rate: ball.apparatusRate * 0.64 });
      } else if (name === "bin-wall") {
        // The side of the bin, which is a bigger, hollower panel than the lip.
        engine.play("backboard", { gain: ball.apparatusGain * 0.4, rate: ball.apparatusRate * 0.7 });
      } else if (name === "backboard") {
        engine.play("backboard", { gain: ball.apparatusGain, rate: ball.apparatusRate });
      } else if (name === "wall") {
        // Bare plaster, not the board: same impact, duller and quieter.
        engine.play("backboard", { gain: ball.apparatusGain * 0.5, rate: ball.apparatusRate * 0.82 });
      } else if (name === "ceiling") {
        // Also plaster, and further away than the wall ever is — duller again
        // and pitched down. A ceiling does not need a recording of its own; it
        // needs to sound like something the ball hit above your head.
        engine.play("backboard", { gain: ball.apparatusGain * 0.38, rate: ball.apparatusRate * 0.7 });
      } else if (name === "floor" && speed > BOUNCE_MIN_SPEED) {
        engine.play(ball.floor, { gain: impactGain(speed) });
      }
    },

    /**
     * A ball that did not survive its landing.
     *
     * It takes the PLACE of the contact sound it arrived with rather than
     * playing over it: a wall's dull plaster thud belongs to a ball that came
     * back off the wall, and this one did not. What is left is the ball's own
     * body — the same sample its floor impact uses, at the weight it hit with,
     * and then nothing, because there is no roll to follow.
     */
    splat(surface, { ballId, speed = 0 } = {}) {
      engine.play(ballAudio(ballId).floor, { gain: impactGain(speed), ignoreThrottle: true });
    },

    /**
     * A ball has set something alight where it landed.
     *
     * NOT a contact, and deliberately not routed through `contact()`. The
     * collider reports a bump the instant it happens and once per 8ms substep
     * after that; a fire is what the room is left with, it starts at most once
     * per landing, and whether one started at all is a question only
     * `effects/flame-trail.js` can answer — so that module decides and this
     * plays. A ball with no fire has no `land` sample and this is silence.
     */
    sizzle(ballId) {
      const land = ballAudio(ballId).land;
      if (land) engine.play(land);
    },

    /**
     * It went in.
     *
     * The celebration fires on the shot that STARTS the streak, not on every
     * shot inside it — a crowd that comes up again on every bucket from the
     * third onward stops meaning anything, and the samples are seconds long.
     */
    scored(streak) {
      engine.play("swish");
      if (streak === ON_FIRE_STREAK) this.celebrate();
    },

    /**
     * A bin swallowed the ball.
     *
     * Not `scored()`. A swish is a ball passing through a net and there is no
     * net here — what the room hears is the ball landing in a plastic drum, so
     * this is the ball's own body sample at full weight with the reward chime
     * over it. It is also a TURN ending rather than a point scored, which is why
     * it does not touch the streak or bring the crowd up.
     */
    binScored(ballId) {
      engine.play(ballAudio(ballId).floor, { gain: 1, ignoreThrottle: true });
      engine.play("swish", { gain: 0.55 });
    },

    /** It did not. */
    missed() {
      engine.play("miss");
    },

    /** The player and the room, together. Used for going on fire and for a new best. */
    celebrate() {
      engine.play("crowd-cheer");
      engine.play("player-cheer");
    },
  };
}

export { BOUNCE_MIN_SPEED };
