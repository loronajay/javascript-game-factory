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
import { createPortrait } from "./portraits.js";
import { SLOT_LAYOUT, normalizeSquadLoadout, availableTypesForSlot, groupedUnitTypes } from "./squadModel.js";
import { getUnitSkins, normalizeSkinSlug, skinLabel } from "./skinModel.js";

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
  const loadout = normalizeSquadLoadout(initial);
  const squad = [...loadout.composition];
  const skins = [...loadout.skins];
  const selectedSkinByType = new Map(squad.map((type, index) => [type, skins[index] ?? null]));
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
      `<p class="roster-sub">Pick a slot, click a unit to read its card, then press <b>Place</b> beside its name. Double-click a unit to place it instantly.</p>`;
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

    // Footer — Cancel · Done. The contextual Place button now lives in the
    // detail pane, right beside the unit the player is reading.
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
    footer.append(cancelBtn, doneBtn);
    card.appendChild(footer);
    assignBtn.addEventListener("click", () => { if (!assignBtn.disabled) assign(focusedType); });

    // ── Renders ──────────────────────────────────────────────────────────────
    function paintTray() {
      tray.replaceChildren();
      for (const slot of SLOT_LAYOUT) {
        const def = UNIT_TYPES[squad[slot.index]];
        const btn = el("button", `roster-slot row-${slot.row}${slot.index === activeSlot ? " is-active" : ""}`);
        btn.type = "button";
        const tag = el("span", "roster-slot-tag");
        tag.textContent = `${slot.index + 1} · ${slot.row === "front" ? "Front" : "Back"}`;
        const name = el("span", "roster-slot-name");
        name.textContent = def.name;
        btn.append(tag, createPortrait(squad[slot.index], { variant: "is-slot", eager: true, skin: skins[slot.index] }), name);
        btn.addEventListener("click", () => {
          activeSlot = slot.index;
          focusedType = squad[slot.index];
          selectedSkinByType.set(focusedType, skins[slot.index] ?? null);
          paintAll();
        });
        tray.appendChild(btn);
      }
    }

    function paintGrid() {
      const available = new Set(availableTypesForSlot(squad, activeSlot, allowDuplicates));
      grid.replaceChildren();
      for (const group of groupedUnitTypes()) {
        const section = el("section", "roster-class");
        section.dataset.classType = group.id;
        const heading = el("h3", "roster-class-title");
        heading.textContent = group.label;
        const units = el("div", "roster-class-units");
        for (const type of group.types) {
          const def = UNIT_TYPES[type];
          const disabled = !available.has(type);
          const unitBtn = el("button", `roster-unit${type === focusedType ? " is-focused" : ""}${disabled ? " is-disabled" : ""}`);
          unitBtn.type = "button";
          unitBtn.dataset.type = type;
          unitBtn.append(createPortrait(type, { variant: "is-card", eager: true, skin: selectedSkinForType(type) }));
          const name = el("span", "roster-unit-name");
          name.textContent = def.name;
          unitBtn.append(name);
          if (disabled) {
            const flag = el("span", "roster-unit-flag");
            flag.textContent = "In squad";
            unitBtn.append(flag);
          }
          // Click inspects — the detail card stays locked to this unit (no hover
          // fragility, scroll it freely). Double-click is the power-user fast-slot.
          // Disabled (already-in-squad) units stay inspectable; only assign is blocked.
          unitBtn.addEventListener("click", () => { focusedType = type; paintDetail(); flagFocus(); });
          unitBtn.addEventListener("dblclick", () => { if (!disabled) assign(type); });
          units.appendChild(unitBtn);
        }
        section.append(heading, units);
        grid.appendChild(section);
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
      // Action bar — the unit's name + the contextual Place button, pinned above
      // the scrolling card. Read the unit, press Place right where you read it;
      // no trip down to the footer.
      const bar = el("div", "roster-detail-bar");
      const name = document.createElement("h3");
      name.className = "roster-detail-name";
      name.innerHTML = `<span class="ref-glyph">${def.glyph}</span>${escapeHtml(def.name)}`;
      bar.append(name, assignBtn);

      // Scrolling card: large painted portrait LEFT, stat grid + passives + ARTS
      // RIGHT — players read the figure they're drafting alongside its data. The
      // portrait self-frames to a consistent scale (see portraits.js).
      const scroll = el("div", "roster-detail-scroll");
      const split = el("div", "roster-detail-split");
      const portrait = createPortrait(focusedType, { variant: "is-hero", eager: true, skin: selectedSkinForType(focusedType) });
      portrait.style.setProperty("--team", accent || "var(--p1)");
      const info = el("div", "roster-detail-info");
      info.innerHTML = unitDetailHtml(def);
      info.prepend(createSkinShelf(focusedType));
      split.append(portrait, info);
      scroll.append(split);
      detail.replaceChildren(bar, scroll);
      paintAssign();
    }

    // The contextual Place button reflects the focused unit + the active slot, and
    // disables itself when that unit can't go there (already in squad, draft rule).
    function paintAssign() {
      const available = new Set(availableTypesForSlot(squad, activeSlot, allowDuplicates));
      const activeSlotDef = SLOT_LAYOUT.find((s) => s.index === activeSlot) ?? SLOT_LAYOUT[0];
      const rowLabel = activeSlotDef.row === "front" ? "Front" : "Back";
      const canAssign = available.has(focusedType);
      assignBtn.disabled = !canAssign;
      assignBtn.textContent = canAssign ? `▸ Place in Slot ${activeSlot + 1} · ${rowLabel}` : "Already in squad";
    }

    function paintAll() { paintTray(); paintGrid(); paintDetail(); }

    // Place `type` in the active slot, then advance to the next slot so a player
    // can tap straight down the roster.
    function assign(type) {
      squad[activeSlot] = type;
      skins[activeSlot] = selectedSkinForType(type);
      focusedType = type;
      activeSlot = (activeSlot + 1) % squad.length;
      paintAll();
    }

    function selectedSkinForType(type) {
      return normalizeSkinSlug(type, selectedSkinByType.get(type));
    }

    function createSkinShelf(type) {
      const shelf = el("div", "skin-shelf");
      const title = el("div", "skin-shelf-title");
      title.textContent = "Skins";
      const options = el("div", "skin-options");
      const current = selectedSkinForType(type);
      const choices = [
        { slug: null, name: "Classic", unlocked: true },
        ...getUnitSkins(type)
      ];

      for (const choice of choices) {
        const selected = (choice.slug ?? null) === current;
        const locked = !choice.unlocked;
        const btn = el("button", `skin-option${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}`);
        btn.type = "button";
        btn.dataset.skin = choice.slug ?? "";
        btn.appendChild(createPortrait(type, { variant: "is-skin", eager: true, skin: choice.slug }));
        const name = el("span", "skin-option-name");
        name.textContent = choice.name ?? skinLabel(type, choice.slug);
        const status = el("span", "skin-option-status");
        status.textContent = locked ? "Locked" : "Unlocked";
        btn.append(name, status);
        btn.addEventListener("click", () => {
          if (locked) return;
          selectedSkinByType.set(type, choice.slug ?? null);
          if (squad[activeSlot] === type) skins[activeSlot] = selectedSkinForType(type);
          paintAll();
        });
        options.appendChild(btn);
      }

      shelf.append(title, options);
      return shelf;
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
    function finish() { close({ composition: [...squad], skins: [...skins] }); }
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
