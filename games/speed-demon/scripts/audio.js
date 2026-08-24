// Browser audio for the cabinet. This layer consumes state transitions from the
// composition root; the deterministic simulation never knows that sounds exist.

export const SOUND_SOURCES = {
  button: "assets/sounds/button-click.wav",
  countdownHigh: "assets/sounds/countdown-high.wav",
  countdownLow: "assets/sounds/countdown-low.wav",
  idle: "assets/sounds/idle.wav",
  perfect: "assets/sounds/perfect.wav",
  revving: "assets/sounds/revving.wav",
  stick: "assets/sounds/stick-move.wav",
};

const ONE_SHOT_VOLUMES = {
  button: 0.45,
  countdownHigh: 0.75,
  countdownLow: 0.65,
  perfect: 0.85,
  stick: 0.55,
};

const IDLE_VOLUME = 0.32;
const REV_VOLUME = 0.62;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/** A clearly audible half-octave rise across the six-speed box. */
export function revRateForGear(gear) {
  const clampedGear = Math.max(1, Math.min(6, Number(gear) || 1));
  return 0.85 + (clampedGear - 1) * 0.1;
}

/**
 * Continuous engine mix for a circuit car, which has no discrete gearbox RPM.
 * Road speed carries pitch and throttle carries load; coasting therefore still
 * sounds like a connected engine instead of dropping to silence between key
 * presses.
 */
export function circuitEngineMix({ active, throttle, speed, maxSpeed }) {
  if (!active) return { idleVolume: 0, revVolume: 0, playbackRate: 1 };
  const load = clamp01(throttle);
  const safeMaxSpeed = Math.max(1, Number(maxSpeed) || 1);
  const speedRatio = clamp01(Math.abs(Number(speed) || 0) / safeMaxSpeed);
  const rpmShape = Math.sqrt(speedRatio);
  const idleVolume = IDLE_VOLUME * (1 - speedRatio) ** 2 * (1 - load * 0.85);
  const revPresence = Math.min(1, rpmShape * 0.7 + load * 0.3);
  return {
    idleVolume,
    revVolume: REV_VOLUME * revPresence,
    playbackRate: 0.72 + rpmShape * 0.93 + load * 0.15,
  };
}

/** Returns the tree cue caused by one race-state transition, if any. */
export function countdownCue(previous, next) {
  if (!previous || !next) {
    return null;
  }
  if (previous.phase === "staging" && next.phase === "countdown") {
    return "countdownLow";
  }
  if (previous.phase === "staging" && next.phase === "running") {
    return "countdownHigh";
  }
  if (previous.phase !== "countdown") {
    return null;
  }
  if (next.phase === "running") {
    return "countdownHigh";
  }
  if (next.phase !== "countdown") {
    return null;
  }

  const previousBulb = Math.ceil(Math.max(0, previous.countdown));
  const nextBulb = Math.ceil(Math.max(0, next.countdown));
  return nextBulb < previousBulb ? "countdownLow" : null;
}

/** Maps the circuit reducer's status names onto the same 3-2-1-GO tree. */
export function circuitCountdownCue(previous, next) {
  if (!next) return null;
  if (!previous) {
    return next.status === "countdown" && Math.ceil(Math.max(0, next.countdown)) > 0
      ? "countdownLow"
      : null;
  }
  const asDragState = (state) => ({
    phase: state.status === "racing" ? "running" : state.status,
    countdown: state.countdown,
  });
  return countdownCue(asDragState(previous), asDragState(next));
}

/** One-shot sounds that are implied by a race transition. */
export function raceSoundEvents(previous, next) {
  const events = [];
  const treeCue = countdownCue(previous, next);
  if (treeCue) {
    events.push(treeCue);
  }

  const previousShiftCount = previous?.shifts?.length ?? 0;
  const nextShiftCount = next?.shifts?.length ?? 0;
  if (nextShiftCount > previousShiftCount && next.lastShift?.grade === "perfect") {
    events.push("perfect");
  }
  return events;
}

/** True only when a live shift actually traversed the H-pattern. */
export function stickMoved(previous, next) {
  if (!previous?.shift) {
    return false;
  }
  return next?.shift === null || next?.shift?.node !== previous.shift.node;
}

function swallowRejectedPlay(result) {
  // Browsers reject play() before their first trusted interaction. The next
  // keydown calls unlock() and starts the loops inside that gesture.
  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
}

/**
 * Owns the reusable HTMLAudioElements. AudioClass is injectable so all routing,
 * looping, volume and pitch behavior can be verified without a browser.
 */
export function createGameAudio({ AudioClass = globalThis.Audio } = {}) {
  if (typeof AudioClass !== "function") {
    return {
      unlock() {},
      play() {},
      engine() {},
      stop() {},
    };
  }

  const sounds = Object.fromEntries(
    Object.entries(SOUND_SOURCES).map(([name, src]) => [name, new AudioClass(src)]),
  );
  const idle = sounds.idle;
  const revving = sounds.revving;
  idle.loop = true;
  revving.loop = true;
  idle.volume = 0;
  revving.volume = 0;

  // playbackRate changes tempo but browsers preserve the original pitch unless
  // this is disabled. Both properties cover current Chromium and older WebKit.
  revving.preservesPitch = false;
  revving.webkitPreservesPitch = false;

  for (const [name, volume] of Object.entries(ONE_SHOT_VOLUMES)) {
    sounds[name].volume = volume;
  }

  let loopsStarted = false;
  function startLoops() {
    if (loopsStarted) {
      return;
    }
    loopsStarted = true;
    swallowRejectedPlay(idle.play());
    swallowRejectedPlay(revving.play());
  }

  return {
    /** Called directly by the first recognized keydown to satisfy autoplay. */
    unlock() {
      startLoops();
    },

    play(name) {
      const sound = sounds[name];
      if (!sound || sound.loop) {
        return;
      }
      sound.currentTime = 0;
      swallowRejectedPlay(sound.play());
    },

    engine({ active, throttle, gear, speed = null, maxSpeed = null }) {
      if (!active) {
        idle.volume = 0;
        revving.volume = 0;
        return;
      }
      startLoops();
      if (speed !== null && Number(maxSpeed) > 0) {
        const mix = circuitEngineMix({ active, throttle, speed, maxSpeed });
        idle.volume = mix.idleVolume;
        revving.volume = mix.revVolume;
        revving.playbackRate = mix.playbackRate;
        return;
      }
      const onThrottle = throttle > 0;
      idle.volume = onThrottle ? 0 : IDLE_VOLUME;
      revving.volume = onThrottle ? REV_VOLUME : 0;
      revving.playbackRate = revRateForGear(gear);
    },

    stop() {
      idle.volume = 0;
      revving.volume = 0;
      idle.pause();
      revving.pause();
      loopsStarted = false;
    },
  };
}
