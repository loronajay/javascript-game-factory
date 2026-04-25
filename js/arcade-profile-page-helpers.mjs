import { normalizeProfileMetricsRecord } from "./platform/metrics/metrics.mjs";
import {
  normalizeProfileRelationshipsRecord,
  resolveProfileFriendSlots,
} from "./platform/relationships/relationships.mjs";

export function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function gameHrefFromSlug(slug = "") {
  const normalized = String(slug || "").trim();
  return normalized ? `../games/${encodeURIComponent(normalized)}/index.html` : "../grid.html";
}

export function gamePreviewSrcFromSlug(slug = "") {
  const normalized = String(slug || "").trim();
  return normalized ? `../grid-previews/${encodeURIComponent(normalized)}.png` : "";
}

export function buildProfileInitials(name) {
  const tokens = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0] || ""}${tokens[1][0] || ""}`.toUpperCase();
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return "??";
}

export function formatPresenceLabel(presence) {
  const normalized = String(presence || "").trim().toLowerCase();
  if (!normalized) return "Offline";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function humanizeToken(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildPresenceToneClass(presence) {
  const normalized = String(presence || "").trim().toLowerCase();
  return normalized || "offline";
}

export function buildIdentityLinkItems(links = [], emptyValue = "Profile links are not wired in yet.") {
  if (Array.isArray(links) && links.length > 0) {
    return links.map((link) => ({
      label: link.label,
      value: link.url,
      kind: link.kind,
      isPlaceholder: false,
    }));
  }

  return [{
    label: "Link Ports",
    value: emptyValue,
    kind: "placeholder",
    isPlaceholder: true,
  }];
}

export function buildFavoriteGameItems(publicView, favoriteTitleResolver, options = {}) {
  const favoriteSlug = publicView.favoriteGameSlug
    || publicView.featuredGames?.[0]
    || "";

  if (!favoriteSlug) {
    return [{
      title: "Favorite Cabinet",
      value: options.emptyValue || "No favorite cabinet is pinned yet.",
      isPlaceholder: true,
    }];
  }

  return [{
    title: favoriteTitleResolver(favoriteSlug),
    value: favoriteSlug,
    href: gameHrefFromSlug(favoriteSlug),
    previewSrc: gamePreviewSrcFromSlug(favoriteSlug),
    linkLabel: "Launch Cabinet",
    isPlaceholder: false,
  }];
}

export function buildRankingItems(publicView, favoriteTitleResolver, options = {}) {
  const placements = Array.isArray(publicView.ladderPlacements) ? publicView.ladderPlacements : [];
  if (placements.length > 0) {
    return placements.map((placement) => ({
      title: favoriteTitleResolver(placement.gameSlug),
      value: placement.ratingLabel || `Rank #${placement.rank}`,
      meta: `Rank #${placement.rank}`,
      isPlaceholder: false,
    }));
  }

  return [{
    title: "Top Ladder Rankings",
    value: options.emptyValue || "Rank snapshots will appear here once shared standings come online.",
    isPlaceholder: true,
  }];
}

function createFriendCardItem({ title, value, meta, isPlaceholder = false, avatarSrc = "" }) {
  return {
    title,
    value,
    meta,
    isPlaceholder,
    avatarInitials: buildProfileInitials(value),
    avatarSrc,
  };
}

export function buildFriendItems(publicView, relationshipsRecord) {
  const normalizedRelationships = relationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(relationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: publicView.playerId });
  const resolvedSlots = resolveProfileFriendSlots(publicView, normalizedRelationships);

  const mainSqueezeItem = resolvedSlots.mainSqueeze
    ? createFriendCardItem({
        title: "Main Squeeze",
        value: resolvedSlots.mainSqueeze.profileName,
        meta: `${resolvedSlots.mainSqueeze.resolvedFriendPoints} friendship points`,
        avatarSrc: resolvedSlots.mainSqueeze.avatarUrl || "",
      })
    : createFriendCardItem({
        title: "Main Squeeze",
        value: "Awaiting Main Squeeze",
        meta: "Friendship points pending",
        isPlaceholder: true,
      });

  const friendPreviewItems = resolvedSlots.friendSlots.map((friend) => (
    friend
      ? createFriendCardItem({
          title: formatPresenceLabel(friend.presence),
          value: friend.profileName,
          meta: `${friend.resolvedFriendPoints} friendship points`,
          avatarSrc: friend.avatarUrl || "",
        })
      : createFriendCardItem({
          title: "Friend Slot",
          value: "Awaiting Arcade Friend",
          meta: "Friendship points pending",
          isPlaceholder: true,
        })
  ));

  return [mainSqueezeItem, ...friendPreviewItems];
}

export function buildHeroStats(publicView, resolvedThoughtCount, metricsRecord, relationshipsRecord) {
  const normalizedMetrics = metricsRecord?.playerId
    ? normalizeProfileMetricsRecord(metricsRecord)
    : normalizeProfileMetricsRecord({ playerId: publicView.playerId });
  const normalizedRelationships = relationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(relationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: publicView.playerId });
  const derivedFriendCount = (publicView.friendsPreview?.length || 0) + (publicView.mainSqueeze ? 1 : 0);
  const resolvedFriendCount = Math.max(derivedFriendCount, normalizedMetrics.friendCount, normalizedRelationships.friendPlayerIds.length);

  return [
    { label: "Thoughts", value: String(Math.max(resolvedThoughtCount, normalizedMetrics.thoughtPostCount)) },
    { label: "Friends", value: String(resolvedFriendCount) },
    { label: "Sessions", value: String(normalizedMetrics.totalPlaySessionCount) },
    { label: "Events", value: String(normalizedMetrics.eventParticipationCount) },
  ];
}

export function buildBadgeItems(badgeIds = []) {
  if (Array.isArray(badgeIds) && badgeIds.length > 0) {
    return badgeIds.map((badgeId) => ({
      label: humanizeToken(badgeId) || "Arcade Badge",
      isPlaceholder: false,
    }));
  }

  return [{
    label: "Badge case still empty",
    isPlaceholder: true,
  }];
}
