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
  miss: "universal/miss.wav",

  // Ranger.
  arrowAirborne: "ranger/arrow-airborne.wav",
  arrowHit: "ranger/arrow-hit.wav",

  // Medic.
  heal: "medic/heal.wav",
  healCrit: "medic/heal-crit.wav",
  medicAttackAirborne: "medic/medic-attack-airborne.wav",
});

const SOUNDS_BASE = new URL("../../sounds/", import.meta.url);

export class AudioManager {
  constructor({ enabled = true, volume = 0.8 } = {}) {
    this.enabled = enabled;
    this.volume = volume;
    // Decoded template per key. Cloning these to play reuses the cached buffer
    // and lets overlapping copies run without stealing each other's playhead.
    this.templates = new Map();

    for (const [key, file] of Object.entries(FILES)) {
      const audio = new Audio(new URL(file, SOUNDS_BASE).href);
      audio.preload = "auto";
      this.templates.set(key, audio);
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
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
    node.volume = this.volume;

    const played = node.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => {});
    }
  }
}
