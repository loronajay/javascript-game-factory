import { getUnitType } from "../core/unitCatalog.js";
import { findUnit } from "../core/state.js";
import { DEFAULT_SQUAD, UNIT_TYPE_KEYS } from "../ui/squadModel.js";
import { readUnlockProgress, writeUnlockProgress } from "../progression/unlocks.js";
import { enqueueUnitUnlockAnnouncements } from "../progression/announcements.js";

export const CAMPAIGN_PROGRESS_KEY = "tacticalArenaCampaignProgressV1";
export const CLOD_MISSION_ID = "clod-trial";
export const NECROMANCER_MISSION_ID = "necromancer-rise";
export const MIN_CAMPAIGN_SQUAD_SIZE = 1;
export const MAX_CAMPAIGN_SQUAD_SIZE = 4;

export const CAMPAIGN_MISSIONS = Object.freeze([
  Object.freeze({
    id: CLOD_MISSION_ID,
    title: "Clod on the Ridge",
    subtitle: "Lesson: armor, magic, and RAGE spacing",
    description: "Take two units into a half-HP duel against Clod and a Juggernaut. Magic damage cuts through defense; loose spacing keeps Thunderous Charge from ending the run.",
    unitType: "clod",
    requiredStars: 0,
    rewardUnits: Object.freeze(["clod"]),
    playerSlots: 2,
    defaultSquad: Object.freeze(["mystic", "magician"]),
    enemySquad: Object.freeze(["clod", "juggernaut"]),
    size: 11,
    position: Object.freeze({ x: 10, y: 72 }),
    routeFrom: Object.freeze({ x: 12, y: 84 }),
    routeTo: Object.freeze({ x: 10, y: 72 }),
  }),
  Object.freeze({
    id: NECROMANCER_MISSION_ID,
    title: "Necromancer's Gate",
    subtitle: "Coming soon",
    description: "The next canon mission will unlock Necromancer. For now, the node reveals once you prove the Clod lesson.",
    unitType: "necromancer",
    requiredStars: 2,
    rewardUnits: Object.freeze(["necromancer"]),
    comingSoon: true,
    position: Object.freeze({ x: 58, y: 32 }),
    routeFrom: Object.freeze({ x: 10, y: 72 }),
    routeTo: Object.freeze({ x: 58, y: 32 }),
  }),
]);

function defaultStorage() {
  return globalThis.localStorage;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function progressFallback() {
  return {
    completedMissions: [],
    missionStars: {},
  };
}

export function normalizeCampaignProgress(value = {}) {
  const missionIds = new Set(CAMPAIGN_MISSIONS.map((mission) => mission.id));
  const completedMissions = uniqueStrings(value.completedMissions).filter((id) => missionIds.has(id));
  const missionStars = {};
  for (const mission of CAMPAIGN_MISSIONS) {
    const stars = Math.max(0, Math.min(3, Math.floor(Number(value.missionStars?.[mission.id]) || 0)));
    if (stars > 0) missionStars[mission.id] = stars;
  }
  for (const id of completedMissions) {
    missionStars[id] = Math.max(1, missionStars[id] ?? 0);
  }
  return { completedMissions, missionStars };
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

export function totalCampaignStars(progress) {
  return Object.values(progress?.missionStars ?? {}).reduce((sum, stars) => sum + Math.max(0, Number(stars) || 0), 0);
}

export function getCampaignMission(missionId) {
  return CAMPAIGN_MISSIONS.find((mission) => mission.id === missionId) ?? null;
}

export function campaignSquadSize(mission) {
  return Math.max(
    MIN_CAMPAIGN_SQUAD_SIZE,
    Math.min(MAX_CAMPAIGN_SQUAD_SIZE, Math.floor(Number(mission?.playerSlots) || MAX_CAMPAIGN_SQUAD_SIZE))
  );
}

export function normalizeCampaignSquad(selectedSquad = DEFAULT_SQUAD, missionOrSize = MAX_CAMPAIGN_SQUAD_SIZE) {
  const size = typeof missionOrSize === "number" ? missionOrSize : campaignSquadSize(missionOrSize);
  const targetSize = Math.max(MIN_CAMPAIGN_SQUAD_SIZE, Math.min(MAX_CAMPAIGN_SQUAD_SIZE, size));
  const out = [];
  for (const type of Array.isArray(selectedSquad) ? selectedSquad : []) {
    if (UNIT_TYPE_KEYS.includes(type) && !out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of DEFAULT_SQUAD) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of UNIT_TYPE_KEYS) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  return out;
}

export function getCampaignMap(storage = defaultStorage()) {
  const progress = readCampaignProgress(storage);
  const totalStars = totalCampaignStars(progress);
  const completed = new Set(progress.completedMissions);
  return {
    totalStars,
    progress,
    nodes: CAMPAIGN_MISSIONS.map((mission) => {
      const stars = progress.missionStars[mission.id] ?? 0;
      const unlocked = totalStars >= mission.requiredStars;
      const complete = completed.has(mission.id);
      const status = !unlocked
        ? "locked"
        : mission.comingSoon
          ? "coming-soon"
          : complete
            ? "completed"
            : "available";
      return {
        ...mission,
        stars,
        complete,
        locked: !unlocked,
        status,
        displayType: unlocked ? mission.unitType : null,
      };
    }),
  };
}

export function createCampaignMatchConfig(missionId = CLOD_MISSION_ID, selectedSquad = null) {
  const mission = getCampaignMission(missionId);
  if (!mission || mission.comingSoon) throw new Error(`Campaign mission is not playable: ${missionId}`);
  const playerSquad = normalizeCampaignSquad(selectedSquad ?? mission.defaultSquad ?? DEFAULT_SQUAD, mission);
  return {
    mode: "campaign",
    campaignMissionId: mission.id,
    difficulty: "normal",
    size: mission.size ?? 11,
    playerCount: 2,
    squads: {
      1: playerSquad,
      2: [...mission.enemySquad],
    },
    teamNames: {
      1: "Player Vanguard",
      2: "Ridge Guard",
    },
  };
}

export function prepareCampaignMatchState(match, missionId = CLOD_MISSION_ID) {
  if (missionId !== CLOD_MISSION_ID) return match;
  const positions = {
    "p1-0-mystic": { x: 2, y: 6 },
    "p1-1-magician": { x: 2, y: 4 },
    "p2-0-clod": { x: 7, y: 5 },
    "p2-1-juggernaut": { x: 8, y: 7 },
  };
  return {
    ...match,
    currentPlayer: 1,
    activation: null,
    units: match.units.map((unit) => {
      const definition = getUnitType(unit.type);
      return {
        ...unit,
        position: { ...(positions[unit.id] ?? defaultCampaignPosition(unit)) },
        hp: Math.ceil(definition.stats.maxHp / 2),
        mp: definition.stats.maxMp,
        spent: false,
        defending: false,
      };
    }),
  };
}

function defaultCampaignPosition(unit) {
  if (unit.player === 1) return unit.id.includes("-0-") ? { x: 2, y: 6 } : { x: 2, y: 4 };
  return unit.id.includes("-0-") ? { x: 7, y: 5 } : { x: 8, y: 7 };
}

export function evaluateCampaignMission(missionId, state, {
  clodChargeHitCount = 0,
  chargeDefended = false,
} = {}) {
  const mission = getCampaignMission(missionId);
  const victory = state?.winner === 1;
  const playerUnits = (state?.units ?? []).filter((unit) => unit.player === 1);
  const enemyUnits = (state?.units ?? []).filter((unit) => unit.player === 2);
  const survivingPlayerUnits = playerUnits.filter((unit) => unit.hp > 0).length;
  const clod = enemyUnits.find((unit) => unit.type === "clod") ?? null;
  const objectives = [
    { id: "complete", label: "Complete the mission", earned: victory },
    { id: "survive", label: "Keep both chosen units alive", earned: victory && survivingPlayerUnits === playerUnits.length },
    { id: "spacing", label: "Have Clod only hit one unit with Thunderous Charge", earned: victory && clodChargeHitCount <= 1 },
  ];
  const bonusObjectives = [
    { id: "brace", label: "Bonus: defend against Thunderous Charge", earned: victory && chargeDefended },
  ];
  const earnedObjectiveStars = objectives.filter((objective) => objective.earned).length;
  const earnedBonusStars = bonusObjectives.filter((objective) => objective.earned).length;
  const stars = Math.min(3, earnedObjectiveStars + earnedBonusStars);
  return {
    missionId,
    missionTitle: mission?.title ?? "Campaign Mission",
    victory,
    stars,
    grade: stars === 3 ? "S" : stars === 2 ? "A" : stars === 1 ? "B" : "C",
    objectives,
    bonusObjectives,
    earnedBonusStars,
    rewardUnits: victory ? [...(mission?.rewardUnits ?? [])] : [],
    survivingPlayerUnits,
    totalPlayerUnits: playerUnits.length,
    playerHpRemaining: playerUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    enemyHpRemaining: enemyUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    clodDefeated: Boolean(clod && clod.hp <= 0),
    clodChargeHitCount: Math.max(0, Math.floor(Number(clodChargeHitCount) || 0)),
    chargeDefended: Boolean(chargeDefended),
  };
}

export function completeCampaignMission(storage = defaultStorage(), missionId, state, meta = {}) {
  const evaluation = evaluateCampaignMission(missionId, state, meta);
  const current = readCampaignProgress(storage);
  if (!evaluation.victory) {
    return { ...evaluation, progress: current, newRewardUnits: [] };
  }

  const completedMissions = new Set(current.completedMissions);
  completedMissions.add(missionId);
  const previousStars = current.missionStars[missionId] ?? 0;
  const progress = writeCampaignProgress(storage, {
    ...current,
    completedMissions: [...completedMissions],
    missionStars: {
      ...current.missionStars,
      [missionId]: Math.max(previousStars, evaluation.stars),
    },
  });

  const unlockProgress = readUnlockProgress(storage);
  const existing = new Set(unlockProgress.unlockedUnits);
  const newRewardUnits = evaluation.rewardUnits.filter((type) => !existing.has(type));
  writeUnlockProgress(storage, {
    ...unlockProgress,
    unlockedUnits: [...existing, ...evaluation.rewardUnits],
  });
  enqueueUnitUnlockAnnouncements(storage, newRewardUnits);

  return { ...evaluation, progress, newRewardUnits };
}

export function clodMissionOpeningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  const clod = findUnit(state, "p2-0-clod");
  if (!speaker) return [];
  return [
    {
      speakerId: clod?.id,
      text: "This ridge belongs to Clod. Step closer, and the stones will remember you.",
    },
    {
      speakerId: speaker.id,
      text: "Big words for a pile of rocks. We came for the ridge, and we are not leaving empty-handed.",
    },
    {
      speaker: "swordsman",
      text: "Stay spread out. If Clod drops into RAGE, Thunderous Charge punishes anyone standing shoulder to shoulder.",
    },
  ];
}

export function shouldShowClodRageWarning(state, { warningShown = false, chargeUsed = false } = {}) {
  if (warningShown || chargeUsed || state?.phase !== "playing") return false;
  const clod = findUnit(state, "p2-0-clod");
  return Boolean(clod && clod.hp > 0 && clod.hp <= 5);
}

export function clodRageWarningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  if (!speaker) return [];
  const clod = findUnit(state, "p2-0-clod");
  return [
    {
      speakerId: speaker.id,
      text: "Spread out. Clod is in RAGE now, and that charge is coming.",
    },
    {
      speakerId: clod?.id,
      text: "The ridge shakes under Clod's feet. Thunderous Charge is online.",
    },
  ];
}
