// The to-hit die overlay presentation, injected with the dice DOM nodes owned by
// createEffects. `currentGeneration` guards against a cleared/restarted battle:
// the reveal abandons itself the moment clearActive bumps the generation.

import { reducedMotion, sleep } from "./effectDom.js";

export function createDiceRollReveal({ diceOverlay, dieFace, sound, currentGeneration }) {
  // The roll reveal. Tumbles die faces then settles on an icon + label.
  // Pass a custom `label` for a second effect roll (e.g. "BLINDED", "RESISTED").
  return async function rollReveal(outcome, label = null) {
    if (!diceOverlay || !dieFace) return;
    const token = currentGeneration();
    sound.play("diceRoll");
    diceOverlay.classList.add("show", "rolling");
    dieFace.className = "die";
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    if (!reducedMotion()) {
      for (let i = 0; i < 7; i += 1) {
        dieFace.textContent = faces[Math.floor(Math.random() * faces.length)];
        await sleep(46);
        if (token !== currentGeneration()) return;
      }
    }
    const glyph = outcome.missed ? "✘" : outcome.critical ? "✦" : "⚔";
    const text = label ?? (outcome.missed ? "MISS" : outcome.critical ? "CRIT" : "HIT");
    dieFace.innerHTML = `<span class="die-glyph">${glyph}</span><span class="die-label">${text}</span>`;
    dieFace.classList.add(outcome.missed ? "die-miss" : outcome.critical ? "die-crit" : "die-hit");
    diceOverlay.classList.remove("rolling");
    await sleep(reducedMotion() ? 140 : 380);
    if (token !== currentGeneration()) return;
    diceOverlay.classList.remove("show");
    await sleep(120);
  };
}
