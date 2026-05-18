export const HERO_CHILD_COLUMNS = 4;
export const HERO_CHILD_ROWS = 5;

export const PROFILE_PANEL_CHILD_REGISTRY = {
  hero: {
    columns: HERO_CHILD_COLUMNS,
    rows: HERO_CHILD_ROWS,
    children: {
      portrait: {
        label: "Portrait Chip",
        minW: 1,
        minH: 1,
        maxW: HERO_CHILD_COLUMNS,
        maxH: HERO_CHILD_ROWS,
        defaultX: 0,
        defaultY: 0,
        defaultW: 4,
        defaultH: 2,
      },
      metrics: {
        label: "Metrics Chip",
        minW: 1,
        minH: 1,
        maxW: HERO_CHILD_COLUMNS,
        maxH: HERO_CHILD_ROWS,
        defaultX: 0,
        defaultY: 2,
        defaultW: 4,
        defaultH: 2,
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
  return registry ? { columns: registry.columns, rows: registry.rows } : null;
}

