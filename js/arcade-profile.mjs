import {
  FACTORY_PROFILE_NAME_MAX_LENGTH,
  loadFactoryProfile,
  normalizeFactoryProfile,
  saveFactoryProfile,
} from "./factory-profile.mjs";

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
    inputValue: normalized.profileName,
    inputMaxLength: FACTORY_PROFILE_NAME_MAX_LENGTH,
    saveLabel: hasName ? "UPDATE CARD" : "STORE CARD",
    statusLine: hasName
      ? "DEFAULT ONLINE IDENTITY ACROSS THE ARCADE"
      : "SET YOUR DEFAULT ARCADE NAME",
    helperText: "This becomes your default online identity across the arcade. Games can still use temporary match aliases.",
    playerIdLabel: formatArcadePlayerId(normalized.playerId),
    flashMessage: typeof options.flashMessage === "string" ? options.flashMessage : "",
  };
}

export function saveArcadeProfileName(storage, profileName, options = {}) {
  const current = loadFactoryProfile(storage, options);
  return saveFactoryProfile({
    ...current,
    profileName,
  }, storage, options);
}

export function initArcadeProfilePanel({
  doc = globalThis.document,
  storage = globalThis.window?.localStorage ?? null,
  options = {},
} = {}) {
  const button = doc?.getElementById?.("playerProfileButton");
  const panel = doc?.getElementById?.("playerProfilePanel");
  const closeButton = doc?.getElementById?.("playerProfileClose");
  const form = doc?.getElementById?.("playerProfileForm");
  const input = doc?.getElementById?.("playerProfileName");
  const clearButton = doc?.getElementById?.("playerProfileClear");

  if (!button || !panel || !form || !input) {
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

    input.value = model.inputValue;
    input.maxLength = model.inputMaxLength;
  }

  function openPanel() {
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    input.focus();
    input.select();
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
    saveArcadeProfileName(storage, "", options);
    render("PLAYER CARD CLEARED");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveArcadeProfileName(storage, input.value, options);
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
