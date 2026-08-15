import { $, escapeHtml } from "./dom.mjs";

// The equip control shared by the local and online setup screens. Unlike the
// inspector's preview strip, choosing here DOES persist: this is the one place
// a skin becomes the bowler's equipped look.
export function renderSkinOptions({ containerId, slug, selectedSkinId, animation, assets, onEquip }) {
  const host = $(containerId);
  host.innerHTML = "";
  const bowler = assets.bowlerBySlug(slug);
  for (const skin of animation.AVAILABLE_SKINS) {
    const button = document.createElement("button");
    button.className = `skin-option${skin.id === selectedSkinId ? " is-selected" : ""}`;
    button.type = "button";
    button.dataset.skinId = skin.id;
    button.setAttribute("aria-pressed", String(skin.id === selectedSkinId));
    button.innerHTML = `<img src="${assets.characterPortrait(slug, skin.id)}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(skin.name)}</strong><small>${skin.id === selectedSkinId ? "Equipped" : "Equip"}</small></span>`;
    button.addEventListener("click", () => onEquip(animation.saveEquippedSkinId(bowler, skin.id)));
    host.appendChild(button);
  }
}
