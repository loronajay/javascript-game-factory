import { PROFILE_PANEL_REGISTRY, KNOWN_PANEL_IDS } from "./registry.mjs";
import { getDefaultLayout, LAYOUT_COLUMNS, LAYOUT_VERSION } from "./default-layout.mjs";
import { PROFILE_PANEL_CHILD_REGISTRY } from "./child-layout.mjs";

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

  const defaultLayout = getDefaultLayout();
  const defaultPanelMap = new Map(defaultLayout.desktop.panels.map((p) => [p.id, p]));

  for (const p of rawPanels) {
    if (!p || typeof p !== "object") continue;
    const id = p.id;
    if (!KNOWN_PANEL_IDS.has(id)) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const def = PROFILE_PANEL_REGISTRY[id];
    const enabled = p.enabled !== false;

    if (!enabled && def.required) continue; // required panels are always enabled

    // Fully locked panels (not draggable AND not resizable) always use default geometry.
    if (!def.draggable && !def.resizable) {
      const dp = defaultPanelMap.get(id);
      if (dp) {
        normalized.push({ id, enabled, x: dp.x, y: dp.y, w: dp.w, h: dp.h });
        continue;
      }
    }

    const w = clamp(toInt(p.w, def.defaultW), def.minW, def.maxW);
    const h = clamp(toInt(p.h, def.defaultH), def.minH, def.maxH);
    const x = clamp(toInt(p.x, 0), 0, columns - 1);
    const y = Math.max(toInt(p.y, 0), 0);

    // Clamp x so panel fits within the grid
    const clampedX = Math.min(x, columns - w);

    normalized.push({
      id,
      enabled,
      x: clampedX,
      y,
      w,
      h,
      style: normalizePanelStyle(p.style),
      children: normalizePanelChildren(id, p.children),
    });
  }

  // Add any required panels that are missing
  for (const defaultPanel of defaultLayout.desktop.panels) {
    const def = PROFILE_PANEL_REGISTRY[defaultPanel.id];
    if (def.required && !seenIds.has(defaultPanel.id)) {
      normalized.push({
        ...defaultPanel,
        style: normalizePanelStyle(defaultPanel.style),
        children: normalizePanelChildren(defaultPanel.id, defaultPanel.children),
      });
    }
  }

  // Enforce x/w lock for panels where resizableWidth === false (e.g. hero).
  // The general path normalizes h from saved value, but x and w must stay at defaults.
  for (let i = 0; i < normalized.length; i++) {
    const def = PROFILE_PANEL_REGISTRY[normalized[i].id];
    if (def && !def.draggable && def.resizableWidth === false) {
      const dp = defaultPanelMap.get(normalized[i].id);
      if (dp) normalized[i] = { ...normalized[i], x: dp.x, w: dp.w };
    }
  }

  return { version: LAYOUT_VERSION, desktop: { columns, panels: normalized } };
}

export function normalizePanelStyle(raw) {
  if (!raw || typeof raw !== "object") return {};

  const style = {};
  const panelColor = normalizeHexColor(raw.panelColor);
  const panelColor2 = normalizeHexColor(raw.panelColor2);
  const titleColor = normalizeHexColor(raw.titleColor);
  const elementColor = normalizeHexColor(raw.elementColor);
  if (panelColor) style.panelColor = panelColor;
  if (panelColor2) style.panelColor2 = panelColor2;
  if (titleColor) style.titleColor = titleColor;
  if (elementColor) style.elementColor = elementColor;

  const opacity = clampNumber(raw.opacity, 0.15, 1);
  const saturation = clampNumber(raw.saturation, 0, 2);
  const brightness = clampNumber(raw.brightness, 0.35, 1.8);
  const gradientAngle = clampNumber(raw.gradientAngle, 0, 360);
  if (opacity !== null) style.opacity = opacity;
  if (saturation !== null) style.saturation = saturation;
  if (brightness !== null) style.brightness = brightness;
  if (gradientAngle !== null) style.gradientAngle = gradientAngle;

  return style;
}

export function normalizePanelChildren(panelId, rawChildren) {
  const registry = PROFILE_PANEL_CHILD_REGISTRY[panelId];
  if (!registry) return undefined;

  const migratedChildren = migratePanelChildren(panelId, rawChildren);
  const rawById = new Map(
    (Array.isArray(migratedChildren) ? migratedChildren : [])
      .filter((child) => child && typeof child === "object")
      .map((child) => [child.id, child]),
  );

  return Object.entries(registry.children).map(([id, def]) => {
    const raw = rawById.get(id) || {};
    const w = clamp(toInt(raw.w, def.defaultW), def.minW, def.maxW);
    const h = clamp(toInt(raw.h, def.defaultH), def.minH, def.maxH);
    const x = clamp(toInt(raw.x, def.defaultX), 0, registry.columns - 1);
    const y = clamp(toInt(raw.y, def.defaultY), 0, registry.rows - 1);

    return {
      id,
      enabled: raw.enabled !== false,
      x: Math.min(x, registry.columns - w),
      y: Math.min(y, registry.rows - h),
      w,
      h,
      style: normalizePanelStyle(raw.style),
    };
  });
}

function migratePanelChildren(panelId, rawChildren) {
  if (panelId === "topFriends" && Array.isArray(rawChildren)) {
    return rawChildren.map((child) => (
      child?.id === "friend1" ? { ...child, id: "mainSqueeze" } : child
    ));
  }

  if (panelId !== "hero" || !Array.isArray(rawChildren)) return rawChildren;

  const portrait = rawChildren.find((child) => child?.id === "portrait");
  const metrics = rawChildren.find((child) => child?.id === "metrics");
  const defaults = PROFILE_PANEL_CHILD_REGISTRY.hero.children;
  const isCrampedOldDefault =
    portrait?.x === 0 && portrait?.y === 0 && portrait?.w === 4 && portrait?.h === 2 &&
    metrics?.x === 0 && metrics?.y === 2 && metrics?.w === 4 && metrics?.h === 2;
  const isPreviousDefault =
    portrait?.x === 0 && portrait?.y === 0 && portrait?.w === 4 && portrait?.h === 3 &&
    metrics?.x === 0 && metrics?.y === 3 && metrics?.w === 4 && metrics?.h === 2;

  if (isCrampedOldDefault || isPreviousDefault) {
    return rawChildren.map((child) => {
      const def = defaults[child?.id];
      return def
        ? { ...child, x: def.defaultX, y: def.defaultY, w: def.defaultW, h: def.defaultH }
        : child;
    });
  }

  const looksLikeLegacyGrid = rawChildren.every((child) => (
    !child ||
    (
      toInt(child.x, 0) <= 4 &&
      toInt(child.y, 0) <= 5 &&
      toInt(child.w, 1) <= 4 &&
      toInt(child.h, 1) <= 5
    )
  ));
  if (!looksLikeLegacyGrid) return rawChildren;

  return rawChildren.map((child) => {
    if (!child || typeof child !== "object") return child;
    const scaled = {
      ...child,
      x: Math.round(toInt(child.x, 0) * 25),
      y: Math.round(toInt(child.y, 0) * 20),
      w: Math.round(toInt(child.w, 1) * 25),
      h: Math.round(toInt(child.h, 1) * 20),
    };
    const def = defaults[child.id];
    if (!def) return scaled;
    return {
      ...scaled,
      w: Math.max(def.minW, scaled.w),
      h: Math.max(def.minH, scaled.h),
    };
  });
}

function toInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function clampNumber(val, min, max) {
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return "";
}
