// Shared helpers for screen modules.

export function screenRoot(name, documentRef = document) {
  const el = documentRef.querySelector(`[data-screen="${name}"]`);
  if (!el) {
    throw new Error(`Missing screen element: [data-screen="${name}"]`);
  }
  return el;
}

// Wire the navigation-only controls every screen shares: `[data-nav]` buttons
// jump to another screen; `[data-action="rules"]` opens the How-to-Play overlay;
// `[data-action="settings"]` opens the Settings overlay. Screen-specific actions
// are wired by each screen module itself.
export function bindCommonControls(root, { nav, openRules, openSettings }) {
  root.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => nav(btn.dataset.nav));
  });

  root.querySelectorAll('[data-action="rules"]').forEach((btn) => {
    btn.addEventListener("click", () => openRules());
  });

  root.querySelectorAll('[data-action="settings"]').forEach((btn) => {
    btn.addEventListener("click", () => openSettings?.());
  });
}

// Wire a segmented (radio-style) control: clicking a `.seg` inside
// `[data-field="<field>"]` marks it selected and reports the chosen button. Skips
// disabled segments. Shared by the setup screens.
export function bindSegmented(root, field, onPick) {
  root.querySelectorAll(`[data-field="${field}"] .seg`).forEach((seg) => {
    seg.addEventListener("click", () => {
      if (seg.disabled) return;
      selectSeg(root, field, (candidate) => candidate === seg);
      onPick(seg);
    });
  });
}

export function selectSeg(root, field, isChosen) {
  root.querySelectorAll(`[data-field="${field}"] .seg`).forEach((seg) => {
    seg.classList.toggle("is-selected", isChosen(seg));
  });
}

// Build a row of color swatches into `[data-swatches="<key>"]`. `onPick(hue)` fires
// on a click of an enabled swatch. Shared by the setup + online-lobby screens.
export function buildSwatchRow(root, key, hues, onPick) {
  const host = root.querySelector(`[data-swatches="${key}"]`);
  if (!host) return;
  host.replaceChildren();
  for (const hue of hues) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.dataset.hue = hue;
    btn.style.setProperty("--swatch", hue);
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      onPick(hue);
    });
    host.appendChild(btn);
  }
}

// Reflect a swatch row's state: `selected` is the chosen hue, `taken` (optional) a
// hue claimed by the other team (disabled), and `locked` disables the whole row
// (e.g. the non-owner read-only lobby view).
export function paintSwatchRow(root, key, { selected, taken = null, locked = false }) {
  const host = root.querySelector(`[data-swatches="${key}"]`);
  if (!host) return;
  for (const btn of host.querySelectorAll(".swatch")) {
    const hue = btn.dataset.hue;
    btn.classList.toggle("is-selected", hue === selected);
    btn.disabled = locked || hue === taken;
  }
}
