// Pure view-model helpers for the campaign map screen and campaign results —
// no DOM, so node tests can exercise them directly.

import { UNIT_TYPES } from "../core/unitCatalog.js";
import { groupedUnitTypes } from "./squadModel.js";
import { getNicknamePref } from "./nicknameModel.js";
import { formatValor } from "../progression/marketplace.js";
import { getCampaignMission } from "../campaign/campaign.js";
import {
  getAvailableCampaignSkinRewardChoices,
  getCampaignUnitRewardChoices,
  isCampaignSkinRewardGranted,
  isCampaignUnitRewardGranted,
} from "../progression/unlocks.js";

export function campaignUnitChoiceGroups(unlockedTypes = [], squad = [], slot = 0) {
  const pickableTypes = unlockedTypes.filter((type) => !squad.includes(type) || squad[slot] === type);
  return groupedUnitTypes(pickableTypes).map((group) => ({
    id: group.id,
    label: group.label,
    choices: group.types.map((type) => ({
      value: type,
      label: getNicknamePref(type) || UNIT_TYPES[type].name,
      type,
    })),
  }));
}

export function campaignValorRewardForNode(node) {
  const nodeReward = Math.floor(Number(node?.valorReward) || 0);
  if (nodeReward > 0) return nodeReward;
  const missionReward = Math.floor(Number(getCampaignMission(node?.id)?.valorReward) || 0);
  return Math.max(0, missionReward);
}

export function campaignResultsValorLabel(campaign) {
  const valorGranted = Math.floor(Number(campaign?.valorGranted) || 0);
  if (valorGranted > 0) return `+${formatValor(valorGranted)}`;
  if (campaign?.valorClaimed || campaign?.victory) return "Already claimed";
  return `Win to earn ${formatValor(campaign?.valorReward ?? 0)}`;
}

export function campaignPendingRewardActionForNode(node, storage = globalThis.localStorage) {
  if (!node || node.status !== "completed") return null;
  if (node.rewardSkinPack) {
    const choices = getAvailableCampaignSkinRewardChoices(storage, node.rewardSkinPack);
    if (choices?.length && !isCampaignSkinRewardGranted(storage, node.rewardSkinPack)) {
      return { kind: "skin", packId: node.rewardSkinPack, label: "Choose Reward" };
    }
  }
  if (node.rewardUnitChoicePack && !isCampaignUnitRewardGranted(storage, node.rewardUnitChoicePack)) {
    const choices = getCampaignUnitRewardChoices(node.rewardUnitChoicePack);
    if (choices?.length) {
      return { kind: "unit", packId: node.rewardUnitChoicePack, label: "Choose Recruit" };
    }
  }
  return null;
}

export function isCampaignMapPanTarget(target, host) {
  if (!target || target === host) return true;
  return !target.closest?.("[data-action='selectCampaignMission']");
}

export function unitLabel(type) {
  return UNIT_TYPES[type]?.name ?? type;
}

function titleCaseSlug(value, fallback) {
  return String(value ?? fallback)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function skinRewardLabel(reward) {
  return `${titleCaseSlug(reward?.slug, "skin")} ${titleCaseSlug(reward?.type, "unit")}`;
}
