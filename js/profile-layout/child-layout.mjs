export const HERO_CHILD_COLUMNS = 100;
export const HERO_CHILD_ROWS = 100;
export const HERO_CHILD_VISUAL_COLUMNS = 10;
export const HERO_CHILD_VISUAL_ROWS = 10;

export const PROFILE_PANEL_CHILD_REGISTRY = {
  hero: {
    columns: HERO_CHILD_COLUMNS,
    rows: HERO_CHILD_ROWS,
    visualColumns: HERO_CHILD_VISUAL_COLUMNS,
    visualRows: HERO_CHILD_VISUAL_ROWS,
    children: {
      portrait: {
        label: "Portrait Chip",
        minW: 12,
        minH: 12,
        maxW: HERO_CHILD_COLUMNS,
        maxH: HERO_CHILD_ROWS,
        defaultX: 25,
        defaultY: 5,
        defaultW: 50,
        defaultH: 36,
      },
      metrics: {
        label: "Metrics Chip",
        minW: 18,
        minH: 18,
        maxW: HERO_CHILD_COLUMNS,
        maxH: HERO_CHILD_ROWS,
        defaultX: 20,
        defaultY: 46,
        defaultW: 60,
        defaultH: 48,
      },
    },
  },
  favoriteGame: {
    columns: 100,
    rows: 100,
    visualColumns: 10,
    visualRows: 10,
    children: {
      title: {
        label: "Title Bubble",
        minW: 12,
        minH: 8,
        maxW: 100,
        maxH: 40,
        defaultX: 25,
        defaultY: 2,
        defaultW: 50,
        defaultH: 12,
      },
      content: {
        label: "Favorite Card",
        minW: 20,
        minH: 20,
        maxW: 100,
        maxH: 100,
        defaultX: 16,
        defaultY: 18,
        defaultW: 68,
        defaultH: 76,
      },
    },
  },
};

export function getDefaultPanelChildren(panelId) {
  const registry = PROFILE_PANEL_CHILD_REGISTRY[panelId];
  if (!registry) return [];

  return Object.entries(registry.children).map(([id, def]) => ({
    id,
    enabled: true,
    x: def.defaultX,
    y: def.defaultY,
    w: def.defaultW,
    h: def.defaultH,
    style: {},
  }));
}

export function getPanelChildGrid(panelId) {
  const registry = PROFILE_PANEL_CHILD_REGISTRY[panelId];
  return registry ? {
    columns: registry.columns,
    rows: registry.rows,
    visualColumns: registry.visualColumns || registry.columns,
    visualRows: registry.visualRows || registry.rows,
  } : null;
}
