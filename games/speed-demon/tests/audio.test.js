import { suite, test, assert, assertEqual, assertDeepEqual, assertClose, finish } from "./harness.js";

import {
  SOUND_SOURCES,
  countdownCue,
  raceSoundEvents,
  revRateForGear,
  stickMoved,
  createGameAudio,
} from "../scripts/audio.js";

suite("audio — cue routing and engine pitch");

test("every authored sound has a stable asset path", () => {
  assertDeepEqual(SOUND_SOURCES, {
    button: "assets/sounds/button-click.wav",
    countdownHigh: "assets/sounds/countdown-high.wav",
    countdownLow: "assets/sounds/countdown-low.wav",
    idle: "assets/sounds/idle.wav",
    perfect: "assets/sounds/perfect.wav",
    revving: "assets/sounds/revving.wav",
    stick: "assets/sounds/stick-move.wav",
  });
});

test("the tree ticks low at each amber and high on green", () => {
  const staging = { phase: "staging", countdown: 3 };
  const three = { phase: "countdown", countdown: 3 };
  const almostTwo = { phase: "countdown", countdown: 2.01 };
  const two = { phase: "countdown", countdown: 1.99 };
  const one = { phase: "countdown", countdown: 0.99 };
  const green = { phase: "running", countdown: 0 };

  assertEqual(countdownCue(staging, three), "countdownLow");
  assertEqual(countdownCue(three, almostTwo), null, "no duplicate cue between bulbs");
  assertEqual(countdownCue(almostTwo, two), "countdownLow");
  assertEqual(countdownCue(two, one), "countdownLow");
  assertEqual(countdownCue(one, green), "countdownHigh");
});

test("only a newly completed perfect shift earns the perfect cue", () => {
  const before = { phase: "running", countdown: 0, shifts: [], lastShift: null };
  const perfect = {
    ...before,
    shifts: [{ grade: "perfect" }],
    lastShift: { grade: "perfect" },
  };
  const good = {
    ...before,
    shifts: [{ grade: "good" }],
    lastShift: { grade: "good" },
  };

  assertDeepEqual(raceSoundEvents(before, perfect), ["perfect"]);
  assertDeepEqual(raceSoundEvents(before, good), []);
  assertDeepEqual(raceSoundEvents(perfect, perfect), [], "a held result must not replay");
});

test("the stick cue follows physical gate movement, not a wall bump", () => {
  const before = { shift: { node: "gear:1" } };
  assertEqual(stickMoved(before, { shift: { node: "neutral:0" } }), true);
  assertEqual(stickMoved(before, { shift: { node: "gear:1" } }), false);
  assertEqual(stickMoved(before, { shift: null }), true, "landing in gear is still a movement");
  assertEqual(stickMoved({ shift: null }, { shift: null }), false);
});

test("rev pitch rises monotonically from first through sixth", () => {
  let previous = 0;
  for (let gear = 1; gear <= 6; gear += 1) {
    const rate = revRateForGear(gear);
    assert(rate > previous, `gear ${gear} did not rise above the prior gear`);
    previous = rate;
  }
  assertClose(revRateForGear(1), 0.85, 1e-9);
  assertClose(revRateForGear(6), 1.35, 1e-9);
});

class FakeAudio {
  static instances = [];

  constructor(src) {
    this.src = src;
    this.loop = false;
    this.volume = 1;
    this.currentTime = 0;
    this.playbackRate = 1;
    this.preservesPitch = true;
    this.webkitPreservesPitch = true;
    this.playCount = 0;
    this.pauseCount = 0;
    FakeAudio.instances.push(this);
  }

  play() {
    this.playCount += 1;
    return Promise.resolve();
  }

  pause() {
    this.pauseCount += 1;
  }
}

test("engine control switches between idle and rev and applies real pitch shifting", () => {
  FakeAudio.instances = [];
  const audio = createGameAudio({ AudioClass: FakeAudio });
  const idle = FakeAudio.instances.find((sound) => sound.src === SOUND_SOURCES.idle);
  const revving = FakeAudio.instances.find((sound) => sound.src === SOUND_SOURCES.revving);

  assertEqual(idle.loop, true);
  assertEqual(revving.loop, true);
  assertEqual(revving.preservesPitch, false);
  assertEqual(revving.webkitPreservesPitch, false);

  audio.engine({ active: true, throttle: 0, gear: 1 });
  assert(idle.volume > 0, "idle should be audible off throttle");
  assertEqual(revving.volume, 0);

  audio.engine({ active: true, throttle: 1, gear: 5 });
  assertEqual(idle.volume, 0);
  assert(revving.volume > 0, "rev should be audible on throttle");
  assertEqual(revving.playbackRate, revRateForGear(5));

  audio.engine({ active: false, throttle: 1, gear: 6 });
  assertEqual(idle.volume, 0);
  assertEqual(revving.volume, 0);
});

test("one-shot cues rewind so repeated countdown ticks are never skipped", () => {
  FakeAudio.instances = [];
  const audio = createGameAudio({ AudioClass: FakeAudio });
  const low = FakeAudio.instances.find((sound) => sound.src === SOUND_SOURCES.countdownLow);
  low.currentTime = 0.4;
  audio.play("countdownLow");
  audio.play("countdownLow");
  assertEqual(low.currentTime, 0);
  assertEqual(low.playCount, 2);
});

finish();
