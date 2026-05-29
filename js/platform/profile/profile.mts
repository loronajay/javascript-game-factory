export const PROFILE_TAGLINE_MAX_LENGTH = 80;
export const PROFILE_BIO_MAX_LENGTH = 280;
export const PROFILE_REAL_NAME_MAX_LENGTH = 48;
export const PROFILE_LINK_LABEL_MAX_LENGTH = 24;
export const PROFILE_BACKGROUND_URL_MAX_LENGTH = 280;
export const FRIEND_CODE_LENGTH = 8;
export const MUSIC_TRACK_TITLE_MAX = 80;
export const MUSIC_TRACK_ARTIST_MAX = 60;
export const MUSIC_PLAYLIST_MAX = 5;

export const PROFILE_LINK_KIND_VALUES = ["external", "social", "support", "portfolio"] as const;
export type ProfileLinkKind = (typeof PROFILE_LINK_KIND_VALUES)[number];
const PROFILE_LINK_KINDS = new Set<string>(PROFILE_LINK_KIND_VALUES);

export const PROFILE_PRESENCE_VALUES = ["online", "away", "busy", "offline"] as const;
export type ProfilePresence = (typeof PROFILE_PRESENCE_VALUES)[number];
const PROFILE_PRESENCES = new Set<string>(PROFILE_PRESENCE_VALUES);

export type ProfileBackgroundStyle = "static" | "blend";

export interface ProfileLink {
  id: string;
  label: string;
  url: string;
  kind: ProfileLinkKind;
  createdAt: string;
}

export interface LadderPlacement {
  gameSlug: string;
  rank: number;
  ratingLabel: string;
  score: number;
}

export interface FriendPreview {
  playerId: string;
  profileName: string;
  presence: ProfilePresence;
  friendPoints: number;
  isMainSqueeze: boolean;
  avatarAssetId: string;
  avatarUrl: string;
}

export interface MusicTrack {
  url: string;
  title: string;
  artist: string;
}

export interface ProfileFields {
  realName: string;
  bio: string;
  tagline: string;
  avatarAssetId: string;
  backgroundImageUrl: string;
  backgroundStyle: ProfileBackgroundStyle;
  friendCode: string;
  presence: ProfilePresence;
  favoriteGameSlug: string;
  ladderPlacements: LadderPlacement[];
  friendsPreview: FriendPreview[];
  mainSqueeze: FriendPreview | null;
  badgeIds: string[];
  links: ProfileLink[];
  profileMusicPlaylist: MusicTrack[];
}

export interface PlayerProfileView {
  playerId: string;
  profileName: string;
  realName: string;
  bio: string;
  tagline: string;
  avatarAssetId: string;
  backgroundImageUrl: string;
  backgroundStyle: ProfileBackgroundStyle;
  friendCode: string;
  presence: ProfilePresence;
  avatarUrl: string;
  links: ProfileLink[];
  favoriteGameSlug: string;
  ladderPlacements: LadderPlacement[];
  friendsPreview: FriendPreview[];
  mainSqueeze: FriendPreview | null;
  badgeIds: string[];
  featuredGames: string[];
  recentActivity: Record<string, unknown>[];
  thoughtCount: number;
  profileMusicPlaylist: MusicTrack[];
}

export interface BuildPlayerProfileViewOptions {
  avatarUrlResolver?: (assetId: string) => unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeAssetId(value: unknown): string {
  return sanitizeSingleLine(value, 120);
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function sanitizeGameSlug(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

function normalizePublicStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const item = sanitizeSingleLine(entry, 120);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function normalizeUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizePresence(value: unknown): ProfilePresence {
  const presence = sanitizeSingleLine(value, 24).toLowerCase();
  return PROFILE_PRESENCES.has(presence) ? (presence as ProfilePresence) : "offline";
}

function normalizeBadgeIds(value: unknown): string[] {
  return normalizePublicStringList(value);
}

function normalizeLadderPlacement(entry: unknown): LadderPlacement | null {
  if (!isPlainObject(entry)) return null;

  const gameSlug = sanitizeGameSlug(entry.gameSlug || entry.slug);
  const rank = Math.max(0, Math.floor(Number(entry.rank) || 0));
  const ratingLabel = sanitizeSingleLine(entry.ratingLabel, 32);
  const score = Math.max(0, Math.floor(Number(entry.score) || 0));

  if (!gameSlug || rank <= 0) return null;

  return {
    gameSlug,
    rank,
    ratingLabel: ratingLabel || (score > 0 ? `${score} ELO` : ""),
    score,
  };
}

function normalizeLadderPlacements(value: unknown): LadderPlacement[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: LadderPlacement[] = [];

  value.forEach((entry) => {
    const placement = normalizeLadderPlacement(entry);
    if (!placement || seen.has(placement.gameSlug)) return;
    seen.add(placement.gameSlug);
    normalized.push(placement);
  });

  return normalized;
}

function normalizeFriendPreviewEntry(entry: unknown, options: { isMainSqueeze?: boolean } = {}): FriendPreview | null {
  if (!isPlainObject(entry)) return null;

  const profileName = sanitizeSingleLine(entry.profileName || entry.displayName, 60);
  const playerId = sanitizeSingleLine(entry.playerId, 80);
  const friendPoints = Math.max(0, Math.floor(Number(entry.friendPoints) || 0));
  const isMainSqueeze = !!options.isMainSqueeze || !!entry.isMainSqueeze;
  const avatarAssetId = sanitizeAssetId(entry.avatarAssetId);
  const avatarUrl = normalizeUrl(sanitizeSingleLine(entry.avatarUrl || "", PROFILE_BACKGROUND_URL_MAX_LENGTH));

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

function normalizeFriendsPreview(value: unknown): FriendPreview[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: FriendPreview[] = [];

  value.forEach((entry) => {
    const friend = normalizeFriendPreviewEntry(entry);
    const dedupeKey = friend ? (friend.playerId || friend.profileName) : "";
    if (!friend || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push(friend);
  });

  return normalized;
}

function normalizeMainSqueeze(value: unknown): FriendPreview | null {
  return normalizeFriendPreviewEntry(value, { isMainSqueeze: true });
}

function defaultLinkLabelFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function sanitizeProfileTagline(value: unknown): string {
  return sanitizeSingleLine(value, PROFILE_TAGLINE_MAX_LENGTH);
}

export function sanitizeProfileRealName(value: unknown): string {
  return sanitizeSingleLine(value, PROFILE_REAL_NAME_MAX_LENGTH);
}

export function sanitizeProfileFriendCode(value: unknown): string {
  return sanitizeSingleLine(value, FRIEND_CODE_LENGTH * 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, FRIEND_CODE_LENGTH);
}

export function sanitizeProfileBio(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, PROFILE_BIO_MAX_LENGTH);
}

export function buildDefaultFriendCode(playerId: unknown, attempt = 0): string {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 80);
  if (!normalizedPlayerId) return "";

  const source = `${normalizedPlayerId}#${Math.max(0, Math.floor(Number(attempt) || 0))}`;
  const left = hashString(`${source}:left`).toString(36).toUpperCase();
  const right = hashString(`${source}:right`).toString(36).toUpperCase();

  return `${left}${right}`.replace(/[^A-Z0-9]/g, "").padStart(FRIEND_CODE_LENGTH, "0").slice(0, FRIEND_CODE_LENGTH);
}

export function formatProfileFriendCode(value: unknown): string {
  const normalized = sanitizeProfileFriendCode(value);
  if (!normalized) return "";
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function normalizeProfileLink(link: unknown, index = 0): ProfileLink | null {
  if (!isPlainObject(link)) return null;

  const url = normalizeUrl(link.url);
  if (!url) return null;

  const label = sanitizeSingleLine(link.label, PROFILE_LINK_LABEL_MAX_LENGTH) || defaultLinkLabelFromUrl(url);
  const kind = sanitizeSingleLine(link.kind, 24).toLowerCase();

  return {
    id: sanitizeSingleLine(link.id, 60) || `link-${index + 1}`,
    label: label.slice(0, PROFILE_LINK_LABEL_MAX_LENGTH),
    url,
    kind: PROFILE_LINK_KINDS.has(kind) ? (kind as ProfileLinkKind) : "external",
    createdAt: sanitizeSingleLine(link.createdAt, 40),
  };
}

export function normalizeProfileLinks(links: unknown): ProfileLink[] {
  if (!Array.isArray(links)) return [];

  const seenUrls = new Set<string>();
  const normalized: ProfileLink[] = [];

  links.forEach((entry, index) => {
    const link = normalizeProfileLink(entry, index);
    if (!link || seenUrls.has(link.url)) return;
    seenUrls.add(link.url);
    normalized.push(link);
  });

  return normalized;
}

function normalizeMusicTrack(entry: unknown): MusicTrack | null {
  if (!isPlainObject(entry)) return null;
  const url = normalizeUrl(sanitizeSingleLine(entry.url, PROFILE_BACKGROUND_URL_MAX_LENGTH));
  if (!url) return null;
  return {
    url,
    title: sanitizeSingleLine(entry.title, MUSIC_TRACK_TITLE_MAX),
    artist: sanitizeSingleLine(entry.artist, MUSIC_TRACK_ARTIST_MAX),
  };
}

export function normalizeProfileMusicPlaylist(value: unknown): MusicTrack[] {
  if (!Array.isArray(value)) return [];
  const normalized: MusicTrack[] = [];
  for (const entry of value) {
    if (normalized.length >= MUSIC_PLAYLIST_MAX) break;
    const track = normalizeMusicTrack(entry);
    if (track) normalized.push(track);
  }
  return normalized;
}

export function normalizeProfileFields(profile: unknown = {}): ProfileFields {
  const source = isPlainObject(profile) ? profile : {};

  return {
    realName: sanitizeProfileRealName(source.realName),
    bio: sanitizeProfileBio(source.bio),
    tagline: sanitizeProfileTagline(source.tagline),
    avatarAssetId: sanitizeAssetId(source.avatarAssetId),
    backgroundImageUrl: normalizeUrl(sanitizeSingleLine(source.backgroundImageUrl, PROFILE_BACKGROUND_URL_MAX_LENGTH)),
    backgroundStyle: source.backgroundStyle === "static" ? "static" : "blend",
    friendCode: sanitizeProfileFriendCode(source.friendCode),
    presence: normalizePresence(source.presence),
    favoriteGameSlug: sanitizeGameSlug(source.favoriteGameSlug),
    ladderPlacements: normalizeLadderPlacements(source.ladderPlacements),
    friendsPreview: normalizeFriendsPreview(source.friendsPreview),
    mainSqueeze: normalizeMainSqueeze(source.mainSqueeze),
    badgeIds: normalizeBadgeIds(source.badgeIds),
    links: normalizeProfileLinks(source.links),
    profileMusicPlaylist: normalizeProfileMusicPlaylist(source.profileMusicPlaylist),
  };
}

function resolveNestedAvatar(entry: FriendPreview, resolver: BuildPlayerProfileViewOptions["avatarUrlResolver"]): FriendPreview;
function resolveNestedAvatar(entry: FriendPreview | null, resolver: BuildPlayerProfileViewOptions["avatarUrlResolver"]): FriendPreview | null;
function resolveNestedAvatar(entry: FriendPreview | null, resolver: BuildPlayerProfileViewOptions["avatarUrlResolver"]): FriendPreview | null {
  if (!entry) return entry;
  const resolvedAvatarUrl = entry.avatarAssetId && resolver
    ? String(resolver(entry.avatarAssetId) || "")
    : entry.avatarUrl;
  return {
    ...entry,
    avatarUrl: resolvedAvatarUrl || "",
  };
}

export function buildPlayerProfileView(profile: unknown = {}, options: BuildPlayerProfileViewOptions = {}): PlayerProfileView {
  const source = isPlainObject(profile) ? profile : {};
  const normalizedFields = normalizeProfileFields(source);
  const avatarUrlResolver = typeof options?.avatarUrlResolver === "function"
    ? options.avatarUrlResolver
    : null;
  const providedAvatarUrl = normalizeUrl(sanitizeSingleLine(source.avatarUrl, PROFILE_BACKGROUND_URL_MAX_LENGTH));

  return {
    playerId: sanitizeSingleLine(source.playerId, 80),
    profileName: sanitizeSingleLine(source.profileName, 60),
    realName: normalizedFields.realName,
    bio: normalizedFields.bio,
    tagline: normalizedFields.tagline,
    avatarAssetId: normalizedFields.avatarAssetId,
    backgroundImageUrl: normalizedFields.backgroundImageUrl,
    backgroundStyle: normalizedFields.backgroundStyle,
    friendCode: normalizedFields.friendCode || buildDefaultFriendCode(source.playerId),
    presence: normalizedFields.presence,
    avatarUrl: normalizedFields.avatarAssetId && avatarUrlResolver
      ? String(avatarUrlResolver(normalizedFields.avatarAssetId) || "")
      : providedAvatarUrl,
    links: normalizedFields.links,
    favoriteGameSlug: normalizedFields.favoriteGameSlug,
    ladderPlacements: normalizedFields.ladderPlacements,
    friendsPreview: normalizedFields.friendsPreview.map((entry) => resolveNestedAvatar(entry, avatarUrlResolver)),
    mainSqueeze: resolveNestedAvatar(normalizedFields.mainSqueeze, avatarUrlResolver),
    badgeIds: normalizedFields.badgeIds,
    featuredGames: normalizePublicStringList(source.featuredGames).length > 0
      ? normalizePublicStringList(source.featuredGames)
      : normalizePublicStringList(source.favorites),
    recentActivity: Array.isArray(source.recentActivity)
      ? source.recentActivity.filter((entry): entry is Record<string, unknown> => isPlainObject(entry))
      : [],
    thoughtCount: Math.max(0, Math.floor(Number(source.thoughtCount) || 0)),
    profileMusicPlaylist: normalizeProfileMusicPlaylist(source.profileMusicPlaylist),
  };
}
