// Cross-match achievement state for Yam Bowling. These counters live inside
// each bowler's existing progression JSON, so they inherit the XP transaction's
// row locking and do not create a second account save system.

export const YAM_BOWLING_VENUE_SLUGS = Object.freeze([
  "crimson-crown", "blue-circuit", "emerald-vault", "royal-gold", "sunset-strip",
  "neon-carnival", "cosmic-bowl", "liberty-lanes", "oak-and-onyx",
]);
export const YAM_BOWLING_ALL_VENUES_MASK = (1 << YAM_BOWLING_VENUE_SLUGS.length) - 1;

export const YAM_BOWLING_BOWLER_SLUGS = Object.freeze([
  "daisy-monroe", "nia-brooks", "tessa-quinn", "zuri-banks", "amara-reed",
  "hazel-ward", "piper-hart", "skye-bennett", "marisol-cruz", "talia-dodson",
  "lumi-vega", "cassy-cruz", "lillie-chen", "roxy-chen", "carmen-blaze",
  "sage-holloway", "claire-rowan", "mina-park", "kevya-desai", "aaliyah-storm",
  "fiona-vale", "imani-cole", "simone-carter", "rei-nakamura", "naomi-okafor",
  "echo-sterling", "nyx-calder", "sabrina-wilde", "scarlett-voss", "reina-sato",
]);

function count(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function yamBowlingVenueMask(slug: unknown): number {
  const index = YAM_BOWLING_VENUE_SLUGS.indexOf(String(slug));
  return index < 0 ? 0 : 1 << index;
}

export function mergeYamBowlingCareerStats(
  stored: Record<string, unknown> = {},
  incoming: Record<string, unknown> = {},
  standard: Record<string, number> = {},
): Record<string, number> {
  const careerKeys = ["careerVenueMask", "careerVenueWinMask", "careerSpareRun", "careerSpareBest", "careerWins"];
  const matchKeys = ["venueMask", "venueWinMask", "spareAttempts", "spares", "sparePrefix", "spareSuffix", "spareBest", "careerWins"];
  const hasCareerState = careerKeys.some((key) => Object.prototype.hasOwnProperty.call(stored, key))
    || matchKeys.some((key) => Object.prototype.hasOwnProperty.call(incoming, key));
  if (!hasCareerState) return standard;
  const attempts = count(incoming.spareAttempts);
  const spares = Math.min(attempts, count(incoming.spares));
  const prefix = Math.min(spares, count(incoming.sparePrefix));
  const suffix = Math.min(spares, count(incoming.spareSuffix));
  const matchBest = Math.min(spares, count(incoming.spareBest));
  const previousRun = count(stored.careerSpareRun);
  const previousBest = count(stored.careerSpareBest);
  const allConverted = attempts > 0 && attempts === spares;
  const nextRun = attempts === 0 ? previousRun : allConverted ? previousRun + attempts : suffix;
  const bridgedRun = attempts > 0 ? previousRun + prefix : previousRun;

  return {
    ...standard,
    careerVenueMask: (count(stored.careerVenueMask) | count(incoming.venueMask)) & YAM_BOWLING_ALL_VENUES_MASK,
    careerVenueWinMask: (count(stored.careerVenueWinMask) | count(incoming.venueWinMask)) & YAM_BOWLING_ALL_VENUES_MASK,
    careerSpareRun: nextRun,
    careerSpareBest: Math.max(previousBest, matchBest, bridgedRun),
    careerWins: count(stored.careerWins) + count(incoming.careerWins),
  };
}

export function earnedYamBowlingCareerBadges(tracks: Record<string, any> = {}): string[] {
  const values = Object.values(tracks || {});
  const venueMask = values.reduce((mask, stats) => mask | count(stats?.careerVenueMask), 0);
  const venueWinMask = values.reduce((mask, stats) => mask | count(stats?.careerVenueWinMask), 0);
  const bestSpareRun = values.reduce((best, stats) => Math.max(best, count(stats?.careerSpareBest)), 0);
  const earned: string[] = [];
  if (bestSpareRun >= 20) earned.push("badge:precision-bowler");
  if ((venueWinMask & YAM_BOWLING_ALL_VENUES_MASK) === YAM_BOWLING_ALL_VENUES_MASK) earned.push("badge:lane-legend");
  if ((venueMask & YAM_BOWLING_ALL_VENUES_MASK) === YAM_BOWLING_ALL_VENUES_MASK) earned.push("badge:road-tested");
  if (YAM_BOWLING_BOWLER_SLUGS.every((slug) => count(tracks?.[slug]?.careerWins) > 0)) earned.push("badge:deep-bench");
  return earned;
}
