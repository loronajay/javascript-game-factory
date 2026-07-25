// Unlock/achievement popup presenter. Announcements are produced from many places
// (campaign evaluation, campaign reward picks, tutorials, the shop, boot progress
// sync) but must only ever be PRESENTED from here, so there is exactly one runner:
//
//  - requests coalesce instead of being dropped, so an unlock queued while a batch
//    is already on screen still shows in this session rather than the next one;
//  - presentation is gated on the screen router telling us the player is somewhere a
//    popup belongs (see ANNOUNCEMENT_SCREENS in menuFlow.js). A request made anywhere
//    else — mid-match, on the title screen, in the online lobby — is HELD, not dropped,
//    and flushed the moment the player reaches a presentation screen;
//  - the queue is drained one announcement at a time (see shiftProgressionAnnouncement)
//    so an interrupted batch keeps the remainder queued.
import { shiftProgressionAnnouncement } from "../progression/announcements.js";
import { createProgressionAnnouncementRunner } from "./progressionAnnouncementRunner.js";
import { createPortrait } from "./portraits.js";
import { el } from "./domHelpers.js";

let host = null;
let hostDocument = null;
// Closes the popup that is currently on screen, if any. Held so navigating away can
// never leave a modal open that the runner is still awaiting.
let dismissOpenAnnouncement = null;

// Which storage the runner drains. Every call site passes localStorage in production;
// this just keeps the runner itself storage-agnostic.
let runnerStorage = null;
const runner = createProgressionAnnouncementRunner({
  shift: () => shiftProgressionAnnouncement(runnerStorage ?? globalThis.localStorage),
  present: (announcement) => openProgressionAnnouncement(announcement),
});

function ensureHost() {
  if (host && hostDocument === document) return host;
  host = document.createElement("div");
  hostDocument = document;
  host.className = "ref-modal progression-announcement-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

// Called by the screen router on every screen change. Turning presentation back on
// flushes anything that was queued while the player was elsewhere.
export function setProgressionAnnouncementsAllowed(value, storage = globalThis.localStorage, { delay = 0 } = {}) {
  runnerStorage = storage;
  // Leaving for a screen that can't show popups closes whatever is open, so the runner
  // never sits forever awaiting a modal the player can no longer reach. The rest of the
  // batch stays queued for the next allowed screen.
  if (!value) dismissOpenAnnouncement?.();
  runner.setAllowed(value, { delay });
}

// Fire-and-forget drain request. Safe to call from anywhere, any number of times.
export function requestProgressionAnnouncements({ delay = 0, storage = globalThis.localStorage } = {}) {
  runnerStorage = storage;
  runner.request({ delay });
}

// Drains the queue to empty. Returns the in-flight run if one is already going, so
// awaiting this always means "the popups are done", never "someone else has it".
export function showPendingProgressionAnnouncements(storage = globalThis.localStorage) {
  runnerStorage = storage;
  return runner.run();
}

// Test seam: the runner is module-level singleton state.
export function resetProgressionAnnouncementPresenter() {
  dismissOpenAnnouncement?.();
  runner.reset();
  runnerStorage = null;
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
    } else if (announcement.kind === "skin-unlock" && announcement.unitType) {
      body.appendChild(createPortrait(announcement.unitType, {
        variant: "is-unlock-hero",
        eager: true,
        skin: announcement.skinSlug ?? null,
      }));
    }
    const copy = el("div", "progression-announcement-copy");
    copy.appendChild(buildAnnouncementBody(announcement));
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
      if (dismissOpenAnnouncement === close) dismissOpenAnnouncement = null;
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey);
      overlay.replaceChildren();
      resolve();
    }
    dismissOpenAnnouncement = close;
    function onOverlay(event) { if (event.target === overlay) close(); }
    function onKey(event) { if (event.key === "Escape" || event.key === "Enter") close(); }

    button.addEventListener("click", close);
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey);
    overlay.hidden = false;
    button.focus?.();
  });
}

function buildAnnouncementBody(announcement) {
  const text = announcement.body || "A new reward is available.";
  const p = el("p", "");
  if (announcement.kind !== "valor-gain") {
    p.textContent = text;
    return p;
  }
  // Swap the resource word for the Valor coin icon in the achievement copy.
  const parts = text.split(/\bValor\b/gi);
  parts.forEach((part, index) => {
    if (part) p.appendChild(document.createTextNode(part));
    if (index < parts.length - 1) {
      const icon = el("span", "valor-icon");
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", "Valor");
      p.appendChild(icon);
    }
  });
  return p;
}
