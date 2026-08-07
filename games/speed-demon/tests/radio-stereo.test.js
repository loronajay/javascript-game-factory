import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import { createStereo } from "../scripts/radio/stereo.js";

suite("radio stereo — applying a state to the deck");

/**
 * A stand-in for HTMLAudioElement. Only the surface the stereo actually touches,
 * plus a log, so "did it call play twice" is a thing a test can ask.
 */
function FakeAudio() {
  const element = {
    src: null,
    volume: 0,
    loop: false,
    paused: true,
    preload: null,
    currentTime: 0,
    duration: NaN,
    calls: [],
    listeners: {},
    play() {
      this.calls.push("play");
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.calls.push("pause");
      this.paused = true;
    },
    removeAttribute(name) {
      this.calls.push(`removeAttribute:${name}`);
      if (name === "src") {
        this.src = null;
      }
    },
    addEventListener(name, fn) {
      (this.listeners[name] ??= []).push(fn);
    },
    removeEventListener(name, fn) {
      this.listeners[name] = (this.listeners[name] ?? []).filter((entry) => entry !== fn);
    },
    emit(name) {
      for (const fn of this.listeners[name] ?? []) {
        fn();
      }
    },
  };
  FakeAudio.last = element;
  return element;
}

const build = (options = {}) => {
  const stereo = createStereo({ AudioClass: FakeAudio, ...options });
  return { stereo, element: FakeAudio.last };
};

const state = (overrides = {}) => ({
  src: "blob:one",
  playing: true,
  volume: 0.5,
  seekToken: 1,
  ...overrides,
});

test("a source is loaded and played", () => {
  const { stereo, element } = build();
  stereo.apply(state());
  assertEqual(element.src, "blob:one");
  assertEqual(element.volume, 0.5);
  assertEqual(element.paused, false);
});

test("re-applying an unchanged state does nothing at all", () => {
  // `apply` runs every tick; a second play() call per frame would be a bug the
  // browser mostly hides and occasionally does not.
  const { stereo, element } = build();
  stereo.apply(state());
  const after = element.calls.length;
  stereo.apply(state());
  stereo.apply(state());
  assertEqual(element.calls.length, after, "apply did work on an unchanged state");
});

test("the element never loops itself, so the reducer always sees the track end", () => {
  const { element } = build();
  assertEqual(element.loop, false);
});

test("a track change does not seek as well as load", () => {
  // A fresh source already starts at zero; seeking it again is a double rewind.
  const { stereo, element } = build();
  stereo.apply(state());
  element.currentTime = 42;
  stereo.apply(state({ src: "blob:two", seekToken: 2 }));
  assertEqual(element.src, "blob:two");
  assertEqual(element.currentTime, 42, "loading a new source should not have forced a seek");
});

test("a bumped seek token on the same source rewinds it", () => {
  const { stereo, element } = build();
  stereo.apply(state());
  element.currentTime = 42;
  stereo.apply(state({ seekToken: 2 }));
  assertEqual(element.currentTime, 0);
});

test("an element that refuses to be seeked does not take the game down with it", () => {
  const { stereo, element } = build();
  stereo.apply(state());
  Object.defineProperty(element, "currentTime", {
    get: () => 0,
    set: () => {
      throw new Error("InvalidStateError");
    },
  });
  stereo.apply(state({ seekToken: 2 })); // must not throw
  assert(true);
});

test("pausing pauses, and resuming does not reload the track", () => {
  const { stereo, element } = build();
  stereo.apply(state());
  stereo.apply(state({ playing: false }));
  assertEqual(element.paused, true);
  const src = element.src;
  stereo.apply(state());
  assertEqual(element.src, src, "resuming re-set the source");
  assertEqual(element.paused, false);
});

test("no source yet is a normal state, not an error", () => {
  // There is a gap between the reducer selecting a track and the object URL for
  // it resolving. Nothing should be played into that gap.
  const { stereo, element } = build();
  stereo.apply(state({ src: null }));
  stereo.apply(state({ src: null }));
  assertDeepEqual(element.calls, [], "the deck did something with nothing loaded");
});

test("losing the source empties the deck rather than leaving it holding a dead URL", () => {
  const { stereo, element } = build();
  stereo.apply(state());
  element.calls.length = 0;
  stereo.apply(state({ src: null }));
  assertDeepEqual(element.calls, ["pause", "removeAttribute:src"]);
  assertEqual(element.src, null);
});

test("play is retried, but not sixty times a second", () => {
  // Until the page has had a trusted interaction every play() is rejected, and
  // `apply` runs every tick.
  const { stereo, element } = build();
  element.play = function play() {
    this.calls.push("play"); // stays paused: a rejected play
    return Promise.reject(new Error("NotAllowedError"));
  };
  for (let i = 0; i < 40; i += 1) {
    stereo.apply(state());
  }
  const attempts = element.calls.filter((call) => call === "play").length;
  assert(attempts >= 1, "the first attempt must be immediate");
  assert(attempts <= 3, `play was retried ${attempts} times in 40 ticks`);
});

test("a deliberate track change is not held up by that backoff", () => {
  const { stereo, element } = build();
  element.play = function play() {
    this.calls.push("play");
    return Promise.reject(new Error("NotAllowedError"));
  };
  stereo.apply(state());
  stereo.apply(state()); // now in the backoff
  const before = element.calls.filter((call) => call === "play").length;
  stereo.apply(state({ src: "blob:two", seekToken: 2 }));
  const after = element.calls.filter((call) => call === "play").length;
  assertEqual(after, before + 1, "skipping a track had to wait out the retry backoff");
});

test("a finished track is reported once, to the reducer", () => {
  let ended = 0;
  const { stereo, element } = build({ onEnded: () => (ended += 1) });
  stereo.apply(state());
  element.emit("ended");
  assertEqual(ended, 1);
});

test("an element error on a loaded track is reported as a failure", () => {
  let failed = 0;
  const { stereo, element } = build({ onFailed: () => (failed += 1) });
  stereo.apply(state());
  element.emit("error");
  assertEqual(failed, 1);
});

test("an error with nothing loaded is not a track failure", () => {
  let failed = 0;
  const { element } = build({ onFailed: () => (failed += 1) });
  element.emit("error");
  assertEqual(failed, 0);
});

test("playback is read from the element rather than stored", () => {
  const { stereo, element } = build();
  stereo.apply(state());
  assertDeepEqual(stereo.playback(), { elapsed: 0, duration: 0, ready: false });
  element.currentTime = 12;
  element.duration = 180;
  assertDeepEqual(stereo.playback(), { elapsed: 12, duration: 180, ready: true });
});

test("a duration the element does not know yet reads as zero, not NaN", () => {
  const { stereo, element } = build();
  element.duration = Infinity; // what a stream reports
  assertEqual(stereo.playback().duration, 0);
});

test("without an Audio class the stereo is a no-op rather than a crash", () => {
  const stereo = createStereo({ AudioClass: null });
  stereo.apply(state());
  assertDeepEqual(stereo.playback(), { elapsed: 0, duration: 0, ready: false });
});

test("destroying unhooks the listeners", () => {
  let ended = 0;
  const { stereo, element } = build({ onEnded: () => (ended += 1) });
  stereo.apply(state());
  stereo.destroy();
  element.emit("ended");
  assertEqual(ended, 0);
});

finish();
