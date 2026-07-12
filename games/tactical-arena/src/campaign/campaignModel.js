import { CAMPAIGN_MISSIONS, CAMPAIGN_GEOMETRY, CAMPAIGN_REGION_BOXES, REGION_BIOME_BY_ID } from "./campaignContent.js";
import { readCampaignProgress, defaultStorage } from "./campaignProgress.js";

export function totalCampaignStars(progress) {
  return Object.values(progress?.missionStars ?? {}).reduce((sum, stars) => sum + Math.max(0, Number(stars) || 0), 0);
}

export function getCampaignMission(missionId) {
  return CAMPAIGN_MISSIONS.find((mission) => mission.id === missionId) ?? null;
}

export function getCampaignMap(storage = defaultStorage()) {
  const progress = readCampaignProgress(storage);
  const totalStars = totalCampaignStars(progress);
  const completed = new Set(progress.completedMissions);
  const nodes = CAMPAIGN_MISSIONS.map((mission, index) => {
    const stars = progress.missionStars[mission.id] ?? 0;
    const complete = completed.has(mission.id);
    const previousMissionsComplete = !mission.requiresPreviousMissionsComplete ||
      CAMPAIGN_MISSIONS.slice(0, index).every((previous) => completed.has(previous.id));
    const unlocked = totalStars >= mission.requiredStars && previousMissionsComplete;
    const status = !unlocked
      ? "locked"
      : mission.comingSoon
        ? "coming-soon"
        : complete
          ? "completed"
          : "available";
    const point = CAMPAIGN_GEOMETRY.positions[mission.id] ?? { x: 50, y: 50 };
    return {
      ...mission,
      stars,
      complete,
      locked: !unlocked,
      status,
      displayType: unlocked ? mission.unitType ?? null : null,
      biome: REGION_BIOME_BY_ID.get(mission.region) ?? null,
      // Position is a percent of the map canvas, derived from the mission's grid cell.
      position: { x: point.x, y: point.y },
    };
  });

  // A trail reads as "open" only when both of its endpoints are revealed, so locked
  // stretches of the map draw dim/dashed and the charted route glows.
  const statusById = new Map(nodes.map((node) => [node.id, node.status]));
  const edges = CAMPAIGN_GEOMETRY.edges.map((edge) => ({
    ...edge,
    status:
      statusById.get(edge.from) !== "locked" && statusById.get(edge.to) !== "locked"
        ? "open"
        : "locked",
  }));

  return {
    totalStars,
    progress,
    grid: CAMPAIGN_GEOMETRY.grid,
    nodes,
    edges,
    regions: CAMPAIGN_REGION_BOXES,
  };
}
