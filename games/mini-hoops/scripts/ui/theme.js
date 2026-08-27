// How the cabinet is dressed.
//
// One view for the whole customization layer: it builds every theme picker in
// the markup from `assets/theme-catalog.js`, paints the chosen theme onto the
// page, and keeps the motion switch's label honest. It owns no state — the
// composition root reads and writes `preferences` and hands the answer back
// here, exactly as it does for the sound and hand switches.
//
// WHY THE TOKENS GO ON `document.documentElement` AND NOT ON THE CABINET.
//
// A theme names fifteen primitives; `styles/game.css` derives about a dozen more
// from two of them (`--ink-rgb`, `--brass-rgb`) in its `:root` block. Custom
// property substitution happens where the DERIVED property is declared, against
// whichever declaration of the primitive wins on THAT element — and the derived
// ones are declared on `:root`. Writing `--ink-rgb` onto `#mini-hoops` instead
// would set it for everything that reads it directly and leave every derived
// hairline still resolved against the stylesheet's default: half the cabinet in
// the new theme and half of it in the old one. An inline style on the root
// element beats the `:root` rule on the same element, so the derived tokens
// re-resolve with it and the whole cabinet moves at once.
//
// THE PICKER IS BUILT FROM THE CATALOG, in every container that asks for one.
// There are two — the full gallery on the Customize screen and the compact strip
// filling the setup screen's empty column — and they are the same list rendered
// twice, the same way `sound-toggle.js` keeps two copies of one switch in step.
// A third costs a `data-theme-picker` container in the markup and nothing else.

import { THEMES, THEME_TOKENS, themeById, themeSwatch } from "../assets/theme-catalog.js";

const PICKER_SELECTOR = "[data-theme-picker]";
const MOTION_SELECTOR = '[data-intent="toggle-motion"]';

const MOTION_LABELS = {
  full: "Motion: On",
  calm: "Motion: Calm",
};

export function createThemeView(root, { onSelect = () => {}, target } = {}) {
  const surface = target || (typeof document === "undefined" ? null : document.documentElement);
  const pickers = [...root.querySelectorAll(PICKER_SELECTOR)];
  const motionButtons = [...root.querySelectorAll(MOTION_SELECTOR)];

  for (const picker of pickers) {
    // `compact` is the strip that fills the setup screen's dead column: the same
    // eight themes, swatches only. The name and the blurb are the gallery's job,
    // and repeating them beside a room preview would make the column a second
    // Customize screen rather than a shortcut into this one.
    const compact = picker.dataset.themePicker === "compact";
    picker.replaceChildren(...THEMES.map((theme) => buildOption(theme, compact)));
    picker.addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (!button || !picker.contains(button)) return;
      onSelect(button.dataset.value);
    });
  }

  return {
    /** Paint a theme onto the page and reflect it on every picker and switch. */
    render({ themeId, motion }) {
      const theme = themeById(themeId);
      if (surface) {
        for (const token of THEME_TOKENS) surface.style.setProperty(token, theme.tokens[token]);
        // Not read by any rule in the cabinet: it is here so that what the page
        // is wearing is visible in devtools and in a screenshot audit, where the
        // computed tokens are otherwise fifteen anonymous colours.
        surface.dataset.theme = theme.id;
        surface.dataset.motion = motion === "calm" ? "calm" : "full";
      }

      for (const picker of pickers) {
        for (const button of picker.querySelectorAll("[data-value]")) {
          const active = button.dataset.value === theme.id;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        }
      }

      for (const button of motionButtons) {
        button.textContent = MOTION_LABELS[motion] || MOTION_LABELS.full;
        // Tracks CALM, the non-default, so a screen reader hears "not pressed"
        // for the setting almost nobody changes. Same rule as the hand switch.
        button.setAttribute("aria-pressed", String(motion === "calm"));
      }
    },
  };
}

/**
 * One theme's button.
 *
 * The swatch comes from `themeSwatch`, which reads the theme's own tokens — so
 * a picker cannot advertise a colour the cabinet will not actually wear. This
 * file does no colour arithmetic, the same rule the ball picker's flight bars
 * live by.
 */
function buildOption(theme, compact) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact ? "chip chip--swatch chip--swatch-compact" : "chip chip--swatch";
  button.dataset.value = theme.id;
  // The compact strip has no name to read, so the accessible name has to come
  // from somewhere; `title` carries the blurb for a pointer either way.
  button.title = compact ? `${theme.label} — ${theme.blurb}` : theme.blurb;
  if (compact) button.setAttribute("aria-label", theme.label);

  button.appendChild(buildSwatch(theme.id));
  if (!compact) {
    const strong = document.createElement("strong");
    strong.textContent = theme.label;
    button.appendChild(strong);

    const span = document.createElement("span");
    span.className = "chip-note";
    span.textContent = theme.blurb;
    button.appendChild(span);
  }
  return button;
}

/** Four bands of the theme's own colour: the page, a panel, the action, the highlight. */
function buildSwatch(id) {
  const swatch = themeSwatch(id);
  const wrap = document.createElement("span");
  wrap.className = "theme-swatch";
  wrap.setAttribute("aria-hidden", "true");
  for (const key of ["room", "panel", "ember", "brass"]) {
    const band = document.createElement("span");
    band.style.background = swatch[key];
    wrap.appendChild(band);
  }
  return wrap;
}
