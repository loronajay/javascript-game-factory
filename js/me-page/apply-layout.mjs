export const ME_PANEL_TO_DOM = {
  hero: "meHeroCard",
  identity: "meIdentityPanel",
  rankings: "meRankingsPanel",
  topFriends: "meTopFriendsPanel",
  friends: "meFriendsPanel",
  music: "meMusicPanel",
  friendCode: "meFriendCodePanel",
  favoriteGame: "meFavoriteGamePanel",
  gallery: "meGalleryPanel",
  thoughts: "meThoughtsPanel",
  about: "meAboutPanel",
  badges: "meBadgesPanel",
};

export const PLAYER_PANEL_TO_DOM = {
  hero: "playerHeroCard",
  identity: "playerIdentityPanel",
  rankings: "playerRankingsPanel",
  friends: "playerFriendsPanel",
  music: "playerMusicPanel",
  favoriteGame: "playerFavoritePanel",
  gallery: "playerGalleryPanel",
  thoughts: "playerThoughtsPanel",
  about: "playerAboutPanel",
  badges: "playerBadgesPanel",
};

const ME_REQUIRED = new Set(["hero"]);
const PLAYER_REQUIRED = new Set(["hero"]);

// Applies saved panel layout using the 3-column wrapper structure.
// Panels are grouped by x value (x<4=left, x<8=middle, x>=8=right),
// sorted by y within each column, then moved to the correct column
// wrapper via appendChild so columns stack independently without row
// alignment bleeding between them.
export function applyProfileLayout(doc, layout, {
  panelToDom = ME_PANEL_TO_DOM,
  required = ME_REQUIRED,
  layoutSelector = ".me-layout",
  columnSelectors = {
    left: ".me-layout__main",
    middle: ".me-layout__side--middle",
    right: ".me-layout__side--right",
  },
} = {}) {
  if (!layout?.desktop?.panels) return;

  const layoutEl = doc.querySelector(layoutSelector);
  if (!layoutEl) return;

  const leftCol = layoutEl.querySelector(columnSelectors.left);
  const middleCol = layoutEl.querySelector(columnSelectors.middle);
  const rightCol = layoutEl.querySelector(columnSelectors.right);

  const groups = [[], [], []];
  for (const panel of layout.desktop.panels) {
    if (!panelToDom[panel.id]) continue;
    const colIdx = panel.x < 4 ? 0 : panel.x < 8 ? 1 : 2;
    groups[colIdx].push(panel);
  }
  groups.forEach((g) => g.sort((a, b) => a.y - b.y));

  const containers = [leftCol, middleCol, rightCol];

  for (let colIdx = 0; colIdx < 3; colIdx++) {
    const container = containers[colIdx];
    if (!container) continue;

    for (const panel of groups[colIdx]) {
      const el = doc.getElementById(panelToDom[panel.id]);
      if (!el) continue;

      const enabled = panel.enabled !== false || required.has(panel.id);
      el.classList.toggle("layout-panel--hidden", !enabled);
      // Clear any leftover inline grid styles from old flat-grid approach.
      el.style.gridColumn = "";
      el.style.gridRow = "";
      // Move into the correct column in sorted order.
      container.appendChild(el);
    }
  }
}

export function applyMeLayout(doc, layout) {
  applyProfileLayout(doc, layout, {
    panelToDom: ME_PANEL_TO_DOM,
    required: ME_REQUIRED,
    layoutSelector: ".me-layout",
    columnSelectors: {
      left: ".me-layout__main",
      middle: ".me-layout__side--middle",
      right: ".me-layout__side--right",
    },
  });
}

export function applyPlayerLayout(doc, layout) {
  applyProfileLayout(doc, layout, {
    panelToDom: PLAYER_PANEL_TO_DOM,
    required: PLAYER_REQUIRED,
    layoutSelector: ".player-layout",
    columnSelectors: {
      left: ".player-layout__main",
      middle: ".player-layout__side--middle",
      right: ".player-layout__side--right",
    },
  });
}
