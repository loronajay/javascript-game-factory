// The ability reference pop-up: hold (or right-click) an action button to read the
// whole thing. It exists because the two places an ability's text used to surface were
// both lossy — the native `title` tooltip needs a hover that touch does not have, and
// the #message box is clipped on phones — and because an instant-resolving ART fires on
// the first tap, so its description never got a chance to appear at all.
//
// This module owns only DOM: the view model comes from abilityDetailModel.js, and the
// press gesture is wired by attachAbilityDetailGestures so main.js and the sandbox both
// get it from one line. Borrows the shared `.ref-modal` overlay, like choiceModal.js.
import { el } from "./domHelpers.js";
import { buildAbilityDetail } from "./abilityDetailModel.js";

export const ABILITY_DETAIL_HOLD_MS = 400;

let host = null;
let openState = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal ability-detail-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function isAbilityDetailOpen() {
  return Boolean(openState);
}

export function closeAbilityDetail() {
  if (!openState) return;
  const { overlay, onOverlayClick, onKey } = openState;
  openState = null;
  overlay.hidden = true;
  overlay.removeEventListener("click", onOverlayClick);
  document.removeEventListener("keydown", onKey);
  overlay.replaceChildren();
}

function factsList(facts) {
  const list = el("dl", "ability-detail-facts");
  for (const { label, value } of facts) {
    list.appendChild(el("dt", "ability-detail-fact-label", label));
    list.appendChild(el("dd", "ability-detail-fact-value", value));
  }
  return list;
}

function passivesSection(passives) {
  const section = el("section", "ability-detail-passives");
  section.appendChild(el("h3", "ability-detail-section-title", "Always on"));
  for (const passive of passives) {
    const line = el("p", `ability-detail-passive${passive.active ? "" : " is-dormant"}`);
    line.appendChild(el("span", "ability-detail-passive-tag", passive.tag));
    if (passive.name) line.appendChild(el("b", "ability-detail-passive-name", passive.name));
    line.appendChild(el("span", "ability-detail-passive-text", passive.description));
    section.appendChild(line);
  }
  return section;
}

// detail: the shape returned by buildAbilityDetail. `accent` tints the card with the
// owning player's colour so the pop-up reads as "this unit's" like the rest of the HUD.
export function openAbilityDetail(detail, { accent = null } = {}) {
  if (!detail) return false;
  closeAbilityDetail();
  const overlay = ensureHost();
  overlay.replaceChildren();
  if (accent) overlay.style.setProperty("--team", accent);
  else overlay.style.removeProperty("--team");

  const card = el("div", "ref-card ability-detail-card");

  const head = el("header", "ability-detail-head");
  const heading = el("div", "ability-detail-heading");
  heading.appendChild(el("span", "ability-detail-kicker", detail.kicker));
  heading.appendChild(el("h2", "ability-detail-title", detail.title));
  heading.appendChild(el("span", "ability-detail-owner", detail.unitName));
  head.appendChild(heading);
  const close = el("button", "ref-close ability-detail-close", "✕");
  close.type = "button";
  close.setAttribute?.("aria-label", "Close");
  close.addEventListener("click", () => closeAbilityDetail());
  head.appendChild(close);
  card.appendChild(head);

  const body = el("div", "ability-detail-body");
  if (detail.unavailableReason) {
    body.appendChild(el("p", "ability-detail-blocked", detail.unavailableReason));
  }
  if (detail.facts.length > 0) body.appendChild(factsList(detail.facts));
  if (detail.description) body.appendChild(el("p", "ability-detail-text", detail.description));
  for (const note of detail.notes) body.appendChild(el("p", "ability-detail-note", note));
  if (detail.passives.length > 0) body.appendChild(passivesSection(detail.passives));
  card.appendChild(body);

  overlay.appendChild(card);

  const onOverlayClick = (event) => { if (event.target === overlay) closeAbilityDetail(); };
  const onKey = (event) => { if (event.key === "Escape") closeAbilityDetail(); };
  overlay.addEventListener("click", onOverlayClick);
  document.addEventListener("keydown", onKey);
  overlay.hidden = false;
  openState = { overlay, onOverlayClick, onKey };
  return true;
}

// Arm an action bar for hold-to-read, and keep it pointed at what is on screen.
//
// The bar's buttons are rebuilt on every render, so the gesture is delegated to the
// container and attached exactly once per element; later calls only refresh the context.
// renderActions calls this, which is why both the shipping match and the sandbox get the
// gesture without either composition root wiring it.
const armedBars = new WeakMap();
export function armAbilityDetails(hostEl, context) {
  // renderActions is also driven by light element stubs (tests, headless renders) that
  // have markup but no event plumbing — reading an ability is optional there.
  if (typeof hostEl?.addEventListener !== "function") return;
  const armed = armedBars.get(hostEl);
  if (armed) {
    armed.context = context;
    return;
  }
  const box = { context };
  armedBars.set(hostEl, box);
  attachAbilityDetailGestures(hostEl, () => box.context);
}

// Convenience for callers that hold the live unit/state: build then open in one step.
export function openAbilityDetailFor(action, unit, state, options = {}) {
  return openAbilityDetail(buildAbilityDetail(action, unit, state), options);
}

// Press-and-hold on any action button inside `host` opens its detail; a right-click does
// the same on desktop. The hold cancels if the finger drifts or lifts early, and the
// click that follows a completed hold is swallowed so reading an ability never fires it.
//
// getContext() returns { unit, state, accent } for the current activation, or null when
// there is nothing selected. Returns a detach function.
export function attachAbilityDetailGestures(hostEl, getContext, { holdMs = ABILITY_DETAIL_HOLD_MS } = {}) {
  if (typeof hostEl?.addEventListener !== "function") return () => {};
  let timer = null;
  let origin = null;
  let opened = false;

  function buttonAt(x, y) {
    for (const button of hostEl.querySelectorAll("button[data-action]")) {
      const rect = button.getBoundingClientRect?.();
      if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return button;
    }
    return null;
  }

  function actionFor(event) {
    const button = event.target?.closest?.("button[data-action]");
    if (button && hostEl.contains(button)) return button.dataset.action;
    // A disabled button swallows its own pointer events (the container becomes the
    // event target) — and a greyed-out ability is precisely the one a player wants
    // explained. Fall back to hit-testing the press position against the buttons.
    return buttonAt(event.clientX ?? -1, event.clientY ?? -1)?.dataset.action ?? null;
  }

  function show(action) {
    const context = getContext?.();
    if (!context?.unit || !context?.state) return false;
    return openAbilityDetailFor(action, context.unit, context.state, { accent: context.accent ?? null });
  }

  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    origin = null;
  }

  function onPointerDown(event) {
    // Primary button / touch only: a right-click is handled by onContextMenu, and a
    // middle-click should not arm a hold.
    if (event.button !== undefined && event.button !== 0) return;
    const action = actionFor(event);
    if (!action) return;
    opened = false;
    origin = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    timer = setTimeout(() => {
      timer = null;
      opened = show(action);
    }, holdMs);
  }

  function onPointerMove(event) {
    if (timer === null || !origin) return;
    const dx = (event.clientX ?? 0) - origin.x;
    const dy = (event.clientY ?? 0) - origin.y;
    if (Math.hypot(dx, dy) > 12) cancel();
  }

  function onPointerUp() {
    cancel();
  }

  // A completed hold must not also press the button. The pop-up is open by now, so this
  // click is the tail of the gesture, not a command.
  function onClickCapture(event) {
    if (!opened) return;
    opened = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // Desktop right-click, and the native long-press menu Android raises at ~500ms — by
  // which point our own 400ms hold has usually already opened the card, so suppress the
  // menu rather than rebuilding the same pop-up underneath it.
  function onContextMenu(event) {
    const action = actionFor(event);
    if (!action) return;
    cancel();
    if (isAbilityDetailOpen() || show(action)) {
      opened = true;
      event.preventDefault();
    }
  }

  hostEl.addEventListener("pointerdown", onPointerDown);
  hostEl.addEventListener("pointermove", onPointerMove);
  hostEl.addEventListener("pointerup", onPointerUp);
  hostEl.addEventListener("pointercancel", onPointerUp);
  hostEl.addEventListener("pointerleave", onPointerUp);
  hostEl.addEventListener("click", onClickCapture, true);
  hostEl.addEventListener("contextmenu", onContextMenu);

  return () => {
    cancel();
    hostEl.removeEventListener("pointerdown", onPointerDown);
    hostEl.removeEventListener("pointermove", onPointerMove);
    hostEl.removeEventListener("pointerup", onPointerUp);
    hostEl.removeEventListener("pointercancel", onPointerUp);
    hostEl.removeEventListener("pointerleave", onPointerUp);
    hostEl.removeEventListener("click", onClickCapture, true);
    hostEl.removeEventListener("contextmenu", onContextMenu);
  };
}
