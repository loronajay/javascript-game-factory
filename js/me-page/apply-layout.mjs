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

// Player page omits topFriends and friendCode (those panels don't exist on /player).
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

// Applies saved panel layout to the live profile page DOM.
// Sets grid-column/grid-row from layout data and toggles layout-panel--hidden
// on disabled panels. Uses a CSS class so render functions that call
// container.hidden = false can't undo the hidden state.
export function applyProfileLayout(doc, layout, {
  panelToDom = ME_PANEL_TO_DOM,
  required = ME_REQUIRED,
} = {}) {
  if (!layout?.desktop?.panels) return;

  const panelMap = new Map(layout.desktop.panels.map((p) => [p.id, p]));

  for (const [panelId, domId] of Object.entries(panelToDom)) {
    const el = doc.getElementById(domId);
    if (!el) continue;

    const panel = panelMap.get(panelId);
    if (!panel) continue;

    const enabled = panel.enabled !== false || required.has(panelId);
    el.classList.toggle("layout-panel--hidden", !enabled);

    if (enabled) {
      el.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
      el.style.gridRow = `${panel.y + 1} / span ${panel.h}`;
    } else {
      el.style.gridColumn = "";
      el.style.gridRow = "";
    }
  }
}

export function applyMeLayout(doc, layout) {
  applyProfileLayout(doc, layout, { panelToDom: ME_PANEL_TO_DOM, required: ME_REQUIRED });
}

export function applyPlayerLayout(doc, layout) {
  applyProfileLayout(doc, layout, { panelToDom: PLAYER_PANEL_TO_DOM, required: PLAYER_REQUIRED });
}
