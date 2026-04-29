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

function createFriendCardItem({ title, value, meta, isPlaceholder = false, avatarSrc = "", playerId = "" }) {
  return {
    title,
    value,
    meta,
    isPlaceholder,
    avatarInitials: buildProfileInitials(value),
    avatarSrc,
    playerId,
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
        playerId: resolvedSlots.mainSqueeze.playerId || "",
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
          playerId: friend.playerId || "",
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

function createFriendNavigatorCandidate(entry, insertionIndex, options = {}) {
  const profileName = String(entry?.profileName || entry?.displayName || "").trim();
  const playerId = String(entry?.playerId || "").trim();

  if (!profileName && !playerId) return null;

  return {
    playerId,
    profileName: profileName || playerId || "Arcade Pilot",
    presence: String(entry?.presence || "").trim().toLowerCase(),
    friendPoints: Math.max(0, Math.floor(Number(entry?.friendPoints) || 0)),
    avatarUrl: String(entry?.avatarUrl || "").trim(),
    isMainSqueeze: !!options.isMainSqueeze || !!entry?.isMainSqueeze,
    insertionIndex,
  };
}

function createFriendNavigatorItem(candidate) {
  const displayName = candidate?.profileName || candidate?.playerId || "Arcade Pilot";
  const playerId = candidate?.playerId || "";
  const friendPoints = Math.max(0, Math.floor(Number(candidate?.friendPoints) || 0));

  return {
    label: candidate?.isMainSqueeze ? "Main Squeeze" : formatPresenceLabel(candidate?.presence || "friend"),
    value: displayName,
    profileName: displayName,
    playerId,
    playerIdLabel: playerId || "NO-ID",
    meta: `${friendPoints} friendship points`,
    avatarSrc: candidate?.avatarUrl || "",
    avatarInitials: buildProfileInitials(displayName),
    profileHref: playerId ? `../player/index.html?id=${encodeURIComponent(playerId)}` : "",
    isMainSqueeze: !!candidate?.isMainSqueeze,
    searchText: `${displayName} ${playerId} ${candidate?.isMainSqueeze ? "main squeeze" : formatPresenceLabel(candidate?.presence || "friend")}`.toLowerCase(),
  };
}

export function buildFriendNavigatorItems(publicView, relationshipsRecord) {
  const normalizedRelationships = relationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(relationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: publicView.playerId });
  const resolvedFriendSlots = resolveProfileFriendSlots(publicView, normalizedRelationships);
  const resolvedMainSqueezePlayerId = resolvedFriendSlots.mainSqueeze?.playerId || "";
  const preferredNavigatorOrder = [
    resolvedMainSqueezePlayerId,
    ...resolvedFriendSlots.friendSlots.map((friend) => friend?.playerId || ""),
  ].filter(Boolean);
  const candidatesByKey = new Map();
  let insertionIndex = 0;

  function upsertCandidate(entry, options = {}) {
    const candidate = createFriendNavigatorCandidate(entry, insertionIndex, options);
    if (!candidate) return;

    const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
    const existing = candidatesByKey.get(key);
    if (existing) {
      existing.isMainSqueeze = existing.isMainSqueeze || candidate.isMainSqueeze;
      existing.friendPoints = Math.max(existing.friendPoints, candidate.friendPoints);
      if (!existing.avatarUrl && candidate.avatarUrl) existing.avatarUrl = candidate.avatarUrl;
      if (!existing.presence && candidate.presence) existing.presence = candidate.presence;
      if (!existing.playerId && candidate.playerId) existing.playerId = candidate.playerId;
      if ((!existing.profileName || existing.profileName === existing.playerId) && candidate.profileName) {
        existing.profileName = candidate.profileName;
      }
      return;
    }

    candidatesByKey.set(key, candidate);
    insertionIndex += 1;
  }

  upsertCandidate(publicView?.mainSqueeze, { isMainSqueeze: true });
  (Array.isArray(publicView?.friendsPreview) ? publicView.friendsPreview : []).forEach((friend) => {
    upsertCandidate(friend);
  });
  normalizedRelationships.friendPlayerIds.forEach((playerId) => {
    upsertCandidate({
      playerId,
      profileName: playerId,
      friendPoints: normalizedRelationships.friendPointsByPlayerId[playerId] || 0,
    });
  });

  const relationshipOrder = normalizedRelationships.friendPlayerIds;

  return Array.from(candidatesByKey.values())
    .map((candidate) => ({
      ...candidate,
      isMainSqueeze: resolvedMainSqueezePlayerId
        ? candidate.playerId === resolvedMainSqueezePlayerId
        : !!candidate.isMainSqueeze,
    }))
    .sort((left, right) => {
      if (left.isMainSqueeze !== right.isMainSqueeze) {
        return left.isMainSqueeze ? -1 : 1;
      }

      const leftPreferredOrder = left.playerId ? preferredNavigatorOrder.indexOf(left.playerId) : -1;
      const rightPreferredOrder = right.playerId ? preferredNavigatorOrder.indexOf(right.playerId) : -1;
      const leftHasPreferredOrder = leftPreferredOrder >= 0;
      const rightHasPreferredOrder = rightPreferredOrder >= 0;

      if (leftHasPreferredOrder !== rightHasPreferredOrder) {
        return leftHasPreferredOrder ? -1 : 1;
      }

      if (leftHasPreferredOrder && rightHasPreferredOrder && leftPreferredOrder !== rightPreferredOrder) {
        return leftPreferredOrder - rightPreferredOrder;
      }

      const leftOrder = left.playerId ? relationshipOrder.indexOf(left.playerId) : -1;
      const rightOrder = right.playerId ? relationshipOrder.indexOf(right.playerId) : -1;
      const leftHasOrder = leftOrder >= 0;
      const rightHasOrder = rightOrder >= 0;

      if (leftHasOrder !== rightHasOrder) {
        return leftHasOrder ? -1 : 1;
      }

      if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      if (left.friendPoints !== right.friendPoints) {
        return right.friendPoints - left.friendPoints;
      }

      if (left.insertionIndex !== right.insertionIndex) {
        return left.insertionIndex - right.insertionIndex;
      }

      return left.profileName.localeCompare(right.profileName);
    })
    .map(createFriendNavigatorItem);
}

export function filterFriendNavigatorItems(items = [], query = "") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return Array.isArray(items) ? [...items] : [];

  return (Array.isArray(items) ? items : []).filter((item) => {
    const searchText = String(item?.searchText || `${item?.profileName || ""} ${item?.playerId || ""} ${item?.label || ""}`).toLowerCase();
    return searchText.includes(normalizedQuery);
  });
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
