import {
  normalizeProfileRelationshipsRecord,
  sanitizeCount,
  sanitizeDisplayName,
  sanitizePlayerId,
  sanitizeSingleLine,
} from "./relationships-normalize.mjs";

function normalizeFriendCandidate(entry = {}, originalIndex = 0, isMainSqueeze = false) {
  const playerId = sanitizePlayerId(entry?.playerId);
  const profileName = sanitizeDisplayName(entry?.profileName || entry?.displayName);

  if (!playerId && !profileName) return null;

  return {
    playerId,
    profileName: profileName || "Arcade Pilot",
    presence: sanitizeSingleLine(entry?.presence, 24).toLowerCase(),
    friendPoints: sanitizeCount(entry?.friendPoints),
    isMainSqueeze: !!isMainSqueeze || !!entry?.isMainSqueeze,
    originalIndex,
    avatarUrl: sanitizeSingleLine(entry?.avatarUrl || "", 500),
  };
}

function buildFriendCandidateState(profileView = {}) {
  const candidatesByKey = new Map();
  const candidatesByPlayerId = new Map();
  let insertionIndex = 0;

  function upsertCandidate(entry, isMainSqueeze = false) {
    const candidate = normalizeFriendCandidate(entry, insertionIndex, isMainSqueeze);
    if (!candidate) return;

    const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
    const existing = candidatesByKey.get(key);
    if (existing) {
      existing.isMainSqueeze = existing.isMainSqueeze || candidate.isMainSqueeze;
      existing.friendPoints = Math.max(existing.friendPoints, candidate.friendPoints);
      if (!existing.profileName && candidate.profileName) {
        existing.profileName = candidate.profileName;
      }
      if (!existing.presence && candidate.presence) {
        existing.presence = candidate.presence;
      }
      return;
    }

    candidatesByKey.set(key, candidate);
    if (candidate.playerId) {
      candidatesByPlayerId.set(candidate.playerId, candidate);
    }
    insertionIndex++;
  }

  upsertCandidate(profileView?.mainSqueeze, true);

  if (Array.isArray(profileView?.friendsPreview)) {
    profileView.friendsPreview.forEach((entry) => {
      upsertCandidate(entry, false);
    });
  }

  return {
    candidates: Array.from(candidatesByKey.values()),
    candidatesByPlayerId,
    preferredMainSqueezePlayerId: sanitizePlayerId(profileView?.mainSqueeze?.playerId),
  };
}

function getRelationshipOrderIndex(candidate, relationshipOrder = []) {
  if (!candidate?.playerId) return -1;
  return relationshipOrder.indexOf(candidate.playerId);
}

function buildResolvedFriendCandidate(candidate, relationshipPoints) {
  if (!candidate) return null;

  return {
    ...candidate,
    resolvedFriendPoints: candidate.playerId
      ? (relationshipPoints[candidate.playerId] ?? candidate.friendPoints)
      : candidate.friendPoints,
  };
}

function sortAutomaticFriendCandidates(candidates, normalizedRelationships) {
  const relationshipOrder = normalizedRelationships.friendPlayerIds;
  const relationshipPoints = normalizedRelationships.friendPointsByPlayerId;

  return [...candidates].sort((left, right) => {
    const leftRelationshipIndex = getRelationshipOrderIndex(left, relationshipOrder);
    const rightRelationshipIndex = getRelationshipOrderIndex(right, relationshipOrder);
    const leftHasRelationshipOrder = leftRelationshipIndex >= 0;
    const rightHasRelationshipOrder = rightRelationshipIndex >= 0;

    if (leftHasRelationshipOrder !== rightHasRelationshipOrder) {
      return leftHasRelationshipOrder ? -1 : 1;
    }
    if (leftHasRelationshipOrder && rightHasRelationshipOrder && leftRelationshipIndex !== rightRelationshipIndex) {
      return leftRelationshipIndex - rightRelationshipIndex;
    }

    const leftPoints = left.playerId ? (relationshipPoints[left.playerId] ?? left.friendPoints) : left.friendPoints;
    const rightPoints = right.playerId ? (relationshipPoints[right.playerId] ?? right.friendPoints) : right.friendPoints;
    if (leftPoints !== rightPoints) {
      return rightPoints - leftPoints;
    }
    if (left.originalIndex !== right.originalIndex) {
      return left.originalIndex - right.originalIndex;
    }
    return left.profileName.localeCompare(right.profileName);
  });
}

function takeFriendCandidateByPlayerId(candidatesByPlayerId, usedKeys, playerId, relationshipPoints) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const candidate = candidatesByPlayerId.get(normalizedPlayerId);
  if (!candidate) return null;

  const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
  if (usedKeys.has(key)) return null;

  usedKeys.add(key);
  return buildResolvedFriendCandidate(candidate, relationshipPoints);
}

function takeAutomaticFriendCandidate(candidates, usedKeys, relationshipPoints) {
  for (const candidate of candidates) {
    const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    return buildResolvedFriendCandidate(candidate, relationshipPoints);
  }

  return null;
}

export function resolveProfileFriendSlots(profileView = {}, relationshipsRecord = {}) {
  const normalizedRelationships = normalizeProfileRelationshipsRecord({
    playerId: profileView?.playerId || relationshipsRecord?.playerId || "",
    ...relationshipsRecord,
  });
  const relationshipPoints = normalizedRelationships.friendPointsByPlayerId;
  const { candidates, candidatesByPlayerId, preferredMainSqueezePlayerId } = buildFriendCandidateState(profileView);
  const automaticCandidates = sortAutomaticFriendCandidates(candidates, normalizedRelationships);
  const usedKeys = new Set();

  let mainSqueeze = null;
  const hasManualMainSqueezeSelection = !!normalizedRelationships.mainSqueezePlayerId;
  if (normalizedRelationships.mainSqueezeMode === "manual" && hasManualMainSqueezeSelection) {
    mainSqueeze = takeFriendCandidateByPlayerId(
      candidatesByPlayerId,
      usedKeys,
      normalizedRelationships.mainSqueezePlayerId,
      relationshipPoints,
    );
  } else if (normalizedRelationships.mainSqueezeMode !== "manual") {
    mainSqueeze = takeFriendCandidateByPlayerId(
      candidatesByPlayerId,
      usedKeys,
      preferredMainSqueezePlayerId || normalizedRelationships.mostPlayedWithPlayerId || normalizedRelationships.lastPlayedWithPlayerId,
      relationshipPoints,
    ) || takeAutomaticFriendCandidate(automaticCandidates, usedKeys, relationshipPoints);
  } else if (preferredMainSqueezePlayerId) {
    mainSqueeze = takeFriendCandidateByPlayerId(
      candidatesByPlayerId,
      usedKeys,
      preferredMainSqueezePlayerId,
      relationshipPoints,
    );
  }

  const friendSlots = [];
  if (normalizedRelationships.friendRailMode === "manual") {
    normalizedRelationships.manualFriendSlotPlayerIds.forEach((playerId) => {
      friendSlots.push(takeFriendCandidateByPlayerId(candidatesByPlayerId, usedKeys, playerId, relationshipPoints));
    });
  } else {
    while (friendSlots.length < 4) {
      friendSlots.push(takeAutomaticFriendCandidate(automaticCandidates, usedKeys, relationshipPoints));
    }
  }

  while (friendSlots.length < 4) {
    friendSlots.push(null);
  }

  return {
    mainSqueeze,
    friendSlots,
  };
}
