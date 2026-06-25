// AudioManager — the one place that knows the sound files on disk and how to
// play them. Everything else asks for a logical key ("attackHit", "diceRoll");
// nothing else touches an <audio> element or a file path.
//
// Design rules that match the rest of this game:
//   * Presentation only. Sounds never gate or depend on the rules — a muted or
//     missing file must never change the match. Every play is best-effort and
//     swallows its own errors.
//   * Headless-safe. Imported only from the browser boot path (app.js); the
//     deterministic core/AI and the node tests never reach this module.
//   * Overlap-friendly. Rapid repeats (two arrows, a dice rattle over a move)
//     each get their own playback node, so one sound never cuts off another.

// Logical key -> file, relative to the game's /sounds folder. Resolved against
// this module's URL so it works regardless of where index.html is served from.
const FILES = Object.freeze({
  buttonClick: "button-click.wav",
  diceRoll: "dice-roll.wav",

  // Universal combat outcomes (any unit).
  unitMove: "universal/unit-move.wav",
  attackHit: "universal/attack-hit.wav",
  criticalHit: "universal/critical-hit.wav",
  defendedHit: "universal/defended-hit.wav",
  // Sound for *initiating* a defend (a unit bracing). Shares the shield/block clip
  // with defendedHit for now; give it its own file later by swapping this path only.
  defend: "universal/defended-hit.wav",
  miss: "universal/miss.wav",

  // Ranger.
  arrowAirborne: "ranger/arrow-airborne.wav",
  arrowHit: "ranger/arrow-hit.wav",

  // Medic.
  heal: "medic/heal.wav",
  healCrit: "medic/heal-crit.wav",
  medicAttackAirborne: "medic/medic-attack-airborne.wav",
});

// Looping background tracks. These are NOT in FILES — music is a single,
// long-lived, looping element per key (no per-play cloning), so it lives in its
// own map with its own start/stop lifecycle.
const MUSIC = Object.freeze({
  battle: "battle.mp3",
});

const SOUNDS_BASE = new URL("../../sounds/", import.meta.url);

export class AudioManager {
  constructor({ enabled = true, masterVolume = 1, volume = 0.8, musicVolume = 0.35 } = {}) {
    this.enabled = enabled;
    // Three independent levels, all 0..1. `volume` is the SFX bus, `musicVolume`
    // the music bus, and `masterVolume` multiplies both — so the Settings panel's
    // Master / SFX / Music sliders map straight onto these. Effective level is
    // always master × bus; see effectiveVolume()/effectiveMusicVolume().
    this.masterVolume = masterVolume;
    this.volume = volume;
    this.musicVolume = musicVolume;
    // Decoded template per key. Cloning these to play reuses the cached buffer
    // and lets overlapping copies run without stealing each other's playhead.
    this.templates = new Map();

    for (const [key, file] of Object.entries(FILES)) {
      const audio = new Audio(new URL(file, SOUNDS_BASE).href);
      audio.preload = "auto";
      this.templates.set(key, audio);
    }

    // One persistent, looping element per music key. Built lazily on first
    // start so the (large) file isn't fetched until a match actually begins.
    this.musicTracks = new Map();
    this.currentMusic = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.stopMusic();
    }
  }

  // Live volume setters for the Settings sliders. Each clamps to 0..1 and, for
  // anything that affects music, re-applies the level to the currently-playing
  // track so a drag is heard immediately without restarting the loop.
  setMasterVolume(value) {
    this.masterVolume = clamp01(value);
    this.applyMusicVolume();
  }

  setVolume(value) {
    this.volume = clamp01(value);
  }

  setMusicVolume(value) {
    this.musicVolume = clamp01(value);
    this.applyMusicVolume();
  }

  effectiveVolume() {
    return this.masterVolume * this.volume;
  }

  effectiveMusicVolume() {
    return this.masterVolume * this.musicVolume;
  }

  applyMusicVolume() {
    if (this.currentMusic) {
      this.currentMusic.volume = this.effectiveMusicVolume();
    }
  }

  // Fire-and-forget. Unknown keys, disabled audio, and blocked/failed playback
  // are all silent no-ops — callers never need to guard or await.
  play(key) {
    if (!this.enabled) {
      return;
    }

    const template = this.templates.get(key);
    if (!template) {
      return;
    }

    const node = template.cloneNode(true);
    node.volume = this.effectiveVolume();

    const played = node.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => {});
    }
  }

  // Start a looping background track, restarting it from the top. Switching to a
  // new track stops the old one first, so only one loop ever plays. Unknown
  // keys and disabled audio are silent no-ops, like play().
  startMusic(key) {
    if (!this.enabled) {
      return;
    }

    const file = MUSIC[key];
    if (!file) {
      return;
    }

    if (this.currentMusic && this.currentMusic !== this.musicTracks.get(key)) {
      this.stopMusic();
    }

    let track = this.musicTracks.get(key);
    if (!track) {
      track = new Audio(new URL(file, SOUNDS_BASE).href);
      track.loop = true;
      track.preload = "auto";
      this.musicTracks.set(key, track);
    }

    track.volume = this.effectiveMusicVolume();
    track.currentTime = 0;
    this.currentMusic = track;

    const played = track.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => {});
    }
  }

  // Stop the active background track (if any) and rewind it.
  stopMusic() {
    const track = this.currentMusic;
    this.currentMusic = null;
    if (!track) {
      return;
    }
    try {
      track.pause();
      track.currentTime = 0;
    } catch {
      // Best-effort — pausing a never-started element can throw; ignore.
    }
  }
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}
