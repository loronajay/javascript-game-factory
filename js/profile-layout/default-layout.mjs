export const LAYOUT_COLUMNS = 12;
export const LAYOUT_VERSION = 1;

// Maps the classic 3-column profile structure onto a 12-column grid.
// Left col = x 0–3 (w4), Middle col = x 4–7 (w4), Right col = x 8–11 (w4).
// Music sits at the bottom of the middle column (enabled:true so initProfileMusicPlayer
// can reveal it naturally). When the playlist is empty the section stays hidden via the
// HTML `hidden` attribute; since music is the last item in its column, no empty gap forms.
export const DEFAULT_PROFILE_LAYOUT = {
  version: LAYOUT_VERSION,
  desktop: {
    columns: LAYOUT_COLUMNS,
    panels: [
      // Left column
      { id: "hero",         enabled: true, x: 0, y: 0,  w: 4, h: 5 },
      { id: "identity",     enabled: true, x: 0, y: 5,  w: 4, h: 3 },
      { id: "rankings",     enabled: true, x: 0, y: 8,  w: 4, h: 3 },
      { id: "topFriends",   enabled: true, x: 0, y: 11, w: 4, h: 3 },
      { id: "friends",      enabled: true, x: 0, y: 14, w: 4, h: 3 },
      // Middle column
      { id: "music",        enabled: true, x: 4, y: 0,  w: 4, h: 3 },
      { id: "favoriteGame", enabled: true, x: 4, y: 3,  w: 4, h: 4 },
      { id: "friendCode",   enabled: true, x: 4, y: 7,  w: 4, h: 3 },
      { id: "gallery",      enabled: true, x: 4, y: 10, w: 4, h: 3 },
      // Right column
      { id: "about",        enabled: true, x: 8, y: 0,  w: 4, h: 2 },
      { id: "badges",       enabled: true, x: 8, y: 2,  w: 4, h: 2 },
      { id: "thoughts",     enabled: true, x: 8, y: 4,  w: 4, h: 5 },
    ],
  },
};

export function getDefaultLayout() {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE_LAYOUT));
}

// Player page omits topFriends and friendCode, so panels are repositioned
// to fill those gaps compactly.
export const PLAYER_DEFAULT_PROFILE_LAYOUT = {
  version: LAYOUT_VERSION,
  desktop: {
    columns: LAYOUT_COLUMNS,
    panels: [
      // Left column
      { id: "hero",         enabled: true, x: 0, y: 0,  w: 4, h: 5 },
      { id: "identity",     enabled: true, x: 0, y: 5,  w: 4, h: 3 },
      { id: "rankings",     enabled: true, x: 0, y: 8,  w: 4, h: 3 },
      { id: "friends",      enabled: true, x: 0, y: 11, w: 4, h: 3 },
      // Middle column (no friendCode on player page)
      { id: "music",        enabled: true, x: 4, y: 0,  w: 4, h: 3 },
      { id: "favoriteGame", enabled: true, x: 4, y: 3,  w: 4, h: 4 },
      { id: "gallery",      enabled: true, x: 4, y: 7,  w: 4, h: 3 },
      // Right column
      { id: "about",        enabled: true, x: 8, y: 0,  w: 4, h: 2 },
      { id: "badges",       enabled: true, x: 8, y: 2,  w: 4, h: 2 },
      { id: "thoughts",     enabled: true, x: 8, y: 4,  w: 4, h: 5 },
    ],
  },
};

export function getPlayerDefaultLayout() {
  return JSON.parse(JSON.stringify(PLAYER_DEFAULT_PROFILE_LAYOUT));
}
