// A one-time skin-reward chooser (Tutorial's Juggernaut-unlock grant, Campaign's
// Wandering Party / Has-Been Heroes packs) that shares skinPicker.js's preview/select
// split: clicking a thumbnail only PREVIEWS it, a dedicated button commits the pick.
// Unlike skinPicker.js this isn't scoped to one unit type — each choice carries its own
// {type, slug}, since a reward list can span several roster units. Reuses the same
// .skin-picker-* CSS (verified generic, no per-type styling) so it matches the equip picker.
import { createPortrait } from "./portraits.js";
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

// choices: [{ value, type, slug, label, sub? }]. Resolves with a choice's `value`,
// or null if cancelled (Escape / backdrop / Cancel) — no pick is ever forced.
export function openRewardSkinPicker({
  title = "",
  subtitle = "",
  accent = null,
  cancelLabel = "Cancel",
  selectLabel = "Select This Skin",
  itemKind = "skin",
  choices = [],
} = {}) {
  const overlay = ensureHost();
  let viewingIndex = choices.length > 0 ? 0 : -1;

  return new Promise((resolve) => {
    overlay.replaceChildren();
    if (accent) overlay.style.setProperty("--team", accent);
    else overlay.style.removeProperty("--team");

    const card = el("div", "ref-card skin-picker-card");
    overlay.appendChild(card);

    const head = el("header", "ref-head");
    const titleRow = el("div", "ref-head-title");
    titleRow.appendChild(el("h2", "", title));
    const closeBtn = el("button", "ref-close", "X");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    titleRow.appendChild(closeBtn);
    head.appendChild(titleRow);
    if (subtitle) head.appendChild(el("p", "choice-sub", subtitle));
    card.appendChild(head);

    const body = el("div", "skin-picker-body");
    card.appendChild(body);

    const foot = el("div", "roster-foot skin-picker-foot");
    const cancelBtn = el("button", "menu-btn ghost", cancelLabel);
    cancelBtn.type = "button";
    cancelBtn.style.marginRight = "auto";
    foot.append(cancelBtn);
    card.appendChild(foot);

    function paint() {
      body.replaceChildren();
      const viewing = choices[viewingIndex] ?? null;

      const preview = el("section", "skin-picker-preview");
      preview.appendChild(createPortrait(viewing?.type ?? null, {
        variant: "is-skin-preview",
        eager: true,
        skin: viewing?.slug ?? null,
        alt: viewing?.label ?? "Reward skin",
      }));

      const copy = el("div", "skin-picker-copy");
      copy.appendChild(el("span", "skin-picker-kicker", viewing?.sub ?? ""));
      copy.appendChild(el("h3", "skin-picker-title", viewing?.label ?? ""));
      copy.appendChild(el("span", "skin-picker-status", "Previewing"));
      const selectBtn = el("button", "menu-btn skin-picker-select-btn", selectLabel);
      selectBtn.type = "button";
      selectBtn.disabled = !viewing;
      selectBtn.addEventListener("click", () => close(viewing?.value ?? null));
      copy.appendChild(selectBtn);
      preview.appendChild(copy);

      const grid = el("div", "skin-picker-grid");
      choices.forEach((choice, index) => {
        const viewingThisChoice = index === viewingIndex;
        const classes = ["skin-picker-choice"];
        if (viewingThisChoice) classes.push("is-viewing");
        const btn = el("button", classes.join(" "));
        btn.type = "button";
        btn.setAttribute("aria-label", `View ${choice.label} ${itemKind}`);
        btn.appendChild(createPortrait(choice.type, { variant: "is-skin-choice", eager: true, skin: choice.slug ?? null }));
        const name = el("span", "skin-picker-choice-name", choice.label);
        const status = el("span", "skin-picker-choice-status", choice.sub ?? "");
        btn.append(name, status);
        btn.addEventListener("click", () => {
          viewingIndex = index;
          paint();
        });
        btn.addEventListener("dblclick", () => close(choice.value));
        grid.appendChild(btn);
      });

      body.append(preview, grid);
    }

    function close(result) {
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey, true);
      overlay.replaceChildren();
      resolve(result ?? null);
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
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey, true);

    paint();
    overlay.hidden = false;
  });
}
