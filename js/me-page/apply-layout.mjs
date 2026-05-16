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

// Applies saved panel layout onto the 12-column CSS grid.
// Panels are sorted by column-group (x<4=left, x<8=mid, x>=8=right) then by y within
// each group so DOM order produces correct single-column stacking at mobile breakpoints.
// Inline grid-column / grid-row styles drive desktop placement; the mobile CSS overrides
// them back to auto with !important so the DOM order takes over.
export function applyProfileLayout(doc, layout, {
  panelToDom = ME_PANEL_TO_DOM,
  required = ME_REQUIRED,
  layoutSelector = ".me-layout",
} = {}) {
  if (!layout?.desktop?.panels) return;

  const layoutEl = doc.querySelector(layoutSelector);
  if (!layoutEl) return;

  // Sort: column bucket first (0=left, 1=mid, 2=right), then y within bucket.
  const panels = [...layout.desktop.panels].sort((a, b) => {
    const ga = a.x < 4 ? 0 : a.x < 8 ? 1 : 2;
    const gb = b.x < 4 ? 0 : b.x < 8 ? 1 : 2;
    return ga !== gb ? ga - gb : a.y - b.y;
  });

  for (const panel of panels) {
    if (!panelToDom[panel.id]) continue;
    const el = doc.getElementById(panelToDom[panel.id]);
    if (!el) continue;

    const enabled = panel.enabled !== false || required.has(panel.id);
    el.classList.toggle("layout-panel--hidden", !enabled);

    el.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
    el.style.gridRow    = `${panel.y + 1} / span ${panel.h}`;

    // Append in sort order so DOM order drives mobile stacking.
    layoutEl.appendChild(el);
  }
}

export function applyMeLayout(doc, layout) {
  applyProfileLayout(doc, layout, {
    panelToDom: ME_PANEL_TO_DOM,
    required: ME_REQUIRED,
    layoutSelector: ".me-layout",
  });
}

export function applyPlayerLayout(doc, layout) {
  applyProfileLayout(doc, layout, {
    panelToDom: PLAYER_PANEL_TO_DOM,
    required: PLAYER_REQUIRED,
    layoutSelector: ".player-layout",
  });
}
