// Roster picker — a pop-up squad builder. Replaces the old cycle-through-a-cell
// picker: players see the whole roster, read each unit's stats/passives/ARTS (the
// same reference card as the in-match Codex), then fill their four squad slots.
// The detail pane is the onboarding seam — new players learn the engine by
// browsing what they pick.
//
// One async entry point, `openRosterPicker(...) => Promise<string[]|null>`, builds
// ONE squad. That maps cleanly onto online later: hot-seat opens it per player,
// blind pick opens it per player (hidden), and a future draft controller can drive
// the same modal by re-opening it on each pick step. `allowDuplicates` already
// carries the draft/ranked uniqueness rule (false greys out used units).
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { unitDetailHtml } from "./codex.js";
import { createUnitFigurine } from "./unitRenderer.js";
import { svgElement } from "./svgHelpers.js";
import { UNIT_TYPE_KEYS, SLOT_LAYOUT, normalizeSquad, availableTypesForSlot } from "./squadModel.js";

const SVG_NS = "http://www.w3.org/2000/svg";

let host = null; // lazily-created singleton overlay, reused across opens

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal roster-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

// Open the picker over `initial`, focused on `startSlot`. Resolves with the new
// squad on Done, or null if cancelled (Escape / overlay / ✕ / Cancel).
export function openRosterPicker({ title = "Squad", accent = null, initial = null, allowDuplicates = true, startSlot = 0 } = {}) {
  const overlay = ensureHost();
  const squad = normalizeSquad(initial);
  let activeSlot = clampSlot(startSlot);
  let focusedType = squad[activeSlot];

  return new Promise((resolve) => {
    overlay.replaceChildren();
    if (accent) overlay.style.setProperty("--team", accent);
    else overlay.style.removeProperty("--team");

    const card = el("div", "ref-card roster-card");
    overlay.appendChild(card);

    // Header
    const head = el("header", "ref-head roster-head");
    head.innerHTML =
      `<div class="ref-head-title"><h2>${escapeHtml(title)}</h2>` +
      `<button class="ref-close" type="button" data-roster="close" aria-label="Close">✕</button></div>` +
      `<p class="roster-sub">Click a unit to inspect it — its card stays put while you read. Then press Place (or double-click) to slot it.</p>`;
    card.appendChild(head);

    // Squad tray (the four slots being filled)
    const tray = el("div", "roster-tray");
    card.appendChild(tray);

    // Body: roster grid (left) + detail pane (right)
    const body = el("div", "roster-body");
    const grid = el("div", "roster-grid");
    const detail = el("div", "roster-detail codex-detail");
    body.append(grid, detail);
    card.appendChild(body);

    // Footer — Cancel · contextual Place button (always visible, never needs a
    // scroll to reach) · Done.
    const footer = el("div", "roster-foot");
    const cancelBtn = el("button", "menu-btn ghost");
    cancelBtn.type = "button";
    cancelBtn.dataset.roster = "cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.marginRight = "auto";
    const assignBtn = el("button", "menu-btn roster-assign");
    assignBtn.type = "button";
    const doneBtn = el("button", "primary menu-btn");
    doneBtn.type = "button";
    doneBtn.dataset.roster = "done";
    doneBtn.textContent = "Done";
    footer.append(cancelBtn, assignBtn, doneBtn);
    card.appendChild(footer);
    assignBtn.addEventListener("click", () => { if (!assignBtn.disabled) assign(focusedType); });

    // ── Renders ──────────────────────────────────────────────────────────────
    function paintTray() {
      tray.replaceChildren();
      for (const slot of SLOT_LAYOUT) {
        const def = UNIT_TYPES[squad[slot.index]];
        const btn = el("button", `roster-slot row-${slot.row}${slot.index === activeSlot ? " is-active" : ""}`);
        btn.type = "button";
        btn.innerHTML =
          `<span class="roster-slot-tag">${slot.row === "front" ? "Front" : "Back"}</span>` +
          `<span class="roster-slot-glyph">${def.glyph}</span>` +
          `<span class="roster-slot-name">${escapeHtml(def.name)}</span>`;
        btn.addEventListener("click", () => { activeSlot = slot.index; focusedType = squad[slot.index]; paintAll(); });
        tray.appendChild(btn);
      }
    }

    function paintGrid() {
      const available = new Set(availableTypesForSlot(squad, activeSlot, allowDuplicates));
      grid.replaceChildren();
      for (const type of UNIT_TYPE_KEYS) {
        const def = UNIT_TYPES[type];
        const disabled = !available.has(type);
        const unitBtn = el("button", `roster-unit${type === focusedType ? " is-focused" : ""}${disabled ? " is-disabled" : ""}`);
        unitBtn.type = "button";
        unitBtn.dataset.type = type;
        unitBtn.innerHTML =
          `<span class="roster-unit-glyph">${def.glyph}</span>` +
          `<span class="roster-unit-name">${escapeHtml(def.name)}</span>` +
          (disabled ? `<span class="roster-unit-flag">In squad</span>` : "");
        // Click inspects — the detail card stays locked to this unit (no hover
        // fragility, scroll it freely). Double-click is the power-user fast-slot.
        // Disabled (already-in-squad) units stay inspectable; only assign is blocked.
        unitBtn.addEventListener("click", () => { focusedType = type; paintDetail(); flagFocus(); paintFooter(); });
        unitBtn.addEventListener("dblclick", () => { if (!disabled) assign(type); });
        grid.appendChild(unitBtn);
      }
    }

    // Cheap focus restyle without a full grid rebuild (pointerenter path).
    function flagFocus() {
      for (const node of grid.querySelectorAll(".roster-unit")) {
        node.classList.toggle("is-focused", node.dataset.type === focusedType);
      }
    }

    function paintDetail() {
      const def = UNIT_TYPES[focusedType];
      const section = el("section", "ref-unit codex-unit-detail");
      // Hero band: the actual carved figurine (team-tinted) beside the name, so
      // players see the piece they're drafting — not just a text block.
      const hero = el("div", "roster-detail-hero");
      hero.append(figureStage(focusedType, accent));
      const name = document.createElement("h3");
      name.innerHTML = `<span class="ref-glyph">${def.glyph}</span>${escapeHtml(def.name)}`;
      hero.append(name);
      section.append(hero);
      const bodyHtml = document.createElement("div");
      bodyHtml.innerHTML = unitDetailHtml(def);
      section.append(bodyHtml);
      detail.replaceChildren(section);
    }

    // The contextual Place button reflects the focused unit + the active slot, and
    // disables itself when that unit can't go there (already in squad, draft rule).
    function paintFooter() {
      const def = UNIT_TYPES[focusedType];
      const available = new Set(availableTypesForSlot(squad, activeSlot, allowDuplicates));
      const activeSlotDef = SLOT_LAYOUT.find((s) => s.index === activeSlot) ?? SLOT_LAYOUT[0];
      const rowLabel = activeSlotDef.row === "front" ? "Front" : "Back";
      const canAssign = available.has(focusedType);
      assignBtn.disabled = !canAssign;
      assignBtn.textContent = canAssign ? `▸ Place ${def.name} · ${rowLabel}` : `${def.name} already in squad`;
    }

    function paintAll() { paintTray(); paintGrid(); paintDetail(); paintFooter(); }

    // Place `type` in the active slot, then advance to the next slot so a player
    // can tap straight down the roster.
    function assign(type) {
      squad[activeSlot] = type;
      focusedType = type;
      activeSlot = (activeSlot + 1) % squad.length;
      paintAll();
    }

    paintAll();

    // ── Lifecycle ────────────────────────────────────────────────────────────
    function close(result) {
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey, true);
      overlay.replaceChildren();
      resolve(result);
    }
    function finish() { close([...squad]); }
    function cancel() { close(null); }

    function onOverlay(event) { if (event.target === overlay) cancel(); }
    function onKey(event) {
      if (event.key === "Escape") { event.stopPropagation(); cancel(); }
    }

    card.addEventListener("click", (event) => {
      const action = event.target.closest("[data-roster]")?.dataset.roster;
      if (action === "done") finish();
      else if (action === "cancel" || action === "close") cancel();
    });
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey, true);

    overlay.hidden = false;
  });
}

// A standing-figurine portrait. Reuses the board's carved-miniature builder; the
// `.unit` wrapper scopes the shared `.fig-*` material CSS and `--team` tints the
// cloak/glow to the picking player's colour. Figure space puts the feet at (0,0)
// and the piece rises into -y, so the viewBox frames the body with a small plinth.
function figureStage(type, accent) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "roster-figure-svg");
  svg.setAttribute("viewBox", "-30 -64 60 80");
  svg.setAttribute("aria-hidden", "true");
  const stage = svgElement("g", { class: "unit", style: `--team:${accent || "var(--p1)"}` });
  stage.append(
    svgElement("ellipse", { class: "roster-plinth-side", cx: 0, cy: 11, rx: 19, ry: 6 }),
    svgElement("ellipse", { class: "roster-plinth-top", cx: 0, cy: 8, rx: 19, ry: 6 }),
    createUnitFigurine(type)
  );
  svg.append(stage);
  return svg;
}

function clampSlot(index) {
  const n = Number(index) || 0;
  return Math.min(Math.max(0, n), SLOT_LAYOUT.length - 1);
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
