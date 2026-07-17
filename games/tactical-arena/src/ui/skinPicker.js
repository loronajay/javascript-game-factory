import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";
import { getUnitSkins, normalizeSkinSlug, skinLabel } from "./skinModel.js";
import { el } from "./domHelpers.js";

let host = null;

function ensureHost() {
  if (host?.parentElement === document.body) return host;
  host = document.createElement("div");
  host.className = "ref-modal skin-picker-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function openSkinPicker({ type, initial = null, accent = null } = {}) {
  const overlay = ensureHost();
  const def = UNIT_TYPES[type];
  let selected = normalizeSkinSlug(type, initial);
  let viewing = selected;

  return new Promise((resolve) => {
    overlay.replaceChildren();
    if (accent) overlay.style.setProperty("--team", accent);
    else overlay.style.removeProperty("--team");

    const card = el("div", "ref-card skin-picker-card");
    overlay.appendChild(card);

    const head = el("header", "ref-head");
    const titleRow = el("div", "ref-head-title");
    titleRow.appendChild(el("h2", "", `${def?.name ?? "Unit"} Skin`));
    const closeBtn = el("button", "ref-close", "X");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    titleRow.appendChild(closeBtn);
    head.appendChild(titleRow);
    card.appendChild(head);

    const body = el("div", "skin-picker-body");
    card.appendChild(body);

    const foot = el("div", "roster-foot skin-picker-foot");
    const cancelBtn = el("button", "menu-btn ghost", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.dataset.skinAction = "cancel";
    cancelBtn.style.marginRight = "auto";
    const useBtn = el("button", "primary menu-btn", "Use Skin");
    useBtn.type = "button";
    useBtn.dataset.skinAction = "use";
    foot.append(cancelBtn, useBtn);
    card.appendChild(foot);

    function paint() {
      const previousGrid = [...body.children].find((node) => node.className?.split(/\s+/).includes("skin-picker-grid"));
      const previousGridScrollTop = previousGrid?.scrollTop ?? 0;
      body.replaceChildren();

      const viewingChoice = choicesFor(type).find((choice) => (choice.slug ?? null) === viewing);
      const viewingLocked = !!viewingChoice && !viewingChoice.unlocked;
      const isSelected = viewing === selected;

      const preview = el("section", "skin-picker-preview");
      preview.appendChild(createPortrait(type, {
        variant: "is-skin-preview",
        eager: true,
        skin: viewing,
        alt: `${def?.name ?? type} ${skinLabel(type, viewing)} skin`
      }));

      const copy = el("div", "skin-picker-copy");
      copy.appendChild(el("span", "skin-picker-kicker", def?.name ?? type ?? "Unit"));
      copy.appendChild(el("h3", "skin-picker-title", skinLabel(type, viewing)));
      copy.appendChild(el(
        "span",
        "skin-picker-status",
        viewingLocked ? "Locked — not yet unlocked" : isSelected ? "Currently selected" : "Previewing"
      ));
      const selectBtn = el("button", "menu-btn skin-picker-select-btn", isSelected ? "✓ Selected" : "Select This Skin");
      selectBtn.type = "button";
      selectBtn.disabled = viewingLocked || isSelected;
      selectBtn.addEventListener("click", () => {
        selected = viewing;
        paint();
      });
      copy.appendChild(selectBtn);
      preview.appendChild(copy);

      const grid = el("div", "skin-picker-grid");
      for (const choice of choicesFor(type)) {
        const slug = choice.slug ?? null;
        const selectedChoice = slug === selected;
        const viewingThisChoice = slug === viewing;
        const locked = !choice.unlocked;
        const classes = ["skin-picker-choice"];
        if (selectedChoice) classes.push("is-selected");
        if (viewingThisChoice) classes.push("is-viewing");
        if (locked) classes.push("is-locked");
        const btn = el("button", classes.join(" "));
        btn.type = "button";
        btn.dataset.skin = choice.slug ?? "";
        btn.setAttribute("aria-label", `View ${choice.name} skin`);
        btn.appendChild(createPortrait(type, { variant: "is-skin-choice", eager: true, skin: choice.slug }));
        const name = el("span", "skin-picker-choice-name", choice.name);
        const status = el("span", "skin-picker-choice-status", locked ? "Locked" : selectedChoice ? "Selected" : "Unlocked");
        btn.append(name, status);
        btn.addEventListener("click", () => {
          // Previewing a locked skin must NOT run it through normalizeSkinSlug — that
          // clamps locked slugs back to null, which would make locked thumbnails
          // un-previewable (the whole point of the view/select split).
          viewing = choice.slug ?? null;
          paint();
        });
        btn.addEventListener("dblclick", () => {
          if (locked) return;
          viewing = normalizeSkinSlug(type, choice.slug);
          selected = viewing;
          paint();
        });
        grid.appendChild(btn);
      }

      body.append(preview, grid);
      grid.scrollTop = previousGridScrollTop;
      useBtn.textContent = selected ? "Use Skin" : "Use Classic";
    }

    function close(result) {
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey, true);
      overlay.replaceChildren();
      resolve(result);
    }

    function onOverlay(event) {
      if (event.target === overlay) close(null);
    }

    function onKey(event) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      close(null);
    }

    closeBtn.addEventListener("click", () => close(null));
    cancelBtn.addEventListener("click", () => close(null));
    useBtn.addEventListener("click", () => close({ skin: selected }));
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey, true);

    paint();
    overlay.hidden = false;
  });
}

function choicesFor(type) {
  return [
    { slug: null, name: "Classic", unlocked: true },
    ...getUnitSkins(type)
  ];
}
