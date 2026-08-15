// Shared DOM primitives for the cabinet UI. Nothing here knows about bowling —
// it is the thin layer every screen module sits on, so no game state lives here.

export const $ = (id) => document.getElementById(id);

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value) => String(value ?? "").replace(
  /[&<>"']/g,
  (character) => HTML_ESCAPES[character],
);

// Screen swaps reset the viewport: phone navigation otherwise lands mid-scroll
// on the next screen because the previous one was taller.
export function showScreen(id) {
  for (const screen of document.querySelectorAll(".screen")) {
    const active = screen.id === id;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  }
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export function setSelected(group, attribute, value) {
  for (const button of group.querySelectorAll(`[${attribute}]`)) {
    button.classList.toggle("is-selected", button.getAttribute(attribute) === value);
  }
}
