// Markup helpers shared by both admin renderers.
//
// Every value that reaches the DOM goes through escapeHtml. The console displays
// player-authored text — reported comments, profile names, report details — inside an
// interface that only admins see, which makes it the WORST place to be careless: a stored
// script here would run with an operator's session. There is no innerHTML in these
// renderers that is not built from these helpers.

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDate(value: unknown): string {
  const timestamp = Date.parse(String(value || ""));
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(timestamp));
}

// <input type="datetime-local"> will not accept an ISO string with a timezone or seconds,
// so round-tripping a stored timestamp through the form needs this trim.
export function toDateTimeLocal(value: unknown): string {
  const timestamp = Date.parse(String(value || ""));
  if (!timestamp) return "";
  const date = new Date(timestamp - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

export function field(label: string, inputMarkup: string, hint = ""): string {
  return `
    <label class="admin-field">
      <span class="admin-field__label">${escapeHtml(label)}</span>
      ${inputMarkup}
      ${hint ? `<span class="admin-field__hint">${escapeHtml(hint)}</span>` : ""}
    </label>
  `;
}

export function textInput(name: string, value: unknown, { placeholder = "", type = "text" } = {}): string {
  return `<input class="admin-input" type="${escapeHtml(type)}" name="${escapeHtml(name)}"
    value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
}

export function textArea(name: string, value: unknown, rows = 4, placeholder = ""): string {
  return `<textarea class="admin-input admin-input--area" name="${escapeHtml(name)}" rows="${rows}"
    placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
}

export function select(name: string, value: unknown, options: readonly string[]): string {
  const current = String(value ?? "");
  const optionMarkup = options.map((option) => {
    const selected = option === current ? " selected" : "";
    const label = option.charAt(0).toUpperCase() + option.slice(1);
    return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(label)}</option>`;
  }).join("");
  return `<select class="admin-input admin-select" name="${escapeHtml(name)}">${optionMarkup}</select>`;
}

export function checkbox(name: string, checked: boolean, label: string): string {
  return `
    <label class="admin-check">
      <input type="checkbox" name="${escapeHtml(name)}"${checked ? " checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

// `data-action` is the only way a control talks to the page: entry.mts delegates from the
// document root, so nothing here has to attach or clean up its own listeners, and a panel
// can be re-rendered wholesale without leaking handlers.
export function button(action: string, label: string, { tone = "", value = "", type = "button" } = {}): string {
  const toneClass = tone ? ` admin-button--${escapeHtml(tone)}` : "";
  return `<button class="admin-button${toneClass}" type="${escapeHtml(type)}"
    data-action="${escapeHtml(action)}"${value ? ` data-value="${escapeHtml(value)}"` : ""}>${escapeHtml(label)}</button>`;
}

export function badge(text: unknown, tone = ""): string {
  const toneClass = tone ? ` admin-badge--${escapeHtml(tone)}` : "";
  return `<span class="admin-badge${toneClass}">${escapeHtml(text)}</span>`;
}

export function panel(title: string, bodyMarkup: string, actionsMarkup = ""): string {
  return `
    <section class="admin-panel">
      <header class="admin-panel__header">
        <h2 class="admin-panel__title">${escapeHtml(title)}</h2>
        ${actionsMarkup ? `<div class="admin-panel__actions">${actionsMarkup}</div>` : ""}
      </header>
      <div class="admin-panel__body">${bodyMarkup}</div>
    </section>
  `;
}

export function emptyState(message: string): string {
  return `<p class="admin-empty">${escapeHtml(message)}</p>`;
}

export function statusTone(status: unknown): string {
  const value = String(status || "").toLowerCase();
  if (value === "published" || value === "live" || value === "resolved") return "good";
  if (value === "draft" || value === "scheduled" || value === "open") return "warn";
  if (value === "archived" || value === "cancelled" || value === "dismissed") return "muted";
  return "";
}
