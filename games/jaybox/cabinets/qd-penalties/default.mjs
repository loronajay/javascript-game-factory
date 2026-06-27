// Default penalty view — the controller half for "mash to survive" penalties. The
// gamepad takes any input; the display shows survival progress.
import { escapeHtml } from "../../jaybox-client-model.mjs";

export const defaultView = {
  penaltyId: "default",

  renderDisplay(penalty) {
    return `<div class="qd-penalty-mash">
      <div class="qd-pen-status">${escapeHtml(penalty.statusText || "Survive it")}</div>
    </div>`;
  },

  renderControllerOverlay(penalty) {
    return `<div class="qd-pen-prompt">${escapeHtml(penalty.promptText || "Mash any button to survive!")}</div>`;
  },

  // Any button works, so nothing is highlighted.
  litButtons() {
    return [];
  },
};
