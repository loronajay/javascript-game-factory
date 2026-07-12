import { CAMPAIGN_PROGRESS_KEY } from "./campaignConstants.js";
import { CAMPAIGN_MISSIONS } from "./campaignContent.js";

export function defaultStorage() {
  return globalThis.localStorage;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function progressFallback() {
  return {
    completedMissions: [],
    missionStars: {},
    seenMapCutscenes: [],
    seenPostMatchCutscenes: [],
  };
}

export function normalizeCampaignProgress(value = {}) {
  const missionIds = new Set(CAMPAIGN_MISSIONS.map((mission) => mission.id));
  const completedMissions = uniqueStrings(value.completedMissions).filter((id) => missionIds.has(id));
  const seenMapCutscenes = uniqueStrings(value.seenMapCutscenes).filter((id) => missionIds.has(id));
  const seenPostMatchCutscenes = uniqueStrings(value.seenPostMatchCutscenes).filter((id) => missionIds.has(id));
  const missionStars = {};
  for (const mission of CAMPAIGN_MISSIONS) {
    const stars = Math.max(0, Math.min(3, Math.floor(Number(value.missionStars?.[mission.id]) || 0)));
    if (stars > 0) missionStars[mission.id] = stars;
  }
  for (const id of completedMissions) {
    missionStars[id] = Math.max(1, missionStars[id] ?? 0);
  }
  return { completedMissions, missionStars, seenMapCutscenes, seenPostMatchCutscenes };
}

export function readCampaignProgress(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(CAMPAIGN_PROGRESS_KEY);
    if (!raw) return progressFallback();
    return normalizeCampaignProgress(JSON.parse(raw));
  } catch {
    return progressFallback();
  }
}

export function writeCampaignProgress(storage, progress) {
  const normalized = normalizeCampaignProgress(progress);
  try {
    storage?.setItem?.(CAMPAIGN_PROGRESS_KEY, JSON.stringify(normalized));
  } catch {
    // Campaign progress is a convenience layer; storage failures should not break play.
  }
  return normalized;
}

export function resetCampaignProgress(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(CAMPAIGN_PROGRESS_KEY);
  } catch {
    // Best-effort reset.
  }
  return progressFallback();
}
