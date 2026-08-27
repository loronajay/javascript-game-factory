// DOM binding for the How-to-Play demo: its power meter, its shout, its hint
// and its tally.
//
// Same shape and same rules as `hud.js` — it is handed values and writes them,
// it holds no state, and every write is guarded against a missing node so a
// markup change costs a readout rather than a thrown exception mid-shot. It is
// a separate file rather than a second mode of the HUD because the two share no
// element ids and the demo has no clock, no score and no streak.

import { createTurnBallPicker } from "./turn-ball-picker.js";

const TRANSIENT_MS = 900;

export function createPracticeView(root, { onBallSelect = () => {} } = {}) {
  const nodes = {
    ballChoices: root.querySelector("#practiceBallChoices"),
    meterFill: root.querySelector("#practiceMeterFill"),
    readout: root.querySelector("#practiceReadout"),
    shout: root.querySelector("#practiceShout"),
    hint: root.querySelector("#practiceHint"),
    tally: root.querySelector("#practiceTally"),
  };

  // The same catalog-driven picker the two per-turn modes use. The demo is the
  // one screen where a ball is worth trying rather than reading about: the balls
  // genuinely fly differently, and the pull that drops a bowling ball is not the
  // pull that drops a paper wad. It is deliberately NOT written back to
  // preferences — How to Play is a sandbox, not a second setup screen, and the
  // demo is re-dressed from the player's real selection every time it opens.
  const balls = createTurnBallPicker(nodes.ballChoices, { onSelect: onBallSelect });

  let shoutTimer = 0;

  return {
    /**
     * Which ball the demo is shooting, and whether the choice is live.
     *
     * It is locked for the flight, because the court solves the launch against
     * the ball's own weight at release: swapping mid-air would leave a ball in
     * the room flying an arc solved for a different one.
     */
    setBallChoice(choice) {
      balls.render(choice);
    },

    /** Power meter, 0..1. The number is the honest ratio, same as in a run. */
    setPower(power) {
      const percent = Math.round(Math.max(0, Math.min(1, power)) * 100);
      if (nodes.meterFill) nodes.meterFill.style.width = `${percent}%`;
      if (nodes.readout) nodes.readout.textContent = `${percent}%`;
    },

    /** The transient word over the court — BUCKET!, RIM, SHORT. */
    say(text) {
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

    setHintVisible(visible) {
      nodes.hint?.classList.toggle("is-hidden", !visible);
    },

    /** Attempts, and how many dropped. No accuracy percentage: this is not a test. */
    setTally({ made, taken }) {
      if (!nodes.tally) return;
      nodes.tally.textContent = taken === 0 ? "No shots yet" : `${made} of ${taken} down`;
    },

    dispose() {
      clearTimeout(shoutTimer);
    },
  };
}
