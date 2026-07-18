import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { isFactoryAccountLoggedIn, readStoredFactoryAccountSession } from "./factoryAccount.js";

export const TACTICAL_ARENA_GAME_SLUG = "tactical-arena";
export const PENDING_GAME_PROGRESS_CLAIMS_KEY = "tacticalArenaPendingGameProgressClaimsV1";

const VALID_CLAIM_KINDS = new Set([
  "campaign-valor",
  "campaign-skin-choice",
  "campaign-unit-choice",
  "tutorial-complete",
  "tutorial-valor",
  "tutorial-unit-reward",
  "tutorial-skin-choice",
]);

function defaultStorage() {
  return globalThis.localStorage;
}

function cleanText(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function cleanPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeGameProgressClaim(value) {
  if (!value || typeof value !== "object") return null;
  const claimId = cleanText(value.claimId);
  const kind = cleanText(value.kind, 80);
  if (!claimId || !VALID_CLAIM_KINDS.has(kind)) return null;
  return Object.freeze({
    claimId,
    kind,
    sourceId: cleanText(value.sourceId),
    payload: Object.freeze(cleanPayload(value.payload)),
  });
}

function writePendingGameProgressClaims(storage, claims) {
  const normalized = [];
  const seen = new Set();
  for (const claim of Array.isArray(claims) ? claims : []) {
    const next = normalizeGameProgressClaim(claim);
    if (!next || seen.has(next.claimId)) continue;
    seen.add(next.claimId);
    normalized.push(next);
  }
  try {
    if (normalized.length) {
      storage?.setItem?.(PENDING_GAME_PROGRESS_CLAIMS_KEY, JSON.stringify(normalized));
    } else {
      storage?.removeItem?.(PENDING_GAME_PROGRESS_CLAIMS_KEY);
    }
  } catch {
    // Pending sync is best-effort; local progression should remain playable offline.
  }
  return normalized;
}

export function readPendingGameProgressClaims(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(PENDING_GAME_PROGRESS_CLAIMS_KEY);
    if (!raw) return [];
    return writePendingGameProgressClaims(storage, JSON.parse(raw));
  } catch {
    return writePendingGameProgressClaims(storage, []);
  }
}

export function enqueueGameProgressClaim(storage = defaultStorage(), claim) {
  const normalized = normalizeGameProgressClaim(claim);
  const pending = readPendingGameProgressClaims(storage);
  if (!normalized) {
    return { accepted: false, errorCode: "INVALID_CLAIM", pending };
  }
  if (pending.some((entry) => entry.claimId === normalized.claimId)) {
    return { accepted: false, errorCode: "CLAIM_ALREADY_PENDING", pending };
  }
  const next = writePendingGameProgressClaims(storage, [...pending, normalized]);
  return { accepted: true, claim: normalized, pending: next };
}

export function buildCampaignValorClaim({ missionId, amount, stars = 0 } = {}) {
  const cleanMissionId = cleanText(missionId);
  const cleanAmount = cleanInt(amount);
  if (!cleanMissionId || cleanAmount <= 0) return null;
  return Object.freeze({
    claimId: `campaign-valor:${cleanMissionId}`,
    kind: "campaign-valor",
    sourceId: cleanMissionId,
    payload: Object.freeze({
      missionId: cleanMissionId,
      amount: cleanAmount,
      stars: cleanInt(stars, { min: 0, max: 3 }),
    }),
  });
}

export function buildCampaignSkinChoiceClaim({ packId, choice, missionId = "", stars = 0 } = {}) {
  const cleanPackId = cleanText(packId);
  const type = cleanText(choice?.type, 80);
  const slug = cleanText(choice?.slug, 120);
  if (!cleanPackId || !type || !slug) return null;
  const sourceId = cleanText(missionId) || cleanPackId;
  return Object.freeze({
    claimId: `campaign-skin-choice:${cleanPackId}:${type}:${slug}`,
    kind: "campaign-skin-choice",
    sourceId,
    payload: Object.freeze({
      packId: cleanPackId,
      missionId: cleanText(missionId),
      type,
      slug,
      entitlementId: `skin:${type}:${slug}`,
      stars: cleanInt(stars, { min: 0, max: 3 }),
    }),
  });
}

export function buildCampaignUnitChoiceClaim({ packId, choice, missionId = "", stars = 0 } = {}) {
  const cleanPackId = cleanText(packId);
  const type = cleanText(choice, 80);
  if (!cleanPackId || !type) return null;
  const sourceId = cleanText(missionId) || cleanPackId;
  return Object.freeze({
    claimId: `campaign-unit-choice:${cleanPackId}:${type}`,
    kind: "campaign-unit-choice",
    sourceId,
    payload: Object.freeze({
      packId: cleanPackId,
      missionId: cleanText(missionId),
      type,
      entitlementId: `unit:${type}`,
      stars: cleanInt(stars, { min: 0, max: 3 }),
    }),
  });
}

export function buildCampaignUnitRewardClaim({ missionId, type, stars = 0 } = {}) {
  const cleanMissionId = cleanText(missionId);
  const cleanType = cleanText(type, 80);
  if (!cleanMissionId || !cleanType) return null;
  return Object.freeze({
    claimId: `campaign-unit-reward:${cleanMissionId}:${cleanType}`,
    kind: "campaign-unit-choice",
    sourceId: cleanMissionId,
    payload: Object.freeze({
      missionId: cleanMissionId,
      type: cleanType,
      entitlementId: `unit:${cleanType}`,
      stars: cleanInt(stars, { min: 0, max: 3 }),
    }),
  });
}

export function buildCampaignSkinRewardClaim({ missionId, skin, stars = 0 } = {}) {
  const cleanMissionId = cleanText(missionId);
  const type = cleanText(skin?.type, 80);
  const slug = cleanText(skin?.slug, 120);
  if (!cleanMissionId || !type || !slug) return null;
  return Object.freeze({
    claimId: `campaign-skin-reward:${cleanMissionId}:${type}:${slug}`,
    kind: "campaign-skin-choice",
    sourceId: cleanMissionId,
    payload: Object.freeze({
      missionId: cleanMissionId,
      type,
      slug,
      entitlementId: `skin:${type}:${slug}`,
      stars: cleanInt(stars, { min: 0, max: 3 }),
    }),
  });
}

export function buildTutorialCompleteClaim({ tutorialId } = {}) {
  const cleanTutorialId = cleanText(tutorialId);
  if (!cleanTutorialId) return null;
  return Object.freeze({
    claimId: `tutorial-complete:${cleanTutorialId}`,
    kind: "tutorial-complete",
    sourceId: cleanTutorialId,
    payload: Object.freeze({
      tutorialId: cleanTutorialId,
    }),
  });
}

export function buildTutorialValorClaim({ amount, completedTutorials = [] } = {}) {
  const cleanAmount = cleanInt(amount);
  if (cleanAmount <= 0) return null;
  return Object.freeze({
    claimId: "tutorial-valor:all-tutorials",
    kind: "tutorial-valor",
    sourceId: "all-tutorials",
    payload: Object.freeze({
      amount: cleanAmount,
      completedTutorials: Array.isArray(completedTutorials)
        ? completedTutorials.map((id) => cleanText(id)).filter(Boolean)
        : [],
    }),
  });
}

export function buildTutorialUnitRewardClaim({ type, sourceId = "all-tutorials" } = {}) {
  const cleanType = cleanText(type, 80);
  const cleanSourceId = cleanText(sourceId) || "all-tutorials";
  if (!cleanType) return null;
  return Object.freeze({
    claimId: `tutorial-unit-reward:${cleanSourceId}:${cleanType}`,
    kind: "tutorial-unit-reward",
    sourceId: cleanSourceId,
    payload: Object.freeze({
      type: cleanType,
      entitlementId: `unit:${cleanType}`,
    }),
  });
}

export function buildTutorialSkinChoiceClaim({ choice, sourceId = "all-tutorials" } = {}) {
  const type = cleanText(choice?.type, 80);
  const slug = cleanText(choice?.slug, 120);
  const cleanSourceId = cleanText(sourceId) || "all-tutorials";
  if (!type || !slug) return null;
  return Object.freeze({
    claimId: `tutorial-skin-choice:${type}:${slug}`,
    kind: "tutorial-skin-choice",
    sourceId: cleanSourceId,
    payload: Object.freeze({
      type,
      slug,
      entitlementId: `skin:${type}:${slug}`,
    }),
  });
}

export async function fetchGameProgressSnapshot({
  account = readStoredFactoryAccountSession(),
  apiClient = createPlatformApiClient(),
  gameSlug = TACTICAL_ARENA_GAME_SLUG,
} = {}) {
  if (!isFactoryAccountLoggedIn(account)) return null;
  if (!apiClient?.isConfigured || typeof apiClient.fetchGameProgress !== "function") return null;
  return apiClient.fetchGameProgress(gameSlug);
}

export async function flushPendingGameProgressClaims({
  storage = defaultStorage(),
  account = readStoredFactoryAccountSession(storage),
  apiClient = createPlatformApiClient(),
  gameSlug = TACTICAL_ARENA_GAME_SLUG,
} = {}) {
  let pending = readPendingGameProgressClaims(storage);
  if (!pending.length) {
    return { ok: true, syncedCount: 0, pending: [], progress: null };
  }
  if (!isFactoryAccountLoggedIn(account)) {
    return { ok: false, errorCode: "ACCOUNT_LOGIN_REQUIRED", syncedCount: 0, pending, progress: null };
  }
  if (!apiClient?.isConfigured || typeof apiClient.recordGameProgressClaim !== "function") {
    return { ok: false, errorCode: "PROGRESS_API_UNAVAILABLE", syncedCount: 0, pending, progress: null };
  }

  let syncedCount = 0;
  let latestProgress = null;
  for (const claim of [...pending]) {
    let result = null;
    try {
      result = await apiClient.recordGameProgressClaim(gameSlug, claim);
    } catch {
      result = null;
    }
    if (!result?.ok) {
      return { ok: false, errorCode: "CLAIM_SYNC_FAILED", syncedCount, pending, progress: latestProgress };
    }
    syncedCount += 1;
    latestProgress = result.progress ?? latestProgress;
    pending = pending.filter((entry) => entry.claimId !== claim.claimId);
    writePendingGameProgressClaims(storage, pending);
  }

  return { ok: true, syncedCount, pending, progress: latestProgress };
}
