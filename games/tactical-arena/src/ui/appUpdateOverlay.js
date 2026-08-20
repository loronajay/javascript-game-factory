// The blocking "update required" screen for the packaged app.
//
// This is deliberately the ONLY thing on screen and the ONLY thing to press: the game
// modules are never imported when it is up, so there is no board behind it to reach and
// nothing to dismiss it back to. Escape, the Android back button, and a tap outside all do
// nothing on purpose — the point of a hard gate is that an out-of-date client cannot talk
// to the server at all.
//
// It renders from plain DOM with no dependency on the game's own screen system, because it
// has to work in exactly the situation where the rest of the build is not trusted to run.

import { openStoreListing } from "../platform/appUpdateGate.js";

const OVERLAY_ID = "appUpdateOverlay";

export function renderAppUpdateOverlay(requirement = {}, {
  doc = globalThis.document,
  root = globalThis,
  open = openStoreListing,
} = {}) {
  if (!doc?.body) return null;

  const existing = doc.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = doc.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "app-update-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "appUpdateTitle");
  overlay.setAttribute("aria-describedby", "appUpdateBody");

  const card = doc.createElement("div");
  card.className = "app-update-card";

  const title = doc.createElement("h1");
  title.id = "appUpdateTitle";
  title.className = "app-update-title";
  title.textContent = "Update required";

  const body = doc.createElement("p");
  body.id = "appUpdateBody";
  body.className = "app-update-body";
  body.textContent =
    "A new version of Tactical Arena is available. Update from Google Play to keep playing — "
    + "your account, campaign progress, and everything you own are safe on your account.";

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "app-update-button";
  button.textContent = "Update on Google Play";
  button.addEventListener("click", () => {
    open({ root, updateUrl: requirement.updateUrl, storeUrl: requirement.storeUrl });
  });

  const note = doc.createElement("p");
  note.className = "app-update-note";
  const installed = Number.isInteger(requirement.installedVersionCode) ? requirement.installedVersionCode : "?";
  const required = Number.isInteger(requirement.minimumVersionCode) ? requirement.minimumVersionCode : "?";
  note.textContent = `Installed build ${installed} · required build ${required}`;

  card.append(title, body, button, note);
  overlay.append(card);

  // Nothing else should be reachable behind it, including by screen readers or a stray
  // keyboard focus from whatever the shell already rendered.
  doc.body.replaceChildren(overlay);
  doc.body.classList.add("app-update-blocked");

  // The gate must survive a back press. Capacitor routes hardware back to this event; the
  // shell's own handler would otherwise minimise or navigate.
  try {
    root?.Capacitor?.Plugins?.App?.addListener?.("backButton", () => {});
  } catch {
    // A shell without the App plugin simply has no hardware back to intercept.
  }

  button.focus?.();
  return overlay;
}
