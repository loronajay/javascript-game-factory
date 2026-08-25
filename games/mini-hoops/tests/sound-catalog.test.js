import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { ballIds } from "../scripts/assets/ball-catalog.js";
import {
  COUNTDOWN_LEAD_SECONDS,
  SOUNDS,
  ballAudio,
  soundById,
  soundIds,
  soundPath,
  soundPaths,
} from "../scripts/audio/sound-catalog.js";

// The sound layer's rules, checked where they are cheap to check. What a sound
// is FOR lives in `game-audio.js` and needs a browser; which file it is, how
// loud, and whether it exists on disk do not — and those are exactly the ones
// that fail silently, since a missing sound is silence and silence looks like a
// design decision.

suite("sound catalog");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every declared sound has a file on disk", () => {
  const missing = soundPaths().filter((relative) => !fs.existsSync(path.join(gameRoot, relative)));
  assertEqual(missing.join(", "), "", "declared sounds with no file");
});

test("every sound file on disk is declared", () => {
  // The mirror of the check above, and the one that matters more: art and audio
  // that lands undeclared is completely silent about being unused.
  const onDisk = fs
    .readdirSync(path.join(gameRoot, "assets", "sounds"))
    .filter((name) => name.endsWith(".wav"));
  const declared = new Set(SOUNDS.map((sound) => sound.file));
  const undeclared = onDisk.filter((name) => !declared.has(name));
  assertEqual(undeclared.join(", "), "", "sound files with no catalog row");
});

test("ids are unique", () => {
  const ids = soundIds();
  assertEqual(new Set(ids).size, ids.length, "duplicate sound id");
});

test("every row carries a usable level, trim and throttle", () => {
  for (const sound of SOUNDS) {
    assert(sound.gain > 0 && sound.gain <= 1, `${sound.id} gain out of range`);
    assert(sound.offset >= 0 && sound.offset < 1, `${sound.id} trim out of range`);
    assert(sound.minInterval >= 0, `${sound.id} throttle out of range`);
  }
});

test("an unknown sound resolves to nothing rather than throwing", () => {
  // Silence is the correct failure mode for audio; an exception is not.
  assertEqual(soundById("no-such-sound"), null);
  assertEqual(soundPath("no-such-sound"), null);
});

test("every ball has its own body sound, and no two share one", () => {
  // The whole point of the per-ball rows: a snowball must never make the
  // basketball's bounce.
  const floors = ballIds().map((id) => ballAudio(id).floor);
  assertEqual(new Set(floors).size, floors.length, "two balls share a body sound");
  for (const floor of floors) assert(soundById(floor), `${floor} is not a declared sound`);
});

test("a ball's release sound, where it has one, is declared", () => {
  for (const id of ballIds()) {
    const release = ballAudio(id).release;
    if (release) assert(soundById(release), `${id} names an undeclared release sound`);
  }
});

test("an unknown ball degrades to the default rather than throwing", () => {
  assertEqual(ballAudio("no-such-ball").floor, ballAudio("basketball").floor);
});

test("every ball colours the shared apparatus sounds sanely", () => {
  for (const id of ballIds()) {
    const profile = ballAudio(id);
    assert(profile.apparatusGain > 0 && profile.apparatusGain <= 1, `${id} apparatus gain out of range`);
    assert(profile.apparatusRate > 0.5 && profile.apparatusRate < 2, `${id} apparatus rate out of range`);
  }
});

test("the countdown is armed early enough to have somewhere to count from", () => {
  // If this were ever 0 the sample would be triggered at the buzzer and every
  // beep would land after the round was over.
  assert(COUNTDOWN_LEAD_SECONDS >= 1, "the countdown needs a lead");
  assert(soundById("countdown").minInterval === 0, "the countdown must never be throttled");
});

// ---------------------------------------------------------------------------
// The files themselves
// ---------------------------------------------------------------------------
//
// `COUNTDOWN_LEAD_SECONDS` and every `offset` are MEASURED PROPERTIES of the
// audio, not preferences — the countdown is started early and seeked into so its
// beeps land on 3, 2 and 1, and that is only true while the sample's beeps are
// where they were when the number was written. So the numbers are checked
// against the waveform rather than trusted.
//
// This is the same instinct as `tests/hoop.test.js` finite-differencing a
// hand-derived velocity: a constant that describes something real should be
// verified against the real thing, because replacing the file is exactly the
// change that would break it silently.

test("the countdown sample beeps once a second, ending on the lead", () => {
  const beeps = onsets("countdown.wav", 0.15);
  assertEqual(beeps.length, COUNTDOWN_LEAD_SECONDS + 1, "one beep per second, plus the beat on zero");
  beeps.forEach((at, index) => {
    assert(Math.abs(at - index) < 0.06, `beep ${index} is at ${at.toFixed(2)}s, not ${index}s`);
  });
  assertEqual(
    Math.round(beeps[beeps.length - 1]),
    COUNTDOWN_LEAD_SECONDS,
    "the last beat has to fall exactly COUNTDOWN_LEAD_SECONDS in, or the buzzer misses it",
  );
});

test("no sound's trim cuts into its own attack", () => {
  // The trims exist to strip leading silence so a click feels immediate. A trim
  // past the transient would strip the sound instead.
  for (const sound of SOUNDS) {
    if (sound.offset === 0) continue;
    const [first] = onsets(sound.file, 0.1);
    assert(first !== undefined, `${sound.id} has a trim but no detectable attack`);
    assert(sound.offset <= first + 0.02, `${sound.id} trims ${sound.offset}s, past its attack at ${first.toFixed(2)}s`);
  }
});

/**
 * When a sound file gets loud, in seconds.
 *
 * A deliberately crude 20ms peak envelope with a rising-edge test — enough to
 * find a beep or a transient, and short enough to keep the suite dependency-free
 * like the rest of the cabinet's tests.
 */
function onsets(file, threshold) {
  const { rate, channels, bits, data } = readWav(path.join(gameRoot, "assets", "sounds", file));
  const bytesPerFrame = (bits / 8) * channels;
  const frames = Math.floor(data.length / bytesPerFrame);
  const window = Math.floor(rate * 0.02);

  const found = [];
  let wasLoud = false;
  for (let start = 0; start < frames; start += window) {
    let peak = 0;
    for (let frame = start; frame < Math.min(start + window, frames); frame++) {
      peak = Math.max(peak, Math.abs(sampleAt(data, frame * bytesPerFrame, bits)));
    }
    const loud = peak > threshold;
    if (loud && !wasLoud) found.push(start / rate);
    wasLoud = loud;
  }
  return found;
}

/** One sample, as -1..1. Only the two bit depths this cabinet's audio actually uses. */
function sampleAt(data, at, bits) {
  if (bits === 16) return data.readInt16LE(at) / 32768;
  if (bits === 24) return ((data.readInt8(at + 2) << 16) | (data[at + 1] << 8) | data[at]) / 8388608;
  throw new Error(`unhandled bit depth ${bits}`);
}

/** Enough RIFF parsing to find the format and the samples. Chunks are walked, not assumed to be in order. */
function readWav(file) {
  const bytes = fs.readFileSync(file);
  let at = 12;
  let format = null;
  let data = null;
  while (at + 8 <= bytes.length) {
    const id = bytes.toString("ascii", at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    if (id === "fmt ") {
      format = { channels: bytes.readUInt16LE(at + 10), rate: bytes.readUInt32LE(at + 12), bits: bytes.readUInt16LE(at + 22) };
    } else if (id === "data") {
      data = bytes.subarray(at + 8, at + 8 + size);
    }
    at += 8 + size + (size % 2);
  }
  if (!format || !data) throw new Error(`${file} is not a WAV this test can read`);
  return { ...format, data };
}

finish();
