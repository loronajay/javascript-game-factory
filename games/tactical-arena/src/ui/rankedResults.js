import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { describePlacementResult, getRankedPlacementProgress, placementProgressText } from "./rankedPlacements.js";

function addStat(listEl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  listEl.append(dt, dd);
  return dd;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderPlacementAnnouncement(stats, result) {
  const parent = stats?.parentElement;
  if (!parent || !result || result.kind !== "complete") return;
  parent.querySelector?.(".ranked-placement-result")?.remove?.();
  const notice = document.createElement("div");
  notice.className = "ranked-placement-result";
  notice.appendChild(Object.assign(document.createElement("h3"), { textContent: result.title }));
  notice.appendChild(Object.assign(document.createElement("p"), { textContent: result.body }));
  stats.after?.(notice);
}

// Ranked stat block: shows placement progress, final placement, and the rating
// change once the server-side attestation has settled.
export async function renderRankedResult(ranked, stats) {
  const before = Number(ranked?.ratingBefore);
  const tierDd = addStat(stats, "Ranked", "...");
  const ratingDd = addStat(stats, "Rating", Number.isFinite(before) ? String(before) : "...");
  try {
    const apiClient = createPlatformApiClient();
    if (!apiClient?.isConfigured || typeof apiClient.fetchRankedStanding !== "function") {
      tierDd.textContent = "Ranked match";
      return;
    }
    let standing = await apiClient.fetchRankedStanding(TACTICAL_ARENA_GAME_SLUG);
    for (let i = 0; i < 3 && standing && Number.isFinite(before) && Number(standing.rating) === before; i += 1) {
      await delay(1500);
      standing = await apiClient.fetchRankedStanding(TACTICAL_ARENA_GAME_SLUG);
    }
    if (!standing) {
      tierDd.textContent = "Ranked match";
      return;
    }
    const progress = getRankedPlacementProgress(standing);
    tierDd.textContent = progress.complete ? (standing.tier?.label ?? "Ranked") : "Placement match";
    addStat(stats, "Placement", placementProgressText(progress, standing));
    renderPlacementAnnouncement(stats, describePlacementResult(standing));
    const after = Number(standing.rating);
    if (Number.isFinite(before) && Number.isFinite(after) && after !== before) {
      const delta = after - before;
      ratingDd.textContent = `${before} -> ${after} (${delta > 0 ? "+" : ""}${delta})`;
    } else if (Number.isFinite(after)) {
      ratingDd.textContent = Number.isFinite(before) && after === before ? `${after} - updating...` : String(after);
    }
  } catch {
    tierDd.textContent = "Ranked match";
  }
}
