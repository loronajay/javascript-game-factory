export const HERO_CHILD_COLUMNS = 100;
export const HERO_CHILD_ROWS = 100;
export const HERO_CHILD_VISUAL_COLUMNS = 10;
export const HERO_CHILD_VISUAL_ROWS = 10;

export interface PanelChildDef {
  label: string;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  defaultX: number;
  defaultY: number;
  defaultW: number;
  defaultH: number;
}

export interface PanelChildGroup {
  columns: number;
  rows: number;
  visualColumns: number;
  visualRows: number;
  children: Record<string, PanelChildDef>;
}

export interface PanelChildGrid {
  columns: number;
  rows: number;
  visualColumns: number;
  visualRows: number;
}

export interface DefaultPanelChild {
  id: string;
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  style: Record<string, unknown>;
}

export const PROFILE_PANEL_CHILD_REGISTRY: Record<string, PanelChildGroup> = {
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
  identity: {
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
        defaultX: 20,
        defaultY: 4,
        defaultW: 60,
        defaultH: 14,
      },
      name: {
        label: "Name Field",
        minW: 24,
        minH: 12,
        maxW: 100,
        maxH: 60,
        defaultX: 8,
        defaultY: 22,
        defaultW: 84,
        defaultH: 14,
      },
      pageViews: {
        label: "Page Views",
        minW: 20,
        minH: 12,
        maxW: 100,
        maxH: 60,
        defaultX: 8,
        defaultY: 38,
        defaultW: 84,
        defaultH: 14,
      },
      factoryId: {
        label: "Factory ID",
        minW: 24,
        minH: 12,
        maxW: 100,
        maxH: 60,
        defaultX: 8,
        defaultY: 54,
        defaultW: 84,
        defaultH: 14,
      },
      socialLinks: {
        label: "Social Links",
        minW: 24,
        minH: 14,
        maxW: 100,
        maxH: 80,
        defaultX: 8,
        defaultY: 70,
        defaultW: 84,
        defaultH: 26,
      },
    },
  },
  music: {
    columns: 100,
    rows: 100,
    visualColumns: 10,
    visualRows: 10,
    children: {
      playerSurface: {
        label: "Player Surface",
        minW: 24,
        minH: 20,
        maxW: 100,
        maxH: 100,
        defaultX: 8,
        defaultY: 12,
        defaultW: 84,
        defaultH: 76,
      },
      deck: {
        label: "Tape Deck",
        minW: 18,
        minH: 12,
        maxW: 100,
        maxH: 70,
        defaultX: 14,
        defaultY: 18,
        defaultW: 72,
        defaultH: 26,
      },
      trackLabel: {
        label: "Track Label",
        minW: 18,
        minH: 12,
        maxW: 100,
        maxH: 70,
        defaultX: 14,
        defaultY: 49,
        defaultW: 72,
        defaultH: 20,
      },
      controls: {
        label: "Player Controls",
        minW: 18,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 14,
        defaultY: 74,
        defaultW: 72,
        defaultH: 14,
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
  rankings: {
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
        defaultX: 16,
        defaultY: 3,
        defaultW: 68,
        defaultH: 14,
      },
      ranking1: {
        label: "Ranking Slot 1",
        minW: 20,
        minH: 12,
        maxW: 100,
        maxH: 60,
        defaultX: 8,
        defaultY: 24,
        defaultW: 84,
        defaultH: 18,
      },
      ranking2: {
        label: "Ranking Slot 2",
        minW: 20,
        minH: 12,
        maxW: 100,
        maxH: 60,
        defaultX: 8,
        defaultY: 45,
        defaultW: 84,
        defaultH: 18,
      },
      ranking3: {
        label: "Ranking Slot 3",
        minW: 20,
        minH: 12,
        maxW: 100,
        maxH: 60,
        defaultX: 8,
        defaultY: 66,
        defaultW: 84,
        defaultH: 18,
      },
    },
  },
  friendCode: {
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
        defaultY: 4,
        defaultW: 50,
        defaultH: 14,
      },
      code: {
        label: "Friend Code Box",
        minW: 24,
        minH: 24,
        maxW: 100,
        maxH: 100,
        defaultX: 10,
        defaultY: 24,
        defaultW: 80,
        defaultH: 66,
      },
    },
  },
  gallery: {
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
        defaultY: 4,
        defaultW: 50,
        defaultH: 14,
      },
      content: {
        label: "Gallery Grid",
        minW: 24,
        minH: 20,
        maxW: 100,
        maxH: 100,
        defaultX: 8,
        defaultY: 24,
        defaultW: 84,
        defaultH: 68,
      },
    },
  },
  thoughts: {
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
        defaultY: 3,
        defaultW: 50,
        defaultH: 10,
      },
      composer: {
        label: "Composer",
        minW: 24,
        minH: 18,
        maxW: 100,
        maxH: 100,
        defaultX: 8,
        defaultY: 16,
        defaultW: 84,
        defaultH: 32,
      },
      feed: {
        label: "Feed",
        minW: 24,
        minH: 18,
        maxW: 100,
        maxH: 100,
        defaultX: 8,
        defaultY: 54,
        defaultW: 84,
        defaultH: 40,
      },
    },
  },
  about: {
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
        defaultY: 4,
        defaultW: 50,
        defaultH: 16,
      },
      text: {
        label: "About Text",
        minW: 20,
        minH: 16,
        maxW: 100,
        maxH: 100,
        defaultX: 12,
        defaultY: 26,
        defaultW: 76,
        defaultH: 64,
      },
    },
  },
  badges: {
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
        defaultY: 4,
        defaultW: 50,
        defaultH: 16,
      },
      content: {
        label: "Badge Box",
        minW: 20,
        minH: 16,
        maxW: 100,
        maxH: 100,
        defaultX: 12,
        defaultY: 26,
        defaultW: 76,
        defaultH: 64,
      },
    },
  },
  topFriends: {
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
      mainSqueeze: {
        label: "Main Squeeze",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 8,
        defaultY: 18,
        defaultW: 84,
        defaultH: 14,
      },
      friend2: {
        label: "Friend Slot 2",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 8,
        defaultY: 34,
        defaultW: 84,
        defaultH: 14,
      },
      friend3: {
        label: "Friend Slot 3",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 8,
        defaultY: 50,
        defaultW: 84,
        defaultH: 14,
      },
      friend4: {
        label: "Friend Slot 4",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 8,
        defaultY: 66,
        defaultW: 84,
        defaultH: 14,
      },
      friend5: {
        label: "Friend Slot 5",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 8,
        defaultY: 82,
        defaultW: 84,
        defaultH: 14,
      },
    },
  },
  friends: {
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
        defaultY: 4,
        defaultW: 50,
        defaultH: 14,
      },
      navigatorSurface: {
        label: "Navigator Surface",
        minW: 24,
        minH: 20,
        maxW: 100,
        maxH: 100,
        defaultX: 8,
        defaultY: 24,
        defaultW: 84,
        defaultH: 68,
      },
      toggle: {
        label: "Toggle Button",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 12,
        defaultY: 30,
        defaultW: 76,
        defaultH: 18,
      },
      search: {
        label: "Search Box",
        minW: 20,
        minH: 10,
        maxW: 100,
        maxH: 50,
        defaultX: 12,
        defaultY: 54,
        defaultW: 76,
        defaultH: 16,
      },
      list: {
        label: "Friend List",
        minW: 20,
        minH: 12,
        maxW: 100,
        maxH: 100,
        defaultX: 12,
        defaultY: 74,
        defaultW: 76,
        defaultH: 18,
      },
    },
  },
};

export function getDefaultPanelChildren(panelId: string): DefaultPanelChild[] {
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

export function getPanelChildGrid(panelId: string): PanelChildGrid | null {
  const registry = PROFILE_PANEL_CHILD_REGISTRY[panelId];
  return registry ? {
    columns: registry.columns,
    rows: registry.rows,
    visualColumns: registry.visualColumns || registry.columns,
    visualRows: registry.visualRows || registry.rows,
  } : null;
}
