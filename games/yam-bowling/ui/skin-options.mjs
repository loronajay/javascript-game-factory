import { $, escapeHtml } from "./dom.mjs";

// The equip control shared by the local and online setup screens. Unlike the
// inspector's preview strip, choosing here DOES persist: this is the one place
// a skin becomes the bowler's equipped look, and it writes through the
// presentation loadout so equipment has a single owner.
//
// Only skins the current ownership source permits are offered. Canon is always
// present; server-entitled looks appear only after authenticated sync.
export function renderSkinOptions({ containerId, slug, selectedSkinId, animation, assets, loadout, onEquip }) {
  const host = $(containerId);
  host.innerHTML = "";
  const bowler = assets.bowlerBySlug(slug);
  const ownedSkinIds = new Set(loadout.listOwned("skin")
    .filter((item) => item.characterSlug === bowler.slug)
    .map((item) => item.id.split(":")[2]));

  for (const skin of animation.AVAILABLE_SKINS.filter((option) => ownedSkinIds.has(option.id))) {
    const button = document.createElement("button");
    button.className = `skin-option${skin.id === selectedSkinId ? " is-selected" : ""}`;
    button.type = "button";
    button.dataset.skinId = skin.id;
    button.setAttribute("aria-pressed", String(skin.id === selectedSkinId));
    button.innerHTML = `<img src="${assets.characterPortrait(slug, skin.id)}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(skin.name)}</strong><small>${skin.id === selectedSkinId ? "Equipped" : "Equip"}</small></span>`;
    button.addEventListener("click", () => onEquip(loadout.equipSkin(bowler.slug, skin.id)));
    host.appendChild(button);
  }
}
