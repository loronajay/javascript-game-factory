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

const DEFAULT_PANEL_STYLE = {
  opacity: 0.96,
  saturation: 1,
  brightness: 1,
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
    applyPanelVisualStyle(el, panel.style);

    // Append in sort order so DOM order drives mobile stacking.
    layoutEl.appendChild(el);
  }
}

function applyPanelVisualStyle(el, style = {}) {
  const panelColor = normalizeHexColor(style.panelColor);
  const titleColor = normalizeHexColor(style.titleColor);
  const elementColor = normalizeHexColor(style.elementColor);
  const opacity = clampNumber(style.opacity, 0.15, 1, DEFAULT_PANEL_STYLE.opacity);
  const saturation = clampNumber(style.saturation, 0, 2, DEFAULT_PANEL_STYLE.saturation);
  const brightness = clampNumber(style.brightness, 0.35, 1.8, DEFAULT_PANEL_STYLE.brightness);

  const panelRgb = panelColor ? adjustHexColor(panelColor, saturation, brightness) : "";
  const titleRgb = titleColor ? hexToRgbString(titleColor) : "";
  const elementRgb = elementColor ? hexToRgbString(elementColor) : "";

  setOrClear(el, "--profile-panel-custom-rgb", panelRgb);
  setOrClear(el, "--profile-panel-custom-opacity", panelColor ? String(opacity) : "");
  setOrClear(el, "--profile-panel-base-rgb", panelRgb);
  setOrClear(el, "--profile-panel-base-opacity", panelColor ? String(Math.max(0.55, opacity)) : "");
  setOrClear(el, "--profile-panel-title-rgb", titleRgb);
  setOrClear(el, "--profile-panel-element-rgb", elementRgb);
}

function setOrClear(el, name, value) {
  if (value) el.style.setProperty(name, value);
  else el.style.removeProperty(name);
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return "";
}

function clampNumber(value, min, max, fallback) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function hexToRgb(hex) {
  const clean = normalizeHexColor(hex).slice(1);
  if (!clean) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function hexToRgbString(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : "";
}

function adjustHexColor(hex, saturation, brightness) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "";
  const gray = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  const adjust = (channel) => Math.round(Math.min(255, Math.max(0, (gray + (channel - gray) * saturation) * brightness)));
  return `${adjust(rgb.r)}, ${adjust(rgb.g)}, ${adjust(rgb.b)}`;
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
