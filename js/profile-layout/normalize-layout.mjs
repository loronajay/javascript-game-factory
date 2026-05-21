import { PROFILE_PANEL_REGISTRY, KNOWN_PANEL_IDS } from "./registry.mjs";
import { getDefaultLayout, LAYOUT_COLUMNS, LAYOUT_VERSION } from "./default-layout.mjs?v=20260521-freeform-panels-1";
import { getDefaultPanelChildren, PROFILE_PANEL_CHILD_REGISTRY } from "./child-layout.mjs";
import {
  COMPOSITION_GRID_COLUMNS,
  COMPOSITION_GRID_ROWS,
  CUSTOM_TITLE_PREFIX,
  PROFILE_COMPOSITION_ELEMENT_REGISTRY,
  CUSTOM_TITLE_ELEMENT_DEF,
  getDefaultCompositionElements,
  isCustomTitleElementId,
} from "./composition-layout.mjs?v=20260521-freeform-panels-1";

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

  return {
    version: LAYOUT_VERSION,
    desktop: {
      columns,
      elements: migrateCompositionElementStylesFromPanelChildren(
        normalizeCompositionElements(desktop.elements),
        normalized,
      ),
      panels: normalized,
    },
  };
}

export function normalizeCompositionElements(rawElements) {
  if (!Array.isArray(rawElements) || rawElements.length === 0) return [];
  if (compositionElementsAreUntouchedDefault(rawElements)) return [];

  const rawById = buildRawCompositionElementMap(rawElements);

  const normalized = Object.entries(PROFILE_COMPOSITION_ELEMENT_REGISTRY).map(([id, def]) => {
    const raw = rawById.get(id) || {};
    return normalizeCompositionElement(id, raw, def);
  });

  const customTitles = (Array.isArray(rawElements) ? rawElements : [])
    .filter((element) => element && isCustomTitleElementId(element.id))
    .map((element) => normalizeCompositionElement(element.id, element, CUSTOM_TITLE_ELEMENT_DEF));

  return [...disableUntouchedThoughtsFreeformDefaults(normalized, rawById), ...customTitles];
}

function buildRawCompositionElementMap(rawElements) {
  const rawById = new Map();
  rawElements
    .filter((element) => element && typeof element === "object")
    .forEach((element) => {
      const existing = rawById.get(element.id);
      rawById.set(element.id, selectRawCompositionElement(existing, element));
    });
  return rawById;
}

function selectRawCompositionElement(existing, incoming) {
  if (!existing) return incoming;
  if (incoming?.enabled !== false && existing?.enabled === false) return incoming;
  if (existing?.enabled !== false && incoming?.enabled === false) return existing;
  if (String(incoming?.id || "").startsWith("galleryPhoto")) {
    const existingOldTiny = isOldTinyGalleryPhotoGeometry(existing);
    const incomingOldTiny = isOldTinyGalleryPhotoGeometry(incoming);
    if (existingOldTiny && !incomingOldTiny) return incoming;
    if (!existingOldTiny && incomingOldTiny) return existing;
    const existingArea = Math.max(0, toNumber(existing.w, 0)) * Math.max(0, toNumber(existing.h, 0));
    const incomingArea = Math.max(0, toNumber(incoming.w, 0)) * Math.max(0, toNumber(incoming.h, 0));
    return incomingArea >= existingArea ? incoming : existing;
  }
  return incoming;
}

function normalizeCompositionElement(id, raw, def) {
  const migratedRaw = migrateCompositionElementGeometry(id, raw, def);
  const safeId = isCustomTitleElementId(id)
    ? `${CUSTOM_TITLE_PREFIX}${String(id).slice(CUSTOM_TITLE_PREFIX.length).replace(/[^a-z0-9_-]/gi, "").slice(0, 40)}`
    : id;
  const w = clamp(toNumber(migratedRaw.w, def.defaultW), def.minW, def.maxW);
  const h = clamp(toNumber(migratedRaw.h, def.defaultH), def.minH, def.maxH);
  const x = clamp(toNumber(migratedRaw.x, def.defaultX), 0, COMPOSITION_GRID_COLUMNS - w);
  const y = clamp(toNumber(migratedRaw.y, def.defaultY), 0, COMPOSITION_GRID_ROWS - h);
  return {
    id: safeId,
    category: def.category,
    type: def.type,
    enabled: migratedRaw.enabled ?? (def.defaultEnabled !== false),
    text: typeof migratedRaw.text === "string" ? migratedRaw.text : (def.defaultText || ""),
    x,
    y,
    w,
    h,
    style: normalizePanelStyle(migratedRaw.style),
  };
}

function migrateCompositionElementGeometry(id, raw, def) {
  if (def.type !== "galleryPhoto" || !raw || raw.enabled === false) return raw || {};

  const rawW = toNumber(raw.w, def.defaultW);
  const rawH = toNumber(raw.h, def.defaultH);
  const looksLikeOldTinyPhotoDefault = isOldTinyGalleryPhotoGeometry({ ...raw, w: rawW, h: rawH });
  if (!looksLikeOldTinyPhotoDefault) return raw;

  const migratedDefault = getMigratedGalleryPhotoDefault(id, def);
  return {
    ...raw,
    x: migratedDefault.x,
    y: migratedDefault.y,
    w: migratedDefault.w,
    h: migratedDefault.h,
  };
}

function isOldTinyGalleryPhotoGeometry(element) {
  return numbersEqual(element?.w, 0.4) && numbersEqual(element?.h, 0.62);
}

function getMigratedGalleryPhotoDefault(id, def) {
  const match = String(id || "").match(/^galleryPhoto(\d+)$/);
  const index = match ? Number.parseInt(match[1], 10) - 1 : -1;
  if (index < 0 || index >= 8) {
    return { x: def.defaultX, y: def.defaultY, w: def.defaultW, h: def.defaultH };
  }

  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: 4.35 + col * 0.88,
    y: 7.85 + row * 1.15,
    w: 0.8,
    h: 1.05,
  };
}

function disableUntouchedThoughtsFreeformDefaults(elements, rawById) {
  const thoughtsIds = ["thoughtsSurface", "thoughtsTitle", "thoughtsComposer", "thoughtsFeed"];
  const rawThoughts = thoughtsIds.map((id) => rawById.get(id));
  const badDefaultWasSaved = rawThoughts.every((raw) => raw && raw.enabled !== false) &&
    thoughtsIds.every((id) => {
      const raw = rawById.get(id);
      const def = PROFILE_COMPOSITION_ELEMENT_REGISTRY[id];
      if (!raw || !def) return false;
      const rawStyle = raw.style && typeof raw.style === "object" ? raw.style : {};
      const textMatches = def.type !== "title" || !raw.text || raw.text === def.defaultText;
      return textMatches &&
        Object.keys(rawStyle).length === 0 &&
        numbersEqual(raw.x, def.defaultX) &&
        numbersEqual(raw.y, def.defaultY) &&
        numbersEqual(raw.w, def.defaultW) &&
        numbersEqual(raw.h, def.defaultH);
    });

  if (!badDefaultWasSaved) return elements;

  return elements.map((element) => (
    thoughtsIds.includes(element.id)
      ? { ...element, enabled: false }
      : element
  ));
}

function numbersEqual(value, expected) {
  const n = parseFloat(value);
  return Number.isFinite(n) && Math.abs(n - expected) < 0.001;
}

function migrateCompositionElementStylesFromPanelChildren(elements, panels) {
  const childStyleByElementId = new Map();
  const panelById = new Map((Array.isArray(panels) ? panels : []).map((panel) => [panel.id, panel]));
  const legacyLinks = [
    ["identityTitle", "identity", "title"],
    ["identityName", "identity", "name"],
    ["identityPageViews", "identity", "pageViews"],
    ["identityFactoryId", "identity", "factoryId"],
    ["identitySocialLinks", "identity", "socialLinks"],
    ["identityFriendAction", "identity", "friendAction"],
    ["identityMessageAction", "identity", "messageAction"],
    ["identityGestureActions", "identity", "gestureActions"],
    ["aboutTitle", "about", "title"],
    ["aboutText", "about", "text"],
    ["badgesTitle", "badges", "title"],
    ["badgesContent", "badges", "content"],
    ["friendCodeTitle", "friendCode", "title"],
    ["friendCodeContent", "friendCode", "code"],
    ["galleryTitle", "gallery", "title"],
    ["galleryContent", "gallery", "content"],
    ["thoughtsTitle", "thoughts", "title"],
    ["thoughtsComposer", "thoughts", "composer"],
    ["thoughtsFeed", "thoughts", "feed"],
  ];

  for (const [elementId, panelId, childId] of legacyLinks) {
    const child = panelById.get(panelId)?.children?.find((item) => item.id === childId);
    if (child?.style && Object.keys(child.style).length > 0) {
      childStyleByElementId.set(elementId, child.style);
    }
  }

  if (childStyleByElementId.size === 0) return elements;

  return elements.map((element) => {
    const legacyStyle = childStyleByElementId.get(element.id);
    if (!legacyStyle) return element;
    return {
      ...element,
      style: {
        ...legacyStyle,
        ...(element.style || {}),
      },
    };
  });
}

export function normalizePanelStyle(raw) {
  if (!raw || typeof raw !== "object") return {};

  const style = {};
  const panelColor = normalizeHexColor(raw.panelColor);
  const panelColor2 = normalizeHexColor(raw.panelColor2);
  const titleColor = normalizeHexColor(raw.titleColor);
  const elementColor = normalizeHexColor(raw.elementColor);
  const textColor = normalizeHexColor(raw.textColor);
  const buttonColor = normalizeHexColor(raw.buttonColor);
  if (panelColor) style.panelColor = panelColor;
  if (panelColor2) style.panelColor2 = panelColor2;
  if (titleColor) style.titleColor = titleColor;
  if (elementColor) style.elementColor = elementColor;
  if (textColor) style.textColor = textColor;
  if (buttonColor) style.buttonColor = buttonColor;

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

function compositionElementsAreUntouchedDefault(rawElements) {
  if (!Array.isArray(rawElements) || rawElements.length === 0) return false;

  const defaultsById = new Map(getDefaultCompositionElements().map((element) => [element.id, element]));
  const knownElements = rawElements.filter((element) => defaultsById.has(element?.id));
  if (knownElements.length !== defaultsById.size) return false;

  return knownElements.every((element) => {
    const def = defaultsById.get(element.id);
    const style = element.style && typeof element.style === "object" ? element.style : {};
    return element.category === def.category &&
      element.type === def.type &&
      (element.enabled ?? true) === (def.enabled ?? true) &&
      (element.text || "") === (def.text || "") &&
      Object.keys(style).length === 0 &&
      numbersEqual(element.x, def.x) &&
      numbersEqual(element.y, def.y) &&
      numbersEqual(element.w, def.w) &&
      numbersEqual(element.h, def.h);
  });
}

function migratePanelChildren(panelId, rawChildren) {
  if (panelId === "identity" && Array.isArray(rawChildren)) {
    const defaults = PROFILE_PANEL_CHILD_REGISTRY.identity.children;
    const oldDefaultById = {
      name: { x: 8, y: 22, w: 84, h: 16 },
      nameWideLinks1: { id: "name", x: 8, y: 22, w: 84, h: 15 },
      pageViews: { x: 8, y: 42, w: 84, h: 16 },
      pageViewsWideLinks1: { id: "pageViews", x: 8, y: 40, w: 84, h: 15 },
      factoryId: { x: 8, y: 62, w: 84, h: 16 },
      factoryIdWideLinks1: { id: "factoryId", x: 8, y: 58, w: 84, h: 15 },
      socialLinks: { x: 8, y: 82, w: 84, h: 14 },
      socialLinksWideLinks1: { id: "socialLinks", x: 8, y: 76, w: 84, h: 20 },
    };
    return rawChildren.map((child) => {
      const oldDefault = Object.values(oldDefaultById).find((candidate) => (
        (candidate.id || child?.id) === child?.id &&
        child.x === candidate.x &&
        child.y === candidate.y &&
        child.w === candidate.w &&
        child.h === candidate.h
      ));
      const nextDefault = defaults[child?.id];
      return oldDefault && nextDefault
        ? { ...child, x: nextDefault.defaultX, y: nextDefault.defaultY, w: nextDefault.defaultW, h: nextDefault.defaultH }
        : child;
    });
  }

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

function toNumber(val, fallback) {
  const n = parseFloat(val);
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
