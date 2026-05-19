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

const COMPOSITION_GRID_COLUMNS = 12;
const COMPOSITION_GRID_ROWS = 17;
const CUSTOM_TITLE_PREFIX = "customTitle_";

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
  layoutEl.querySelectorAll("[data-profile-composition-overlay]").forEach((el) => el.remove());
  const compositionCategories = getCompositionCategories(layout.desktop.elements);

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
    const renderedAsComposition = compositionCategories.has(panel.id);
    el.classList.toggle("layout-panel--hidden", !enabled || renderedAsComposition);
    if (renderedAsComposition && !required.has(panel.id)) {
      continue;
    }

    el.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
    el.style.gridRow    = `${panel.y + 1} / span ${panel.h}`;
    applyPanelVisualStyle(el, panel.style);
    applyPanelChildLayout(el, panel);
    applyHeroCompositionLayout(doc, el, layout.desktop.elements);

    // Append in sort order so DOM order drives mobile stacking.
    layoutEl.appendChild(el);
  }

  renderCompositionOverlays(doc, layoutEl, layout.desktop.elements, layout.desktop.panels);
}

function applyPanelChildLayout(panelEl, panel) {
  if (!Array.isArray(panel?.children)) return;

  for (const child of panel.children) {
    if (!child?.id || child.enabled === false) continue;
    const childEl = panelEl.querySelector(`[data-profile-child-id="${child.id}"]`);
    if (!childEl) continue;
    childEl.style.gridColumn = "";
    childEl.style.gridRow = "";
    childEl.style.left = `${child.x}%`;
    childEl.style.top = `${child.y}%`;
    childEl.style.width = `${child.w}%`;
    childEl.style.height = `${child.h}%`;
    applyPanelVisualStyle(childEl, child.style);
  }
}

function applyHeroCompositionLayout(doc, heroEl, elements) {
  if (!heroEl?.classList?.contains("me-hero-card") && !heroEl?.classList?.contains("player-hero-card")) return;
  if (!Array.isArray(elements)) return;

  const heroElements = elements.filter((element) => element?.category === "hero");
  if (!heroElements.some((element) => element.enabled !== false)) return;

  const byId = new Map(heroElements.map((element) => [element.id, element]));
  const surface = byId.get("heroSurface");
  if (surface) {
    heroEl.classList.toggle("profile-composition-surface--hidden", surface.enabled === false);
    applyPanelVisualStyle(heroEl, surface.style);
  }

  applyHeroCompositionChild(heroEl, "heroPortrait", heroEl.querySelector('[data-profile-child-id="portrait"]'), byId.get("heroPortrait"), surface);
  applyHeroCompositionChild(heroEl, "heroMetrics", heroEl.querySelector('[data-profile-child-id="metrics"]'), byId.get("heroMetrics"), surface);

  const title = byId.get("heroTitle");
  let titleEl = heroEl.querySelector('[data-profile-composition-id="heroTitle"]');
  if (title?.enabled !== false) {
    if (!titleEl) {
      titleEl = doc.createElement("div");
      titleEl.className = "me-panel__header";
      titleEl.dataset.profileChildId = "title";
      titleEl.dataset.profileCompositionId = "heroTitle";
      titleEl.innerHTML = `<h2 class="me-panel__title"></h2>`;
      heroEl.appendChild(titleEl);
    }
    const heading = titleEl.querySelector(".me-panel__title");
    if (heading) heading.textContent = title.text || "Player Profile";
    applyHeroCompositionChild(heroEl, "heroTitle", titleEl, title, surface);
  } else if (titleEl) {
    titleEl.remove();
  }
}

function applyHeroCompositionChild(heroEl, elementId, childEl, element, surface) {
  if (!childEl || !element) return;
  childEl.dataset.profileCompositionId = elementId;
  childEl.hidden = element.enabled === false;
  childEl.classList.toggle("profile-composition-child--hidden", element.enabled === false);
  if (element.enabled === false) return;

  childEl.style.gridColumn = "";
  childEl.style.gridRow = "";
  childEl.style.left = `${compositionToSurfacePercent(element.x, surface?.x, surface?.w, COMPOSITION_GRID_COLUMNS)}%`;
  childEl.style.top = `${compositionToSurfacePercent(element.y, surface?.y, surface?.h, COMPOSITION_GRID_ROWS)}%`;
  childEl.style.width = `${compositionSizeToSurfacePercent(element.w, surface?.w, COMPOSITION_GRID_COLUMNS)}%`;
  childEl.style.height = `${compositionSizeToSurfacePercent(element.h, surface?.h, COMPOSITION_GRID_ROWS)}%`;
  applyPanelVisualStyle(childEl, element.style);
  heroEl.classList.add("profile-composition-hero");
}

function renderCompositionOverlays(doc, layoutEl, elements, panels = []) {
  if (!Array.isArray(elements)) return;
  const isOwnerLayout = layoutEl.classList.contains("me-layout");
  for (const element of elements) {
    if (element?.enabled === false) continue;
    if (element.category === "friendCode" && !isOwnerLayout) continue;
    if (element.id === "thoughtsComposer" && !isOwnerLayout) continue;
    if (isCustomTitleElement(element) || element.id === "aboutTitle" || element.id === "badgesTitle" || element.id === "friendCodeTitle" || element.id === "thoughtsTitle") {
      renderTitleOverlay(doc, layoutEl, element, element.text || getDefaultTitleText(element));
    } else if (element.id === "aboutSurface" || element.id === "badgesSurface" || element.id === "friendCodeSurface" || element.id === "thoughtsSurface") {
      renderSurfaceOverlay(doc, layoutEl, element, element.category);
    } else if (element.id === "aboutText") {
      renderAboutTextOverlay(doc, layoutEl, element, panels);
    } else if (element.id === "badgesContent") {
      renderBadgesContentOverlay(doc, layoutEl, element, panels);
    } else if (element.id === "friendCodeContent") {
      renderFriendCodeContentOverlay(doc, layoutEl, element, panels);
    } else if (element.id === "thoughtsComposer") {
      renderThoughtsComposerOverlay(doc, layoutEl, element, panels);
    } else if (element.id === "thoughtsFeed") {
      renderThoughtsFeedOverlay(doc, layoutEl, getThoughtsFeedRenderElement(element, elements, isOwnerLayout), panels);
    }
  }
}

function isCustomTitleElement(element) {
  return element?.type === "title" && typeof element.id === "string" && element.id.startsWith(CUSTOM_TITLE_PREFIX);
}

function getCompositionCategories(elements) {
  return new Set((Array.isArray(elements) ? elements : [])
    .filter((element) => (
      element?.enabled !== false &&
      element.category &&
      element.category !== "custom" &&
      element.category !== "hero"
    ))
    .map((element) => element.category));
}

function renderTitleOverlay(doc, layoutEl, element, text) {
  const titleEl = doc.createElement("div");
  titleEl.className = "profile-composition-overlay profile-composition-overlay--title me-panel__header player-panel__header";
  titleEl.dataset.profileCompositionOverlay = element.id;
  titleEl.innerHTML = `<h2 class="me-panel__title player-panel__title"></h2>`;
  const heading = titleEl.querySelector(".me-panel__title");
  if (heading) heading.textContent = text;
  applyCompositionOverlayRect(titleEl, element);
  applyPanelVisualStyle(titleEl, element.style);
  layoutEl.appendChild(titleEl);
}

function renderSurfaceOverlay(doc, layoutEl, element, category) {
  const surfaceEl = doc.createElement("section");
  const panelClass = getPanelCssSlug(category);
  surfaceEl.className = `profile-composition-overlay profile-composition-overlay--surface me-panel player-panel me-panel--${panelClass} player-panel--${panelClass}`;
  surfaceEl.dataset.profileCompositionOverlay = element.id;
  applyCompositionOverlayRect(surfaceEl, element);
  applyPanelVisualStyle(surfaceEl, element.style);
  layoutEl.appendChild(surfaceEl);
}

function renderAboutTextOverlay(doc, layoutEl, element, panels) {
  const textEl = doc.createElement("div");
  const source = doc.querySelector("#meAboutPanel [data-profile-child-id='text'], #playerAboutPanel [data-profile-child-id='text']");
  textEl.className = "profile-composition-overlay profile-composition-overlay--text me-about-copy-wrap";
  textEl.dataset.profileCompositionOverlay = element.id;
  textEl.dataset.profileChildId = "text";
  textEl.innerHTML = source?.innerHTML || `<p class="me-about-copy player-about-copy"></p>`;
  applyCompositionOverlayRect(textEl, element);
  applyPanelVisualStyle(textEl, mergeLegacyChildStyle(element, panels, "about", "text"));
  layoutEl.appendChild(textEl);
}

function renderBadgesContentOverlay(doc, layoutEl, element, panels) {
  const badgesEl = doc.createElement("div");
  const source = doc.querySelector("#meBadgesPanel [data-profile-child-id='content'], #playerBadgesPanel [data-profile-child-id='content']");
  badgesEl.className = "profile-composition-overlay profile-composition-overlay--badges me-badge-box";
  badgesEl.dataset.profileCompositionOverlay = element.id;
  badgesEl.dataset.profileChildId = "content";
  badgesEl.innerHTML = source?.innerHTML || `<p class="me-badge-empty player-badge-empty">Badge case still empty</p>`;
  applyCompositionOverlayRect(badgesEl, element);
  applyPanelVisualStyle(badgesEl, mergeLegacyChildStyle(element, panels, "badges", "content"));
  layoutEl.appendChild(badgesEl);
}

function renderFriendCodeContentOverlay(doc, layoutEl, element, panels) {
  const codeEl = doc.createElement("div");
  const source = doc.querySelector("#meFriendCodePanel [data-profile-child-id='code']");
  codeEl.className = "profile-composition-overlay profile-composition-overlay--friend-code friend-code-card";
  codeEl.dataset.profileCompositionOverlay = element.id;
  codeEl.dataset.profileChildId = "code";
  codeEl.innerHTML = source?.innerHTML || `
    <p class="friend-code-card__label">Your Friend Code</p>
    <p class="friend-code-card__value">PENDING</p>
    <p class="friend-code-card__helper">Share this code so friends can link with you directly.</p>
  `;
  applyCompositionOverlayRect(codeEl, element);
  applyPanelVisualStyle(codeEl, mergeLegacyChildStyle(element, panels, "friendCode", "code"));
  layoutEl.appendChild(codeEl);
}

function renderThoughtsComposerOverlay(doc, layoutEl, element, panels) {
  const source = doc.querySelector("#meThoughtsPanel [data-profile-child-id='composer']");
  const composerEl = source || doc.createElement("div");
  composerEl.classList.add("profile-composition-overlay", "profile-composition-overlay--thoughts-composer");
  composerEl.dataset.profileCompositionOverlay = element.id;
  composerEl.dataset.profileChildId = "composer";
  composerEl.removeAttribute("data-profile-child-scroll");
  if (!source) {
    composerEl.classList.add("thought-composer");
    composerEl.innerHTML = `
      <input class="thought-composer__subject" type="text" placeholder="Optional headline">
      <textarea class="thought-composer__body" rows="4" placeholder="Share a thought."></textarea>
    `;
  }
  applyCompositionOverlayRect(composerEl, element);
  applyPanelVisualStyle(composerEl, mergeLegacyChildStyle(element, panels, "thoughts", "composer"));
  layoutEl.appendChild(composerEl);
}

function renderThoughtsFeedOverlay(doc, layoutEl, element, panels) {
  const source = doc.querySelector("#meThoughtsPanel [data-profile-child-id='feed'], #playerThoughtsPanel .thoughts-feed");
  const feedEl = source || doc.createElement("div");
  feedEl.classList.add("profile-composition-overlay", "profile-composition-overlay--thoughts-feed", "thoughts-feed");
  feedEl.dataset.profileCompositionOverlay = element.id;
  feedEl.dataset.profileChildId = "feed";
  feedEl.dataset.profileChildScroll = "true";
  if (!source) {
    feedEl.innerHTML = `<p class="me-panel__empty player-panel__empty">No thoughts posted yet.</p>`;
  }
  applyCompositionOverlayRect(feedEl, element);
  applyPanelVisualStyle(feedEl, mergeLegacyChildStyle(element, panels, "thoughts", "feed"));
  layoutEl.appendChild(feedEl);
}

function getThoughtsFeedRenderElement(feedElement, elements, isOwnerLayout) {
  if (isOwnerLayout) return feedElement;
  const composer = (Array.isArray(elements) ? elements : [])
    .find((element) => element.id === "thoughtsComposer" && element.enabled !== false);
  if (!composer) return feedElement;
  const y = Math.min(feedElement.y, composer.y);
  const bottom = Math.max(feedElement.y + feedElement.h, composer.y + composer.h);
  return {
    ...feedElement,
    y,
    h: Math.max(feedElement.h, bottom - y),
  };
}

function mergeLegacyChildStyle(element, panels, panelId, childId) {
  const legacyStyle = (Array.isArray(panels) ? panels : [])
    .find((panel) => panel.id === panelId)
    ?.children
    ?.find((child) => child.id === childId)
    ?.style;
  return {
    ...(legacyStyle || {}),
    ...(element.style || {}),
  };
}

function getDefaultTitleText(element) {
  if (element.id === "aboutTitle") return "About Me";
  if (element.id === "badgesTitle") return "Badges";
  if (element.id === "friendCodeTitle") return "Friend Code";
  if (element.id === "thoughtsTitle") return "Player Feed";
  return "New Section";
}

function getPanelCssSlug(category) {
  if (category === "friendCode") return "friend-code";
  if (category === "favoriteGame") return "favorite";
  if (category === "topFriends") return "top-friends";
  return category;
}

function applyCompositionOverlayRect(el, element) {
  el.style.left = `${(element.x / COMPOSITION_GRID_COLUMNS) * 100}%`;
  el.style.top = `${(element.y / COMPOSITION_GRID_ROWS) * 100}%`;
  el.style.width = `${(element.w / COMPOSITION_GRID_COLUMNS) * 100}%`;
  el.style.height = `${(element.h / COMPOSITION_GRID_ROWS) * 100}%`;
}

function compositionToSurfacePercent(value, surfaceStart, surfaceSize, gridSize) {
  const start = Number.isFinite(surfaceStart) ? surfaceStart : 0;
  const size = Number.isFinite(surfaceSize) && surfaceSize > 0 ? surfaceSize : gridSize;
  return ((value - start) / size) * 100;
}

function compositionSizeToSurfacePercent(value, surfaceSize, gridSize) {
  const size = Number.isFinite(surfaceSize) && surfaceSize > 0 ? surfaceSize : gridSize;
  return (value / size) * 100;
}

function applyPanelVisualStyle(el, style = {}) {
  const panelColor = normalizeHexColor(style.panelColor);
  const panelColor2 = normalizeHexColor(style.panelColor2);
  const titleColor = normalizeHexColor(style.titleColor);
  const elementColor = normalizeHexColor(style.elementColor);
  const opacity = clampNumber(style.opacity, 0.15, 1, DEFAULT_PANEL_STYLE.opacity);
  const saturation = clampNumber(style.saturation, 0, 2, DEFAULT_PANEL_STYLE.saturation);
  const brightness = clampNumber(style.brightness, 0.35, 1.8, DEFAULT_PANEL_STYLE.brightness);
  const gradientAngle = clampNumber(style.gradientAngle, 0, 360, 180);

  const panelRgb = panelColor ? adjustHexColor(panelColor, saturation, brightness) : "";
  const panelRgb2 = panelColor2 ? adjustHexColor(panelColor2, saturation, brightness) : panelRgb;
  const titleRgb = titleColor ? hexToRgbString(titleColor) : "";
  const elementRgb = elementColor ? hexToRgbString(elementColor) : "";

  setOrClear(el, "--profile-panel-custom-rgb", panelRgb);
  setOrClear(el, "--profile-panel-custom-rgb-2", panelRgb2);
  setOrClear(el, "--profile-panel-custom-opacity", panelColor ? String(opacity) : "");
  setOrClear(el, "--profile-panel-base-rgb", panelRgb);
  setOrClear(el, "--profile-panel-base-rgb-2", panelRgb2);
  setOrClear(el, "--profile-panel-base-opacity", panelColor ? String(Math.max(0.55, opacity)) : "");
  setOrClear(el, "--profile-panel-gradient-angle", panelColor ? `${gradientAngle}deg` : "");
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
