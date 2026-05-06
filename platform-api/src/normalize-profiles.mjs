import {
  isPlainObject,
  sanitizeCount,
  sanitizeGameSlug,
  sanitizePlayerId,
  sanitizeSingleLine,
  sanitizeTextBlock,
} from "./normalize-shared.mjs";

const FRIEND_CODE_LENGTH = 8;
const PROFILE_TAGLINE_MAX_LENGTH = 80;
const PROFILE_BIO_MAX_LENGTH = 280;
const PROFILE_REAL_NAME_MAX_LENGTH = 48;
const PROFILE_LINK_LABEL_MAX_LENGTH = 24;
const PROFILE_BACKGROUND_URL_MAX_LENGTH = 280;
const FACTORY_PROFILE_NAME_MAX_LENGTH = 12;
const FACTORY_PROFILE_VERSION = 1;

const PROFILE_LINK_KINDS = new Set(["external", "social", "support", "portfolio"]);
const PROFILE_PRESENCES = new Set(["online", "away", "busy", "offline"]);

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sanitizeProfileFriendCode(value) {
  return sanitizeSingleLine(value, FRIEND_CODE_LENGTH * 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, FRIEND_CODE_LENGTH);
}

export function buildDefaultFriendCode(playerId, attempt = 0) {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 80);
  if (!normalizedPlayerId) return "";
  const source = `${normalizedPlayerId}#${Math.max(0, Math.floor(Number(attempt) || 0))}`;
  const left = hashString(`${source}:left`).toString(36).toUpperCase();
  const right = hashString(`${source}:right`).toString(36).toUpperCase();
  return `${left}${right}`.replace(/[^A-Z0-9]/g, "").padStart(FRIEND_CODE_LENGTH, "0").slice(0, FRIEND_CODE_LENGTH);
}

function sanitizeFactoryProfileName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, FACTORY_PROFILE_NAME_MAX_LENGTH);
}

function normalizeUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizePresence(value) {
  const presence = sanitizeSingleLine(value, 24).toLowerCase();
  return PROFILE_PRESENCES.has(presence) ? presence : "offline";
}

function normalizePublicStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = sanitizeSingleLine(entry, 120);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function normalizeLadderPlacement(entry) {
  if (!isPlainObject(entry)) return null;
  const gameSlug = sanitizeGameSlug(entry.gameSlug || entry.slug);
  const rank = Math.max(0, Math.floor(Number(entry.rank) || 0));
  const ratingLabel = sanitizeSingleLine(entry.ratingLabel, 32);
  const score = Math.max(0, Math.floor(Number(entry.score) || 0));
  if (!gameSlug || rank <= 0) return null;
  return { gameSlug, rank, ratingLabel: ratingLabel || (score > 0 ? `${score} ELO` : ""), score };
}

function normalizeLadderPlacements(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const placement = normalizeLadderPlacement(entry);
    if (!placement || seen.has(placement.gameSlug)) return;
    seen.add(placement.gameSlug);
    normalized.push(placement);
  });
  return normalized;
}

function normalizeFriendPreviewEntry(entry, options = {}) {
  if (!isPlainObject(entry)) return null;
  const profileName = sanitizeSingleLine(entry.profileName || entry.displayName, 60);
  const playerId = sanitizeSingleLine(entry.playerId, 80);
  const friendPoints = Math.max(0, Math.floor(Number(entry.friendPoints) || 0));
  const isMainSqueeze = !!options.isMainSqueeze || !!entry.isMainSqueeze;
  const avatarAssetId = sanitizeSingleLine(entry.avatarAssetId, 120);
  const avatarUrl = normalizeUrl(sanitizeSingleLine(entry.avatarUrl, PROFILE_BACKGROUND_URL_MAX_LENGTH));
  if (!profileName && !playerId) return null;
  return {
    playerId,
    profileName: profileName || "Arcade Pilot",
    presence: normalizePresence(entry.presence),
    friendPoints,
    isMainSqueeze,
    avatarAssetId,
    avatarUrl,
  };
}

function normalizeFriendsPreview(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const friend = normalizeFriendPreviewEntry(entry);
    const dedupeKey = friend ? (friend.playerId || friend.profileName) : "";
    if (!friend || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push(friend);
  });
  return normalized;
}

function defaultLinkLabelFromUrl(value) {
  try { return new URL(value).hostname.replace(/^www\./i, ""); } catch { return ""; }
}

function normalizeProfileLink(link, index = 0) {
  if (!isPlainObject(link)) return null;
  const url = normalizeUrl(link.url);
  if (!url) return null;
  const label = sanitizeSingleLine(link.label, PROFILE_LINK_LABEL_MAX_LENGTH) || defaultLinkLabelFromUrl(url);
  const kind = sanitizeSingleLine(link.kind, 24).toLowerCase();
  return {
    id: sanitizeSingleLine(link.id, 60) || `link-${index + 1}`,
    label: label.slice(0, PROFILE_LINK_LABEL_MAX_LENGTH),
    url,
    kind: PROFILE_LINK_KINDS.has(kind) ? kind : "external",
    createdAt: sanitizeSingleLine(link.createdAt, 40),
  };
}

function normalizeProfileLinks(links) {
  if (!Array.isArray(links)) return [];
  const seenUrls = new Set();
  const normalized = [];
  links.forEach((entry, index) => {
    const link = normalizeProfileLink(entry, index);
    if (!link || seenUrls.has(link.url)) return;
    seenUrls.add(link.url);
    normalized.push(link);
  });
  return normalized;
}

function normalizeProfileFields(profile = {}) {
  const source = isPlainObject(profile) ? profile : {};
  return {
    realName: sanitizeSingleLine(source.realName, PROFILE_REAL_NAME_MAX_LENGTH),
    bio: sanitizeTextBlock(source.bio, PROFILE_BIO_MAX_LENGTH),
    tagline: sanitizeSingleLine(source.tagline, PROFILE_TAGLINE_MAX_LENGTH),
    avatarAssetId: sanitizeSingleLine(source.avatarAssetId, 120),
    backgroundImageUrl: normalizeUrl(sanitizeSingleLine(source.backgroundImageUrl, PROFILE_BACKGROUND_URL_MAX_LENGTH)),
    friendCode: sanitizeProfileFriendCode(source.friendCode),
    presence: normalizePresence(source.presence),
    favoriteGameSlug: sanitizeGameSlug(source.favoriteGameSlug),
    ladderPlacements: normalizeLadderPlacements(source.ladderPlacements),
    friendsPreview: normalizeFriendsPreview(source.friendsPreview),
    mainSqueeze: normalizeFriendPreviewEntry(source.mainSqueeze, { isMainSqueeze: true }),
    badgeIds: normalizePublicStringList(source.badgeIds),
    links: normalizeProfileLinks(source.links),
  };
}

function normalizeSimpleStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = typeof entry === "string" ? entry.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

export function normalizeFactoryProfile(profile = {}, options = {}) {
  const source = isPlainObject(profile) ? profile : {};
  const playerIdGenerator = typeof options?.playerIdGenerator === "function"
    ? options.playerIdGenerator
    : () => `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const seededProfileName = sanitizeFactoryProfileName(options.seedProfileName || "");
  const playerId = typeof source.playerId === "string" ? source.playerId.trim() : "";
  const resolvedPlayerId = playerId || playerIdGenerator();
  const profileName = sanitizeFactoryProfileName(source.profileName || "") || seededProfileName;
  const profileFields = normalizeProfileFields(source);

  return {
    version: FACTORY_PROFILE_VERSION,
    playerId: resolvedPlayerId,
    profileName,
    friendCode: profileFields.friendCode || buildDefaultFriendCode(resolvedPlayerId),
    realName: profileFields.realName,
    bio: profileFields.bio,
    tagline: profileFields.tagline,
    avatarAssetId: profileFields.avatarAssetId,
    backgroundImageUrl: profileFields.backgroundImageUrl,
    presence: profileFields.presence,
    favoriteGameSlug: profileFields.favoriteGameSlug,
    ladderPlacements: profileFields.ladderPlacements,
    friendsPreview: profileFields.friendsPreview,
    mainSqueeze: profileFields.mainSqueeze,
    badgeIds: profileFields.badgeIds,
    favorites: normalizeSimpleStringList(source.favorites),
    friends: normalizeSimpleStringList(source.friends),
    recentPartners: normalizeSimpleStringList(source.recentPartners),
    links: profileFields.links,
    preferences: isPlainObject(source.preferences) ? { ...source.preferences } : {},
  };
}
