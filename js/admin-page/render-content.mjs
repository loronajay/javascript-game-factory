import { findCabinetOverride } from "./admin-state.mjs";
import { badge, button, checkbox, emptyState, escapeHtml, field, formatDate, panel, select, statusTone, textArea, textInput, toDateTimeLocal, } from "./render-shared.mjs";
// The authoring half of the console: overview, bulletins, events, and cabinet
// presentation. Pure rendering — every function takes state and returns markup, and
// nothing here fetches or mutates. Actions live in actions.mts.
const BULLETIN_STATUSES = ["draft", "published", "archived"];
const BULLETIN_AUDIENCES = ["public", "friends", "private"];
const EVENT_STATUSES = ["scheduled", "live", "completed", "cancelled"];
function statTile(label, value, hint = "") {
    return `
    <div class="admin-stat">
      <span class="admin-stat__value">${escapeHtml(value)}</span>
      <span class="admin-stat__label">${escapeHtml(label)}</span>
      ${hint ? `<span class="admin-stat__hint">${escapeHtml(hint)}</span>` : ""}
    </div>
  `;
}
export function renderOverview(state) {
    const overview = state.overview;
    if (!overview)
        return panel("Overview", emptyState("Overview data is not available."));
    return panel("Arcade At A Glance", `
    <div class="admin-stat-grid">
      ${statTile("Open reports", overview.openReportCount, overview.openReportCount > 0 ? "Needs review" : "All clear")}
      ${statTile("Bulletins", overview.bulletinCount, `${overview.publishedBulletinCount} published`)}
      ${statTile("Events", overview.eventCount, `${overview.upcomingEventCount} upcoming or live`)}
      ${statTile("Suspended accounts", overview.suspendedCount)}
      ${statTile("Cabinet overrides", overview.cabinetOverrideCount)}
      ${statTile("Admins", overview.adminCount)}
    </div>
  `);
}
// ---- Bulletins ----
function bulletinRow(bulletin, isEditing) {
    return `
    <li class="admin-row${isEditing ? " admin-row--active" : ""}">
      <div class="admin-row__main">
        <span class="admin-row__title">${escapeHtml(bulletin.title)}</span>
        <span class="admin-row__meta">/${escapeHtml(bulletin.slug)} · ${escapeHtml(formatDate(bulletin.publishedAt))}</span>
      </div>
      <div class="admin-row__side">
        ${bulletin.pinned ? badge("Pinned", "good") : ""}
        ${badge(bulletin.status, statusTone(bulletin.status))}
        ${button("bulletin:edit", "Edit", { value: bulletin.id })}
      </div>
    </li>
  `;
}
export function renderBulletins(state) {
    const editing = state.bulletins.find((entry) => entry.id === state.editingBulletinId) || null;
    const listMarkup = state.bulletins.length
        ? `<ul class="admin-list" role="list">${state.bulletins.map((entry) => bulletinRow(entry, entry.id === state.editingBulletinId)).join("")}</ul>`
        : emptyState("No bulletins yet. Write the first one on the right.");
    const formMarkup = `
    <form class="admin-form" data-form="bulletin">
      ${field("Title", textInput("title", editing?.title || "", { placeholder: "Tactical Arena Season 2 Is Live" }))}
      ${field("Slug", textInput("slug", editing?.slug || ""), "Leave blank to generate one from the title.")}
      ${field("Summary", textArea("summary", editing?.summary || "", 2, "One or two lines for the board."))}
      ${field("Body", textArea("body", editing?.body || "", 8, "The full announcement."))}
      <div class="admin-form__row">
        ${field("Status", select("status", editing?.status || "draft", BULLETIN_STATUSES))}
        ${field("Audience", select("audience", editing?.audience || "public", BULLETIN_AUDIENCES))}
      </div>
      ${field("Publish date", textInput("publishedAt", toDateTimeLocal(editing?.publishedAt), { type: "datetime-local" }), "Blank publishes at the moment you save.")}
      ${checkbox("pinned", editing?.pinned === true, "Pin to the top of the board")}
      <div class="admin-form__actions">
        ${button("bulletin:save", editing ? "Save changes" : "Create bulletin", { tone: "primary", type: "submit" })}
        ${editing ? button("bulletin:new", "New bulletin") : ""}
        ${editing ? button("bulletin:delete", "Delete", { tone: "danger", value: editing.id }) : ""}
      </div>
    </form>
  `;
    return `
    <div class="admin-split">
      ${panel(`Bulletins (${state.bulletins.length})`, listMarkup, button("bulletin:new", "New"))}
      ${panel(editing ? "Edit Bulletin" : "New Bulletin", formMarkup)}
    </div>
  `;
}
// ---- Events ----
function eventRow(event, isEditing) {
    return `
    <li class="admin-row${isEditing ? " admin-row--active" : ""}">
      <div class="admin-row__main">
        <span class="admin-row__title">${escapeHtml(event.title)}</span>
        <span class="admin-row__meta">${escapeHtml(formatDate(event.startsAt))} · ${escapeHtml(event.relatedGames.join(", ") || "no cabinets")}</span>
      </div>
      <div class="admin-row__side">
        ${badge(event.status, statusTone(event.status))}
        ${button("event:edit", "Edit", { value: event.id })}
      </div>
    </li>
  `;
}
export function renderEvents(state) {
    const editing = state.events.find((entry) => entry.id === state.editingEventId) || null;
    const listMarkup = state.events.length
        ? `<ul class="admin-list" role="list">${state.events.map((entry) => eventRow(entry, entry.id === state.editingEventId)).join("")}</ul>`
        : emptyState("No events scheduled yet.");
    const formMarkup = `
    <form class="admin-form" data-form="event">
      ${field("Title", textInput("title", editing?.title || "", { placeholder: "Sumorai Ladder Night" }))}
      ${field("Slug", textInput("slug", editing?.slug || ""), "Leave blank to generate one from the title.")}
      ${field("Summary", textArea("summary", editing?.summary || "", 2))}
      ${field("Body", textArea("body", editing?.body || "", 6))}
      <div class="admin-form__row">
        ${field("Starts", textInput("startsAt", toDateTimeLocal(editing?.startsAt), { type: "datetime-local" }))}
        ${field("Ends", textInput("endsAt", toDateTimeLocal(editing?.endsAt), { type: "datetime-local" }))}
      </div>
      ${field("Related cabinets", textInput("relatedGames", (editing?.relatedGames || []).join(", "), { placeholder: "sumorai, tactical-arena" }), "Comma-separated cabinet slugs.")}
      ${field("Status", select("status", editing?.status || "scheduled", EVENT_STATUSES))}
      <div class="admin-form__actions">
        ${button("event:save", editing ? "Save changes" : "Create event", { tone: "primary", type: "submit" })}
        ${editing ? button("event:new", "New event") : ""}
        ${editing ? button("event:delete", "Delete", { tone: "danger", value: editing.id }) : ""}
      </div>
    </form>
  `;
    return `
    <div class="admin-split">
      ${panel(`Events (${state.events.length})`, listMarkup, button("event:new", "New"))}
      ${panel(editing ? "Edit Event" : "New Event", formMarkup)}
    </div>
  `;
}
// ---- Cabinets ----
function cabinetCard(game, override) {
    const isOverridden = !!override;
    return `
    <form class="admin-cabinet${override?.hidden ? " admin-cabinet--hidden" : ""}" data-form="cabinet" data-slug="${escapeHtml(game.slug)}">
      <div class="admin-cabinet__head">
        <span class="admin-cabinet__name">${escapeHtml(game.title)}</span>
        <span class="admin-cabinet__slug">${escapeHtml(game.slug)}</span>
        ${isOverridden ? badge("Overridden", "warn") : ""}
      </div>
      <div class="admin-cabinet__grid">
        ${field("Display title", textInput("title", override?.title || "", { placeholder: game.title }))}
        ${field("Grid order", textInput("sortOrder", override?.sortOrder ?? "", { type: "number", placeholder: String(game.order) }))}
      </div>
      ${field("Tagline", textInput("tagline", override?.tagline || "", { placeholder: game.tagline }))}
      ${field("Status label", textInput("statusLabel", override?.statusLabel || "", { placeholder: game.status }))}
      <div class="admin-cabinet__toggles">
        ${checkbox("hidden", override?.hidden === true, "Hide from the grid")}
        ${checkbox("featured", override?.featured === true, "Feature this cabinet")}
      </div>
      <div class="admin-form__actions">
        ${button("cabinet:save", "Save", { tone: "primary", type: "submit", value: game.slug })}
        ${isOverridden ? button("cabinet:reset", "Reset to game.json", { value: game.slug }) : ""}
      </div>
    </form>
  `;
}
export function renderCabinets(state) {
    if (!state.catalog.length)
        return panel("Cabinets", emptyState("Could not read the cabinet catalog."));
    const cards = state.catalog
        .map((game) => cabinetCard(game, findCabinetOverride(state, game.slug)))
        .join("");
    // The reassurance below is load-bearing, not decoration: an operator needs to know that
    // nothing on this screen can reach into a game before they feel free to use it.
    return panel("Cabinet Presentation", `
    <p class="admin-note">
      These settings only change how the arcade grid presents a cabinet. Blank fields inherit
      from the game's own <code>game.json</code>, hiding a cabinet removes its grid card but
      leaves the game itself untouched, and <strong>Reset</strong> restores everything.
    </p>
    <div class="admin-cabinet-grid">${cards}</div>
  `);
}
