export const DEFAULT_PLACEMENT_MATCHES = 10;

function finiteNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function totalRecordGames(standing) {
  return finiteNonNegativeInt(standing?.wins)
    + finiteNonNegativeInt(standing?.losses)
    + finiteNonNegativeInt(standing?.draws);
}

function explicitPlacement(standing) {
  const source = standing?.placement || standing?.placements || null;
  return source && typeof source === "object" ? source : null;
}

export function getRankedPlacementProgress(standing) {
  const placement = explicitPlacement(standing);
  const required = Math.max(1, finiteNonNegativeInt(
    placement?.matchesRequired ?? standing?.placementMatchesRequired,
    DEFAULT_PLACEMENT_MATCHES,
  ));
  const played = finiteNonNegativeInt(
    placement?.matchesPlayed ?? standing?.placementMatchesPlayed,
    totalRecordGames(standing),
  );
  const remaining = Math.max(0, required - played);
  const explicitComplete = placement?.complete ?? standing?.placementComplete;
  const complete = explicitComplete === undefined ? remaining === 0 : Boolean(explicitComplete);
  return { required, played, shownPlayed: Math.min(played, required), remaining, complete };
}

export function rankedTierLabel(standing) {
  return standing?.tier?.label || "Bronze";
}

export function placementProgressText(progress, standing = null) {
  if (!progress) return "";
  if (progress.complete) {
    const rating = Number(standing?.rating);
    return Number.isFinite(rating)
      ? `Placement complete - ${rankedTierLabel(standing)}, ${rating} rating`
      : `Placement complete - ${rankedTierLabel(standing)}`;
  }
  return `Placement matches: ${progress.shownPlayed}/${progress.required} complete - ${progress.remaining} to go`;
}

export function describePlacementResult(standing) {
  const progress = getRankedPlacementProgress(standing);
  if (progress.complete) {
    if (progress.played !== progress.required) return null;
    const rating = Number(standing?.rating);
    const ratingCopy = Number.isFinite(rating) ? ` at ${rating} rating` : "";
    return {
      kind: "complete",
      title: "Placement Complete",
      body: `You placed in ${rankedTierLabel(standing)}${ratingCopy}.`,
    };
  }
  return {
    kind: "progress",
    title: "Placement Progress",
    body: placementProgressText(progress, standing),
  };
}
