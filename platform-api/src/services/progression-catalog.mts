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
  trackStats: { strikes: "sum", highGame: "max" },
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
