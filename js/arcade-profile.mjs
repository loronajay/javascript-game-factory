import {
  FACTORY_PROFILE_NAME_MAX_LENGTH,
  loadFactoryProfile,
  normalizeFactoryProfile,
  saveFactoryProfile,
} from "./platform/identity/factory-profile.mjs";
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_LINK_LABEL_MAX_LENGTH,
  PROFILE_REAL_NAME_MAX_LENGTH,
  PROFILE_TAGLINE_MAX_LENGTH,
} from "./platform/profile/profile.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";

const PROFILE_LINK_ROW_COUNT = 3;
const PROFILE_LINK_URL_MAX_LENGTH = 280;

function createEmptyLinkRow(index) {
  return {
    index,
    idValue: "",
    labelValue: "",
    labelMaxLength: PROFILE_LINK_LABEL_MAX_LENGTH,
    urlValue: "",
    urlMaxLength: PROFILE_LINK_URL_MAX_LENGTH,
    kindValue: "external",
  };
}

function buildLinkRows(links = []) {
  const rows = Array.from({ length: PROFILE_LINK_ROW_COUNT }, (_, index) => createEmptyLinkRow(index));

  links.slice(0, PROFILE_LINK_ROW_COUNT).forEach((link, index) => {
    rows[index] = {
      ...rows[index],
      idValue: link.id || "",
      labelValue: link.label || "",
      urlValue: link.url || "",
      kindValue: link.kind || "external",
    };
  });

  return rows;
}

function collectLinkRows(doc) {
  return Array.from({ length: PROFILE_LINK_ROW_COUNT }, (_, index) => ({
    id: doc?.getElementById?.(`playerProfileLinkId${index + 1}`)?.value || "",
    label: doc?.getElementById?.(`playerProfileLinkLabel${index + 1}`)?.value || "",
    url: doc?.getElementById?.(`playerProfileLinkUrl${index + 1}`)?.value || "",
    kind: doc?.getElementById?.(`playerProfileLinkKind${index + 1}`)?.value || "external",
  }));
}

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
    realNameValue: normalized.realName,
    realNameMaxLength: PROFILE_REAL_NAME_MAX_LENGTH,
    bioValue: normalized.bio,
    bioMaxLength: PROFILE_BIO_MAX_LENGTH,
    taglineValue: normalized.tagline,
    taglineMaxLength: PROFILE_TAGLINE_MAX_LENGTH,
    linkRows: buildLinkRows(normalized.links),
    saveLabel: hasName ? "UPDATE CARD" : "STORE CARD",
    statusLine: "EDIT YOUR PUBLIC PLAYER PROFILE",
    helperText: "Update your arcade username, optional real name, about-me copy, public links, and custom tagline. Games can still use temporary match aliases during a run.",
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
    realName: fields.realName ?? current.realName,
    bio: fields.bio ?? current.bio,
    tagline: fields.tagline ?? current.tagline,
    links: fields.links ?? current.links,
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
  const realNameInput = doc?.getElementById?.("playerProfileRealName");
  const bioInput = doc?.getElementById?.("playerProfileBio");
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
    if (realNameInput) {
      realNameInput.value = model.realNameValue;
      realNameInput.maxLength = model.realNameMaxLength;
    }

    if (bioInput) {
      bioInput.value = model.bioValue;
      bioInput.maxLength = model.bioMaxLength;
    }

    if (taglineInput) {
      taglineInput.value = model.taglineValue;
      taglineInput.maxLength = model.taglineMaxLength;
    }

    model.linkRows.forEach((row, index) => {
      const labelInput = doc.getElementById(`playerProfileLinkLabel${index + 1}`);
      const urlInput = doc.getElementById(`playerProfileLinkUrl${index + 1}`);
      const kindInput = doc.getElementById(`playerProfileLinkKind${index + 1}`);
      const idInput = doc.getElementById(`playerProfileLinkId${index + 1}`);

      if (labelInput) {
        labelInput.value = row.labelValue;
        labelInput.maxLength = row.labelMaxLength;
      }

      if (urlInput) {
        urlInput.value = row.urlValue;
        urlInput.maxLength = row.urlMaxLength;
      }

      if (kindInput) {
        kindInput.value = row.kindValue;
      }

      if (idInput) {
        idInput.value = row.idValue;
      }
    });
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
      realName: "",
      bio: "",
      tagline: "",
      links: [],
    }, options);
    render("PLAYER CARD CLEARED");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveArcadeProfileDetails(storage, {
      profileName: profileNameInput.value,
      realName: realNameInput?.value || "",
      bio: bioInput?.value || "",
      tagline: taglineInput?.value || "",
      links: collectLinkRows(doc),
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
