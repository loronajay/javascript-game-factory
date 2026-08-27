// The in-game HUD: clock, score, streak, power meter, and the shout line.
//
// A thin binding over DOM nodes and nothing more. It holds no game state and
// makes no decisions — it is handed values and writes them. Every write is
// guarded against a missing node so a markup change degrades to a missing
// readout rather than a thrown exception mid-shot.

const TRANSIENT_MS = 650;

export function createHud(root) {
  const nodes = {
    clock: root.querySelector("#hudClock"),
    mode: root.querySelector("#hudMode"),
    score: root.querySelector("#hudScore"),
    shots: root.querySelector("#hudShots"),
    streak: root.querySelector("#hudStreak"),
    streakStat: root.querySelector("#hudStreakStat"),
    fire: root.querySelector("#hudFire"),
    best: root.querySelector("#hudBest"),
    shout: root.querySelector("#hudShout"),
    hint: root.querySelector("#hudHint"),
    meterFill: root.querySelector("#meterFill"),
    meterReadout: root.querySelector("#meterReadout"),
  };

  let shoutTimer = 0;

  const setText = (node, value) => {
    if (node) node.textContent = String(value);
  };

  return {
    setClock: (text) => setText(nodes.clock, text),
    setMode: (text) => setText(nodes.mode, text),
    setScore: (value) => setText(nodes.score, value),
    setShots: (value) => setText(nodes.shots, value),
    setStreak: (value) => setText(nodes.streak, value),

    /**
     * How hard the streak card is burning: 0 is cold, then 1..n gets hotter.
     *
     * A LEVEL RATHER THAN A BOOLEAN, and the level is worked out by
     * `sim/shot.js`'s `onFireLevel` rather than here — the HUD makes no
     * decisions about the run, and "am I on fire" is the same question the
     * shout already asks. One flame per level, so the readout keeps telling a
     * player their streak is still climbing after it has already caught.
     */
    setOnFire(level) {
      const heat = Math.max(0, Math.floor(Number(level) || 0));
      nodes.streakStat?.classList.toggle("is-on-fire", heat > 0);
      nodes.streakStat?.style?.setProperty("--heat", String(heat));
      setText(nodes.fire, "\u{1F525}".repeat(heat));
    },
    setBest: (value) => setText(nodes.best, value),

    /** The big transient word over the court — BUCKET!, RIM, SHORT. */
    shout(text) {
      if (!nodes.shout) return;
      if (!text) {
        nodes.shout.classList.remove("is-shown");
        return;
      }
      nodes.shout.textContent = text;
      nodes.shout.classList.add("is-shown");
      clearTimeout(shoutTimer);
      shoutTimer = setTimeout(() => nodes.shout.classList.remove("is-shown"), TRANSIENT_MS);
    },

    /** The persistent control hint, hidden once the player has clearly got it. */
    setHintVisible(visible) {
      nodes.hint?.classList.toggle("is-hidden", !visible);
    },

    /** Power meter, 0..1. */
    setPower(power) {
      const percent = Math.round(Math.max(0, Math.min(1, power)) * 100);
      if (nodes.meterFill) nodes.meterFill.style.width = `${percent}%`;
      setText(nodes.meterReadout, `${percent}%`);
    },

    /** Stop any pending shout — used when a run ends or the game is left. */
    dispose() {
      clearTimeout(shoutTimer);
    },
  };
}
