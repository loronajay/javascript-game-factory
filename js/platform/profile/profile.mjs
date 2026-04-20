export const PROFILE_TAGLINE_MAX_LENGTH = 48;
export const PROFILE_BIO_MAX_LENGTH = 280;
export const PROFILE_LINK_LABEL_MAX_LENGTH = 24;

const PROFILE_LINK_KINDS = new Set([
  "external",
  "social",
  "support",
  "portfolio",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeAssetId(value) {
  return sanitizeSingleLine(value, 120);
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

function normalizeUrl(value) {
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

function defaultLinkLabelFromUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function sanitizeProfileTagline(value) {
  return sanitizeSingleLine(value, PROFILE_TAGLINE_MAX_LENGTH);
}

export function sanitizeProfileBio(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, PROFILE_BIO_MAX_LENGTH);
}

export function normalizeProfileLink(link, index = 0) {
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

export function normalizeProfileLinks(links) {
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

export function normalizeProfileFields(profile = {}) {
  const source = isPlainObject(profile) ? profile : {};

  return {
    bio: sanitizeProfileBio(source.bio),
    tagline: sanitizeProfileTagline(source.tagline),
    avatarAssetId: sanitizeAssetId(source.avatarAssetId),
    links: normalizeProfileLinks(source.links),
  };
}

export function buildPlayerProfileView(profile = {}, options = {}) {
  const source = isPlainObject(profile) ? profile : {};
  const normalizedFields = normalizeProfileFields(source);
  const avatarUrlResolver = typeof options?.avatarUrlResolver === "function"
    ? options.avatarUrlResolver
    : null;

  return {
    playerId: sanitizeSingleLine(source.playerId, 80),
    profileName: sanitizeSingleLine(source.profileName, 60),
    bio: normalizedFields.bio,
    tagline: normalizedFields.tagline,
    avatarAssetId: normalizedFields.avatarAssetId,
    avatarUrl: normalizedFields.avatarAssetId && avatarUrlResolver
      ? String(avatarUrlResolver(normalizedFields.avatarAssetId) || "")
      : "",
    links: normalizedFields.links,
    featuredGames: normalizePublicStringList(source.featuredGames),
    recentActivity: Array.isArray(source.recentActivity)
      ? source.recentActivity.filter((entry) => isPlainObject(entry))
      : [],
    thoughtCount: Math.max(0, Math.floor(Number(source.thoughtCount) || 0)),
  };
}
