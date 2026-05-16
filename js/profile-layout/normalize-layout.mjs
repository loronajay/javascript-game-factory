import { PROFILE_PANEL_REGISTRY, KNOWN_PANEL_IDS } from "./registry.mjs";
import { getDefaultLayout, LAYOUT_COLUMNS, LAYOUT_VERSION } from "./default-layout.mjs";

export function normalizeLayout(raw) {
  if (!raw || typeof raw !== "object") return getDefaultLayout();

  const version = raw.version;
  if (version !== LAYOUT_VERSION) return getDefaultLayout();

  const desktop = raw.desktop;
  if (!desktop || typeof desktop !== "object") return getDefaultLayout();

  const columns = typeof desktop.columns === "number" ? desktop.columns : LAYOUT_COLUMNS;
  if (columns !== LAYOUT_COLUMNS) return getDefaultLayout();

  const rawPanels = Array.isArray(desktop.panels) ? desktop.panels : [];
  const seenIds = new Set();
  const normalized = [];

  for (const p of rawPanels) {
    if (!p || typeof p !== "object") continue;
    const id = p.id;
    if (!KNOWN_PANEL_IDS.has(id)) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const def = PROFILE_PANEL_REGISTRY[id];
    const enabled = p.enabled !== false;

    if (!enabled && def.required) continue; // required panels are always enabled

    const w = clamp(toInt(p.w, def.defaultW), def.minW, def.maxW);
    const h = clamp(toInt(p.h, def.defaultH), def.minH, def.maxH);
    const x = clamp(toInt(p.x, 0), 0, columns - 1);
    const y = Math.max(toInt(p.y, 0), 0);

    // Clamp x so panel fits within the grid
    const clampedX = Math.min(x, columns - w);

    normalized.push({ id, enabled, x: clampedX, y, w, h });
  }

  // Add any required panels that are missing
  const defaultLayout = getDefaultLayout();
  for (const defaultPanel of defaultLayout.desktop.panels) {
    const def = PROFILE_PANEL_REGISTRY[defaultPanel.id];
    if (def.required && !seenIds.has(defaultPanel.id)) {
      normalized.push({ ...defaultPanel });
    }
  }

  return { version: LAYOUT_VERSION, desktop: { columns, panels: normalized } };
}

function toInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}
