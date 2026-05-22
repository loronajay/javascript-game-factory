import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";
import { LAYOUT_COLUMNS, getDefaultLayout } from "./default-layout.mjs?v=20260521-music-freeform-1";
import { getPanelChildGrid, PROFILE_PANEL_CHILD_REGISTRY } from "./child-layout.mjs";
import {
  COMPOSITION_GRID_COLUMNS,
  COMPOSITION_GRID_ROWS,
  getCompositionElementDef,
} from "./composition-layout.mjs?v=20260521-music-freeform-1";
import {
  renderMeFriendCodePanel,
  renderMeFriendsPanel,
  renderMeGalleryPanel,
  renderMeHeroCard,
  renderMeIdentityPanel,
  renderMeRankingsPanel,
  renderMeThoughtsPanel,
  renderMeTopFriendsPanel,
} from "../arcade-me-view.mjs";
import { renderProfileMusicPlayerPanel } from "../profile-editor/music-player.mjs";
import {
  renderAboutPanel,
  renderBadgesPanel,
  renderFavoritePanel,
} from "../me-page/render-sections.mjs";

const DRAG_HANDLE_SVG = `<svg viewBox="0 0 8 12" fill="currentColor" aria-hidden="true" focusable="false">
  <circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/>
  <circle cx="2" cy="6" r="1.3"/><circle cx="6" cy="6" r="1.3"/>
  <circle cx="2" cy="10" r="1.3"/><circle cx="6" cy="10" r="1.3"/>
</svg>`;

const RESIZE_HANDLE_SVG = `<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true" focusable="false">
  <line x1="1.5" y1="7" x2="7" y2="1.5"/>
  <line x1="4.5" y1="7" x2="7" y2="4.5"/>
</svg>`;

// Renders layout panel tiles into a container element.
// Preserves any extra classes already on the container (e.g. --overlay).
export function renderLayoutGrid(container, layout, options = {}) {
  if (!container) return;
  const editMode = !!options.editMode;
  const selectedId = options.selectedId || null;
  const onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
  const previewModels = options.previewModels || {};
  const childEditPanelId = options.childEditPanelId || null;
  const selectedChildId = options.selectedChildId || null;

  const panels = layout?.desktop?.panels ?? getDefaultLayout().desktop.panels;
  const elements = Array.isArray(layout?.desktop?.elements) ? layout.desktop.elements : [];
  const enabledPanels = panels.filter((p) => p.enabled !== false);
  const compositionCategories = new Set(
    elements
      .filter((element) => element?.enabled !== false && element.category && element.category !== "custom")
      .map((element) => element.category),
  );
  const renderedPanels = enabledPanels
    .filter((panel) => !compositionCategories.has(panel.id))
    .sort(comparePanelsByFreeformPosition);

  // Preserve extra classes (like --overlay) while replacing base edit class.
  const extraClasses = [...container.classList]
    .filter((c) => c !== "profile-layout-grid" && c !== "profile-layout-grid--edit")
    .filter((c) => c !== "profile-layout-grid--has-selection")
    .join(" ");

  container.innerHTML = "";
  container.className = [
    "profile-layout-grid",
    editMode ? "profile-layout-grid--edit" : "",
    editMode && selectedId ? "profile-layout-grid--has-selection" : "",
    extraClasses,
  ].filter(Boolean).join(" ");

  if (editMode) {
    renderGridOverlay(container, renderedPanels);
  }

  for (const panel of renderedPanels) {
    const def = PROFILE_PANEL_REGISTRY[panel.id];
    if (!def) continue;

    const tile = document.createElement("div");
    tile.dataset.panelId = panel.id;
    tile.dataset.density = getPanelDensity(panel);
    tile.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
    tile.style.gridRow = `${panel.y + 1} / span ${panel.h}`;
    applyTileVisualStyle(tile, panel.style);

    const classes = ["profile-layout-tile"];
    if (editMode) {
      classes.push("profile-layout-tile--edit");
      if (panel.id === selectedId) classes.push("profile-layout-tile--selected");
      if (!def.draggable && !def.resizable) classes.push("profile-layout-tile--locked");
      if (hasLivePreview(panel.id, previewModels)) classes.push("profile-layout-tile--live-preview");
      if (childEditPanelId === panel.id) classes.push("profile-layout-tile--child-editing");
    }
    tile.className = classes.join(" ");

    const livePreview = renderLivePreview(tile, panel, previewModels);
    if (editMode && childEditPanelId === panel.id) {
      renderChildEditorOverlay(livePreview || tile, panel, selectedChildId);
    }

    if (editMode && def.draggable) {
      const handle = document.createElement("button");
      handle.className = "profile-layout-tile__drag-handle";
      handle.setAttribute("type", "button");
      handle.setAttribute("data-drag-handle", "");
      handle.setAttribute("aria-label", `Drag ${def.label} panel`);
      handle.setAttribute("title", "Drag to move");
      handle.innerHTML = DRAG_HANDLE_SVG;
      tile.appendChild(handle);
    }

    if (!hasLivePreview(panel.id, previewModels)) {
      const label = document.createElement("span");
      label.className = "profile-layout-tile__label";
      label.textContent = def.label;
      tile.appendChild(label);
    }

    if (editMode && (def.draggable || def.resizable)) {
      const badge = document.createElement("span");
      badge.className = "profile-layout-tile__size-badge";
      badge.textContent = `${panel.w}×${panel.h}`;
      tile.appendChild(badge);
    }

    if (editMode && def.resizable) {
      const handle = document.createElement("button");
      const heightOnly = def.resizableWidth === false;
      handle.className = "profile-layout-tile__resize-handle" +
        (heightOnly ? " profile-layout-tile__resize-handle--height-only" : "");
      handle.setAttribute("type", "button");
      handle.setAttribute("data-resize-handle", "");
      handle.setAttribute("aria-label", `Resize ${def.label} panel`);
      handle.setAttribute("title", heightOnly ? "Drag to resize height" : "Drag to resize");
      handle.innerHTML = RESIZE_HANDLE_SVG;
      tile.appendChild(handle);
    }

    if (editMode && onSelect) {
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", `Select ${def.label} panel`);
      tile.addEventListener("click", (e) => {
        // Don't fire selection when clicking a handle
        if (!e.target.closest("[data-drag-handle],[data-resize-handle],[data-child-id]")) onSelect(panel.id);
      });
      tile.addEventListener("keydown", (e) => {
        if (e.target.closest("[data-child-id]")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(panel.id);
        }
      });
    }

    container.appendChild(tile);
  }

  renderCompositionElements(container, elements, {
    editMode,
    selectedId,
    previewModels,
    onSelect,
  });
}

function comparePanelsByFreeformPosition(a, b) {
  return (a.y - b.y) || (a.x - b.x);
}

function renderCompositionElements(container, elements, options = {}) {
  if (!Array.isArray(elements) || elements.length === 0 || !options.previewModels?.hero) return;

  for (const element of elements.filter((item) => item?.enabled !== false)) {
    const def = getCompositionElementDef(element.id);
    if (!def) continue;

    const tile = document.createElement("div");
    tile.dataset.elementId = element.id;
    tile.dataset.panelId = element.category;
    tile.className = [
      "profile-layout-composition-element",
      `profile-layout-composition-element--${def.type}`,
      options.editMode ? "profile-layout-composition-element--edit" : "",
      options.selectedId === element.id ? "profile-layout-composition-element--selected" : "",
    ].filter(Boolean).join(" ");
    applyCompositionRectStyle(tile, element);
    applyTileVisualStyle(tile, element.style);
    renderCompositionElementContent(tile, element, def, options.previewModels);

    if (options.editMode) {
      const handle = document.createElement("button");
      handle.className = "profile-layout-composition-element__drag-handle";
      handle.setAttribute("type", "button");
      handle.setAttribute("data-element-drag-handle", "");
      handle.setAttribute("aria-label", `Drag ${def.label}`);
      handle.innerHTML = DRAG_HANDLE_SVG;
      tile.appendChild(handle);

      const resize = document.createElement("button");
      resize.className = "profile-layout-composition-element__resize-handle";
      resize.setAttribute("type", "button");
      resize.setAttribute("data-element-resize-handle", "");
      resize.setAttribute("aria-label", `Resize ${def.label}`);
      resize.innerHTML = RESIZE_HANDLE_SVG;
      tile.appendChild(resize);
    }

    if (options.editMode && options.onSelect) {
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", `Select ${def.label}`);
      tile.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onSelect(element.id);
      });
      tile.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          options.onSelect(element.id);
        }
      });
    }

    container.appendChild(tile);
  }
}

function renderCompositionElementContent(tile, element, def, previewModels) {
  const heroModel = previewModels.hero;
  if (def.type === "surface") {
    tile.classList.add("profile-layout-composition-surface");
    if (def.category === "hero") {
      tile.classList.add("me-hero-card");
      tile.innerHTML = `<div class="me-hero-card__backdrop" aria-hidden="true"></div>`;
      const backdrop = tile.querySelector(".me-hero-card__backdrop");
      if (backdrop && heroModel.backgroundImageUrl) {
        backdrop.style.setProperty("--me-profile-backdrop-image", `url("${heroModel.backgroundImageUrl}")`);
      }
      tile.classList.toggle("me-hero-card--default-backdrop", !heroModel.backgroundImageUrl);
      tile.classList.toggle("me-hero-card--custom-backdrop", !!heroModel.backgroundImageUrl);
    } else {
      tile.classList.add("me-panel", `me-panel--${getPanelCssSlug(def.category)}`);
    }
    return;
  }

  if (def.type === "title") {
    tile.dataset.compositionScale = "true";
    tile.innerHTML = `
      <div class="profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--title">
        <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(element.text || def.defaultText || def.label)}</h2></div>
      </div>
    `;
    return;
  }

  if (def.type === "text") {
    tile.dataset.compositionScale = "true";
    tile.innerHTML = `
      <div class="profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--text">
        <div class="me-about-copy-wrap" data-profile-child-id="text">
          <p class="me-about-copy">${escapeHtml(heroModel.aboutText || "")}</p>
        </div>
      </div>
    `;
    return;
  }

  if (def.type === "badges") {
    const badgeItems = Array.isArray(heroModel.badgeItems) ? heroModel.badgeItems : [];
    const badgesHtml = badgeItems[0]?.isPlaceholder
      ? `<p class="me-badge-empty">${escapeHtml(badgeItems[0].label)}</p>`
      : `<div class="me-badge-list">${badgeItems.map((item) => `<span class="me-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;
    tile.dataset.compositionScale = "true";
    tile.innerHTML = `
      <div class="profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--badges">
        <div class="me-badge-box" data-profile-child-id="content">
          ${badgesHtml}
        </div>
      </div>
    `;
    return;
  }

  if (def.type === "friendCode") {
    const preview = document.createElement("div");
    renderMeFriendCodePanel(preview, heroModel);
    const child = preview.querySelector('[data-profile-child-id="code"]');
    tile.dataset.compositionScale = "true";
    const stage = document.createElement("div");
    stage.className = "profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--friend-code";
    if (child) {
      child.removeAttribute("data-profile-child-id");
      stage.appendChild(child);
    } else {
      stage.innerHTML = `<div class="friend-code-card"><p class="friend-code-card__value">${escapeHtml(heroModel.friendCodeDisplay || "PENDING")}</p></div>`;
    }
    tile.appendChild(stage);
    return;
  }

  if (def.type === "galleryGrid" || def.type === "galleryLink") {
    const preview = document.createElement("div");
    renderMeGalleryPanel(preview, previewModels.galleryPhotos || [], {
      galleryPlayerId: heroModel.playerId,
    });
    if (def.type === "galleryGrid") {
      const content = preview.querySelector('[data-profile-child-id="content"]');
      const grid = content?.querySelector(".gallery-grid");
      tile.dataset.compositionScale = "none";
      tile.classList.add("profile-layout-composition-element--gallery-grid");
      if (grid) tile.appendChild(grid.cloneNode(true));
      else tile.innerHTML = `<span class="profile-layout-tile__label">${escapeHtml(def.label)}</span>`;
    } else {
      const link = preview.querySelector(".gallery-view-all");
      tile.dataset.compositionScale = "true";
      const stage = document.createElement("div");
      stage.className = "profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--gallery-link";
      if (link) stage.appendChild(link.cloneNode(true));
      else stage.innerHTML = `<a class="gallery-view-all" href="#">View All Photos -></a>`;
      tile.appendChild(stage);
    }
    return;
  }

  if (def.type === "galleryPhoto") {
    const photoIndex = getGalleryPhotoIndex(element.id);
    const photo = Array.isArray(previewModels.galleryPhotos) && Number.isInteger(photoIndex)
      ? previewModels.galleryPhotos[photoIndex]
      : null;
    tile.dataset.compositionScale = "none";
    tile.classList.add("profile-layout-composition-element--gallery-photo");
    if (photo) {
      tile.innerHTML = `
        <div class="gallery-item" data-photo-id="${escapeHtml(photo.id)}">
          <div class="gallery-item__img-frame">
            <img class="gallery-item__img" src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.caption || "")}" loading="lazy">
          </div>
          ${photo.caption ? `<p class="gallery-item__caption">${escapeHtml(photo.caption)}</p>` : ""}
        </div>
      `;
    } else {
      tile.innerHTML = `
        <div class="gallery-item gallery-item--placeholder">
          <div class="gallery-item__img-frame"></div>
          <p class="gallery-item__caption">Photo ${photoIndex + 1}</p>
        </div>
      `;
    }
    return;
  }

  if (def.type === "identityField") {
    const preview = document.createElement("div");
    renderMeIdentityPanel(preview, heroModel);
    const child = preview.querySelector(`[data-profile-child-id="${getIdentityChildId(element.id)}"]`);
    tile.dataset.compositionScale = "true";
    const stage = document.createElement("div");
    stage.className = "profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--identity-field";
    if (child) {
      child.removeAttribute("data-profile-child-id");
      child.style.left = "";
      child.style.top = "";
      child.style.width = "";
      child.style.height = "";
      stage.appendChild(child);
    } else {
      stage.innerHTML = `<div class="me-hero-card__identity-field"><span class="me-hero-card__identity-field-label">${escapeHtml(def.label)}</span></div>`;
    }
    tile.appendChild(stage);
    return;
  }

  if (def.type === "playerAction") {
    tile.dataset.compositionScale = "true";
    tile.innerHTML = `
      <div class="profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--player-action">
        <div class="profile-layout-player-action-preview">
          <span>${escapeHtml(def.label)}</span>
          <button type="button">${escapeHtml(getPlayerActionPreviewLabel(element.id))}</button>
        </div>
      </div>
    `;
    return;
  }

  if (def.type === "thoughtsComposer" || def.type === "thoughtsFeed") {
    const preview = document.createElement("div");
    renderMeThoughtsPanel(preview, heroModel);
    const childId = def.type === "thoughtsComposer" ? "composer" : "feed";
    const child = preview.querySelector(`[data-profile-child-id="${childId}"]`);
    tile.dataset.compositionScale = def.type === "thoughtsComposer" ? "true" : "none";
    if (child) {
      child.removeAttribute("data-profile-child-id");
      child.removeAttribute("data-profile-child-scroll");
      child.style.left = "";
      child.style.top = "";
      child.style.width = "";
      child.style.height = "";
      if (def.type === "thoughtsComposer") {
        const stage = document.createElement("div");
        stage.className = "profile-layout-composition-element__scale-stage profile-layout-composition-element__scale-stage--thoughts-composer";
        stage.appendChild(child);
        tile.appendChild(stage);
      } else {
        tile.classList.add("profile-layout-composition-element--scroll-content");
        tile.appendChild(child);
      }
    } else {
      tile.innerHTML = `<span class="profile-layout-tile__label">${escapeHtml(def.label)}</span>`;
    }
    return;
  }

  if (def.category !== "hero" || !["portrait", "metrics"].includes(def.type)) {
    tile.innerHTML = `<span class="profile-layout-tile__label">${escapeHtml(def.label)}</span>`;
    return;
  }

  const hero = document.createElement("div");
  hero.className = "me-hero-card";
  renderMeHeroCard(hero, heroModel);
  const childId = def.type === "portrait" ? "portrait" : "metrics";
  const child = hero.querySelector(`[data-profile-child-id="${childId}"]`);
  if (child) {
    child.removeAttribute("data-profile-child-id");
    child.style.left = "";
    child.style.top = "";
    child.style.width = "";
    child.style.height = "";
    tile.dataset.compositionScale = "true";
    const stage = document.createElement("div");
    stage.className = [
      "profile-layout-composition-element__scale-stage",
      `profile-layout-composition-element__scale-stage--${def.type}`,
    ].join(" ");
    stage.appendChild(child);
    tile.appendChild(stage);
  }
}

export function applyCompositionElementScaling(root = document) {
  root.querySelectorAll("[data-composition-scale]").forEach((tile) => {
    const stage = tile.querySelector(".profile-layout-composition-element__scale-stage");
    if (!stage) return;

    stage.style.transform = "translate(-50%, -50%) scale(1)";
    const tileRect = tile.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    if (!tileRect.width || !tileRect.height || !stageRect.width || !stageRect.height) return;

    const scale = Math.min(tileRect.width / stageRect.width, tileRect.height / stageRect.height, 1);
    stage.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
  });
}

function applyCompositionRectStyle(el, item) {
  const x = (item.x / COMPOSITION_GRID_COLUMNS) * 100;
  const y = (item.y / COMPOSITION_GRID_ROWS) * 100;
  const w = (item.w / COMPOSITION_GRID_COLUMNS) * 100;
  const h = (item.h / COMPOSITION_GRID_ROWS) * 100;
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  el.style.width = `${w}%`;
  el.style.height = `${h}%`;
}

function getIdentityChildId(elementId) {
  if (elementId === "identityName") return "name";
  if (elementId === "identityPageViews") return "pageViews";
  if (elementId === "identityFactoryId") return "factoryId";
  if (elementId === "identitySocialLinks") return "socialLinks";
  return "";
}

function getPlayerActionPreviewLabel(elementId) {
  if (elementId === "identityFriendAction") return "Add Friend";
  if (elementId === "identityMessageAction") return "Message";
  if (elementId === "identityGestureActions") return "Kick / Blow Kiss / Challenge";
  return "Action";
}

function getGalleryPhotoIndex(elementId) {
  const match = String(elementId || "").match(/^galleryPhoto(\d+)$/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10) - 1;
  return index >= 0 && index < 8 ? index : null;
}

function getPanelCssSlug(category) {
  if (category === "friendCode") return "friend-code";
  if (category === "favoriteGame") return "favorite";
  if (category === "topFriends") return "top-friends";
  return category;
}

function hasLivePreview(panelId, previewModels) {
  return [
    "hero",
    "identity",
    "music",
    "thoughts",
    "rankings",
    "topFriends",
    "friends",
    "friendCode",
    "favoriteGame",
    "gallery",
    "about",
    "badges",
  ].includes(panelId) && !!previewModels.hero;
}

function renderLivePreview(tile, panel, previewModels) {
  const panelId = panel?.id;
  if (!hasLivePreview(panelId, previewModels)) return null;

  const preview = document.createElement("div");
  preview.className = "profile-layout-tile__live-panel";

  if (panelId === "hero") {
    preview.id = "meLayoutHeroPreview";
    preview.classList.add("me-hero-card");
    renderMeHeroCard(preview, previewModels.hero);
  } else if (panelId === "identity") {
    preview.id = "meLayoutIdentityPreview";
    preview.classList.add("me-panel", "me-panel--identity");
    renderMeIdentityPanel(preview, previewModels.hero);
  } else if (panelId === "music") {
    preview.id = "meLayoutMusicPreview";
    preview.classList.add("me-panel", "me-panel--music");
    renderProfileMusicPlayerPanel(preview, previewModels.hero.profileMusicPlaylist || [], "meLayoutMusicPreview");
  } else if (panelId === "thoughts") {
    preview.id = "meLayoutThoughtsPreview";
    preview.classList.add("me-panel", "me-panel--thoughts");
    renderMeThoughtsPanel(preview, previewModels.hero);
  } else if (panelId === "rankings") {
    preview.id = "meLayoutRankingsPreview";
    preview.classList.add("me-panel", "me-panel--rankings");
    renderMeRankingsPanel(preview, previewModels.hero);
  } else if (panelId === "topFriends") {
    preview.id = "meLayoutTopFriendsPreview";
    preview.classList.add("me-panel", "me-panel--top-friends");
    renderMeTopFriendsPanel(preview, previewModels.hero);
  } else if (panelId === "friends") {
    preview.id = "meLayoutFriendsPreview";
    preview.classList.add("me-panel", "me-panel--friends");
    renderMeFriendsPanel(preview, previewModels.hero, { expanded: true });
  } else if (panelId === "friendCode") {
    preview.id = "meLayoutFriendCodePreview";
    preview.classList.add("me-panel", "me-panel--friend-code");
    renderMeFriendCodePanel(preview, previewModels.hero);
  } else if (panelId === "favoriteGame") {
    preview.id = "meLayoutFavoriteGamePreview";
    preview.classList.add("me-panel", "me-panel--favorite");
    renderFavoritePanel(preview, "Favorite Game", previewModels.hero.favoriteGameItems?.[0]);
  } else if (panelId === "gallery") {
    preview.id = "meLayoutGalleryPreview";
    preview.classList.add("me-panel", "me-panel--gallery");
    renderMeGalleryPanel(preview, previewModels.galleryPhotos || [], {
      galleryPlayerId: previewModels.hero.playerId,
    });
  } else if (panelId === "about") {
    preview.id = "meLayoutAboutPreview";
    preview.classList.add("me-panel", "me-panel--about");
    renderAboutPanel(preview, "About Me", previewModels.hero.aboutText);
  } else if (panelId === "badges") {
    preview.id = "meLayoutBadgesPreview";
    preview.classList.add("me-panel", "me-panel--badges");
    renderBadgesPanel(preview, "Badges", previewModels.hero.badgeItems || []);
  }

  applyPreviewChildLayout(preview, panel);
  tile.appendChild(preview);
  return preview;
}

function applyPreviewChildLayout(preview, panel) {
  if (!Array.isArray(panel?.children)) return;
  for (const child of panel.children) {
    if (!child?.id || child.enabled === false) continue;
    const childEl = preview.querySelector(`[data-profile-child-id="${child.id}"]`);
    if (!childEl) continue;
    applyChildRectStyle(childEl, child);
    applyTileVisualStyle(childEl, child.style);
  }
}

function renderChildEditorOverlay(container, panel, selectedChildId) {
  const grid = getPanelChildGrid(panel.id);
  const registry = PROFILE_PANEL_CHILD_REGISTRY[panel.id];
  if (!grid || !registry || !Array.isArray(panel.children)) return;

  const overlay = document.createElement("div");
  overlay.className = "profile-layout-child-grid";
  overlay.style.setProperty("--profile-child-columns", String(grid.columns));
  overlay.style.setProperty("--profile-child-rows", String(grid.rows));
  overlay.style.setProperty("--profile-child-visual-columns", String(grid.visualColumns || grid.columns));
  overlay.style.setProperty("--profile-child-visual-rows", String(grid.visualRows || grid.rows));

  const visualColumns = grid.visualColumns || grid.columns;
  const visualRows = grid.visualRows || grid.rows;
  const visualColSpan = grid.columns / visualColumns;
  const visualRowSpan = grid.rows / visualRows;
  for (let row = 0; row < visualRows; row += 1) {
    for (let col = 0; col < visualColumns; col += 1) {
      const cell = document.createElement("span");
      cell.className = "profile-layout-child-grid__cell";
      cell.style.gridColumn = `${Math.floor(col * visualColSpan) + 1} / span ${Math.ceil(visualColSpan)}`;
      cell.style.gridRow = `${Math.floor(row * visualRowSpan) + 1} / span ${Math.ceil(visualRowSpan)}`;
      overlay.appendChild(cell);
    }
  }

  for (const child of panel.children) {
    const def = registry.children[child.id];
    if (!def || child.enabled === false) continue;
    const slot = document.createElement("span");
    slot.dataset.childSlot = child.id;
    slot.className = "profile-layout-child-grid__slot" +
      (child.id === selectedChildId ? " profile-layout-child-grid__slot--selected" : "");
    applyChildRectStyle(slot, child);
    slot.setAttribute("aria-hidden", "true");
    overlay.appendChild(slot);

    const box = document.createElement("div");
    box.dataset.childId = child.id;
    box.className = "profile-layout-child-grid__box" +
      (child.id === selectedChildId ? " profile-layout-child-grid__box--selected" : "");
    applyChildRectStyle(box, child);
    box.setAttribute("role", "button");
    box.setAttribute("tabindex", "0");
    box.setAttribute("aria-label", `Select ${def.label}`);
    box.innerHTML = `
      <span class="profile-layout-child-grid__label">${def.label}</span>
      <span class="profile-layout-child-grid__resize" data-child-resize-handle aria-hidden="true">${RESIZE_HANDLE_SVG}</span>
    `;
    overlay.appendChild(box);
  }

  container.appendChild(overlay);
}

function applyChildRectStyle(el, child) {
  el.style.gridColumn = "";
  el.style.gridRow = "";
  el.style.left = `${child.x}%`;
  el.style.top = `${child.y}%`;
  el.style.width = `${child.w}%`;
  el.style.height = `${child.h}%`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGridOverlay(container, panels) {
  const maxRows = Math.max(
    1,
    ...panels.map((panel) => (panel.y || 0) + (panel.h || 1)),
  );
  const overlay = document.createElement("div");
  overlay.className = "profile-layout-grid__overlay-cells";
  overlay.setAttribute("aria-hidden", "true");
  for (let row = 0; row < maxRows; row += 1) {
    for (let col = 0; col < LAYOUT_COLUMNS; col += 1) {
      const cell = document.createElement("span");
      cell.className = "profile-layout-grid__overlay-cell";
      cell.style.gridColumn = `${col + 1} / span 1`;
      cell.style.gridRow = `${row + 1} / span 1`;
      overlay.appendChild(cell);
    }
  }
  container.appendChild(overlay);
}

function applyTileVisualStyle(tile, style = {}) {
  const panelColor = normalizeHexColor(style.panelColor);
  const panelColor2 = normalizeHexColor(style.panelColor2);
  const titleColor = normalizeHexColor(style.titleColor);
  const opacity = clampNumber(style.opacity, 0.15, 1, 0.92);
  const saturation = clampNumber(style.saturation, 0, 2, 1);
  const brightness = clampNumber(style.brightness, 0.35, 1.8, 1);
  const gradientAngle = clampNumber(style.gradientAngle, 0, 360, 180);
  if (panelColor) {
    const rgb = adjustHexColor(panelColor, saturation, brightness);
    const rgb2 = panelColor2 ? adjustHexColor(panelColor2, saturation, brightness) : rgb;
    tile.style.setProperty("--layout-tile-custom-rgb", rgb);
    tile.style.setProperty("--layout-tile-custom-rgb-2", rgb2);
    tile.style.setProperty("--layout-tile-custom-opacity", String(opacity));
    tile.style.setProperty("--layout-tile-base-rgb", rgb);
    tile.style.setProperty("--layout-tile-base-rgb-2", rgb2);
    tile.style.setProperty("--layout-tile-base-opacity", String(Math.max(0.55, opacity)));
    tile.style.setProperty("--layout-tile-gradient-angle", `${gradientAngle}deg`);
    tile.style.setProperty("--profile-panel-custom-rgb", rgb);
    tile.style.setProperty("--profile-panel-custom-rgb-2", rgb2);
    tile.style.setProperty("--profile-panel-custom-opacity", String(opacity));
    tile.style.setProperty("--profile-panel-base-rgb", rgb);
    tile.style.setProperty("--profile-panel-base-rgb-2", rgb2);
    tile.style.setProperty("--profile-panel-base-opacity", String(Math.max(0.55, opacity)));
    tile.style.setProperty("--profile-panel-gradient-angle", `${gradientAngle}deg`);
  }
  if (titleColor) {
    tile.style.setProperty("--layout-tile-label-color", titleColor);
    tile.style.setProperty("--profile-panel-title-rgb", hexToRgbString(titleColor));
  }
  const elementColor = normalizeHexColor(style.elementColor);
  if (elementColor) {
    tile.style.setProperty("--profile-panel-element-rgb", hexToRgbString(elementColor));
  }
  const textColor = normalizeHexColor(style.textColor);
  if (textColor) {
    tile.style.setProperty("--profile-panel-text-rgb", hexToRgbString(textColor));
  }
  const buttonColor = normalizeHexColor(style.buttonColor);
  if (buttonColor) {
    tile.style.setProperty("--profile-panel-button-rgb", hexToRgbString(buttonColor));
  }
}

function getPanelDensity(panel) {
  const area = panel.w * panel.h;
  if (panel.w <= 3 || panel.h <= 2) return "compact";
  if (area <= 12) return "standard";
  return "expanded";
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : "";
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

function adjustHexColor(hex, saturation, brightness) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "";
  const gray = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  const adjust = (channel) => Math.round(Math.min(255, Math.max(0, (gray + (channel - gray) * saturation) * brightness)));
  return `${adjust(rgb.r)}, ${adjust(rgb.g)}, ${adjust(rgb.b)}`;
}

function hexToRgbString(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : "";
}
