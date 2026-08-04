import type { AdminState } from "./admin-state.mjs";
import {
  badge, button, emptyState, escapeHtml, field, formatDate,
  panel, select, statusTone, textInput,
} from "./render-shared.mjs";

// The moderation half of the console: the report queue, suspensions, the admin roster,
// and the audit trail. Pure rendering, same contract as render-content.mts.

const REPORT_FILTERS = ["open", "resolved", "dismissed", "all"] as const;

const TARGET_LABELS: Record<string, string> = {
  thought: "Thought",
  thought_comment: "Thought comment",
  photo: "Photo",
  photo_comment: "Photo comment",
  player: "Player",
};

function reportRow(report: any): string {
  const canRemove = report.targetType !== "player";
  return `
    <li class="admin-row admin-row--stacked">
      <div class="admin-row__main">
        <span class="admin-row__title">
          ${escapeHtml(TARGET_LABELS[report.targetType] || report.targetType)} · ${escapeHtml(report.reason)}
        </span>
        <span class="admin-row__meta">
          Reported by ${escapeHtml(report.reporterName || report.reporterPlayerId)}
          ${report.targetOwnerName ? ` · posted by ${escapeHtml(report.targetOwnerName)}` : ""}
          · ${escapeHtml(formatDate(report.createdAt))}
        </span>
        ${report.details ? `<p class="admin-row__detail">${escapeHtml(report.details)}</p>` : ""}
      </div>
      <div class="admin-row__side">
        ${badge(report.status, statusTone(report.status))}
        ${report.status === "open" ? button("report:resolve", "Resolve", { value: report.id }) : ""}
        ${report.status === "open" ? button("report:dismiss", "Dismiss", { value: report.id }) : ""}
        ${canRemove
          ? button("report:remove", "Remove content", { tone: "danger", value: `${report.targetType}|${report.targetId}` })
          : ""}
        ${report.targetOwnerPlayerId
          ? button("report:suspend", "Suspend author", { tone: "danger", value: report.targetOwnerPlayerId })
          : ""}
      </div>
    </li>
  `;
}

export function renderModeration(state: AdminState): string {
  const filterMarkup = `
    <form class="admin-inline-form" data-form="report-filter">
      ${select("status", state.reportFilter, REPORT_FILTERS)}
      ${button("report:filter", "Apply", { type: "submit" })}
    </form>
  `;

  const listMarkup = state.reports.length
    ? `<ul class="admin-list" role="list">${state.reports.map(reportRow).join("")}</ul>`
    : emptyState(state.reportFilter === "open"
      ? "Nothing in the queue. Nobody has reported anything that's still open."
      : "No reports match that filter.");

  return panel(`Report Queue (${state.reports.length})`, `
    <p class="admin-note">
      Removing content deletes it for everyone and cannot be undone. Suspending an author
      blocks their posts, messages, and ranked play until the suspension expires — they can
      still sign in and read.
    </p>
    ${listMarkup}
  `, filterMarkup);
}

function suspendedRow(account: any): string {
  return `
    <li class="admin-row">
      <div class="admin-row__main">
        <span class="admin-row__title">${escapeHtml(account.profileName || account.playerId)}</span>
        <span class="admin-row__meta">
          Until ${escapeHtml(formatDate(account.suspendedUntil))}
          ${account.suspendedReason ? ` · ${escapeHtml(account.suspendedReason)}` : ""}
        </span>
      </div>
      <div class="admin-row__side">
        ${button("account:unsuspend", "Lift suspension", { value: account.playerId })}
      </div>
    </li>
  `;
}

function adminRow(admin: any, isOnlyAdmin: boolean): string {
  return `
    <li class="admin-row">
      <div class="admin-row__main">
        <span class="admin-row__title">${escapeHtml(admin.profileName || admin.playerId)}</span>
        <span class="admin-row__meta">${escapeHtml(admin.email)}</span>
      </div>
      <div class="admin-row__side">
        ${isOnlyAdmin
          ? badge("Only admin", "warn")
          : button("admin:revoke", "Revoke admin", { tone: "danger", value: admin.playerId })}
      </div>
    </li>
  `;
}

export function renderAccounts(state: AdminState): string {
  const suspendedMarkup = state.suspended.length
    ? `<ul class="admin-list" role="list">${state.suspended.map(suspendedRow).join("")}</ul>`
    : emptyState("No accounts are currently suspended.");

  const adminsMarkup = state.admins.length
    ? `<ul class="admin-list" role="list">${state.admins.map((entry) => adminRow(entry, state.admins.length === 1)).join("")}</ul>`
    : emptyState("No admins listed.");

  const suspendFormMarkup = `
    <form class="admin-form" data-form="suspend">
      ${field("Player ID", textInput("playerId", "", { placeholder: "player-…" }),
        "Find this on the player's profile page URL.")}
      <div class="admin-form__row">
        ${field("Days", textInput("days", "7", { type: "number" }))}
        ${field("Reason", textInput("reason", "", { placeholder: "Repeated harassment" }))}
      </div>
      <div class="admin-form__actions">
        ${button("account:suspend", "Suspend account", { tone: "danger", type: "submit" })}
      </div>
    </form>
  `;

  const grantFormMarkup = `
    <form class="admin-form" data-form="grant-admin">
      ${field("Player ID", textInput("playerId", "", { placeholder: "player-…" }),
        "That player's account gains full console access immediately.")}
      <div class="admin-form__actions">
        ${button("admin:grant", "Grant admin", { tone: "primary", type: "submit" })}
      </div>
    </form>
  `;

  return `
    <div class="admin-split">
      ${panel(`Suspensions (${state.suspended.length})`, `${suspendedMarkup}<hr class="admin-divider">${suspendFormMarkup}`)}
      ${panel(`Admins (${state.admins.length})`, `${adminsMarkup}<hr class="admin-divider">${grantFormMarkup}`)}
    </div>
  `;
}

export function renderAudit(state: AdminState): string {
  if (!state.audit.length) return panel("Audit Log", emptyState("No admin actions recorded yet."));

  const rows = state.audit.map((entry) => `
    <li class="admin-row">
      <div class="admin-row__main">
        <span class="admin-row__title">${escapeHtml(entry.action)}</span>
        <span class="admin-row__meta">
          ${escapeHtml(entry.adminName || entry.adminPlayerId)}
          ${entry.targetId ? ` · ${escapeHtml(entry.targetType)}/${escapeHtml(entry.targetId)}` : ""}
        </span>
      </div>
      <div class="admin-row__side">${escapeHtml(formatDate(entry.createdAt))}</div>
    </li>
  `).join("");

  return panel(`Audit Log (${state.audit.length})`, `
    <p class="admin-note">Every state-changing admin action, newest first.</p>
    <ul class="admin-list" role="list">${rows}</ul>
  `);
}
