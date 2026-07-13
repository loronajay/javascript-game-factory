import { canMoveAndUseArts } from "../unitCatalog.js";
import { spendAndAdvance } from "../turnEngine.js";

export function artKeepsActivationOpen(actor, art) {
  return Boolean(!art?.bonusActionGroup && canMoveAndUseArts(actor));
}

export function completeArtUse(state, actor, art, keepsActivationOpen = artKeepsActivationOpen(actor, art)) {
  if (keepsActivationOpen) {
    state.activation.primaryUsed = true;
    return;
  }
  spendAndAdvance(state, actor);
}
