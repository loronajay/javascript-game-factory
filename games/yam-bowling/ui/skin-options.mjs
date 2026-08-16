import { $, escapeHtml } from "./dom.mjs";

// The equip control shared by the local and online setup screens. Unlike the
// inspector's preview strip, choosing here DOES persist: this is the one place
// a skin becomes the bowler's equipped look, and it writes through the
// presentation loadout so equipment has a single owner.
//
// The full catalog stays visible so locked looks can motivate collection.
// Ownership still controls interaction: only entitled skins can be equipped.
export function renderSkinOptions({ containerId, slug, selectedSkinId, animation, assets, loadout, onEquip }) {
  const host = $(containerId);
  host.innerHTML = "";
  const bowler = assets.bowlerBySlug(slug);
  const ownedSkinIds = new Set(loadout.listOwned("skin")
    .filter((item) => item.characterSlug === bowler.slug)
    .map((item) => item.id.split(":")[2]));

  for (const skin of animation.AVAILABLE_SKINS) {
    const owned = ownedSkinIds.has(skin.id);
    const button = document.createElement("button");
    button.className = `skin-option${skin.id === selectedSkinId ? " is-selected" : ""}${owned ? "" : " is-locked"}`;
    button.type = "button";
    button.disabled = !owned;
    button.dataset.skinId = skin.id;
    button.setAttribute("aria-pressed", String(skin.id === selectedSkinId));
    button.innerHTML = `<img src="${assets.characterPortrait(slug, skin.id)}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(skin.name)}</strong><small>${owned ? (skin.id === selectedSkinId ? "Equipped" : "Equip") : "Locked"}</small></span>`;
    if (owned) button.addEventListener("click", () => onEquip(loadout.equipSkin(bowler.slug, skin.id)));
    host.appendChild(button);
  }
}
