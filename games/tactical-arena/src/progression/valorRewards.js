import { readUnlockProgress, writeUnlockProgress } from "./unlocks.js";
import { startValorBoostsForGain } from "./inventory.js";

export const ONLINE_MATCH_WIN_VALOR_REWARD = 35;
export const ONLINE_MATCH_LOSS_VALOR_REWARD = 10;
export const MIN_ONLINE_REWARD_REVISION = 12;

function normalizedValorAmount(amount) {
  return Math.max(0, Math.floor(Number(amount) || 0));
}

function boostedValorGrant(storage, baseValor, options = {}) {
  const boost = startValorBoostsForGain(storage, options);
  const percent = Math.max(0, Number(boost.percentBonus) || 0);
  const valorBoostBonus = Math.floor(baseValor * percent / 100);
  return {
    valorGranted: baseValor + valorBoostBonus,
    valorBaseGranted: baseValor,
    valorBoostBonus,
    valorBoostPercent: percent,
    startedConsumables: boost.started,
  };
}

export function grantValor(storage = globalThis.localStorage, amount, options = {}) {
  const valorBaseGranted = normalizedValorAmount(amount);
  const progress = readUnlockProgress(storage);
  if (valorBaseGranted <= 0) {
    return { accepted: false, valorGranted: 0, valorBaseGranted: 0, valorBoostBonus: 0, progress };
  }
  const grant = boostedValorGrant(storage, valorBaseGranted, options);
  const next = writeUnlockProgress(storage, {
    ...progress,
    valorBalance: progress.valorBalance + grant.valorGranted,
  });
  return { accepted: true, ...grant, progress: next };
}

export function grantCampaignMissionValor(storage = globalThis.localStorage, missionId, amount, options = {}) {
  const valorBaseReward = normalizedValorAmount(amount);
  const progress = readUnlockProgress(storage);
  if (!missionId || valorBaseReward <= 0 || progress.campaignValorRewards.includes(missionId)) {
    return { accepted: false, valorGranted: 0, valorBaseGranted: 0, valorBoostBonus: 0, progress };
  }
  const grant = boostedValorGrant(storage, valorBaseReward, options);
  const next = writeUnlockProgress(storage, {
    ...progress,
    valorBalance: progress.valorBalance + grant.valorGranted,
    campaignValorRewards: [...progress.campaignValorRewards, missionId],
  });
  return { accepted: true, valorReward: valorBaseReward, ...grant, progress: next };
}

export function onlineMatchValorEligibility({ match, mySeat, hadConcede = false } = {}) {
  if (!match || match.phase !== "complete") return { eligible: false, reason: "MATCH_NOT_COMPLETE" };
  if (hadConcede) return { eligible: false, reason: "MATCH_CONCEDED" };
  if (!Number.isInteger(mySeat) || mySeat < 1) return { eligible: false, reason: "INVALID_SEAT" };
  if (!Number.isInteger(match.winner) || match.winner < 1) return { eligible: false, reason: "NO_WINNER" };
  if ((Number(match.revision) || 0) < MIN_ONLINE_REWARD_REVISION) {
    return { eligible: false, reason: "MATCH_TOO_SHORT" };
  }
  return { eligible: true, reason: "ELIGIBLE" };
}

export function grantOnlineMatchValor(storage = globalThis.localStorage, { match, mySeat, hadConcede = false, now = null } = {}) {
  const eligibility = onlineMatchValorEligibility({ match, mySeat, hadConcede });
  const progress = readUnlockProgress(storage);
  if (!eligibility.eligible) {
    return { accepted: false, valorGranted: 0, valorBaseGranted: 0, valorBoostBonus: 0, progress, reason: eligibility.reason };
  }
  const baseValor = match.winner === mySeat ? ONLINE_MATCH_WIN_VALOR_REWARD : ONLINE_MATCH_LOSS_VALOR_REWARD;
  const grant = boostedValorGrant(storage, baseValor, { now });
  const next = writeUnlockProgress(storage, {
    ...progress,
    valorBalance: progress.valorBalance + grant.valorGranted,
  });
  return { accepted: true, ...grant, progress: next, reason: eligibility.reason };
}

export function recordOnlineValorEvents(matchConfig, events = []) {
  if (matchConfig?.mode !== "online") return;
  if (events.some((event) => event.type === "PLAYER_CONCEDED")) matchConfig.onlineMatchHadConcede = true;
}

export function claimOnlineMatchValorReward(storage, summary, { matchConfig, match, mySeat } = {}) {
  if (matchConfig?.mode !== "online" || matchConfig.onlineValorRewardClaimed) return null;
  const result = grantOnlineMatchValor(storage, {
    match,
    mySeat,
    hadConcede: Boolean(matchConfig.onlineMatchHadConcede),
  });
  matchConfig.onlineValorRewardClaimed = true;
  if (summary) summary.onlineValor = result;
  return result;
}
