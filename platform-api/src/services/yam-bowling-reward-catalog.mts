// A Yam Bowling circuit clear is reported by an installed client, so every input field is
// attacker-controlled. This server catalog fixes the only reward a canonical match can grant
// and the match that must precede it. Rooms and other cosmetics intentionally do not appear:
// their reward cadence has not been designed yet, and the client cannot invent it.

import {
  YAM_BOWLING_BOWLER_SLUGS,
  yamBowlingVenueMask,
} from "./yam-bowling-career.mjs";

export const YAM_BOWLING_GAME_SLUG = "yam-bowling";
export const YAM_BOWLING_CIRCUIT_CLAIM_KIND = "circuit-clear";
export const YAM_BOWLING_MATCH_ACHIEVEMENT_CLAIM_KIND = "match-achievement";
export const YAM_BOWLING_CAREER_MATCH_CLAIM_KIND = "career-match";

const MATCH_ACHIEVEMENTS = Object.freeze({
  "perfect-game": Object.freeze({ entitlementId: "badge:perfect-game", kind: "badge" }),
  "clean-card": Object.freeze({ entitlementId: "badge:clean-card", kind: "badge" }),
  "turkey-club": Object.freeze({ entitlementId: "badge:turkey-club", kind: "badge" }),
  "laser-focus": Object.freeze({ entitlementId: "badge:laser-focus", kind: "badge" }),
  "split-decision": Object.freeze({ entitlementId: "badge:split-decision", kind: "badge" }),
  "comeback-kid": Object.freeze({ entitlementId: "title:comeback-kid", kind: "title" }),
});

const CIRCUIT_UNLOCKS = Object.freeze([
  ["local-hazel-ward", "hazel-ward"],
  ["local-piper-hart", "piper-hart"],
  ["local-skye-bennett", "skye-bennett"],
  ["local-marisol-cruz", "marisol-cruz"],
  ["local-talia-dodson", "talia-dodson"],
  ["city-lumi-vega", "lumi-vega"],
  ["city-cassy-cruz", "cassy-cruz"],
  ["city-lillie-chen", "lillie-chen"],
  ["city-roxy-chen", "roxy-chen"],
  ["city-carmen-blaze", "carmen-blaze"],
  ["regional-sage-holloway", "sage-holloway"],
  ["regional-claire-rowan", "claire-rowan"],
  ["regional-mina-park", "mina-park"],
  ["regional-kevya-desai", "kevya-desai"],
  ["regional-aaliyah-storm", "aaliyah-storm"],
  ["nationals-fiona-vale", "fiona-vale"],
  ["nationals-imani-cole", "imani-cole"],
  ["nationals-simone-carter", "simone-carter"],
  ["nationals-rei-nakamura", "rei-nakamura"],
  ["nationals-naomi-okafor", "naomi-okafor"],
  ["championship-echo-sterling", "echo-sterling"],
  ["championship-nyx-calder", "nyx-calder"],
  ["championship-sabrina-wilde", "sabrina-wilde"],
  ["championship-scarlett-voss", "scarlett-voss"],
  ["championship-reina-sato", "reina-sato"],
] as const);

const PROMOTION_ROOM_REWARDS = Object.freeze({
  "local-talia-dodson": ["teal-lounge", "hot-pink-hideout"],
  "city-carmen-blaze": ["retro-arcade", "beach-house"],
  "regional-aaliyah-storm": ["industrial-workshop", "botanical-glasshouse"],
  "nationals-naomi-okafor": ["frosted-suite", "lavender-cosmic"],
  "championship-reina-sato": ["black-gothic", "circuit-red", "tower-penthouse"],
} as const);

const STARTER_BOWLER_SLUGS = new Set([
  "daisy-monroe",
  "nia-brooks",
  "tessa-quinn",
  "zuri-banks",
  "amara-reed",
]);
const ALL_BOWLER_SLUGS = new Set(YAM_BOWLING_BOWLER_SLUGS);

type CircuitUnlock = Readonly<{
  matchId: string;
  bowlerSlug: string;
  previousMatchId: string | null;
  isPromotionMatch: boolean;
}>;

const CIRCUIT_BY_MATCH_ID = new Map<string, CircuitUnlock>(CIRCUIT_UNLOCKS.map(([matchId, bowlerSlug], index) => [
  matchId,
  Object.freeze({
    matchId,
    bowlerSlug,
    previousMatchId: index > 0 ? CIRCUIT_UNLOCKS[index - 1][0] : null,
    isPromotionMatch: (index + 1) % 5 === 0,
  }),
]));

function cleanText(value: any, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function rejected(): any {
  return { ok: false, statusCode: 400, error: "invalid_claim" };
}

function boundedInt(value: unknown, max: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= max ? number : null;
}

function careerMatchClaim(params: any): any {
  const sourceId = cleanText(params.sourceId, 160);
  const input = params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
    ? params.payload
    : {};
  const trackId = cleanText(input.trackId, 80);
  const outcome = cleanText(input.outcome, 12);
  const venueMask = yamBowlingVenueMask(input.laneSlug);
  const spareAttempts = boundedInt(input.spareAttempts, 12);
  const spares = boundedInt(input.spares, 12);
  const sparePrefix = boundedInt(input.sparePrefix, 12);
  const spareSuffix = boundedInt(input.spareSuffix, 12);
  const spareBest = boundedInt(input.spareBest, 12);
  const counters = [spareAttempts, spares, sparePrefix, spareSuffix, spareBest];
  const validRuns = counters.every((value) => value !== null)
    && spares! <= spareAttempts!
    && sparePrefix! <= spares!
    && spareSuffix! <= spares!
    && spareBest! >= Math.max(sparePrefix!, spareSuffix!)
    && spareBest! <= spares!
    && (spares !== spareAttempts
      || (sparePrefix === spares && spareSuffix === spares && spareBest === spares));
  if (!sourceId || !/^[a-zA-Z0-9._:-]+$/.test(sourceId)
    || cleanText(params.claimId) !== `${YAM_BOWLING_CAREER_MATCH_CLAIM_KIND}:${sourceId}`
    || !ALL_BOWLER_SLUGS.has(trackId) || !["win", "loss", "draw"].includes(outcome)
    || !venueMask || !validRuns) return rejected();
  return {
    ok: true,
    sourceId,
    payload: { trackId, outcome, laneSlug: cleanText(input.laneSlug, 80), spareAttempts, spares, sparePrefix, spareSuffix, spareBest },
    careerStats: {
      trackId,
      venueMask,
      venueWinMask: outcome === "win" ? venueMask : 0,
      spareAttempts,
      spares,
      sparePrefix,
      spareSuffix,
      spareBest,
      careerWins: outcome === "win" ? 1 : 0,
    },
  };
}

export function validateYamBowlingPublicClaim(params: any = {}): any {
  if (cleanText(params.gameSlug, 60) !== YAM_BOWLING_GAME_SLUG) return rejected();
  const kind = cleanText(params.kind, 80);
  if (kind === YAM_BOWLING_MATCH_ACHIEVEMENT_CLAIM_KIND) {
    const achievementId = cleanText(params.sourceId || params.payload?.achievementId, 80);
    const reward = MATCH_ACHIEVEMENTS[achievementId as keyof typeof MATCH_ACHIEVEMENTS];
    if (!reward || cleanText(params.claimId) !== `${YAM_BOWLING_MATCH_ACHIEVEMENT_CLAIM_KIND}:${achievementId}`) return rejected();
    return {
      ok: true,
      sourceId: achievementId,
      payload: { achievementId, entitlementId: reward.entitlementId },
      entitlementGrants: [{ ...reward }],
    };
  }
  if (kind === YAM_BOWLING_CAREER_MATCH_CLAIM_KIND) return careerMatchClaim(params);
  if (kind !== YAM_BOWLING_CIRCUIT_CLAIM_KIND) return rejected();
  const input = params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
    ? params.payload
    : {};
  const matchId = cleanText(input.matchId || params.sourceId);
  const activeBowlerSlug = cleanText(input.activeBowlerSlug, 80);
  const match = CIRCUIT_BY_MATCH_ID.get(matchId);
  if (!match || !ALL_BOWLER_SLUGS.has(activeBowlerSlug)
    || cleanText(params.claimId) !== `${YAM_BOWLING_CIRCUIT_CLAIM_KIND}:${matchId}`) return rejected();

  const entitlementId = `bowler:${match.bowlerSlug}`;
  const roomEntitlements = (PROMOTION_ROOM_REWARDS[matchId as keyof typeof PROMOTION_ROOM_REWARDS] || [])
    .map((roomSlug) => ({ entitlementId: `room:${roomSlug}`, kind: "room" }));
  return {
    ok: true,
    sourceId: matchId,
    prerequisite: match.previousMatchId
      ? { kind: "campaign-mission", missionId: match.previousMatchId }
      : null,
    payload: {
      matchId,
      achievementId: `beat-${match.bowlerSlug}`,
      unlockedBowlerSlug: match.bowlerSlug,
      entitlementId,
      activeBowlerSlug,
    },
    entitlementGrants: [{ entitlementId, kind: "bowler" }, ...roomEntitlements],
    campaignProgress: { missionId: matchId, stars: 1 },
    campaignXp: { trackId: activeBowlerSlug, kind: match.isPromotionMatch ? "boss" : "encounter" },
  };
}

export function validateYamBowlingSkinVoucherTarget(gameSlug: unknown, entitlementId: unknown): any {
  if (gameSlug !== YAM_BOWLING_GAME_SLUG || typeof entitlementId !== "string") return null;
  const match = /^skin:([a-z0-9-]+):(swimsuit|maid|halloween)$/.exec(entitlementId);
  if (!match || !ALL_BOWLER_SLUGS.has(match[1])) return null;
  return { entitlementId, bowlerSlug: match[1], skinId: match[2] };
}

// The twenty-three emotes an Emote Voucher can buy. The six founding ones are
// excluded because every account already holds them — spending a voucher on one
// would burn it for nothing — and `game-face` because the mastery ladder grants
// it outright at level 17. Listed explicitly rather than derived from the whole
// pool so widening what a voucher reaches is always a deliberate edit.
const EMOTE_VOUCHER_SLUGS = new Set([
  "cheer", "peace", "hair-flip", "crowned",
  "fist-pump", "salute", "number-one", "proud", "finger-heart",
  "blow-kiss", "cheeky", "wink", "brush-it-off", "you-next",
  "phew", "please-fall", "rattled", "shush", "well-actually",
  "heads-up", "after-you", "lock-in", "fist-bump",
]);

export function validateYamBowlingEmoteVoucherTarget(gameSlug: unknown, entitlementId: unknown): any {
  if (gameSlug !== YAM_BOWLING_GAME_SLUG || typeof entitlementId !== "string") return null;
  const match = /^emote:([a-z0-9-]+)$/.exec(entitlementId);
  if (!match || !EMOTE_VOUCHER_SLUGS.has(match[1])) return null;
  return { entitlementId, emoteSlug: match[1] };
}

export function isYamBowlingStarterBowler(value: unknown): boolean {
  return typeof value === "string" && STARTER_BOWLER_SLUGS.has(value);
}

export function getYamBowlingCircuitUnlockCatalog(): readonly (readonly [string, string])[] {
  return CIRCUIT_UNLOCKS;
}
