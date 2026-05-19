export const COMPOSITION_GRID_COLUMNS = 12;
export const COMPOSITION_GRID_ROWS = 17;
export const CUSTOM_TITLE_PREFIX = "customTitle_";

export const CUSTOM_TITLE_ELEMENT_DEF = {
  label: "Custom Title Bubble",
  category: "custom",
  type: "title",
  defaultEnabled: true,
  defaultText: "New Section",
  defaultX: 4,
  defaultY: 1,
  defaultW: 2.4,
  defaultH: 0.55,
  minW: 0.75,
  minH: 0.4,
  maxW: 12,
  maxH: 17,
  custom: true,
};

export const PROFILE_COMPOSITION_ELEMENT_REGISTRY = {
  heroSurface: {
    label: "Hero Surface",
    category: "hero",
    type: "surface",
    defaultEnabled: true,
    defaultX: 0,
    defaultY: 0,
    defaultW: 4,
    defaultH: 5,
    minW: 1,
    minH: 1,
    maxW: 12,
    maxH: 17,
  },
  heroPortrait: {
    label: "Portrait Chip",
    category: "hero",
    type: "portrait",
    defaultEnabled: true,
    defaultX: 1,
    defaultY: 0.25,
    defaultW: 2,
    defaultH: 1.8,
    minW: 0.75,
    minH: 0.75,
    maxW: 12,
    maxH: 17,
  },
  heroMetrics: {
    label: "Metrics Chip",
    category: "hero",
    type: "metrics",
    defaultEnabled: true,
    defaultX: 0.8,
    defaultY: 2.3,
    defaultW: 2.4,
    defaultH: 2.4,
    minW: 1,
    minH: 1,
    maxW: 12,
    maxH: 17,
  },
  heroTitle: {
    label: "Hero Title Bubble",
    category: "hero",
    type: "title",
    defaultEnabled: false,
    defaultText: "Player Profile",
    defaultX: 0.8,
    defaultY: 0.2,
    defaultW: 2.4,
    defaultH: 0.55,
    minW: 0.75,
    minH: 0.4,
    maxW: 12,
    maxH: 17,
  },
};

export function isCustomTitleElementId(id) {
  return typeof id === "string" && id.startsWith(CUSTOM_TITLE_PREFIX);
}

export function getCompositionElementDef(id) {
  return PROFILE_COMPOSITION_ELEMENT_REGISTRY[id] || (isCustomTitleElementId(id) ? CUSTOM_TITLE_ELEMENT_DEF : null);
}

export function getDefaultCompositionElements() {
  return Object.entries(PROFILE_COMPOSITION_ELEMENT_REGISTRY).map(([id, def]) => ({
    id,
    category: def.category,
    type: def.type,
    enabled: def.defaultEnabled !== false,
    text: def.defaultText || "",
    x: def.defaultX,
    y: def.defaultY,
    w: def.defaultW,
    h: def.defaultH,
    style: {},
  }));
}
