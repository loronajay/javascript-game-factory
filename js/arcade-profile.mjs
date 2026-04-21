import {
  FACTORY_PROFILE_NAME_MAX_LENGTH,
  loadFactoryProfile,
  normalizeFactoryProfile,
  saveFactoryProfile,
} from "./platform/identity/factory-profile.mjs";
import { PROFILE_TAGLINE_MAX_LENGTH } from "./platform/profile/profile.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";

export function formatArcadePlayerId(playerId) {
  const id = typeof playerId === "string" ? playerId.trim().toUpperCase() : "";
  if (!id) return "PENDING-ID";
  if (id.length <= 16) return id;
  return `${id.slice(0, 11)}...${id.slice(-4)}`;
}

export function buildArcadeProfileViewModel(profile, options = {}) {
  const normalized = normalizeFactoryProfile(profile);
  const hasName = normalized.profileName.length > 0;

  return {
    summaryName: hasName ? normalized.profileName : "UNNAMED PILOT",
    profileName: normalized.profileName,
    profileNameValue: normalized.profileName,
    profileNameMaxLength: FACTORY_PROFILE_NAME_MAX_LENGTH,
    taglineValue: normalized.tagline,
    taglineMaxLength: PROFILE_TAGLINE_MAX_LENGTH,
    saveLabel: hasName ? "UPDATE CARD" : "STORE CARD",
    statusLine: "EDIT YOUR PUBLIC PLAYER PROFILE",
    helperText: "Update the name and custom tagline that appear on your profile. Games can still use temporary match aliases during a run.",
    playerIdLabel: formatArcadePlayerId(normalized.playerId),
    flashMessage: typeof options.flashMessage === "string" ? options.flashMessage : "",
    inputValue: normalized.profileName,
    inputMaxLength: FACTORY_PROFILE_NAME_MAX_LENGTH,
  };
}

export function saveArcadeProfileName(storage, profileName, options = {}) {
  return saveArcadeProfileDetails(storage, { profileName }, options);
}

export function saveArcadeProfileDetails(storage, fields = {}, options = {}) {
  const current = loadFactoryProfile(storage, options);

  return saveFactoryProfile({
    ...current,
    profileName: fields.profileName ?? current.profileName,
    tagline: fields.tagline ?? current.tagline,
  }, storage, options);
}

export function initArcadeProfilePanel({
  doc = globalThis.document,
  storage = getDefaultPlatformStorage(),
  options = {},
} = {}) {
  const button = doc?.getElementById?.("playerProfileButton");
  const panel = doc?.getElementById?.("playerProfilePanel");
  const closeButton = doc?.getElementById?.("playerProfileClose");
  const form = doc?.getElementById?.("playerProfileForm");
  const profileNameInput = doc?.getElementById?.("playerProfileName");
  const taglineInput = doc?.getElementById?.("playerProfileTagline");
  const clearButton = doc?.getElementById?.("playerProfileClear");

  if (!button || !panel || !form || !profileNameInput) {
    return null;
  }

  const summary = doc.getElementById("playerProfileSummary");
  const defaultName = doc.getElementById("playerProfileDefault");
  const status = doc.getElementById("playerProfileStatus");
  const playerId = doc.getElementById("playerProfileId");
  const helper = doc.getElementById("playerProfileHint");
  const flash = doc.getElementById("playerProfileFlash");
  const saveLabel = doc.getElementById("playerProfileSaveLabel");

  function render(flashMessage = "") {
    const model = buildArcadeProfileViewModel(loadFactoryProfile(storage, options), { flashMessage });

    if (summary) summary.textContent = model.summaryName;
    if (defaultName) defaultName.textContent = model.summaryName;
    if (status) status.textContent = model.statusLine;
    if (playerId) playerId.textContent = model.playerIdLabel;
    if (helper) helper.textContent = model.helperText;
    if (flash) flash.textContent = model.flashMessage;
    if (saveLabel) saveLabel.textContent = model.saveLabel;

    profileNameInput.value = model.profileNameValue;
    profileNameInput.maxLength = model.profileNameMaxLength;

    if (taglineInput) {
      taglineInput.value = model.taglineValue;
      taglineInput.maxLength = model.taglineMaxLength;
    }
  }

  function openPanel() {
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    profileNameInput.focus();
    profileNameInput.select();
  }

  function closePanel() {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  button.addEventListener("click", () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  closeButton?.addEventListener("click", closePanel);

  clearButton?.addEventListener("click", () => {
    saveArcadeProfileDetails(storage, {
      profileName: "",
      tagline: "",
    }, options);
    render("PLAYER CARD CLEARED");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveArcadeProfileDetails(storage, {
      profileName: profileNameInput.value,
      tagline: taglineInput?.value || "",
    }, options);
    render("PLAYER CARD SAVED");
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
    }
  });

  render("");

  return {
    render,
    openPanel,
    closePanel,
  };
}
