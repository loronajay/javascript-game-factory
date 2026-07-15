import { UNIT_TYPES } from "../core/unitCatalog.js";
import { groupedUnitTypes } from "./squadModel.js";
import { createPortrait } from "./portraits.js";
import { getUnitSkins } from "./skinModel.js";

let host = null;
let hostDocument = null;

function ensureHost() {
  if (host && hostDocument === document) return host;
  host = document.createElement("div");
  hostDocument = document;
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
  let savedScrollTop = 0;
  renderList();
  card.appendChild(body);

  function renderList() {
    body.replaceChildren();
    for (const group of groupedUnitTypes(Object.keys(UNIT_TYPES))) {
      const section = el("section", "skin-gallery-section");
      section.appendChild(el("h3", "skin-gallery-title", group.label));
      for (const type of group.types) {
        const def = UNIT_TYPES[type];
        const skins = getUnitSkins(type);
        if (!skins.length) continue;
        const unitSection = el("section", "skin-gallery-unit-section");
        unitSection.dataset.type = type;
        const unitHead = el("header", "skin-gallery-unit-head");
        unitHead.append(
          createPortrait(type, { variant: "is-skin-unit", eager: true }),
          el("h4", "skin-gallery-unit-title", def.name),
          el("span", "skin-gallery-unit-count", `${skins.length} skins`),
        );
        const grid = el("div", "skin-gallery-grid");
        for (const skin of skins) {
          const item = el("button", `skin-gallery-item${skin.unlocked ? "" : " is-locked"}`);
          item.type = "button";
          item.dataset.type = type;
          item.dataset.skin = skin.slug;
          item.setAttribute("aria-label", `View ${skin.name} skin for ${def.name}`);
          item.appendChild(createPortrait(type, { variant: "is-skin-card", eager: true, skin: skin.slug }));
          const copy = el("div", "skin-gallery-copy");
          copy.appendChild(el("b", "skin-gallery-unit", def.name));
          copy.appendChild(el("span", "skin-gallery-skin", skin.name));
          copy.appendChild(el("span", "skin-gallery-status", skin.unlocked ? "Unlocked" : "Locked"));
          item.appendChild(copy);
          item.addEventListener("click", () => {
            savedScrollTop = body.scrollTop;
            renderDetail(type, skin);
          });
          grid.appendChild(item);
        }
        unitSection.append(unitHead, grid);
        section.appendChild(unitSection);
      }
      body.appendChild(section);
    }
    body.scrollTop = savedScrollTop;
  }

  function renderDetail(type, skin) {
    const def = UNIT_TYPES[type];
    const detail = el("section", "skin-gallery-detail");
    const closeDetail = el("button", "skin-gallery-detail-close", "X");
    closeDetail.type = "button";
    closeDetail.setAttribute("aria-label", "Return to skins list");
    closeDetail.addEventListener("click", renderList);
    detail.appendChild(closeDetail);

    detail.appendChild(createPortrait(type, {
      variant: "is-skin-detail",
      eager: true,
      skin: skin.slug,
      alt: `${def.name} ${skin.name} skin`
    }));

    const copy = el("div", "skin-gallery-detail-copy");
    copy.appendChild(el("span", "skin-gallery-detail-kicker", def.name));
    copy.appendChild(el("h3", "skin-gallery-detail-title", skin.name));
    copy.appendChild(el("span", "skin-gallery-detail-status", skin.unlocked ? "Unlocked" : "Locked"));
    detail.appendChild(copy);

    body.replaceChildren(detail);
  }

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
