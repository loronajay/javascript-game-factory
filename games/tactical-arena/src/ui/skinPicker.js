import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createPortrait } from "./portraits.js";
import { getUnitSkins, normalizeSkinSlug, skinLabel } from "./skinModel.js";

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

      const preview = el("section", "skin-picker-preview");
      preview.appendChild(createPortrait(type, {
        variant: "is-skin-preview",
        eager: true,
        skin: selected,
        alt: `${def?.name ?? type} ${skinLabel(type, selected)} skin`
      }));

      const copy = el("div", "skin-picker-copy");
      copy.appendChild(el("span", "skin-picker-kicker", def?.name ?? type ?? "Unit"));
      copy.appendChild(el("h3", "skin-picker-title", skinLabel(type, selected)));
      copy.appendChild(el("span", "skin-picker-status", selected ? "Unlocked skin" : "Classic look"));
      preview.appendChild(copy);

      const grid = el("div", "skin-picker-grid");
      for (const choice of choicesFor(type)) {
        const selectedChoice = (choice.slug ?? null) === selected;
        const locked = !choice.unlocked;
        const btn = el("button", `skin-picker-choice${selectedChoice ? " is-selected" : ""}${locked ? " is-locked" : ""}`);
        btn.type = "button";
        btn.dataset.skin = choice.slug ?? "";
        btn.disabled = locked;
        btn.setAttribute("aria-label", `Select ${choice.name} skin`);
        btn.appendChild(createPortrait(type, { variant: "is-skin-choice", eager: true, skin: choice.slug }));
        const name = el("span", "skin-picker-choice-name", choice.name);
        const status = el("span", "skin-picker-choice-status", locked ? "Locked" : selectedChoice ? "Selected" : "Unlocked");
        btn.append(name, status);
        btn.addEventListener("click", () => {
          selected = normalizeSkinSlug(type, choice.slug);
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

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
