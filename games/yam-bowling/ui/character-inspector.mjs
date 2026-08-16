import { $, escapeHtml } from "./dom.mjs";

// The read-only bowler inspector. Its slug, its previewed skin and its focus
// return target are private to this module: nothing else in the cabinet can
// observe or corrupt them, which is what keeps a preview from leaking into the
// equipped-skin persistence used by the setup screens.
export function createCharacterInspector({ animation, catalog, assets, audio, initialSlug }) {
  let slug = initialSlug;
  let previewSkinId = animation.DEFAULT_SKIN_ID;
  let returnFocus = null;

  // A preview is a look, not a purchase: this renderer reads the equipped skin
  // to label options but must never reach an equip path.
  function renderSkinOptions() {
    const host = $("character-inspector-skins");
    const equippedSkinId = assets.storedSkinId(slug);
    host.innerHTML = "";
    for (const skin of animation.AVAILABLE_SKINS) {
      const previewing = skin.id === previewSkinId;
      const equipped = skin.id === equippedSkinId;
      const button = document.createElement("button");
      button.className = `character-inspector-skin${previewing ? " is-previewed" : ""}${equipped ? " is-equipped" : ""}`;
      button.type = "button";
      button.dataset.inspectorSkinId = skin.id;
      button.setAttribute("aria-pressed", String(previewing));
      button.innerHTML = `<img src="${assets.characterPortrait(slug, skin.id)}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(skin.name)}</strong><small>${escapeHtml(catalog.getSkinPreviewLabel(skin.id, previewSkinId, equippedSkinId))}</small></span>`;
      button.addEventListener("click", () => {
        previewSkinId = skin.id;
        render();
      });
      host.appendChild(button);
    }
  }

  function render() {
    const character = catalog.getCharacter(slug);
    const skin = animation.AVAILABLE_SKINS.find(({ id }) => id === previewSkinId)
      || animation.AVAILABLE_SKINS[0];
    const art = $("character-inspector-art");
    art.src = assets.characterPortrait(character.slug, skin.id);
    art.alt = `Front view of ${character.name} wearing the ${skin.name} outfit`;
    $("character-inspector-name").textContent = character.name;
    $("character-inspector-age").textContent = character.age;
    $("character-inspector-hometown").textContent = character.hometown;
    $("character-inspector-occupation").textContent = character.occupation;
    $("character-inspector-style").textContent = character.bowlingStyle;
    $("character-inspector-ball").textContent = character.favoriteBall;
    $("character-inspector-personality").textContent = character.personality;
    $("character-inspector-bio").textContent = character.bio;
    renderSkinOptions();
  }

  function showAdjacent(direction) {
    slug = catalog.getAdjacentCharacterSlug(slug, direction);
    previewSkinId = assets.storedSkinId(slug);
    render();
  }

  function open(nextSlug, focusTarget = document.activeElement) {
    slug = assets.bowlerBySlug(nextSlug).slug;
    previewSkinId = assets.storedSkinId(slug);
    returnFocus = focusTarget instanceof HTMLElement ? focusTarget : null;
    render();
    const dialog = $("character-inspector-dialog");
    if (!dialog.open) dialog.showModal();
    $("character-inspector-close").focus();
    audio.play("popup");
  }

  function close() {
    const dialog = $("character-inspector-dialog");
    if (dialog.open) dialog.close();
  }

  function bind() {
    const dialog = $("character-inspector-dialog");
    $("character-inspector-close").addEventListener("click", close);
    $("character-inspector-previous").addEventListener("click", () => showAdjacent(-1));
    $("character-inspector-next").addEventListener("click", () => showAdjacent(1));
    dialog.addEventListener("close", () => {
      returnFocus?.focus?.();
      returnFocus = null;
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      showAdjacent(event.key === "ArrowLeft" ? -1 : 1);
    });
  }

  return { open, close, bind };
}
