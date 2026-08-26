// The platform progression registry — the single plug-in point for "a cabinet
// where finishing a match earns XP".
//
// Adding a game is one entry in PROGRESSIONS below. Nothing else changes: the
// award path in db/game-xp.mts, the read route, and the level maths all ask this
// registry. It is the third of the per-game catalog seams (ladder-catalog,
// leaderboard-catalog, this one) and follows their rule — generic on game_slug,
// no route code edited to onboard a cabinet.
//
// THIS FILE IS THE SERVER HALF OF A TWIN. The cabinet ships the same rules in
// `games/yam-bowling/progression-core.js` so it can describe a pending grant
// before the server answers. The two are deliberately not imported across the
// project boundary — the API must not depend on a cabinet's source — so the
// numbers are asserted explicitly in BOTH suites. Retuning the economy means
// editing both files; each suite's table test is what makes a half-applied
// retune fail loudly rather than pay two different amounts.
//
// THE SERVER DERIVES EVERY XP AMOUNT. A client reports what it played, never
// what it earned. See the trust note in db/migrations/038-game-xp-progression.sql
// for exactly which of those reported fields are checkable and which are not.

import { mergeYamBowlingCareerStats } from "./yam-bowling-career.mjs";

export interface ProgressionCurve {
  // Cost to advance out of level L is `base + (L - 1) * step`.
  base: number;
  step: number;
  maxLevel: number;
}

export interface ProgressionModeAward {
  completion: number;
  win: number;
}

export interface ProgressionDefinition {
  gameSlug: string;
  // Two tracks: the account-wide one and the per-track one (a bowler, and later
  // for another cabinet a car or a unit). Both are capped; raising a cap is
  // deferred scope, so no caller may hard-code a level.
  curves: { player: ProgressionCurve; track: ProgressionCurve };
  // Keyed by the mode id the cabinet reports. An unlisted mode earns nothing
  // rather than falling back to a payout.
  modes: Record<string, ProgressionModeAward>;
  campaign: Record<string, number>;
  // A capped bonus on a countable performance stat. Capped on purpose: the scope
  // wants abuse telemetry before any uncapped performance XP, so a perfect game
  // cannot out-earn simply playing more.
  performanceXpPerUnit: number;
  maxPerformanceXp: number;
  // How the per-track extras merge when a grant lands. Universal counters
  // (matches, wins, xp) are always summed; these are the per-game ones.
  trackStats: Record<string, "sum" | "max">;
  mergeTrackExtras?: (
    stored: Record<string, unknown>,
    incoming: Record<string, unknown>,
    standard: Record<string, number>,
  ) => Record<string, number>;
  playerInventoryRewards?: ReadonlyArray<Readonly<{
    level: number;
    itemId: string;
    quantity: number;
  }>>;
  // Cosmetics a level pays out, per ladder. These are durable entitlement rows
  // for the same reason vouchers are durable inventory rows: the loadout
  // validator decides what may be saved from `game_entitlements` alone, so a
  // reward that mints nothing can be equipped on the device and then stripped
  // the moment the player saves. Deriving ownership from the level on the
  // client only is what left that gap.
  levelEntitlements?: Readonly<Record<LadderScope, ReadonlyArray<Readonly<{
    level: number;
    entitlementId: string;
    kind: string;
  }>>>>;
}

// Which ladder a level reward hangs on. They are scored on different curves, so
// the scope has to be named rather than inferred.
export type LadderScope = "player" | "track";

// An entitlement id is `<kind>:<slug>`, so the kind is read off the id rather
// than repeated beside it — two spellings of the same fact could disagree.
function levelReward(level: number, entitlementId: string) {
  return Object.freeze({ level, entitlementId, kind: entitlementId.split(":")[0] });
}

const YAM_BOWLING: ProgressionDefinition = {
  gameSlug: "yam-bowling",
  curves: {
    // Player levels are the aggregate of all play, so they are dearer than
    // mastery of one bowler — otherwise spreading play across the roster would
    // outrank it.
    player: { base: 400, step: 150, maxLevel: 30 },
    track: { base: 200, step: 100, maxLevel: 30 },
  },
  modes: {
    quick: { completion: 100, win: 25 },
    classic: { completion: 300, win: 75 },
  },
  campaign: { encounter: 300, boss: 600 },
  performanceXpPerUnit: 4,
  maxPerformanceXp: 20,
  trackStats: {
    strikes: "sum",
    highGame: "max",
    quickGames: "sum",
    quickTotalScore: "sum",
    quickHighGame: "max",
    quickStrikeOpportunities: "sum",
    quickStrikes: "sum",
    quickSpareOpportunities: "sum",
    quickSpares: "sum",
    classicGames: "sum",
    classicTotalScore: "sum",
    classicHighGame: "max",
    classicStrikeOpportunities: "sum",
    classicStrikes: "sum",
    classicSpareOpportunities: "sum",
    classicSpares: "sum",
  },
  mergeTrackExtras: mergeYamBowlingCareerStats,
  // Two spendable currencies, listed in level order because that is the order a
  // player meets them and the order the reward reader returns them in.
  //
  // Emote Vouchers sit on the four rungs that used to promise badges, and are
  // the commoner of the two: the emote pool is thirty deep where the skin pool
  // is two per bowler. Both are currencies rather than named items because a
  // ladder has far fewer rungs than either pool has entries — naming one item
  // per rung would leave most of the pool permanently unreachable.
  playerInventoryRewards: Object.freeze([
    Object.freeze({ level: 7, itemId: "emote-voucher", quantity: 1 }),
    Object.freeze({ level: 10, itemId: "skin-voucher", quantity: 1 }),
    Object.freeze({ level: 16, itemId: "emote-voucher", quantity: 1 }),
    Object.freeze({ level: 22, itemId: "emote-voucher", quantity: 1 }),
    Object.freeze({ level: 25, itemId: "skin-voucher", quantity: 1 }),
    Object.freeze({ level: 30, itemId: "emote-voucher", quantity: 1 }),
  ]),
  // Keep in lockstep with the cabinet's two ladder cadences —
  // games/yam-bowling/player-rewards-core.js and mastery-rewards-core.js. Only
  // their *bound* nodes appear here: a label-only node has nothing to grant.
  // The founding rewards (level 1 canon skin, Rookie title) are deliberately
  // absent, since founding content needs no row.
  //
  // Every player reward is account-wide. Every mastery reward contains
  // `{track}` and belongs to the bowler that crossed the rung, so mastering a
  // second bowler never repays a global item earned on the first.
  levelEntitlements: Object.freeze({
    player: Object.freeze([
      levelReward(2, "ball-trail:lime-shock"),
      levelReward(2, "strike-burst:lime-pop"),
      levelReward(3, "ball-trail:red-neon"),
      levelReward(3, "strike-burst:red-supernova"),
      levelReward(4, "title:lane-regular"),
      levelReward(5, "ball-trail:emerald-glow"),
      levelReward(5, "strike-burst:emerald-impact"),
      levelReward(6, "ball-trail:orange-flare"),
      levelReward(6, "strike-burst:ember"),
      levelReward(7, "emote:game-face"),
      levelReward(8, "ball-trail:mint-frost"),
      levelReward(8, "strike-burst:mint-crackle"),
      levelReward(9, "room:fireside-lodge"),
      levelReward(10, "entrance:spotlight"),
      levelReward(11, "ball-trail:cyan-pulse"),
      levelReward(11, "strike-burst:cyan-flash"),
      levelReward(12, "ball-trail:sky-blue"),
      levelReward(12, "strike-burst:sky-shatter"),
      levelReward(13, "title:house-favourite"),
      levelReward(13, "title:pocket-hunter"),
      levelReward(14, "ball-trail:electric-blue"),
      levelReward(14, "strike-burst:electric-blue"),
      levelReward(15, "ball-trail:gold-rush"),
      levelReward(15, "strike-burst:gold-star"),
      levelReward(16, "room:desert-vista"),
      levelReward(17, "ball-trail:indigo-drive"),
      levelReward(17, "strike-burst:indigo-ring"),
      levelReward(18, "ball-trail:rose-gold"),
      levelReward(18, "strike-burst:rose-gold"),
      levelReward(19, "title:lane-veteran"),
      levelReward(19, "title:pin-chaser"),
      levelReward(20, "ball-trail:violet-haze"),
      levelReward(20, "strike-burst:violet-bloom"),
      levelReward(21, "ball-trail:diamond-white"),
      levelReward(21, "strike-burst:diamond-spark"),
      levelReward(22, "title:lane-reader"),
      levelReward(23, "ball-trail:purple-plasma"),
      levelReward(23, "strike-burst:purple-nova"),
      levelReward(24, "room:deep-sea-suite"),
      levelReward(24, "entrance:champion"),
      levelReward(26, "ball-trail:magenta-pop"),
      levelReward(26, "strike-burst:magenta-blast"),
      levelReward(27, "ball-trail:perfect-line"),
      levelReward(28, "ball-trail:hot-pink"),
      levelReward(28, "strike-burst:hot-pink-pop"),
      levelReward(28, "title:shotmaker"),
      levelReward(29, "ball-trail:eclipse"),
      levelReward(29, "strike-burst:eclipse-corona"),
      levelReward(30, "title:yam-legend"),
    ]),
    track: Object.freeze([
      levelReward(3, "profile-icon:{track}:canon"),
      levelReward(5, "victory-pose:{track}:spotlight"),
      levelReward(9, "player-card:{track}:rivalry"),
      levelReward(12, "player-card:{track}:signature"),
      levelReward(18, "victory-pose:{track}:champion"),
      levelReward(24, "player-card:{track}:elite"),
      levelReward(29, "title:{track}:nameplate"),
      levelReward(30, "title:{track}:master"),
    ]),
  }),
};

const PROGRESSIONS: ProgressionDefinition[] = [YAM_BOWLING];

export function getProgression(gameSlug: unknown): ProgressionDefinition | null {
  return PROGRESSIONS.find((entry) => entry.gameSlug === gameSlug) || null;
}

export function listProgressionSlugs(): string[] {
  return PROGRESSIONS.map((entry) => entry.gameSlug);
}

function safeInt(value: unknown, fallback = 0): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Total XP needed to *be* the given level. Closed form of the running sum, so a
// boundary check is arithmetic rather than a loop.
export function xpForLevel(curve: ProgressionCurve, level: number): number {
  const target = safeInt(level, 1);
  if (target <= 1) return 0;
  const steps = Math.min(target, curve.maxLevel) - 1;
  return steps * curve.base + curve.step * ((steps * (steps - 1)) / 2);
}

// A level is DERIVED, never stored. A stored level disagrees with the curve the
// moment the curve is retuned, and there is no way to tell which one is wrong.
export function levelFromXp(curve: ProgressionCurve, xp: unknown) {
  const total = Math.max(0, safeInt(xp, 0));
  let level = 1;
  while (level < curve.maxLevel && total >= xpForLevel(curve, level + 1)) level += 1;
  const isMaxLevel = level >= curve.maxLevel;
  return {
    level,
    xp: total,
    xpIntoLevel: total - xpForLevel(curve, level),
    xpForNextLevel: isMaxLevel ? 0 : xpForLevel(curve, level + 1) - xpForLevel(curve, level),
    isMaxLevel,
  };
}

export function inventoryRewardsBetween(
  definition: ProgressionDefinition,
  previousXp: unknown,
  nextXp: unknown,
): Array<{ level: number; itemId: string; quantity: number }> {
  if (!definition?.curves?.player) return [];
  const previousLevel = levelFromXp(definition.curves.player, previousXp).level;
  const nextLevel = levelFromXp(definition.curves.player, nextXp).level;
  if (nextLevel <= previousLevel) return [];
  return (definition.playerInventoryRewards || [])
    .filter((reward) => reward.level > previousLevel && reward.level <= nextLevel)
    .map((reward) => ({ level: reward.level, itemId: reward.itemId, quantity: reward.quantity }));
}

// The cosmetics a ladder just paid out over the half-open range `(previous,
// next]`. Same shape as `inventoryRewardsBetween`, and deliberately a separate
// function rather than a flag on it: the two write to different tables, and the
// player ladder pays both while a track ladder pays only this one.
export function entitlementRewardsBetween(
  definition: ProgressionDefinition | null | undefined,
  scope: LadderScope,
  previousXp: unknown,
  nextXp: unknown,
  { trackId }: { trackId?: string | null } = {},
): Array<{ level: number; entitlementId: string; kind: string }> {
  const curve = definition?.curves?.[scope as keyof ProgressionDefinition["curves"]];
  const rewards = definition?.levelEntitlements?.[scope];
  if (!curve || !rewards) return [];
  const previousLevel = levelFromXp(curve, previousXp).level;
  const nextLevel = levelFromXp(curve, nextXp).level;
  if (nextLevel <= previousLevel) return [];
  return rewards
    .filter((reward) => reward.level > previousLevel && reward.level <= nextLevel)
    // A `{track}` reward belongs to the track that earned it. Without a track to
    // name it is skipped rather than granted under a literal placeholder, which
    // would mint an entitlement id nothing can ever match.
    .filter((reward) => !reward.entitlementId.includes("{track}") || Boolean(trackId))
    .map((reward) => ({
      level: reward.level,
      entitlementId: reward.entitlementId.replace("{track}", String(trackId)),
      kind: reward.kind,
    }));
}

export interface GrantBreakdown {
  completion: number;
  win: number;
  performance: number;
  forfeit: number;
}

export interface GrantVerdict {
  eligible: boolean;
  reason: string;
  xp: number;
  breakdown: GrantBreakdown;
}

function refused(reason: string): GrantVerdict {
  return { eligible: false, reason, xp: 0, breakdown: { completion: 0, win: 0, performance: 0, forfeit: 0 } };
}

// What a finished online match is worth. Pure: it touches no storage and banks
// nothing. `playType` is not a parameter on purpose — this is reached only from
// the online result path, and accepting one would let a client claim the richer
// campaign payout for a CPU game.
export function computeOnlineGrant(gameSlug: unknown, {
  modeId,
  outcome = "loss",
  performance = 0,
  forfeitRole = null,
}: { modeId?: unknown; outcome?: unknown; performance?: unknown; forfeitRole?: unknown } = {}): GrantVerdict {
  const definition = getProgression(gameSlug);
  if (!definition) return refused("game-not-registered");

  const mode = typeof modeId === "string" ? definition.modes[modeId] : undefined;
  if (!mode) return refused("unknown-mode");

  // A player who walks gets nothing, whether or not the match ended cleanly.
  if (forfeitRole === "leaver") return refused("left-early");

  const breakdown: GrantBreakdown = { completion: 0, win: 0, performance: 0, forfeit: 0 };

  if (forfeitRole === "remaining") {
    // An abandoned match was not completed and the win was not earned, so the
    // reward is its own line: credit for the frames actually bowled.
    breakdown.forfeit = Math.floor(mode.completion / 2);
  } else {
    breakdown.completion = mode.completion;
    breakdown.win = outcome === "win" ? mode.win : 0;
    breakdown.performance = Math.min(
      definition.maxPerformanceXp,
      Math.max(0, safeInt(performance, 0)) * definition.performanceXpPerUnit,
    );
  }

  const xp = breakdown.completion + breakdown.win + breakdown.performance + breakdown.forfeit;
  return { eligible: true, reason: "eligible", xp, breakdown };
}

export function computeCampaignGrant(gameSlug: unknown, {
  kind,
  firstClear = true,
}: { kind?: unknown; firstClear?: unknown } = {}): GrantVerdict {
  const definition = getProgression(gameSlug);
  if (!definition) return refused("game-not-registered");
  const xp = typeof kind === "string" ? definition.campaign[kind] : undefined;
  if (!Number.isFinite(xp)) return refused("unknown-campaign-clear");
  if (firstClear !== true) return refused("campaign-replay");
  const amount = Number(xp);
  return {
    eligible: true,
    reason: "eligible",
    xp: amount,
    breakdown: { completion: amount, win: 0, performance: 0, forfeit: 0 },
  };
}
