import { consumeProgressionAnnouncements } from "../progression/announcements.js";
import { createPortrait } from "./portraits.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal progression-announcement-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export async function showPendingProgressionAnnouncements(storage = globalThis.localStorage) {
  const announcements = consumeProgressionAnnouncements(storage);
  for (const announcement of announcements) {
    await openProgressionAnnouncement(announcement);
  }
  return announcements;
}

export function openProgressionAnnouncement(announcement) {
  const overlay = ensureHost();
  return new Promise((resolve) => {
    overlay.replaceChildren();

    const card = el("div", "ref-card progression-announcement-card");
    const head = el("header", "progression-announcement-head");
    head.append(
      el("span", "progression-announcement-kicker", announcement.eyebrow || "Unlocked"),
      el("h2", "progression-announcement-title", announcement.title || "Reward Unlocked"),
    );
    card.appendChild(head);

    const body = el("div", "progression-announcement-body");
    if (announcement.kind === "unit-unlock" && announcement.unitType) {
      body.appendChild(createPortrait(announcement.unitType, { variant: "is-unlock-hero", eager: true }));
    }
    const copy = el("div", "progression-announcement-copy");
    copy.appendChild(el("p", "", announcement.body || "A new reward is available."));
    body.appendChild(copy);
    card.appendChild(body);

    const foot = el("footer", "progression-announcement-foot");
    const button = el("button", "primary menu-btn", announcement.primaryLabel || "Continue");
    button.type = "button";
    foot.appendChild(button);
    card.appendChild(foot);
    overlay.appendChild(card);

    let settled = false;
    function close() {
      if (settled) return;
      settled = true;
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey);
      overlay.replaceChildren();
      resolve();
    }
    function onOverlay(event) { if (event.target === overlay) close(); }
    function onKey(event) { if (event.key === "Escape" || event.key === "Enter") close(); }

    button.addEventListener("click", close);
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey);
    overlay.hidden = false;
    button.focus();
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
