// Nickname gallery — the ONE place a player sets their personal per-unit-type
// names ("Swordsman" -> "Leo"). Every game mode (hot-seat, vs CPU, Campaign,
// Tutorial, online Quick Match, online Draft) then just reads the saved
// preference automatically — there is deliberately no rename control anywhere
// else (see nicknameModel.js). Structurally mirrors skinGallery.js.
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { groupedUnitTypes } from "./squadModel.js";
import { createPortrait } from "./portraits.js";
import { getNicknamePref, saveNicknamePref, NICKNAME_MAX_LENGTH } from "./nicknameModel.js";
import { getSkinPref, saveSkinPref, skinLabel } from "./skinModel.js";
import { openSkinPicker } from "./skinPicker.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal nickname-gallery-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function openNicknameGallery() {
  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card nickname-gallery-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Nicknames"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  head.appendChild(el("p", "nickname-gallery-sub", "Give your units a personal name. It shows in place of the unit type everywhere you play."));
  card.appendChild(head);

  const body = el("div", "nickname-gallery-body");
  card.appendChild(body);
  renderList();

  function renderList() {
    body.replaceChildren();
    for (const group of groupedUnitTypes(Object.keys(UNIT_TYPES))) {
      const section = el("section", "nickname-gallery-section");
      section.appendChild(el("h3", "nickname-gallery-title", group.label));
      const grid = el("div", "nickname-gallery-grid");
      for (const type of group.types) {
        const def = UNIT_TYPES[type];
        grid.appendChild(renderRow(type, def));
      }
      section.appendChild(grid);
      body.appendChild(section);
    }
  }

  function renderRow(type, def) {
    const row = el("div", "nickname-gallery-row");
    const portraitSlot = el("div", "nickname-gallery-portrait");
    row.appendChild(portraitSlot);

    const copy = el("div", "nickname-gallery-copy");
    copy.appendChild(el("b", "nickname-gallery-unit", def.name));

    const skinBar = el("div", "nickname-gallery-skinbar");
    const skinName = el("span", "nickname-gallery-skinname");
    const skinBtn = el("button", "nickname-gallery-skinbtn", "Equip Skin");
    skinBtn.type = "button";
    skinBtn.setAttribute("aria-label", `Equip ${def.name} skin`);
    skinBtn.addEventListener("click", async () => {
      const result = await openSkinPicker({ type, initial: getSkinPref(type) });
      if (!result) return;
      saveSkinPref(type, result.skin);
      refreshSkin();
    });
    skinBar.append(skinName, skinBtn);
    copy.appendChild(skinBar);

    const field = el("div", "nickname-gallery-field");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "nickname-gallery-input";
    input.maxLength = NICKNAME_MAX_LENGTH;
    input.placeholder = def.name;
    input.value = getNicknamePref(type) ?? "";
    input.setAttribute("aria-label", `Nickname for ${def.name}`);

    const commit = () => saveNicknamePref(type, input.value);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { commit(); input.blur(); }
    });

    const clearBtn = el("button", "nickname-gallery-clear", "Clear");
    clearBtn.type = "button";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      commit();
    });

    field.append(input, clearBtn);
    copy.appendChild(field);
    row.appendChild(copy);
    refreshSkin();
    return row;

    function refreshSkin() {
      const skin = getSkinPref(type);
      portraitSlot.replaceChildren(createPortrait(type, { variant: "is-chip", eager: true, skin }));
      skinName.textContent = skinLabel(type, skin);
    }
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
