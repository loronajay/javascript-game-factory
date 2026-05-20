import { SOUND_PATHS, createSoundController } from "../scripts/sounds.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

test("button click sound path points at the native sound folder", () => {
  assertEqual(SOUND_PATHS.buttonClick, "assets/scratch/sounds/button-click.wav");
  assertEqual(SOUND_PATHS.gameMusic, "assets/scratch/sounds/game-music.mp3");
  assertEqual(SOUND_PATHS.poopRelease, "assets/scratch/sounds/poop-release.mp3");
  assertEqual(SOUND_PATHS.splat, "assets/scratch/sounds/splat.mp3");
});

test("playButtonClick clones and plays the click sound", () => {
  const played = [];
  const constructed = [];

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.preload = "";
      constructed.push(this);
    }

    cloneNode() {
      return {
        src: this.src,
        currentTime: 10,
        play() {
          played.push(this);
          return Promise.resolve();
        },
      };
    }
  }

  const controller = createSoundController({ Audio: FakeAudio });
  const didPlay = controller.playButtonClick();

  assertEqual(didPlay, true);
  assertEqual(constructed[0].src, SOUND_PATHS.buttonClick);
  assertEqual(constructed[0].preload, "auto");
  assertEqual(played.length, 1);
  assertEqual(played[0].currentTime, 0);
});

test("playButtonClick is safe when Audio is unavailable", () => {
  const controller = createSoundController({ Audio: null });

  assertEqual(controller.playButtonClick(), false);
});

test("gameplay sound helpers play the mapped one-shot sounds", () => {
  const played = [];

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.preload = "";
    }

    cloneNode() {
      return {
        src: this.src,
        currentTime: 4,
        play() {
          played.push(this.src);
          return Promise.resolve();
        },
      };
    }
  }

  const controller = createSoundController({ Audio: FakeAudio });

  assertEqual(controller.playPoopRelease(), true);
  assertEqual(controller.playSplat(), true);
  assertEqual(played[0], SOUND_PATHS.poopRelease);
  assertEqual(played[1], SOUND_PATHS.splat);
});

test("background music loops and can be stopped", () => {
  const played = [];
  const paused = [];

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.loop = false;
      this.currentTime = 7;
      this.preload = "";
    }

    cloneNode() {
      return this;
    }

    play() {
      played.push(this);
      return Promise.resolve();
    }

    pause() {
      paused.push(this);
    }
  }

  const controller = createSoundController({ Audio: FakeAudio });

  assertEqual(controller.startGameMusic(), true);
  assertEqual(played[0].src, SOUND_PATHS.gameMusic);
  assertEqual(played[0].loop, true);
  controller.stopGameMusic();
  assertEqual(paused[0].src, SOUND_PATHS.gameMusic);
  assertEqual(paused[0].currentTime, 0);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
