// A tiny promise-based choice pop-up, reused for Father Time's two decisions: Age's
// STR/DEF stat pick and Rewind's fallen-ally pick. It borrows the shared `.ref-modal`
// overlay (same backdrop/close behavior as the roster picker) so it matches the war-
// table styling and the mobile chrome rules already in responsive.css.
//
// One entry point: openChoiceModal(...) => Promise<value|null>. Resolves with a choice's
// `value`, or null if cancelled (Escape / backdrop / Cancel). Pure DOM; no game imports
// beyond the portrait helper so a choice can show a unit thumb (the ally picker).
import { createPortrait } from "./portraits.js";

let host = null; // lazily-created singleton overlay, reused across opens
function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal choice-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

// choices: [{ value, label, sub?, type? }]  — `type` (a unit type) shows a portrait thumb.
export function openChoiceModal({ title = "", subtitle = "", accent = null, choices = [], groups = null, cancelLabel = "Cancel" } = {}) {
  const overlay = ensureHost();
  return new Promise((resolve) => {
    overlay.replaceChildren();
    if (accent) overlay.style.setProperty("--team", accent);
    else overlay.style.removeProperty("--team");

    const card = el("div", "ref-card choice-card");
    overlay.appendChild(card);

    const head = el("header", "choice-head");
    head.appendChild(el("h2", "choice-title", title));
    if (subtitle) head.appendChild(el("p", "choice-sub", subtitle));
    card.appendChild(head);

    const list = el("div", "choice-list");
    card.appendChild(list);

    let settled = false;
    function close(value) {
      if (settled) return;
      settled = true;
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey);
      overlay.replaceChildren();
      resolve(value);
    }
    function onOverlay(event) { if (event.target === overlay) close(null); }
    function onKey(event) { if (event.key === "Escape") close(null); }

    const groupedChoices = Array.isArray(groups)
      ? groups.filter((group) => Array.isArray(group.choices) && group.choices.length > 0)
      : [];
    if (groupedChoices.length > 0) {
      for (const group of groupedChoices) {
        const section = el("section", "choice-group");
        section.dataset.group = group.id ?? "";
        section.appendChild(el("h3", "choice-group-title", group.label ?? "Choices"));
        const groupList = el("div", "choice-group-options");
        for (const choice of group.choices) renderChoice(choice, groupList);
        section.appendChild(groupList);
        list.appendChild(section);
      }
    } else {
      for (const choice of choices) renderChoice(choice, list);
    }

    function renderChoice(choice, parent) {
      const btn = el("button", "choice-option");
      btn.type = "button";
      if (choice.type) {
        btn.classList.add("has-portrait");
        btn.appendChild(createPortrait(choice.type, { variant: "is-chip", eager: true, skin: choice.skin ?? null }));
      }
      const text = el("span", "choice-option-text");
      text.appendChild(el("span", "choice-option-label", choice.label));
      if (choice.sub) text.appendChild(el("span", "choice-option-sub", choice.sub));
      btn.appendChild(text);
      btn.addEventListener("click", () => close(choice.value));
      parent.appendChild(btn);
    }

    const foot = el("footer", "choice-foot");
    const cancel = el("button", "ref-btn choice-cancel", cancelLabel);
    cancel.type = "button";
    cancel.addEventListener("click", () => close(null));
    foot.appendChild(cancel);
    card.appendChild(foot);

    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey);
    overlay.hidden = false;
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
