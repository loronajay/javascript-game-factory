import { escapeHtml } from "../profile-social/social-view-shared.mjs";
import { PROFILE_COMPOSITION_ELEMENT_REGISTRY } from "../profile-layout/composition-layout.mjs";
import { getDefaultLayout, getPlayerDefaultLayout } from "../profile-layout/default-layout.mjs";
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
const PLAYER_IDENTITY_MIN_ROWS = 5;
// Applies saved panel layout onto the 12-column CSS grid.
export function applyProfileLayout(doc, layout, { panelToDom = ME_PANEL_TO_DOM, required = ME_REQUIRED, layoutSelector = ".me-layout", galleryPhotos = [], } = {}) {
    if (!layout?.desktop?.panels)
        return;
    const layoutEl = doc.querySelector(layoutSelector);
    if (!layoutEl)
        return;
    // Untouched-default profiles render as a natural content-height 3-column flow
    // instead of the rigid fixed-row composition grid. The moment a player customizes
    // anything (moves/resizes/recolors a panel, or adds a freeform element) the layout
    // stops matching the default and the composition engine below takes over.
    if (isDefaultFlowLayout(layout, layoutSelector)) {
        applyDefaultFlowLayout(doc, layoutEl, layout, panelToDom, required);
        return;
    }
    layoutEl.classList.remove("layout--flow");
    layoutEl.querySelectorAll("[data-profile-composition-overlay]").forEach((el) => el.remove());
    const renderElements = getCompositionElementsForRender(layout.desktop.elements, { galleryPhotos });
    const compositionCategories = getCompositionCategories(renderElements);
    const panels = getRenderablePanels(layout.desktop.panels, layoutSelector).sort(comparePanelsByFreeformPosition);
    for (const panel of panels) {
        if (!panelToDom[panel.id])
            continue;
        const el = doc.getElementById(panelToDom[panel.id]);
        if (!el)
            continue;
        const enabled = panel.enabled !== false || required.has(panel.id);
        const renderedAsComposition = compositionCategories.has(panel.id);
        el.classList.toggle("layout-panel--hidden", !enabled || renderedAsComposition);
        if (renderedAsComposition && !required.has(panel.id)) {
            continue;
        }
        el.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
        el.style.gridRow = `${panel.y + 1} / span ${panel.h}`;
        applyPanelVisualStyle(el, panel.style);
        applyPanelChildLayout(el, panel);
        applyHeroCompositionLayout(doc, el, renderElements);
        // Append in sort order so DOM order drives mobile stacking.
        layoutEl.appendChild(el);
    }
    renderCompositionOverlays(doc, layoutEl, renderElements, layout.desktop.panels, { galleryPhotos });
}
const FLOW_COLUMN_CLASS = "layout-flow-col";
// True when the layout is the pristine, never-customized default for its page variant.
// Any moved/resized/recolored panel, customized child, or freeform element makes this
// false so the composition engine renders instead.
export function isDefaultFlowLayout(layout, layoutSelector) {
    if (!layout?.desktop?.panels)
        return false;
    if (Array.isArray(layout.desktop.elements) && layout.desktop.elements.length > 0)
        return false;
    const def = layoutSelector === ".player-layout" ? getPlayerDefaultLayout() : getDefaultLayout();
    const defPanels = def.desktop.panels;
    const panels = layout.desktop.panels;
    if (panels.length !== defPanels.length)
        return false;
    const defById = new Map(defPanels.map((p) => [p.id, p]));
    for (const p of panels) {
        const d = defById.get(p.id);
        if (!d)
            return false;
        if (p.enabled === false)
            return false;
        if (!numbersEqual(p.x, d.x) || !numbersEqual(p.y, d.y) || !numbersEqual(p.w, d.w) || !numbersEqual(p.h, d.h))
            return false;
        if (p.style && typeof p.style === "object" && Object.keys(p.style).length > 0)
            return false;
        if (!panelChildrenMatchDefault(p.children, d.children))
            return false;
    }
    return true;
}
function panelChildrenMatchDefault(childrenA, childrenB) {
    const a = Array.isArray(childrenA) ? childrenA : [];
    const b = Array.isArray(childrenB) ? childrenB : [];
    if (a.length !== b.length)
        return false;
    const bById = new Map(b.map((c) => [c.id, c]));
    for (const c of a) {
        const d = bById.get(c.id);
        if (!d)
            return false;
        if ((c.enabled !== false) !== (d.enabled !== false))
            return false;
        if (!numbersEqual(c.x, d.x) || !numbersEqual(c.y, d.y) || !numbersEqual(c.w, d.w) || !numbersEqual(c.h, d.h))
            return false;
        if (c.style && typeof c.style === "object" && Object.keys(c.style).length > 0)
            return false;
    }
    return true;
}
// Renders panels at natural content height in three independent columns (left/middle/right),
// bypassing the fixed-row grid and zoom-shell scaling used for customized layouts.
function applyDefaultFlowLayout(doc, layoutEl, layout, panelToDom, required) {
    layoutEl.querySelectorAll("[data-profile-composition-overlay]").forEach((el) => el.remove());
    layoutEl.classList.add("layout--flow");
    // Re-applies (thought posts, friend actions, etc.) rebuild the columns; drop the old
    // wrappers so they don't accumulate. Panels are re-fetched by id and re-parented below.
    const staleColumns = [...layoutEl.querySelectorAll(":scope > ." + FLOW_COLUMN_CLASS)];
    const columns = [0, 1, 2].map(() => {
        const col = doc.createElement("div");
        col.className = FLOW_COLUMN_CLASS;
        return col;
    });
    const panels = [...layout.desktop.panels].sort(comparePanelsByFreeformPosition);
    for (const panel of panels) {
        const domId = panelToDom[panel.id];
        if (!domId)
            continue;
        const el = doc.getElementById(domId);
        if (!el)
            continue;
        resetPanelForFlow(el);
        el.classList.toggle("layout-panel--hidden", panel.enabled === false && !required.has(panel.id));
        applyPanelVisualStyle(el, panel.style);
        columns[columnIndexForX(panel.x)].appendChild(el);
    }
    columns.forEach((col) => layoutEl.appendChild(col));
    staleColumns.forEach((col) => col.remove());
}
function columnIndexForX(x) {
    return x < 4 ? 0 : x < 8 ? 1 : 2;
}
// Strips any inline grid/zoom-shell geometry a prior composition pass may have applied so the
// panel and its children fall back to natural document flow.
function resetPanelForFlow(el) {
    const shell = el.querySelector(":scope > .panel-zoom-shell");
    if (shell) {
        while (shell.firstChild)
            el.insertBefore(shell.firstChild, shell);
        shell.remove();
    }
    el.style.gridColumn = "";
    el.style.gridRow = "";
    el.style.zoom = "";
    el.style.width = "";
    el.style.height = "";
    el.style.overflow = "";
    el.querySelectorAll("[data-profile-child-id]").forEach((childEl) => {
        childEl.style.left = "";
        childEl.style.top = "";
        childEl.style.width = "";
        childEl.style.height = "";
        childEl.style.gridColumn = "";
        childEl.style.gridRow = "";
    });
}
function getRenderablePanels(panels, layoutSelector) {
    const renderPanels = [...panels];
    if (layoutSelector !== ".player-layout")
        return renderPanels;
    const identity = renderPanels.find((panel) => panel.id === "identity" && panel.enabled !== false);
    if (!identity || identity.h >= PLAYER_IDENTITY_MIN_ROWS)
        return renderPanels;
    const originalBottom = identity.y + identity.h;
    const delta = PLAYER_IDENTITY_MIN_ROWS - identity.h;
    return renderPanels.map((panel) => {
        if (panel.id === "identity") {
            return { ...panel, h: PLAYER_IDENTITY_MIN_ROWS };
        }
        const sameColumn = panel.x === identity.x;
        const belowIdentity = panel.y >= originalBottom;
        return sameColumn && belowIdentity
            ? { ...panel, y: panel.y + delta }
            : panel;
    });
}
export function comparePanelsByFreeformPosition(a, b) {
    return (a.y - b.y) || (a.x - b.x);
}
function applyPanelChildLayout(panelEl, panel) {
    if (!Array.isArray(panel?.children))
        return;
    for (const child of panel.children) {
        if (!child?.id || child.enabled === false)
            continue;
        const childEl = findPanelLayoutChild(panelEl, child.id);
        if (!childEl)
            continue;
        childEl.style.gridColumn = "";
        childEl.style.gridRow = "";
        childEl.style.left = `${child.x}%`;
        childEl.style.top = `${child.y}%`;
        childEl.style.width = `${child.w}%`;
        childEl.style.height = `${child.h}%`;
        applyPanelVisualStyle(childEl, child.style);
    }
}
function findPanelLayoutChild(panelEl, childId) {
    const all = [...panelEl.querySelectorAll(`[data-profile-child-id="${childId}"]`)];
    if (all.length === 0)
        return null;
    return all.find((childEl) => childEl.parentElement === panelEl) || null;
}
function applyHeroCompositionLayout(doc, heroEl, elements) {
    if (!heroEl?.classList?.contains("me-hero-card") && !heroEl?.classList?.contains("player-hero-card"))
        return;
    if (!Array.isArray(elements))
        return;
    const heroElements = elements.filter((element) => element?.category === "hero");
    if (!heroElements.some((element) => element.enabled !== false))
        return;
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
        if (heading)
            heading.textContent = title.text || "Player Profile";
        applyHeroCompositionChild(heroEl, "heroTitle", titleEl, title, surface);
    }
    else if (titleEl) {
        titleEl.remove();
    }
}
function applyHeroCompositionChild(heroEl, elementId, childEl, element, surface) {
    if (!childEl || !element)
        return;
    childEl.dataset.profileCompositionId = elementId;
    childEl.hidden = element.enabled === false;
    childEl.classList.toggle("profile-composition-child--hidden", element.enabled === false);
    if (element.enabled === false)
        return;
    childEl.style.gridColumn = "";
    childEl.style.gridRow = "";
    childEl.style.left = `${compositionToSurfacePercent(element.x, surface?.x, surface?.w, COMPOSITION_GRID_COLUMNS)}%`;
    childEl.style.top = `${compositionToSurfacePercent(element.y, surface?.y, surface?.h, COMPOSITION_GRID_ROWS)}%`;
    childEl.style.width = `${compositionSizeToSurfacePercent(element.w, surface?.w, COMPOSITION_GRID_COLUMNS)}%`;
    childEl.style.height = `${compositionSizeToSurfacePercent(element.h, surface?.h, COMPOSITION_GRID_ROWS)}%`;
    applyPanelVisualStyle(childEl, element.style);
    heroEl.classList.add("profile-composition-hero");
}
function renderCompositionOverlays(doc, layoutEl, elements, panels = [], { galleryPhotos = [] } = {}) {
    if (!Array.isArray(elements))
        return;
    const isOwnerLayout = layoutEl.classList.contains("me-layout");
    for (const element of elements) {
        if (element?.enabled === false)
            continue;
        if (element.category === "friendCode" && !isOwnerLayout)
            continue;
        if (element.type === "playerAction" && isOwnerLayout)
            continue;
        if (element.id === "thoughtsComposer" && !isOwnerLayout)
            continue;
        if (isCustomTitleElement(element) || element.id === "identityTitle" || element.id === "aboutTitle" || element.id === "badgesTitle" || element.id === "friendCodeTitle" || element.id === "galleryTitle" || element.id === "thoughtsTitle") {
            renderTitleOverlay(doc, layoutEl, element, element.text || getDefaultTitleText(element));
        }
        else if (element.id === "identitySurface" || element.id === "aboutSurface" || element.id === "badgesSurface" || element.id === "friendCodeSurface" || element.id === "gallerySurface" || element.id === "thoughtsSurface") {
            renderSurfaceOverlay(doc, layoutEl, element, element.category);
        }
        else if (element.type === "identityField") {
            renderIdentityFieldOverlay(doc, layoutEl, element, panels);
        }
        else if (element.type === "playerAction") {
            renderPlayerActionOverlay(doc, layoutEl, element, panels);
        }
        else if (element.id === "aboutText") {
            renderAboutTextOverlay(doc, layoutEl, element, panels);
        }
        else if (element.id === "badgesContent") {
            renderBadgesContentOverlay(doc, layoutEl, element, panels);
        }
        else if (element.id === "friendCodeContent") {
            renderFriendCodeContentOverlay(doc, layoutEl, element, panels);
        }
        else if (element.id === "galleryContent") {
            renderGalleryContentOverlay(doc, layoutEl, element, panels, galleryPhotos);
        }
        else if (element.id === "galleryLink") {
            renderGalleryLinkOverlay(doc, layoutEl, element, panels);
        }
        else if (element.type === "galleryPhoto") {
            renderGalleryPhotoOverlay(doc, layoutEl, element, panels, galleryPhotos);
        }
        else if (element.id === "thoughtsComposer") {
            renderThoughtsComposerOverlay(doc, layoutEl, element, panels);
        }
        else if (element.id === "thoughtsFeed") {
            renderThoughtsFeedOverlay(doc, layoutEl, getThoughtsFeedRenderElement(element, elements, isOwnerLayout), panels);
        }
    }
}
function isCustomTitleElement(element) {
    return element?.type === "title" && typeof element.id === "string" && element.id.startsWith(CUSTOM_TITLE_PREFIX);
}
export function getCompositionElementsForRender(elements, { galleryPhotos = [] } = {}) {
    void galleryPhotos;
    const renderElements = Array.isArray(elements) ? [...elements] : [];
    const hasEnabledGalleryComposition = renderElements.some((element) => (element?.enabled !== false &&
        element.category === "gallery"));
    const hasEnabledGalleryGrid = renderElements.some((element) => (element?.enabled !== false &&
        element.id === "galleryContent"));
    const hasEnabledNonLegacyGalleryPhoto = renderElements.some((element) => (element?.enabled !== false &&
        element.type === "galleryPhoto" &&
        !isLegacyTinyGalleryPhotoElement(element)));
    if (!hasEnabledGalleryComposition) {
        return renderElements;
    }
    if (hasEnabledGalleryGrid) {
        return removeLegacyTinyGalleryPhotos(renderElements);
    }
    if (hasEnabledNonLegacyGalleryPhoto) {
        return renderElements;
    }
    const def = PROFILE_COMPOSITION_ELEMENT_REGISTRY.galleryContent;
    return [
        ...removeLegacyTinyGalleryPhotos(renderElements),
        {
            id: "galleryContent",
            category: def.category,
            type: def.type,
            enabled: true,
            text: "",
            x: def.defaultX,
            y: def.defaultY,
            w: def.defaultW,
            h: def.defaultH,
            style: {},
        },
    ];
}
function removeLegacyTinyGalleryPhotos(elements) {
    return elements.filter((element) => !isLegacyTinyGalleryPhotoElement(element));
}
function isLegacyTinyGalleryPhotoElement(element) {
    return element?.type === "galleryPhoto" &&
        ((numbersEqual(element.w, 0.4) && numbersEqual(element.h, 0.62)) ||
            (numbersEqual(element.w, 0.8) && numbersEqual(element.h, 1.05)));
}
function numbersEqual(value, expected) {
    const n = parseFloat(value);
    return Number.isFinite(n) && Math.abs(n - expected) < 0.001;
}
export function getCompositionCategories(elements) {
    return new Set((Array.isArray(elements) ? elements : [])
        .filter((element) => (element?.enabled !== false &&
        element.category &&
        element.category !== "custom" &&
        element.category !== "hero" &&
        element.type !== "playerAction"))
        .map((element) => element.category));
}
function renderTitleOverlay(doc, layoutEl, element, text) {
    const titleEl = doc.createElement("div");
    titleEl.className = "profile-composition-overlay profile-composition-overlay--title me-panel__header player-panel__header";
    titleEl.dataset.profileCompositionOverlay = element.id;
    titleEl.innerHTML = `<h2 class="me-panel__title player-panel__title"></h2>`;
    const heading = titleEl.querySelector(".me-panel__title");
    if (heading)
        heading.textContent = text;
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
function renderIdentityFieldOverlay(doc, layoutEl, element, panels) {
    const childId = getIdentityChildId(element.id);
    const fieldEl = doc.querySelector(`#meIdentityPanel [data-profile-child-id='${childId}'], #playerIdentityPanel [data-profile-child-id='${childId}']`) || doc.createElement("div");
    fieldEl.classList.add("profile-composition-overlay", "profile-composition-overlay--identity-field");
    fieldEl.dataset.profileCompositionOverlay = element.id;
    fieldEl.dataset.profileChildId = childId;
    if (!fieldEl.innerHTML) {
        fieldEl.classList.add("me-hero-card__identity-field", "player-hero-card__identity-field");
        fieldEl.innerHTML = `<span class="me-hero-card__identity-field-label player-hero-card__identity-field-label">${getDefaultIdentityFieldLabel(element.id)}</span>`;
    }
    applyCompositionOverlayRect(fieldEl, element);
    applyPanelVisualStyle(fieldEl, mergeLegacyChildStyle(element, panels, "identity", childId));
    layoutEl.appendChild(fieldEl);
}
function renderPlayerActionOverlay(doc, layoutEl, element, panels) {
    const childId = getPlayerActionChildId(element.id);
    const actionEl = doc.querySelector(`#playerIdentityPanel [data-profile-action-id='${childId}']`) || doc.createElement("div");
    actionEl.classList.add("profile-composition-overlay", "profile-composition-overlay--player-action");
    actionEl.dataset.profileCompositionOverlay = element.id;
    actionEl.dataset.profileChildId = childId;
    actionEl.removeAttribute("data-profile-action-id");
    if (!actionEl.innerHTML) {
        actionEl.innerHTML = `<button class="player-hero-card__friend-action" type="button">${getDefaultPlayerActionLabel(element.id)}</button>`;
    }
    applyCompositionOverlayRect(actionEl, element);
    applyPanelVisualStyle(actionEl, mergeLegacyChildStyle(element, panels, "identity", childId));
    layoutEl.appendChild(actionEl);
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
function renderGalleryContentOverlay(doc, layoutEl, element, panels, galleryPhotos = []) {
    const galleryEl = doc.createElement("div");
    const source = doc.querySelector("#meGalleryPanel [data-profile-child-id='content'], #playerGalleryPanel [data-profile-child-id='content']");
    galleryEl.className = "profile-composition-overlay profile-composition-overlay--gallery-grid gallery-panel__content";
    galleryEl.dataset.profileCompositionOverlay = element.id;
    galleryEl.dataset.profileChildId = "content";
    const grid = source?.querySelector(".gallery-grid")?.cloneNode(true);
    if (grid)
        galleryEl.appendChild(grid);
    else
        galleryEl.innerHTML = renderGalleryGridHtml(galleryPhotos);
    applyCompositionOverlayRect(galleryEl, element);
    applyPanelVisualStyle(galleryEl, mergeLegacyChildStyle(element, panels, "gallery", "content"));
    layoutEl.appendChild(galleryEl);
}
function renderGalleryLinkOverlay(doc, layoutEl, element, panels) {
    const source = doc.querySelector("#meGalleryPanel .gallery-view-all, #playerGalleryPanel .gallery-view-all");
    const linkEl = doc.createElement("a");
    linkEl.className = "profile-composition-overlay profile-composition-overlay--gallery-link gallery-view-all";
    linkEl.dataset.profileCompositionOverlay = element.id;
    linkEl.dataset.profileChildId = "galleryLink";
    linkEl.href = source?.getAttribute("href") || "#";
    linkEl.textContent = source?.textContent || "View All Photos ->";
    applyCompositionOverlayRect(linkEl, element);
    applyPanelVisualStyle(linkEl, mergeLegacyChildStyle(element, panels, "gallery", "content"));
    layoutEl.appendChild(linkEl);
}
function renderGalleryPhotoOverlay(doc, layoutEl, element, panels, galleryPhotos = []) {
    const index = getGalleryPhotoIndex(element.id);
    const sourceItems = doc.querySelectorAll("#meGalleryPanel .gallery-item, #playerGalleryPanel .gallery-item");
    const source = Number.isInteger(index) ? sourceItems[index] : null;
    const photo = Array.isArray(galleryPhotos) && Number.isInteger(index) ? galleryPhotos[index] : null;
    const photoEl = doc.createElement("div");
    photoEl.classList.add("profile-composition-overlay", "profile-composition-overlay--gallery-photo", "gallery-item");
    photoEl.dataset.profileCompositionOverlay = element.id;
    photoEl.dataset.profileChildId = element.id;
    if (photo) {
        photoEl.dataset.photoId = photo.id || "";
        photoEl.innerHTML = `
      <div class="gallery-item__img-frame">
        <img class="gallery-item__img" src="${escapeHtml(photo.imageUrl || "")}" alt="${escapeHtml(photo.caption || "")}" loading="lazy">
      </div>
      ${photo.caption ? `<p class="gallery-item__caption">${escapeHtml(photo.caption)}</p>` : ""}
    `;
    }
    else if (source) {
        photoEl.innerHTML = source.innerHTML;
        if (source.dataset.photoId)
            photoEl.dataset.photoId = source.dataset.photoId;
    }
    else {
        photoEl.innerHTML = `<div class="gallery-item__img-frame"></div><p class="gallery-item__caption">Photo ${index + 1}</p>`;
    }
    applyCompositionOverlayRect(photoEl, element);
    applyPanelVisualStyle(photoEl, mergeLegacyChildStyle(element, panels, "gallery", "content"));
    layoutEl.appendChild(photoEl);
}
function renderGalleryGridHtml(galleryPhotos = []) {
    const photos = Array.isArray(galleryPhotos) ? galleryPhotos.slice(0, 8) : [];
    const content = photos.length > 0
        ? photos.map((photo) => renderGalleryItemHtml(photo)).join("")
        : `<p class="me-panel__empty player-panel__empty">No photos yet.</p>`;
    return `<div class="gallery-grid">${content}</div>`;
}
function renderGalleryItemHtml(photo) {
    return `
    <div class="gallery-item" data-photo-id="${escapeHtml(photo?.id || "")}">
      <div class="gallery-item__img-frame">
        <img class="gallery-item__img" src="${escapeHtml(photo?.imageUrl || "")}" alt="${escapeHtml(photo?.caption || "")}" loading="lazy">
      </div>
      ${photo?.caption ? `<p class="gallery-item__caption">${escapeHtml(photo.caption)}</p>` : ""}
    </div>
  `;
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
    if (isOwnerLayout)
        return feedElement;
    const composer = (Array.isArray(elements) ? elements : [])
        .find((element) => element.id === "thoughtsComposer" && element.enabled !== false);
    if (!composer)
        return feedElement;
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
    if (element.id === "identityTitle")
        return "Player Profile";
    if (element.id === "aboutTitle")
        return "About Me";
    if (element.id === "badgesTitle")
        return "Badges";
    if (element.id === "friendCodeTitle")
        return "Friend Code";
    if (element.id === "galleryTitle")
        return "Photo Gallery";
    if (element.id === "thoughtsTitle")
        return "Player Feed";
    return "New Section";
}
function getIdentityChildId(elementId) {
    if (elementId === "identityName")
        return "name";
    if (elementId === "identityPageViews")
        return "pageViews";
    if (elementId === "identityFactoryId")
        return "factoryId";
    if (elementId === "identitySocialLinks")
        return "socialLinks";
    return "";
}
function getPlayerActionChildId(elementId) {
    if (elementId === "identityFriendAction")
        return "friendAction";
    if (elementId === "identityMessageAction")
        return "messageAction";
    if (elementId === "identityGestureActions")
        return "gestureActions";
    return "";
}
function getGalleryPhotoIndex(elementId) {
    const match = String(elementId || "").match(/^galleryPhoto(\d+)$/);
    if (!match)
        return null;
    const index = Number.parseInt(match[1], 10) - 1;
    return index >= 0 && index < 8 ? index : null;
}
function getDefaultIdentityFieldLabel(elementId) {
    if (elementId === "identityName")
        return "Name";
    if (elementId === "identityPageViews")
        return "Page Views";
    if (elementId === "identityFactoryId")
        return "Factory ID";
    if (elementId === "identitySocialLinks")
        return "Social Links";
    return "Field";
}
function getDefaultPlayerActionLabel(elementId) {
    if (elementId === "identityFriendAction")
        return "Add Friend";
    if (elementId === "identityMessageAction")
        return "Message";
    if (elementId === "identityGestureActions")
        return "Kick / Blow Kiss / Challenge";
    return "Action";
}
function getPanelCssSlug(category) {
    if (category === "friendCode")
        return "friend-code";
    if (category === "favoriteGame")
        return "favorite";
    if (category === "topFriends")
        return "top-friends";
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
    const textColor = normalizeHexColor(style.textColor);
    const buttonColor = normalizeHexColor(style.buttonColor);
    const opacity = clampNumber(style.opacity, 0.15, 1, DEFAULT_PANEL_STYLE.opacity);
    const saturation = clampNumber(style.saturation, 0, 2, DEFAULT_PANEL_STYLE.saturation);
    const brightness = clampNumber(style.brightness, 0.35, 1.8, DEFAULT_PANEL_STYLE.brightness);
    const gradientAngle = clampNumber(style.gradientAngle, 0, 360, 180);
    const panelRgb = panelColor ? adjustHexColor(panelColor, saturation, brightness) : "";
    const panelRgb2 = panelColor2 ? adjustHexColor(panelColor2, saturation, brightness) : panelRgb;
    const titleRgb = titleColor ? hexToRgbString(titleColor) : "";
    const elementRgb = elementColor ? hexToRgbString(elementColor) : "";
    const textRgb = textColor ? hexToRgbString(textColor) : "";
    const buttonRgb = buttonColor ? hexToRgbString(buttonColor) : "";
    setOrClear(el, "--profile-panel-custom-rgb", panelRgb);
    setOrClear(el, "--profile-panel-custom-rgb-2", panelRgb2);
    setOrClear(el, "--profile-panel-custom-opacity", panelColor ? String(opacity) : "");
    setOrClear(el, "--profile-panel-base-rgb", panelRgb);
    setOrClear(el, "--profile-panel-base-rgb-2", panelRgb2);
    setOrClear(el, "--profile-panel-base-opacity", panelColor ? String(Math.max(0.55, opacity)) : "");
    setOrClear(el, "--profile-panel-gradient-angle", panelColor ? `${gradientAngle}deg` : "");
    setOrClear(el, "--profile-panel-title-rgb", titleRgb);
    setOrClear(el, "--profile-panel-element-rgb", elementRgb);
    setOrClear(el, "--profile-panel-text-rgb", textRgb);
    setOrClear(el, "--profile-panel-button-rgb", buttonRgb);
}
function setOrClear(el, name, value) {
    if (value)
        el.style.setProperty(name, value);
    else
        el.style.removeProperty(name);
}
function normalizeHexColor(value) {
    const raw = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(raw))
        return raw.toLowerCase();
    return "";
}
function clampNumber(value, min, max, fallback) {
    const n = parseFloat(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(Math.max(n, min), max);
}
function hexToRgb(hex) {
    const clean = normalizeHexColor(hex).slice(1);
    if (!clean)
        return null;
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
    if (!rgb)
        return "";
    const gray = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
    const adjust = (channel) => Math.round(Math.min(255, Math.max(0, (gray + (channel - gray) * saturation) * brightness)));
    return `${adjust(rgb.r)}, ${adjust(rgb.g)}, ${adjust(rgb.b)}`;
}
export function applyMeLayout(doc, layout, options = {}) {
    applyProfileLayout(doc, layout, {
        panelToDom: ME_PANEL_TO_DOM,
        required: ME_REQUIRED,
        layoutSelector: ".me-layout",
        galleryPhotos: options.galleryPhotos,
    });
}
export function applyPlayerLayout(doc, layout, options = {}) {
    applyProfileLayout(doc, layout, {
        panelToDom: PLAYER_PANEL_TO_DOM,
        required: PLAYER_REQUIRED,
        layoutSelector: ".player-layout",
        galleryPhotos: options.galleryPhotos,
    });
}
