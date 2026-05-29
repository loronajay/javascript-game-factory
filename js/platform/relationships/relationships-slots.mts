import {
  normalizeProfileRelationshipsRecord,
  sanitizeCount,
  sanitizeDisplayName,
  sanitizePlayerId,
  sanitizeSingleLine,
} from "./relationships-normalize.mjs";
import type { ProfileRelationshipsRecord } from "./relationships-normalize.mjs";

interface FriendCandidate {
  playerId: string;
  profileName: string;
  presence: string;
  friendPoints: number;
  isMainSqueeze: boolean;
  originalIndex: number;
  avatarUrl: string;
}

interface ResolvedFriendCandidate extends FriendCandidate {
  resolvedFriendPoints: number;
}

interface FriendCandidateState {
  candidates: FriendCandidate[];
  candidatesByPlayerId: Map<string, FriendCandidate>;
  preferredMainSqueezePlayerId: string;
}

export interface ResolvedFriendSlots {
  mainSqueeze: ResolvedFriendCandidate | null;
  friendSlots: (ResolvedFriendCandidate | null)[];
}

function normalizeFriendCandidate(entry: unknown = {}, originalIndex = 0, isMainSqueeze = false): FriendCandidate | null {
  const src = entry as Record<string, any> | null | undefined;
  const playerId = sanitizePlayerId(src?.playerId);
  const profileName = sanitizeDisplayName(src?.profileName || src?.displayName);

  if (!playerId && !profileName) return null;

  return {
    playerId,
    profileName: profileName || "Arcade Pilot",
    presence: sanitizeSingleLine(src?.presence, 24).toLowerCase(),
    friendPoints: sanitizeCount(src?.friendPoints),
    isMainSqueeze: !!isMainSqueeze || !!src?.isMainSqueeze,
    originalIndex,
    avatarUrl: sanitizeSingleLine(src?.avatarUrl || "", 500),
  };
}

function buildFriendCandidateState(profileView: Record<string, any> | null | undefined = {}): FriendCandidateState {
  const candidatesByKey = new Map<string, FriendCandidate>();
  const candidatesByPlayerId = new Map<string, FriendCandidate>();
  let insertionIndex = 0;

  function upsertCandidate(entry: unknown, isMainSqueeze = false): void {
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
    profileView!.friendsPreview.forEach((entry: unknown) => {
      upsertCandidate(entry, false);
    });
  }

  return {
    candidates: Array.from(candidatesByKey.values()),
    candidatesByPlayerId,
    preferredMainSqueezePlayerId: sanitizePlayerId(profileView?.mainSqueeze?.playerId),
  };
}

function getRelationshipOrderIndex(candidate: FriendCandidate | null, relationshipOrder: string[] = []): number {
  if (!candidate?.playerId) return -1;
  return relationshipOrder.indexOf(candidate.playerId);
}

function buildResolvedFriendCandidate(candidate: FriendCandidate | null, relationshipPoints: Record<string, number>): ResolvedFriendCandidate | null {
  if (!candidate) return null;

  return {
    ...candidate,
    resolvedFriendPoints: candidate.playerId
      ? (relationshipPoints[candidate.playerId] ?? candidate.friendPoints)
      : candidate.friendPoints,
  };
}

function sortAutomaticFriendCandidates(candidates: FriendCandidate[], normalizedRelationships: ProfileRelationshipsRecord): FriendCandidate[] {
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

function takeFriendCandidateByPlayerId(
  candidatesByPlayerId: Map<string, FriendCandidate>,
  usedKeys: Set<string>,
  playerId: unknown,
  relationshipPoints: Record<string, number>,
): ResolvedFriendCandidate | null {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const candidate = candidatesByPlayerId.get(normalizedPlayerId);
  if (!candidate) return null;

  const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
  if (usedKeys.has(key)) return null;

  usedKeys.add(key);
  return buildResolvedFriendCandidate(candidate, relationshipPoints);
}

function takeAutomaticFriendCandidate(
  candidates: FriendCandidate[],
  usedKeys: Set<string>,
  relationshipPoints: Record<string, number>,
): ResolvedFriendCandidate | null {
  for (const candidate of candidates) {
    const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    return buildResolvedFriendCandidate(candidate, relationshipPoints);
  }

  return null;
}

export function resolveProfileFriendSlots(
  profileView: Record<string, any> | null | undefined = {},
  relationshipsRecord: Record<string, any> | null | undefined = {},
): ResolvedFriendSlots {
  const normalizedRelationships = normalizeProfileRelationshipsRecord({
    playerId: profileView?.playerId || relationshipsRecord?.playerId || "",
    ...relationshipsRecord,
  });
  const relationshipPoints = normalizedRelationships.friendPointsByPlayerId;
  const { candidates, candidatesByPlayerId, preferredMainSqueezePlayerId } = buildFriendCandidateState(profileView);
  const automaticCandidates = sortAutomaticFriendCandidates(candidates, normalizedRelationships);
  const usedKeys = new Set<string>();

  let mainSqueeze: ResolvedFriendCandidate | null = null;
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

  const friendSlots: (ResolvedFriendCandidate | null)[] = [];
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
