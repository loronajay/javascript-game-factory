export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function button(label, action, className = "") {
  return `<button class="btn ${className}" data-action="${action}">${escapeHtml(label)}</button>`;
}
