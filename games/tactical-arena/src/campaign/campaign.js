import { getUnitType } from "../core/unitCatalog.js";
import { findUnit } from "../core/state.js";
import { isNegativeStatus } from "../rules/statuses.js";
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
    subtitle: "Lesson: status pressure and cleansing",
    description: "Two units against a Necromancer and a Virus at the old gate. Physical damage slips past Dead Zone, spacing starves Spread, and a cure keeps permanent poison from becoming a losing clock.",
    unitType: "necromancer",
    requiredStars: 2,
    rewardUnits: Object.freeze(["necromancer"]),
    playerSlots: 2,
    enemySquad: Object.freeze(["necromancer", "virus"]),
    size: 13,
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
      2: mission.id === NECROMANCER_MISSION_ID ? "Gatekeepers" : "Ridge Guard",
    },
  };
}

// Each campaign mission owns a spawn layout: hardcoded coordinates for the fixed
// enemy pieces (their ids are deterministic), plus a slot-index fallback that places
// whatever units the player drafted (the squad is player-chosen, so player ids are not
// known ahead of time). Keyed by mission id so a new mission only adds a table entry.
const CAMPAIGN_LAYOUTS = Object.freeze({
  [CLOD_MISSION_ID]: {
    positions: {
      "p1-0-mystic": { x: 2, y: 6 },
      "p1-1-magician": { x: 2, y: 4 },
      "p2-0-clod": { x: 7, y: 5 },
      "p2-1-juggernaut": { x: 8, y: 7 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 2, y: 6 } : { x: 2, y: 4 })
        : (unit.id.includes("-0-") ? { x: 7, y: 5 } : { x: 8, y: 7 }),
  },
  // Necromancer's Gate (13×13): the Necromancer holds the backline; the Virus sits
  // forward enough to threaten but stays focusable; the player's two units spawn in the
  // opposite corner, spread one tile apart with a clean approach outside turn-one Cough
  // range (Virus range 5, opening distance 6).
  [NECROMANCER_MISSION_ID]: {
    positions: {
      "p2-0-necromancer": { x: 10, y: 2 },
      "p2-1-virus": { x: 8, y: 5 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 2, y: 10 } : { x: 4, y: 9 })
        : (unit.id.includes("-0-") ? { x: 10, y: 2 } : { x: 8, y: 5 }),
  },
});

export function prepareCampaignMatchState(match, missionId = CLOD_MISSION_ID) {
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return match;
  return {
    ...match,
    currentPlayer: 1,
    activation: null,
    units: match.units.map((unit) => {
      const definition = getUnitType(unit.type);
      return {
        ...unit,
        position: { ...(layout.positions[unit.id] ?? layout.fallback(unit)) },
        hp: Math.ceil(definition.stats.maxHp / 2),
        mp: definition.stats.maxMp,
        spent: false,
        defending: false,
      };
    }),
  };
}

export function evaluateCampaignMission(missionId, state, meta = {}) {
  const mission = getCampaignMission(missionId);
  const victory = state?.winner === 1;
  const playerUnits = (state?.units ?? []).filter((unit) => unit.player === 1);
  const enemyUnits = (state?.units ?? []).filter((unit) => unit.player === 2);
  const survivingPlayerUnits = playerUnits.filter((unit) => unit.hp > 0).length;
  const allSurvived = victory && survivingPlayerUnits === playerUnits.length;

  // Base objectives shared by every mission; the third star + the bonus are the
  // mission's signature lesson. Only two missions exist, so branch rather than build a
  // premature objective DSL (see MISSION_2 plan's implementation notes).
  const complete = { id: "complete", label: "Complete the mission", earned: victory };
  const survive = { id: "survive", label: "Keep both chosen units alive", earned: allSurvived };

  let objectives;
  let bonusObjectives;
  let extra;
  if (missionId === NECROMANCER_MISSION_ID) {
    const cleanseUsed = Boolean(meta.cleanseUsed);
    const spreadHitCount = Math.max(0, Math.floor(Number(meta.spreadHitCount) || 0));
    objectives = [
      complete,
      survive,
      { id: "cleansed", label: "Win after curing a status with a cleanse", earned: victory && cleanseUsed },
    ];
    bonusObjectives = [
      { id: "spread", label: "Bonus: never let a status spread between your units", earned: victory && spreadHitCount === 0 },
    ];
    extra = {
      cleanseUsed,
      spreadHitCount,
      necromancerDefeated: Boolean((enemyUnits.find((unit) => unit.type === "necromancer") ?? { hp: 0 }).hp <= 0),
    };
  } else {
    const clodChargeHitCount = Math.max(0, Math.floor(Number(meta.clodChargeHitCount) || 0));
    const chargeDefended = Boolean(meta.chargeDefended);
    const clod = enemyUnits.find((unit) => unit.type === "clod") ?? null;
    objectives = [
      complete,
      survive,
      { id: "spacing", label: "Have Clod only hit one unit with Thunderous Charge", earned: victory && clodChargeHitCount <= 1 },
    ];
    bonusObjectives = [
      { id: "brace", label: "Bonus: defend against Thunderous Charge", earned: victory && chargeDefended },
    ];
    extra = {
      clodDefeated: Boolean(clod && clod.hp <= 0),
      clodChargeHitCount,
      chargeDefended,
    };
  }

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
    ...extra,
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

// --- Mission 2: Necromancer's Gate dialogue -----------------------------------
// The hints let a player derive "physical + spacing + a cure" without naming the
// intended Mystic + Swordsman pairing outright.

function firstLivingPlayerUnit(state) {
  return (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0) ?? null;
}

export function necromancerMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  const virus = findUnit(state, "p2-1-virus");
  return [
    {
      speakerId: necromancer?.id,
      text: "The gate drinks magic before it ever lands. Bring spells if you like — they will die quietly at my wall.",
    },
    {
      speakerId: virus?.id,
      text: "And keep your friends close together. Whatever I give one of you, I will happily share with the rest.",
    },
    {
      speakerId: speaker.id,
      text: "Something here punishes crowding, and a curse could hurt worse than any blade. Steel over sorcery — and whatever can lift a curse may matter more than raw damage this time.",
    },
  ];
}

export function shouldShowNecromancerStatusWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
}

export function necromancerStatusWarningScript(state) {
  const afflicted = (state?.units ?? []).find((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
  const speaker = afflicted ?? firstLivingPlayerUnit(state);
  const virus = findUnit(state, "p2-1-virus");
  if (!speaker) return [];
  return [
    {
      speakerId: virus?.id,
      text: "It takes hold. Stand shoulder to shoulder and it will leap to whoever is nearest.",
    },
    {
      speakerId: speaker.id,
      text: "Break apart so it can't jump, and cure it before it stacks. Left alone, this rot only gets worse.",
    },
  ];
}

export function shouldShowNecromancerSummonWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
}

export function necromancerSummonWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ghoul = (state?.units ?? []).find((unit) => unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
  if (!speaker) return [];
  return [
    {
      speakerId: ghoul?.id,
      text: "A ghoul claws its way up from the stones.",
    },
    {
      speakerId: speaker.id,
      text: "The ghoul isn't the win — the caster is. But it'll gnaw at anyone who lingers beside it, so don't camp next to it.",
    },
  ];
}

export function shouldShowNecromancerRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const necromancer = findUnit(state, "p2-0-necromancer");
  return Boolean(necromancer && necromancer.hp > 0 && necromancer.hp <= 5);
}

export function necromancerRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  return [
    {
      speakerId: necromancer?.id,
      text: "Cornered, am I? Then the gate's shadow spreads — and my bomb reaches farther than it did.",
    },
    {
      speakerId: speaker.id,
      text: "Its aura just widened and Dark Bomb will catch more ground now. Don't dawdle in the dark — finish it.",
    },
  ];
}

// Dispatcher so the match seam can ask for a mission's opening without a per-mission
// branch of its own.
export function campaignOpeningScript(missionId, state) {
  if (missionId === NECROMANCER_MISSION_ID) return necromancerMissionOpeningScript(state);
  if (missionId === CLOD_MISSION_ID) return clodMissionOpeningScript(state);
  return [];
}
