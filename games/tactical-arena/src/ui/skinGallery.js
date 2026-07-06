import { UNIT_TYPES } from "../core/unitCatalog.js";
import { groupedUnitTypes } from "./squadModel.js";
import { createPortrait } from "./portraits.js";
import { getUnitSkins } from "./skinModel.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal skin-gallery-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function openSkinGallery() {
  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card skin-gallery-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Skins"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  card.appendChild(head);

  const body = el("div", "skin-gallery-body");
  for (const group of groupedUnitTypes(Object.keys(UNIT_TYPES))) {
    const section = el("section", "skin-gallery-section");
    section.appendChild(el("h3", "skin-gallery-title", group.label));
    const grid = el("div", "skin-gallery-grid");
    for (const type of group.types) {
      const def = UNIT_TYPES[type];
      for (const skin of getUnitSkins(type)) {
        const item = el("article", `skin-gallery-item${skin.unlocked ? "" : " is-locked"}`);
        item.appendChild(createPortrait(type, { variant: "is-skin-card", eager: true, skin: skin.slug }));
        const copy = el("div", "skin-gallery-copy");
        copy.appendChild(el("b", "skin-gallery-unit", def.name));
        copy.appendChild(el("span", "skin-gallery-skin", skin.name));
        copy.appendChild(el("span", "skin-gallery-status", skin.unlocked ? "Unlocked" : "Locked"));
        item.appendChild(copy);
        grid.appendChild(item);
      }
    }
    section.appendChild(grid);
    body.appendChild(section);
  }
  card.appendChild(body);

  function close() {
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }
  function onOverlay(event) {
    if (event.target === overlay) close();
  }
  function onKey(event) {
    if (event.key === "Escape") close();
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
}

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
