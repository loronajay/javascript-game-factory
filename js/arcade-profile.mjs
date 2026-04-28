import { ARCADE_GAME_SLUGS, normalizeGameEntry } from "./arcade-catalog.mjs";
import {
  FACTORY_PROFILE_NAME_MAX_LENGTH,
  loadFactoryProfile,
  normalizeFactoryProfile,
  saveFactoryProfile,
} from "./platform/identity/factory-profile.mjs";
import {
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
  saveProfileRelationshipsRecord,
} from "./platform/relationships/relationships.mjs";
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_LINK_LABEL_MAX_LENGTH,
  PROFILE_REAL_NAME_MAX_LENGTH,
  PROFILE_TAGLINE_MAX_LENGTH,
} from "./platform/profile/profile.mjs";
import {
  loadProfileMetricsRecord,
  saveProfileMetricsRecord,
} from "./platform/metrics/metrics.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";

const PROFILE_LINK_ROW_COUNT = 3;
const PROFILE_LINK_URL_MAX_LENGTH = 280;
const FRIEND_RAIL_SLOT_COUNT = 4;
const RELATIONSHIP_MODE_OPTIONS = [
  { value: "auto", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

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

function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function collectLinkRows(doc) {
  return Array.from({ length: PROFILE_LINK_ROW_COUNT }, (_, index) => ({
    id: doc?.getElementById?.(`playerProfileLinkId${index + 1}`)?.value || "",
    label: doc?.getElementById?.(`playerProfileLinkLabel${index + 1}`)?.value || "",
    url: normalizeUrl(doc?.getElementById?.(`playerProfileLinkUrl${index + 1}`)?.value || ""),
    kind: doc?.getElementById?.(`playerProfileLinkKind${index + 1}`)?.value || "external",
  }));
}

function collectFriendSlotPlayerIds(doc) {
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => (
    doc?.getElementById?.(`playerProfileFriendSlot${index + 1}`)?.value || ""
  ));
}

function hasOwn(source, key) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function hasRelationshipField(fields = {}) {
  return [
    "mainSqueezeMode",
    "mainSqueezePlayerId",
    "friendRailMode",
    "manualFriendSlotPlayerIds",
  ].some((key) => hasOwn(fields, key));
}

function createRelationshipCandidateOption(value, label) {
  return {
    value: String(value || ""),
    label: String(label || ""),
  };
}

function buildRelationshipCandidateOptions(profile, relationshipsRecord) {
  const normalizedProfile = normalizeFactoryProfile(profile);
  const normalizedRelationships = normalizeProfileRelationshipsRecord({
    playerId: normalizedProfile.playerId,
    ...relationshipsRecord,
  });
  const options = [createRelationshipCandidateOption("", "No manual pick")];
  const seen = new Set([""]);

  const nameByPlayerId = new Map();
  if (normalizedProfile.mainSqueeze?.playerId && normalizedProfile.mainSqueeze?.profileName) {
    nameByPlayerId.set(normalizedProfile.mainSqueeze.playerId.trim(), normalizedProfile.mainSqueeze.profileName.trim());
  }
  normalizedProfile.friendsPreview.forEach((friend) => {
    const id = typeof friend.playerId === "string" ? friend.playerId.trim() : "";
    const name = typeof friend.profileName === "string" ? friend.profileName.trim() : "";
    if (id && name) nameByPlayerId.set(id, name);
  });

  function addCandidate(playerId, profileName = "") {
    const id = typeof playerId === "string" ? playerId.trim() : "";
    const name = (typeof profileName === "string" ? profileName.trim() : "") || nameByPlayerId.get(id) || "";
    if (!id || !name || seen.has(id)) return;
    seen.add(id);
    options.push(createRelationshipCandidateOption(id, name));
  }

  addCandidate(normalizedProfile.mainSqueeze?.playerId, normalizedProfile.mainSqueeze?.profileName);
  normalizedProfile.friendsPreview.forEach((friend) => {
    addCandidate(friend.playerId, friend.profileName);
  });
  addCandidate(normalizedRelationships.mainSqueezePlayerId);
  normalizedRelationships.manualFriendSlotPlayerIds.forEach((playerId) => addCandidate(playerId));
  normalizedRelationships.friendPlayerIds.forEach((playerId) => addCandidate(playerId));
  addCandidate(normalizedRelationships.mostPlayedWithPlayerId);
  addCandidate(normalizedRelationships.lastPlayedWithPlayerId);
  normalizedRelationships.recentlyPlayedWithPlayerIds.forEach((playerId) => addCandidate(playerId));

  return options;
}

function buildFriendSlotRows(relationshipsRecord) {
  const normalizedRelationships = normalizeProfileRelationshipsRecord(relationshipsRecord);

  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => ({
    index,
    label: `Friend Slot ${index + 1}`,
    playerIdValue: normalizedRelationships.manualFriendSlotPlayerIds[index] || "",
  }));
}

function renderSelectOptions(select, options, value) {
  if (!select) return;

  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  select.value = value;
}

function buildFavoriteGameOptions() {
  return [
    { value: "", label: "No favorite pinned" },
    ...ARCADE_GAME_SLUGS.map((slug) => {
      const entry = normalizeGameEntry(slug);
      return {
        value: entry.slug,
        label: entry.title,
      };
    }),
  ];
}

export function formatArcadePlayerId(playerId) {
  const id = typeof playerId === "string" ? playerId.trim().toUpperCase() : "";
  if (!id) return "PENDING-ID";
  if (id.length <= 16) return id;
  return `${id.slice(0, 11)}...${id.slice(-4)}`;
}

export function buildArcadeProfileViewModel(profile, options = {}) {
  const normalized = normalizeFactoryProfile(profile);
  const relationshipsRecord = normalizeProfileRelationshipsRecord({
    playerId: normalized.playerId,
    ...options.relationshipsRecord,
  });
  const hasName = normalized.profileName.length > 0;
  const relationshipCandidateOptions = buildRelationshipCandidateOptions(normalized, relationshipsRecord);

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
    favoriteGameValue: normalized.favoriteGameSlug,
    favoriteGameOptions: buildFavoriteGameOptions(),
    mainSqueezeModeValue: relationshipsRecord.mainSqueezeMode,
    mainSqueezePlayerIdValue: relationshipsRecord.mainSqueezePlayerId,
    mainSqueezeModeOptions: RELATIONSHIP_MODE_OPTIONS,
    friendRailModeValue: relationshipsRecord.friendRailMode,
    friendRailModeOptions: RELATIONSHIP_MODE_OPTIONS,
    relationshipCandidateOptions,
    friendSlotRows: buildFriendSlotRows(relationshipsRecord),
    linkRows: buildLinkRows(normalized.links),
    discoverableValue: normalized.preferences?.discoverable !== false,
    saveLabel: hasName ? "UPDATE CARD" : "STORE CARD",
    statusLine: "EDIT YOUR PUBLIC PLAYER PROFILE",
    helperText: "Update your arcade username, optional real name, about-me copy, public links, custom tagline, and whether the visible friend rail is automatic or manually pinned. Games can still use temporary match aliases during a run.",
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
  const updatedPreferences = { ...(current.preferences || {}) };
  if (typeof fields.discoverable === "boolean") {
    updatedPreferences.discoverable = fields.discoverable;
  }
  const savedProfile = saveFactoryProfile({
    ...current,
    profileName: fields.profileName ?? current.profileName,
    realName: fields.realName ?? current.realName,
    bio: fields.bio ?? current.bio,
    tagline: fields.tagline ?? current.tagline,
    favoriteGameSlug: fields.favoriteGameSlug ?? current.favoriteGameSlug,
    links: fields.links ?? current.links,
    preferences: updatedPreferences,
  }, storage, options);

  if (hasRelationshipField(fields)) {
    const currentRelationships = loadProfileRelationshipsRecord(savedProfile.playerId, storage);
    saveProfileRelationshipsRecord({
      ...currentRelationships,
      playerId: savedProfile.playerId,
      mainSqueezeMode: fields.mainSqueezeMode ?? currentRelationships.mainSqueezeMode,
      mainSqueezePlayerId: fields.mainSqueezePlayerId ?? currentRelationships.mainSqueezePlayerId,
      friendRailMode: fields.friendRailMode ?? currentRelationships.friendRailMode,
      manualFriendSlotPlayerIds: fields.manualFriendSlotPlayerIds ?? currentRelationships.manualFriendSlotPlayerIds,
    }, storage);
  }

  return savedProfile;
}

export async function hydrateArcadeProfileFromApi(
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
  options = {},
) {
  const currentProfile = loadFactoryProfile(storage, options);
  const currentRelationships = loadProfileRelationshipsRecord(currentProfile.playerId, storage);
  const currentMetrics = loadProfileMetricsRecord(currentProfile.playerId, storage);
  const playerId = currentProfile.playerId;
  const canLoad = playerId
    && apiClient
    && typeof apiClient.loadPlayerProfile === "function"
    && typeof apiClient.loadPlayerRelationships === "function"
    && typeof apiClient.loadPlayerMetrics === "function";

  if (!canLoad) {
    return {
      profile: currentProfile,
      relationshipsRecord: currentRelationships,
      metricsRecord: currentMetrics,
      usedApi: false,
    };
  }

  const [profileResult, relationshipsResult, metricsResult] = await Promise.all([
    apiClient.loadPlayerProfile(playerId).catch(() => null),
    apiClient.loadPlayerRelationships(playerId).catch(() => null),
    apiClient.loadPlayerMetrics(playerId).catch(() => null),
  ]);
  const profileMissingFriendCode = profileResult?.playerId === playerId && !profileResult.friendCode;
  const seededProfileResult = (!profileResult?.playerId || profileMissingFriendCode) && typeof apiClient.savePlayerProfile === "function"
    ? await apiClient.savePlayerProfile(playerId, currentProfile).catch(() => null)
    : null;
  const resolvedProfileResult = seededProfileResult?.playerId === playerId
    ? seededProfileResult
    : (profileResult?.playerId === playerId ? profileResult : null);

  if (!resolvedProfileResult?.playerId) {
    return {
      profile: null,
      relationshipsRecord: null,
      metricsRecord: null,
      usedApi: false,
      error: "profile_load_failed",
    };
  }

  const profile = saveFactoryProfile({ ...resolvedProfileResult, playerId }, storage, options);
  const relationshipsRecord = relationshipsResult?.playerId === playerId
    ? (saveProfileRelationshipsRecord({
        ...relationshipsResult,
        playerId,
      }, storage) || currentRelationships)
    : currentRelationships;
  const metricsRecord = metricsResult?.playerId === playerId
    ? (saveProfileMetricsRecord({
        ...metricsResult,
        playerId,
      }, storage) || currentMetrics)
    : currentMetrics;

  return {
    profile,
    relationshipsRecord,
    metricsRecord,
    usedApi: true,
  };
}

export async function persistArcadeProfileDetails(storage, fields = {}, options = {}) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const currentProfile = loadFactoryProfile(storage, options);
  const playerId = currentProfile.playerId;

  if (!playerId || !apiClient?.isConfigured) {
    return saveArcadeProfileDetails(storage, fields, options);
  }

  // Write to local as a cache placeholder while the API call is in flight.
  const localMerged = saveArcadeProfileDetails(storage, fields, options);
  const relFields = hasRelationshipField(fields) ? loadProfileRelationshipsRecord(playerId, storage) : null;

  const [profileResult, relResult] = await Promise.allSettled([
    apiClient.savePlayerProfile(playerId, localMerged),
    relFields ? apiClient.savePlayerRelationships(playerId, relFields) : Promise.resolve(null),
  ]);

  if (profileResult.status !== "fulfilled" || !profileResult.value?.playerId) {
    throw new Error("Profile save failed");
  }

  // Update local cache from API response — API object is canonical.
  const saved = saveFactoryProfile(profileResult.value, storage, options);

  if (relResult?.status === "fulfilled" && relResult.value?.playerId) {
    saveProfileRelationshipsRecord({ ...relResult.value, playerId }, storage);
  }

  return saved;
}

export function initArcadeProfilePanel({
  doc = globalThis.document,
  storage = getDefaultPlatformStorage(),
  options = {},
} = {}) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const button = doc?.getElementById?.("playerProfileButton");
  const panel = doc?.getElementById?.("playerProfilePanel");
  const closeButton = doc?.getElementById?.("playerProfileClose");
  const form = doc?.getElementById?.("playerProfileForm");
  const profileNameInput = doc?.getElementById?.("playerProfileName");
  const realNameInput = doc?.getElementById?.("playerProfileRealName");
  const bioInput = doc?.getElementById?.("playerProfileBio");
  const taglineInput = doc?.getElementById?.("playerProfileTagline");
  const favoriteGameInput = doc?.getElementById?.("playerProfileFavoriteGame");
  const mainSqueezeModeInput = doc?.getElementById?.("playerProfileMainSqueezeMode");
  const mainSqueezePlayerIdInput = doc?.getElementById?.("playerProfileMainSqueezePlayerId");
  const friendRailModeInput = doc?.getElementById?.("playerProfileFriendRailMode");
  const discoverableInput = doc?.getElementById?.("playerProfileDiscoverable");
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
  const friendSlotInputs = Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => (
    doc.getElementById(`playerProfileFriendSlot${index + 1}`)
  ));

  function syncRelationshipInputState() {
    const isManualMainSqueeze = mainSqueezeModeInput?.value === "manual";
    const isManualFriendRail = friendRailModeInput?.value === "manual";

    if (mainSqueezePlayerIdInput) {
      mainSqueezePlayerIdInput.disabled = !isManualMainSqueeze;
    }

    friendSlotInputs.forEach((input) => {
      if (!input) return;
      input.disabled = !isManualFriendRail;
    });
  }

  function render(flashMessage = "") {
    const profile = loadFactoryProfile(storage, options);
    const relationshipsRecord = loadProfileRelationshipsRecord(profile.playerId, storage);
    const model = buildArcadeProfileViewModel(profile, { flashMessage, relationshipsRecord });

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

    if (discoverableInput) {
      discoverableInput.checked = model.discoverableValue;
    }

    if (favoriteGameInput) {
      renderSelectOptions(favoriteGameInput, model.favoriteGameOptions, model.favoriteGameValue);
    }

    if (mainSqueezeModeInput) {
      renderSelectOptions(mainSqueezeModeInput, model.mainSqueezeModeOptions, model.mainSqueezeModeValue);
    }

    if (mainSqueezePlayerIdInput) {
      renderSelectOptions(mainSqueezePlayerIdInput, model.relationshipCandidateOptions, model.mainSqueezePlayerIdValue);
    }

    if (friendRailModeInput) {
      renderSelectOptions(friendRailModeInput, model.friendRailModeOptions, model.friendRailModeValue);
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

    model.friendSlotRows.forEach((row, index) => {
      const input = friendSlotInputs[index];
      renderSelectOptions(input, model.relationshipCandidateOptions, row.playerIdValue);
    });

    syncRelationshipInputState();
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

  clearButton?.addEventListener("click", async () => {
    await persistArcadeProfileDetails(storage, {
      profileName: "",
      realName: "",
      bio: "",
      tagline: "",
      favoriteGameSlug: "",
      links: [],
      mainSqueezeMode: "manual",
      mainSqueezePlayerId: "",
      friendRailMode: "auto",
      manualFriendSlotPlayerIds: Array(FRIEND_RAIL_SLOT_COUNT).fill(""),
    }, {
      ...options,
      apiClient,
    });
    render("PLAYER CARD CLEARED");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await persistArcadeProfileDetails(storage, {
      profileName: profileNameInput.value,
      realName: realNameInput?.value || "",
      bio: bioInput?.value || "",
      tagline: taglineInput?.value || "",
      favoriteGameSlug: favoriteGameInput?.value || "",
      discoverable: discoverableInput ? discoverableInput.checked : true,
      links: collectLinkRows(doc),
      mainSqueezeMode: mainSqueezeModeInput?.value || "manual",
      mainSqueezePlayerId: mainSqueezePlayerIdInput?.value || "",
      friendRailMode: friendRailModeInput?.value || "auto",
      manualFriendSlotPlayerIds: collectFriendSlotPlayerIds(doc),
    }, {
      ...options,
      apiClient,
    });
    render("PLAYER CARD SAVED");
    closePanel();
  });

  mainSqueezeModeInput?.addEventListener("change", syncRelationshipInputState);
  friendRailModeInput?.addEventListener("change", syncRelationshipInputState);

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
