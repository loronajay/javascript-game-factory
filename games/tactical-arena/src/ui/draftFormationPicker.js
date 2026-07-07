import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal draft-formation-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

const SLOT_LABELS = ["Front 1", "Front 2", "Corner", "Back"];

export function openDraftFormationPicker({ title = "Arrange Formation", composition = [], skins = [], order = null, accent = null } = {}) {
  const overlay = ensureHost();
  let formationOrder = Array.isArray(order) && order.length === composition.length
    ? [...order]
    : composition.map((_, index) => index);
  let selectedSlot = null;

  return new Promise((resolve) => {
    overlay.replaceChildren();
    if (accent) overlay.style.setProperty("--team", accent);
    else overlay.style.removeProperty("--team");

    const card = el("div", "ref-card draft-formation-card");
    const head = el("header", "ref-head roster-head");
    head.innerHTML =
      `<div class="ref-head-title"><h2>${escapeHtml(title)}</h2>` +
      `<button class="ref-close" type="button" data-formation="cancel" aria-label="Close">X</button></div>` +
      `<p class="roster-sub">Swap your drafted pieces into the four starting slots, then lock formation.</p>`;

    const grid = el("div", "draft-formation-grid");
    const foot = el("div", "roster-foot");
    const resetBtn = el("button", "menu-btn ghost");
    resetBtn.type = "button";
    resetBtn.textContent = "Pick Order";
    resetBtn.dataset.formation = "reset";
    resetBtn.style.marginRight = "auto";
    const cancelBtn = el("button", "menu-btn ghost");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.dataset.formation = "cancel";
    const lockBtn = el("button", "primary menu-btn");
    lockBtn.type = "button";
    lockBtn.textContent = "Lock Formation";
    lockBtn.dataset.formation = "lock";
    foot.append(resetBtn, cancelBtn, lockBtn);
    card.append(head, grid, foot);
    overlay.appendChild(card);

    function paint() {
      grid.replaceChildren();
      for (let slot = 0; slot < 4; slot += 1) {
        const pickIndex = formationOrder[slot];
        const type = composition[pickIndex];
        const skin = skins[pickIndex] ?? null;
        const def = UNIT_TYPES[type];
        const btn = el("button", `draft-formation-slot${selectedSlot === slot ? " is-selected" : ""}`);
        btn.type = "button";
        btn.dataset.slot = String(slot);
        const tag = el("span", "draft-formation-tag");
        tag.textContent = SLOT_LABELS[slot] ?? `Slot ${slot + 1}`;
        const name = el("span", "draft-formation-name");
        name.textContent = def?.name ?? type ?? "Empty";
        if (type) btn.append(createPortrait(type, { variant: "is-slot", eager: true, skin }));
        btn.append(tag, name);
        btn.addEventListener("click", () => chooseSlot(slot));
        grid.appendChild(btn);
      }
    }

    function chooseSlot(slot) {
      if (selectedSlot === null) {
        selectedSlot = slot;
      } else if (selectedSlot === slot) {
        selectedSlot = null;
      } else {
        [formationOrder[selectedSlot], formationOrder[slot]] = [formationOrder[slot], formationOrder[selectedSlot]];
        selectedSlot = null;
      }
      paint();
    }

    function close(result) {
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey, true);
      overlay.replaceChildren();
      resolve(result);
    }
    function onOverlay(event) { if (event.target === overlay) close(null); }
    function onKey(event) { if (event.key === "Escape") { event.stopPropagation(); close(null); } }

    card.addEventListener("click", (event) => {
      const action = event.target.closest("[data-formation]")?.dataset.formation;
      if (action === "cancel") close(null);
      if (action === "reset") { formationOrder = composition.map((_, index) => index); selectedSlot = null; paint(); }
      if (action === "lock") close({ order: [...formationOrder] });
    });
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey, true);

    paint();
    overlay.hidden = false;
  });
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
