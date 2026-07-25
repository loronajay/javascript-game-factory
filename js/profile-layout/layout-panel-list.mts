/**
 * Layout editor panel list.
 *
 * Owns the left-rail "layers" tree for /me/layout: the pure grouping/filtering
 * model plus its markup. The editor exposes ~50 selectable panels and composition
 * elements, so a flat list is unreadable — rows are grouped by the profile section
 * they belong to, collapsed when unused, and filterable by name.
 *
 * This module is presentation-only: it never mutates layout state. The wire layer
 * owns selection, visibility, and group-collapse state and feeds them back in.
 */

export type PanelListRowKind = "panel" | "element";

export interface PanelListRowModel {
  id: string;
  label: string;
  kind: PanelListRowKind;
  enabled: boolean;
  required: boolean;
  selected: boolean;
}

export interface PanelListGroupModel {
  key: string;
  label: string;
  rows: PanelListRowModel[];
  enabledCount: number;
  totalCount: number;
  hasSelection: boolean;
  expanded: boolean;
}

export interface PanelListOptions {
  panels?: any[];
  elements?: any[];
  selectedPanelId?: string | null;
  panelRegistry?: Record<string, any>;
  getElementDef?: (id: string) => any;
  isCustomTitleElementId?: (id: string) => boolean;
  /** Free-text filter typed into the rail search box. */
  query?: string;
  /** Explicit user collapse/expand decisions, keyed by group key. */
  groupOverrides?: Record<string, boolean>;
}

const PANELS_GROUP_KEY = "panels";

/** Categories with no matching panel-registry entry get their wording from here. */
const ELEMENT_GROUP_FALLBACK_LABELS: Record<string, string> = {
  custom: "Custom Titles",
};

/** Categories pinned to the bottom of the rail regardless of element order. */
const TRAILING_GROUP_KEYS = new Set(["custom"]);

function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function groupLabelFor(key: string, panelRegistry?: Record<string, any>): string {
  if (key === PANELS_GROUP_KEY) return "Panels";
  return panelRegistry?.[key]?.label
    || ELEMENT_GROUP_FALLBACK_LABELS[key]
    || titleCase(key);
}

/**
 * Group expansion is derived, not stored, so a fresh editor session opens on the
 * sections the player actually uses. An explicit toggle always wins.
 */
function resolveExpanded(
  key: string,
  { enabledCount, hasSelection }: { enabledCount: number; hasSelection: boolean },
  groupOverrides: Record<string, boolean>,
): boolean {
  const override = groupOverrides[key];
  if (typeof override === "boolean") return override;
  if (hasSelection) return true;
  if (key === PANELS_GROUP_KEY) return true;
  return enabledCount > 0;
}

export function buildPanelListGroups({
  panels = [],
  elements = [],
  selectedPanelId = null,
  panelRegistry,
  getElementDef,
  isCustomTitleElementId,
  query = "",
  groupOverrides = {},
}: PanelListOptions): PanelListGroupModel[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, PanelListGroupModel>();

  function ensureGroup(key: string): PanelListGroupModel {
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: groupLabelFor(key, panelRegistry),
        rows: [],
        enabledCount: 0,
        totalCount: 0,
        hasSelection: false,
        expanded: false,
      };
      groups.set(key, group);
    }
    return group;
  }

  function pushRow(key: string, row: PanelListRowModel): void {
    const group = ensureGroup(key);
    group.rows.push(row);
    group.totalCount += 1;
    if (row.enabled) group.enabledCount += 1;
    if (row.selected) group.hasSelection = true;
  }

  for (const panel of panels) {
    const def = panelRegistry?.[panel.id];
    if (!def) continue;
    pushRow(PANELS_GROUP_KEY, {
      id: panel.id,
      label: def.label,
      kind: "panel",
      enabled: panel.enabled !== false,
      required: Boolean(def.required),
      selected: panel.id === selectedPanelId,
    });
  }

  for (const element of elements) {
    const def = getElementDef?.(element.id);
    if (!def) continue;
    const label = isCustomTitleElementId?.(element.id)
      ? (element.text || def.label)
      : def.label;
    pushRow(def.category || "custom", {
      id: element.id,
      label,
      kind: "element",
      enabled: element.enabled !== false,
      required: false,
      selected: element.id === selectedPanelId,
    });
  }

  const ordered = [...groups.values()].sort((a, b) => {
    return Number(TRAILING_GROUP_KEYS.has(a.key)) - Number(TRAILING_GROUP_KEYS.has(b.key));
  });

  if (!needle) {
    for (const group of ordered) {
      group.expanded = resolveExpanded(group.key, group, groupOverrides);
    }
    return ordered;
  }

  // While filtering, a group-name match keeps the whole group so "gallery" reveals
  // every gallery row rather than only the one literally called "Gallery".
  const matched: PanelListGroupModel[] = [];
  for (const group of ordered) {
    const groupMatches = group.label.toLowerCase().includes(needle);
    const rows = groupMatches
      ? group.rows
      : group.rows.filter((row) => row.label.toLowerCase().includes(needle));
    if (!rows.length) continue;
    matched.push({
      ...group,
      rows,
      enabledCount: rows.filter((row) => row.enabled).length,
      totalCount: rows.length,
      hasSelection: rows.some((row) => row.selected),
      expanded: true,
    });
  }
  return matched;
}

const EYE_OPEN_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3C4.4 3 1.7 5.6 1 8c.7 2.4 3.4 5 7 5s6.3-2.6 7-5c-.7-2.4-3.4-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z"/></svg>`;
const EYE_CLOSED_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.2 1.8 1 3l2.3 2.3C2.1 6.2 1.3 7.2 1 8c.7 2.4 3.4 5 7 5 1.2 0 2.3-.3 3.3-.8L13 14l1.2-1.2-12-11ZM8 11.2a3.2 3.2 0 0 1-2.9-4.6l1.3 1.3a1.6 1.6 0 0 0 2 2l1.3 1.3c-.5.2-1.1.3-1.7.3Zm7-3.2c-.6 2-2.5 4.1-5.2 4.8l-.1-.2 1-.9A5.6 5.6 0 0 0 13.3 8 6 6 0 0 0 8 4.8c-.3 0-.6 0-.9.1L5.8 3.5C6.5 3.2 7.2 3 8 3c3.6 0 6.3 2.6 7 5Z"/></svg>`;
const LOCK_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M11.5 6.5V5a3.5 3.5 0 1 0-7 0v1.5H3.5v7h9v-7h-1ZM6 5a2 2 0 1 1 4 0v1.5H6V5Z"/></svg>`;

function renderRowHtml(row: PanelListRowModel): string {
  const rowClasses = [
    "me-layout-panel-item",
    row.selected ? "me-layout-panel-item--selected" : "",
    row.enabled ? "" : "me-layout-panel-item--hidden",
  ].filter(Boolean).join(" ");

  const safeId = escapeHtml(row.id);
  const safeLabel = escapeHtml(row.label);
  const visibility = row.required
    ? `<span class="me-layout-panel-item__vis me-layout-panel-item__vis--locked" title="Always visible" aria-label="${safeLabel} is always visible" aria-disabled="true">${LOCK_ICON}</span>`
    : `<button
        class="me-layout-panel-item__vis"
        type="button"
        data-panel-visibility="${safeId}"
        aria-pressed="${row.enabled ? "true" : "false"}"
        title="${row.enabled ? "Hide" : "Show"} ${safeLabel}"
        aria-label="${row.enabled ? "Hide" : "Show"} ${safeLabel}"
      >${row.enabled ? EYE_OPEN_ICON : EYE_CLOSED_ICON}</button>`;

  return `
    <div class="me-layout-panel-row">
      <button
        class="${rowClasses}"
        type="button"
        data-panel-select="${safeId}"
        aria-pressed="${row.selected ? "true" : "false"}"
      >
        <span class="me-layout-panel-item__dot"></span>
        <span class="me-layout-panel-item__label">${safeLabel}</span>
      </button>
      ${visibility}
    </div>
  `;
}

function renderGroupHtml(group: PanelListGroupModel): string {
  const safeKey = escapeHtml(group.key);
  return `
    <section class="me-layout-group${group.expanded ? "" : " me-layout-group--collapsed"}" data-panel-group="${safeKey}">
      <button
        class="me-layout-group__toggle"
        type="button"
        data-panel-group-toggle="${safeKey}"
        aria-expanded="${group.expanded ? "true" : "false"}"
      >
        <span class="me-layout-group__chevron" aria-hidden="true"></span>
        <span class="me-layout-group__label">${escapeHtml(group.label)}</span>
        <span class="me-layout-group__count">${group.enabledCount}/${group.totalCount}</span>
      </button>
      <div class="me-layout-group__rows">${group.rows.map(renderRowHtml).join("")}</div>
    </section>
  `;
}

export function renderPanelListHtml(options: PanelListOptions): string {
  const groups = buildPanelListGroups(options);
  if (!groups.length) {
    return `<p class="me-layout-panel-list__empty">No panels match “${escapeHtml(options.query ?? "")}”.</p>`;
  }
  return groups.map(renderGroupHtml).join("");
}
