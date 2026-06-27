// Pattern Panic view. Display: the lit face target, big, plus hit/miss tally.
// Controller: tells the player which face to smash and lights it on the gamepad.
import { escapeHtml } from "../../jaybox-client-model.mjs";

function faceClass(target) {
  return target ? `qd-face-${String(target).toLowerCase()}` : "";
}

export const patternPanicView = {
  penaltyId: "pattern-panic",

  renderDisplay(penalty) {
    const target = penalty.target;
    return `<div class="qd-penalty-targets">
      <div class="qd-target-big ${faceClass(target)}">${target ? escapeHtml(target) : "✓"}</div>
      <div class="qd-pen-status">${penalty.hits || 0} / ${penalty.required || 0} hit${penalty.misses ? ` · ${penalty.misses} missed` : ""}</div>
    </div>`;
  },

  renderControllerOverlay(penalty) {
    const lit = (penalty.litButtons || [])[0];
    return `<div class="qd-pen-prompt">${lit ? `Smash <b class="${faceClass(lit)}">${escapeHtml(lit)}</b>` : "Cleared it!"}</div>`;
  },

  litButtons(penalty) {
    return penalty.litButtons || [];
  },
};
