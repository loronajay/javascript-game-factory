export const LAYOUT_COLUMNS = 12;
export const LAYOUT_VERSION = 1;

// Maps the current 3-column profile structure (main/middle/right) onto a 12-column grid.
// Main col = x 0–3 (w4), Middle col = x 4–7 (w4), Right col = x 8–11 (w4).
export const DEFAULT_PROFILE_LAYOUT = {
  version: LAYOUT_VERSION,
  desktop: {
    columns: LAYOUT_COLUMNS,
    panels: [
      { id: "hero",         enabled: true, x: 0, y: 0,  w: 12, h: 3 },
      { id: "identity",     enabled: true, x: 0, y: 3,  w: 4,  h: 3 },
      { id: "music",        enabled: true, x: 0, y: 6,  w: 4,  h: 3 },
      { id: "rankings",     enabled: true, x: 0, y: 9,  w: 4,  h: 2 },
      { id: "topFriends",   enabled: true, x: 0, y: 11, w: 4,  h: 2 },
      { id: "friends",      enabled: true, x: 0, y: 13, w: 4,  h: 3 },
      { id: "friendCode",   enabled: true, x: 4, y: 3,  w: 4,  h: 3 },
      { id: "favoriteGame", enabled: true, x: 4, y: 6,  w: 4,  h: 2 },
      { id: "gallery",      enabled: true, x: 4, y: 8,  w: 4,  h: 3 },
      { id: "thoughts",     enabled: true, x: 8, y: 3,  w: 4,  h: 5 },
      { id: "about",        enabled: true, x: 8, y: 8,  w: 4,  h: 2 },
      { id: "badges",       enabled: true, x: 8, y: 10, w: 4,  h: 2 },
    ],
  },
};

export function getDefaultLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE_LAYOUT));
}
