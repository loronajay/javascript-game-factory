import { ARCADE_GAME_SLUGS, normalizeGameEntry } from "../arcade-catalog.mjs";
import {
  FACTORY_PROFILE_NAME_MAX_LENGTH,
  normalizeFactoryProfile,
} from "../platform/identity/factory-profile.mjs";
import { normalizeProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import type { ProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import type { FactoryProfile } from "../platform/identity/factory-profile.mjs";
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_LINK_LABEL_MAX_LENGTH,
  PROFILE_REAL_NAME_MAX_LENGTH,
  PROFILE_TAGLINE_MAX_LENGTH,
} from "../platform/profile/profile.mjs";
import {
  FRIEND_RAIL_SLOT_COUNT,
  PROFILE_LINK_ROW_COUNT,
  PROFILE_LINK_URL_MAX_LENGTH,
  RELATIONSHIP_MODE_OPTIONS,
} from "./constants.mjs";

interface SelectOption {
  value: string;
  label: string;
}

interface EditorLinkRow {
  index: number;
  idValue: string;
  labelValue: string;
  labelMaxLength: number;
  urlValue: string;
  urlMaxLength: number;
  kindValue: string;
}

interface FriendSlotRow {
  index: number;
  label: string;
  playerIdValue: string;
}

export interface ArcadeProfileViewModel {
  summaryName: string;
  profileName: string;
  profileNameValue: string;
  profileNameMaxLength: number;
  realNameValue: string;
  realNameMaxLength: number;
  bioValue: string;
  bioMaxLength: number;
  taglineValue: string;
  taglineMaxLength: number;
  favoriteGameValue: string;
  favoriteGameOptions: SelectOption[];
  mainSqueezeModeValue: string;
  mainSqueezePlayerIdValue: string;
  mainSqueezeModeOptions: ReadonlyArray<SelectOption>;
  friendRailModeValue: string;
  friendRailModeOptions: ReadonlyArray<SelectOption>;
  relationshipCandidateOptions: SelectOption[];
  friendSlotRows: FriendSlotRow[];
  linkRows: EditorLinkRow[];
  discoverableValue: boolean;
  saveLabel: string;
  statusLine: string;
  helperText: string;
  playerIdLabel: string;
  flashMessage: string;
  inputValue: string;
  inputMaxLength: number;
}

interface BuildArcadeProfileViewModelOptions {
  relationshipsRecord?: any;
  flashMessage?: string;
}

function createEmptyLinkRow(index: number): EditorLinkRow {
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

function buildLinkRows(links: any[] = []): EditorLinkRow[] {
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

function createRelationshipCandidateOption(value: unknown, label: unknown): SelectOption {
  return {
    value: String(value || ""),
    label: String(label || ""),
  };
}

function buildRelationshipCandidateOptions(profile: FactoryProfile, relationshipsRecord: ProfileRelationshipsRecord): SelectOption[] {
  const normalizedProfile = normalizeFactoryProfile(profile);
  const normalizedRelationships = normalizeProfileRelationshipsRecord({
    ...relationshipsRecord,
    playerId: relationshipsRecord.playerId || normalizedProfile.playerId,
  });
  const options = [createRelationshipCandidateOption("", "No manual pick")];
  const seen = new Set<string>([""]);

  const nameByPlayerId = new Map<string, string>();
  if (normalizedProfile.mainSqueeze?.playerId && normalizedProfile.mainSqueeze?.profileName) {
    nameByPlayerId.set(normalizedProfile.mainSqueeze.playerId.trim(), normalizedProfile.mainSqueeze.profileName.trim());
  }
  normalizedProfile.friendsPreview.forEach((friend) => {
    const id = typeof friend.playerId === "string" ? friend.playerId.trim() : "";
    const name = typeof friend.profileName === "string" ? friend.profileName.trim() : "";
    if (id && name) nameByPlayerId.set(id, name);
  });

  function addCandidate(playerId: unknown, profileName: unknown = "") {
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

function buildFriendSlotRows(relationshipsRecord: ProfileRelationshipsRecord): FriendSlotRow[] {
  const normalizedRelationships = normalizeProfileRelationshipsRecord(relationshipsRecord);

  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => ({
    index,
    label: `Friend Slot ${index + 1}`,
    playerIdValue: normalizedRelationships.manualFriendSlotPlayerIds[index] || "",
  }));
}

function buildFavoriteGameOptions(): SelectOption[] {
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

export function formatArcadePlayerId(playerId: unknown): string {
  const id = typeof playerId === "string" ? playerId.trim().toUpperCase() : "";
  if (!id) return "PENDING-ID";
  if (id.length <= 16) return id;
  return `${id.slice(0, 11)}...${id.slice(-4)}`;
}

export function buildArcadeProfileViewModel(profile: any, options: BuildArcadeProfileViewModelOptions = {}): ArcadeProfileViewModel {
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
    helperText: "Update your arcade username, optional real name, profile music, profile background image, about-me copy, public links, custom tagline, and whether the visible friend rail is automatic or manually pinned.",
    playerIdLabel: formatArcadePlayerId(normalized.playerId),
    flashMessage: typeof options.flashMessage === "string" ? options.flashMessage : "",
    inputValue: normalized.profileName,
    inputMaxLength: FACTORY_PROFILE_NAME_MAX_LENGTH,
  };
}
