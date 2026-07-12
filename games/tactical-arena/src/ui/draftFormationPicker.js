import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";
import {
  DEPLOYMENT_TILES,
  DEPLOYMENT_ZONE_SIZE,
  deploymentSlotDescriptor,
  deploymentTileLabel,
  normalizeDeploymentPositions
} from "./squadModel.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal draft-formation-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function openDraftFormationPicker({ title = "Arrange Formation", composition = [], skins = [], nicknames = [], order = null, positions: initialPositions = null, accent = null } = {}) {
  const overlay = ensureHost();
  let formationOrder = Array.isArray(order) && order.length === composition.length
    ? [...order]
    : composition.map((_, index) => index);
  let positions = normalizeDeploymentPositions(initialPositions, composition.length).map((position) => ({ ...position }));
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
      `<p class="roster-sub">Swap your drafted pieces and place each one in your deployment zone.</p>`;

    const grid = el("div", "draft-formation-grid");
    const deployment = el("div", "deployment-picker draft-deployment-picker");
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
    card.append(head, grid, deployment, foot);
    overlay.appendChild(card);

    function paint() {
      grid.replaceChildren();
      for (let slot = 0; slot < 4; slot += 1) {
        const pickIndex = formationOrder[slot];
        const type = composition[pickIndex];
        const skin = skins[pickIndex] ?? null;
        const def = UNIT_TYPES[type];
        const descriptor = deploymentSlotDescriptor(slot, positions[slot]);
        const btn = el("button", `draft-formation-slot${selectedSlot === slot ? " is-selected" : ""}`);
        btn.type = "button";
        btn.dataset.slot = String(slot);
        const tag = el("span", "draft-formation-tag");
        tag.textContent = `${slot + 1} · ${descriptor.label}`;
        const name = el("span", "draft-formation-name");
        name.textContent = (type && nicknames[pickIndex]) || def?.name || type || "Empty";
        if (type) btn.append(createPortrait(type, { variant: "is-slot", eager: true, skin }));
        btn.append(tag, name);
        btn.addEventListener("click", () => chooseSlot(slot));
        grid.appendChild(btn);
      }
      paintDeployment();
    }

    function paintDeployment() {
      deployment.replaceChildren();
      for (const tile of DEPLOYMENT_TILES) {
        const occupant = positions.findIndex((position) => position.x === tile.x && position.y === tile.y);
        const rankLabel = deploymentTileLabel(tile);
        const btn = el("button", `deployment-tile row-${rankLabel.toLowerCase()}${occupant >= 0 ? " is-occupied" : ""}${occupant === selectedSlot ? " is-active" : ""}`);
        btn.type = "button";
        btn.style.gridColumn = String(tile.x + 1);
        btn.style.gridRow = String(DEPLOYMENT_ZONE_SIZE - tile.y);
        btn.title = `${rankLabel} deployment tile`;
        btn.setAttribute("aria-label", `${rankLabel} deployment tile`);
        if (occupant >= 0) {
          const pickIndex = formationOrder[occupant];
          const type = composition[pickIndex];
          const marker = el("span", "deployment-marker");
          marker.textContent = String(occupant + 1);
          if (type) btn.append(marker, createPortrait(type, { variant: "is-chip", eager: true, skin: skins[pickIndex] ?? null }));
        }
        btn.addEventListener("click", () => chooseDeploymentTile(tile, occupant));
        deployment.appendChild(btn);
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

    function chooseDeploymentTile(tile, occupant) {
      if (selectedSlot === null) {
        if (occupant >= 0) selectedSlot = occupant;
        paint();
        return;
      }
      if (occupant === selectedSlot) {
        selectedSlot = null;
      } else if (occupant >= 0) {
        [positions[selectedSlot], positions[occupant]] = [positions[occupant], positions[selectedSlot]];
        selectedSlot = null;
      } else {
        positions[selectedSlot] = { x: tile.x, y: tile.y };
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
      if (action === "reset") {
        formationOrder = composition.map((_, index) => index);
        positions = normalizeDeploymentPositions(null, composition.length).map((position) => ({ ...position }));
        selectedSlot = null;
        paint();
      }
      if (action === "lock") close({ order: [...formationOrder], positions: positions.map((position) => ({ ...position })) });
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
