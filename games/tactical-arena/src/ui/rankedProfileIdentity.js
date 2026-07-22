// Ranked identity editor: the tagline field + avatar picker shown to a signed-in player,
// plus the legacy-name one-time migration and the "owned unit/skin" avatar-option
// builder. Split out of rankedProfile.js so that file stays focused on the overlay,
// standing, and match/unit history. Everything here operates on a caller-owned `state`
// ({ title, avatarUnit, avatarSkin }) and a `save(patch)` that persists to the platform.

import { el } from "./domHelpers.js";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { loadRankedName, saveRankedName } from "./rankedNameModel.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { readUnlockProgress } from "../progression/unlocks.js";
import { getUnitSkins } from "./skinModel.js";
import { RANKED_AVATARS, createRankedAvatarIcon, getRankedAvatar, hasRankedAvatar } from "./rankedAvatars.js";

// Matches the server-side RANKED_TITLE_MAX_LENGTH in platform-api/src/db/ranked.mts.
export const RANKED_TITLE_MAX_LENGTH = 60;

export function unitLabel(type) {
  return UNIT_TYPES[type]?.name ?? type;
}

function legacyAvatarKey(avatarUnit, avatarSkin = null) {
  return `legacy:${avatarUnit || ""}:${avatarSkin || ""}`;
}

export function buildLegacyRankedAvatarOptions(storage = globalThis.localStorage) {
  const progress = readUnlockProgress(storage);
  const unlockedUnits = new Set(progress.unlockedUnits);
  const options = [];
  const seen = new Set();

  for (const type of Object.keys(UNIT_TYPES)) {
    if (!hasPortrait(type)) continue;
    if (unlockedUnits.has(type)) {
      const key = legacyAvatarKey(type);
      seen.add(key);
      options.push(Object.freeze({
        kind: "legacy",
        id: key,
        avatarUnit: type,
        avatarSkin: null,
        label: unitLabel(type),
        sub: "Owned unit",
      }));
    }

    for (const skin of getUnitSkins(type, storage)) {
      if (!skin.unlocked) continue;
      const key = legacyAvatarKey(type, skin.slug);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(Object.freeze({
        kind: "legacy",
        id: key,
        avatarUnit: type,
        avatarSkin: skin.slug,
        label: `${unitLabel(type)}: ${skin.name}`,
        sub: "Owned skin",
      }));
    }
  }

  return Object.freeze(options);
}

// One-time seed: if the player has no server title yet but set a local ranked name
// under the old model, push it up as their title. Fire-and-forget — the field renders
// with the migrated value immediately regardless of the network round-trip.
export function maybeMigrateLegacyName(state, apiClient) {
  if (state.title) return;
  const legacy = loadRankedName();
  if (!legacy) return;
  state.title = legacy.slice(0, RANKED_TITLE_MAX_LENGTH);
  apiClient.saveRankedProfile(TACTICAL_ARENA_GAME_SLUG, { title: state.title }).catch(() => {});
}

export function renderIdentityEditor(body, { pilot, state, apiClient, onProfileSaved = null }) {
  const section = el("section", "ranked-profile-identity");

  const pilotRow = el("div", "ranked-profile-pilot");
  pilotRow.appendChild(el("span", "ranked-profile-label", "Pilot"));
  pilotRow.appendChild(el("b", "ranked-profile-pilot-name", pilot || "Guest"));
  section.appendChild(pilotRow);

  const status = el("p", "ranked-profile-savestate", "");
  const flashSaved = (text = "Saved") => {
    status.textContent = text;
    status.dataset.state = "ok";
  };
  const flashError = () => {
    status.textContent = "Couldn't save — check your connection.";
    status.dataset.state = "err";
  };
  // Persist a patch, reconcile local state from the authoritative response.
  const save = (patch) =>
    apiClient.saveRankedProfile(TACTICAL_ARENA_GAME_SLUG, patch)
      .then((profile) => {
        if (!profile) { flashError(); return; }
        state.title = profile.title || "";
        state.avatarUnit = profile.avatarUnit || null;
        state.avatarSkin = profile.avatarSkin || null;
        saveRankedName(state.title || "");
        onProfileSaved?.(state);
        flashSaved();
      })
      .catch(flashError);

  // --- Tagline field ---
  const titleField = el("div", "ranked-profile-namefield");
  titleField.appendChild(el("label", "ranked-profile-label", "Ranked tagline"));

  const input = document.createElement("input");
  input.type = "text";
  input.className = "ranked-profile-input";
  input.maxLength = RANKED_TITLE_MAX_LENGTH;
  input.placeholder = "Say something sharp";
  input.value = state.title;
  input.setAttribute("aria-label", "Ranked tagline");

  const preview = el("p", "ranked-profile-nameprev");
  const refreshPreview = () => {
    const shown = input.value.trim() || "No tagline set";
    preview.textContent = `Nameplate tagline: ${shown}`;
  };
  const commitTitle = () => {
    const next = input.value.trim().replace(/\s+/g, " ").slice(0, RANKED_TITLE_MAX_LENGTH);
    if (next === state.title) return;
    input.value = next;
    refreshPreview();
    save({ title: next || null });
  };
  input.addEventListener("input", refreshPreview);
  input.addEventListener("blur", commitTitle);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { commitTitle(); input.blur(); }
  });

  const clearBtn = el("button", "ranked-profile-clear", "Clear");
  clearBtn.type = "button";
  clearBtn.addEventListener("click", () => { input.value = ""; commitTitle(); });

  const fieldRow = el("div", "ranked-profile-fieldrow");
  fieldRow.append(input, clearBtn);
  titleField.append(fieldRow, preview);
  section.appendChild(titleField);
  refreshPreview();

  // --- Avatar picker ---
  section.appendChild(renderAvatarField(state, save));

  section.appendChild(status);
  body.appendChild(section);
}

// Avatar picker: choose from authored sprite icons plus owned unit/skin portraits.
function renderAvatarField(state, save) {
  const field = el("div", "ranked-profile-avatarfield");
  field.appendChild(el("label", "ranked-profile-label", "Ranked avatar"));
  const legacyOptions = buildLegacyRankedAvatarOptions();

  const preview = el("div", "ranked-profile-avatar-preview");
  const dropdown = el("div", "ranked-profile-avatar-dropdown");
  const toggle = el("button", "ranked-profile-avatar-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-haspopup", "listbox");
  toggle.setAttribute("aria-expanded", "false");

  const selectedIcon = el("span", "ranked-profile-avatar-selected-icon");
  const selectedCopy = el("span", "ranked-profile-avatar-selected-copy");
  const selectedLabel = el("span", "ranked-profile-avatar-selected-label", "");
  const selectedSub = el("span", "ranked-profile-avatar-selected-sub", "");
  selectedCopy.append(selectedLabel, selectedSub);
  toggle.append(selectedIcon, selectedCopy, el("span", "ranked-profile-avatar-caret", "v"));

  const menu = el("div", "ranked-profile-avatar-menu");
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Ranked avatars");
  dropdown.append(toggle, menu);

  const renderPreview = () => {
    preview.replaceChildren();
    if (hasRankedAvatar(state.avatarUnit)) {
      preview.appendChild(createRankedAvatarIcon(state.avatarUnit, { className: "is-preview" }));
      preview.appendChild(el("span", "ranked-profile-avatar-name", getRankedAvatar(state.avatarUnit).label));
    } else if (state.avatarUnit && hasPortrait(state.avatarUnit)) {
      preview.appendChild(createPortrait(state.avatarUnit, { variant: "is-thumb", skin: state.avatarSkin, eager: true }));
      const selected = legacyOptions.find((option) =>
        option.avatarUnit === state.avatarUnit && (option.avatarSkin || null) === (state.avatarSkin || null));
      preview.appendChild(el("span", "ranked-profile-avatar-name", selected?.label ?? `${unitLabel(state.avatarUnit)} portrait`));
    } else {
      preview.appendChild(el("span", "ranked-profile-avatar-none", "No avatar set"));
    }
  };

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  const toggleMenu = () => {
    const isOpening = menu.hidden;
    menu.hidden = !isOpening;
    toggle.setAttribute("aria-expanded", String(isOpening));
  };
  const selectAvatar = ({ avatarUnit = null, avatarSkin = null } = {}) => {
    const nextAvatarUnit = avatarUnit || null;
    const nextAvatarSkin = avatarSkin || null;
    if (nextAvatarUnit === (state.avatarUnit || null) && nextAvatarSkin === (state.avatarSkin || null)) {
      closeMenu();
      return;
    }
    state.avatarUnit = nextAvatarUnit;
    state.avatarSkin = nextAvatarSkin;
    save({ avatarUnit: state.avatarUnit, avatarSkin: state.avatarSkin });
    syncAvatarDropdown();
    closeMenu();
  };
  const renderSelected = () => {
    selectedIcon.replaceChildren();
    if (hasRankedAvatar(state.avatarUnit)) {
      selectedIcon.appendChild(createRankedAvatarIcon(state.avatarUnit, { className: "is-menu" }));
      selectedLabel.textContent = getRankedAvatar(state.avatarUnit).label;
      selectedSub.textContent = "Icon avatar";
    } else if (state.avatarUnit && hasPortrait(state.avatarUnit)) {
      selectedIcon.appendChild(createPortrait(state.avatarUnit, { variant: "is-thumb", skin: state.avatarSkin, eager: true }));
      const selected = legacyOptions.find((option) =>
        option.avatarUnit === state.avatarUnit && (option.avatarSkin || null) === (state.avatarSkin || null));
      selectedLabel.textContent = selected?.label ?? unitLabel(state.avatarUnit);
      selectedSub.textContent = selected?.sub ?? "Legacy portrait";
    } else {
      selectedIcon.appendChild(el("span", "ranked-profile-avatar-initial", "C"));
      selectedLabel.textContent = "No avatar";
      selectedSub.textContent = "Use initial";
    }
  };
  const renderDropdownOption = ({ id = null, avatarUnit = null, avatarSkin = null, label, sub, icon }) => {
    const nextAvatarUnit = avatarUnit ?? id ?? null;
    const nextAvatarSkin = avatarSkin ?? null;
    const selected = (state.avatarUnit || null) === (nextAvatarUnit || null)
      && (state.avatarSkin || null) === (nextAvatarSkin || null);
    const option = el("button", `ranked-profile-avatar-option${selected ? " is-selected" : ""}`);
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(selected));
    option.append(icon, el("span", "ranked-profile-avatar-option-text", label), el("span", "ranked-profile-avatar-option-sub", sub));
    option.addEventListener("click", () => selectAvatar({ avatarUnit: nextAvatarUnit, avatarSkin: nextAvatarSkin }));
    menu.appendChild(option);
  };
  const renderMenu = () => {
    menu.replaceChildren();
    renderDropdownOption({
      id: null,
      label: "No avatar",
      sub: "Use initial",
      icon: el("span", "ranked-profile-avatar-option-none", "C"),
    });
    let currentLegacyOptionRendered = false;
    for (const legacy of legacyOptions) {
      if (legacy.avatarUnit === state.avatarUnit && (legacy.avatarSkin || null) === (state.avatarSkin || null)) {
        currentLegacyOptionRendered = true;
      }
      renderDropdownOption({
        avatarUnit: legacy.avatarUnit,
        avatarSkin: legacy.avatarSkin,
        label: legacy.label,
        sub: legacy.sub,
        icon: createPortrait(legacy.avatarUnit, { variant: "is-thumb", skin: legacy.avatarSkin, eager: true }),
      });
    }
    if (!currentLegacyOptionRendered && state.avatarUnit && !hasRankedAvatar(state.avatarUnit) && hasPortrait(state.avatarUnit)) {
      renderDropdownOption({
        avatarUnit: state.avatarUnit,
        avatarSkin: state.avatarSkin,
        label: unitLabel(state.avatarUnit),
        sub: state.avatarSkin ? "Current skin" : "Legacy portrait",
        icon: createPortrait(state.avatarUnit, { variant: "is-thumb", skin: state.avatarSkin, eager: true }),
      });
    }
    for (const avatar of RANKED_AVATARS) {
      renderDropdownOption({
        id: avatar.id,
        label: avatar.label,
        sub: avatar.sheet === "sheet-1" ? "Set 1" : "Set 2",
        icon: createRankedAvatarIcon(avatar.id, { className: "is-menu" }),
      });
    }
  };
  function syncAvatarDropdown() {
    renderPreview();
    renderSelected();
    renderMenu();
  }
  toggle.addEventListener("click", toggleMenu);
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu();
      toggle.focus();
    }
  });
  syncAvatarDropdown();

  field.append(preview, dropdown);
  return field;
}
