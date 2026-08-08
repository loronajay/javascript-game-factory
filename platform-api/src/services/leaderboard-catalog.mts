// The leaderboard board registry — what solo boards exist, per game.
//
// This is the score-board counterpart to services/ladder-catalog. That registry
// answers "which games have a cross-game ladder"; this one answers "what can be
// recorded, and what makes one run better than another". They are separate
// because a game can have many boards and at most a couple of ladder entries:
// Speed Demon has seven boards, one of which is promoted to the platform rail.
//
// Adding a board is one entry below. Nothing else changes: the submission route,
// the upsert, the board query and the personal-bests read are all driven from
// here. Adding a *game* is one key in BOARDS — the table (game_run_records) is
// generic on game_slug and this module is the only place a slug is named.
//
// ## Board ids are permanent
//
// A board id is stored on every record row. Renaming one orphans every time set
// on it, on every account — the same rule Speed Demon's model ids follow. Labels
// are free to change; ids are not.
//
// ## Direction lives here and nowhere else
//
// Whether a bigger value is better is a property of the board: a distance race
// wants the lowest elapsed time, a time attack the greatest distance covered.
// The column does not store it (see migration 036) precisely so there is one
// copy of the fact, and the upsert reads it from here to decide whether an
// incoming run beats the stored one.
//
// ## The bounds are a plausibility gate, not verification
//
// A submitted run is a claim. The real check is replaying its input log through
// the deterministic sim, which is deliberately not done yet — records land
// `verified: false` and a later pass settles them. What these bounds do in the
// meantime is refuse the *impossible* rather than merely the suspicious: a
// quarter mile cannot be run in 3 seconds by any car in the game, so a claim
// that it was is a forgery rather than a remarkable drive. They are set with
// generous headroom on purpose. Tightening them into a skill judgement would
// start rejecting real runs, and the honest answer to a suspicious-but-possible
// time is the replay, not a narrower window.

export type BoardDirection = "lower" | "higher";

export interface BoardDefinition {
  /** Stable forever. Stored on every record row. */
  id: string;
  /** Display name for the board. */
  label: string;
  /** Which way is better. See the note above — this is the only copy. */
  direction: BoardDirection;
  /**
   * The unit `value` is measured in. Integer units so ordering is exact:
   * milliseconds for a timed board, centimetres for a distance board.
   */
  unit: "ms" | "cm";
  /**
   * Inclusive plausibility bounds on `value`. A submission outside these is
   * refused outright rather than stored unverified — it is not a run at all.
   */
  min: number;
  max: number;
}

export interface GameBoards {
  gameSlug: string;
  title: string;
  boards: BoardDefinition[];
}

/**
 * Speed Demon's boards are **track-agnostic**, which is a measured decision
 * rather than a simplification. `scripts/ui/track-layout.js` keeps the painted
 * road geometry (`ROAD` — lane centres, edges, the divider) shared across all
 * five tracks; only the dash rhythm and the scenery differ, and neither touches
 * the sim. The five tracks are the same road in five settings, so a quarter mile
 * on the coast is directly comparable to one in the desert and splitting them
 * would be five boards competing for the same run.
 *
 * They are also **car-agnostic**, for as long as that stays true: the roster is
 * cosmetic-only, so every model performs identically and per-car boards would be
 * 24 copies of one ladder. If real stat differences ever land (GDD M3), the
 * board id gains a class segment and the old ids keep meaning what they meant.
 *
 * The track and model are still recorded per row as display metadata — a board
 * row saying which car ran the time is worth having even when it does not divide
 * the competition.
 */
const SPEED_DEMON_BOARDS: BoardDefinition[] = [
  // Distance races: elapsed time, lower is better. The floors are well under the
  // measured perfect run (a holeshot quarter mile is 12.04s) and the ceilings
  // are generous — a bad run is still a run.
  { id: "distance:eighth", label: "Eighth Mile", direction: "lower", unit: "ms", min: 4_000, max: 120_000 },
  { id: "distance:quarter", label: "Quarter Mile", direction: "lower", unit: "ms", min: 7_000, max: 180_000 },
  { id: "distance:half", label: "Half Mile", direction: "lower", unit: "ms", min: 14_000, max: 300_000 },
  { id: "distance:mile", label: "Full Mile", direction: "lower", unit: "ms", min: 28_000, max: 600_000 },

  // Time attack: distance covered, higher is better. The ceilings assume a car
  // pinned at the rev limiter for the whole clock with no launch and no shifts
  // lost, which nothing can beat, plus headroom.
  { id: "time-attack:sprint", label: "60 Second Sprint", direction: "higher", unit: "cm", min: 0, max: 600_000 },
  { id: "time-attack:standard", label: "90 Second Run", direction: "higher", unit: "cm", min: 0, max: 900_000 },
  { id: "time-attack:endurance", label: "2 Minute Endurance", direction: "higher", unit: "cm", min: 0, max: 1_200_000 },
];

const GAMES: GameBoards[] = [
  {
    gameSlug: "speed-demon",
    title: "Speed Demon",
    boards: SPEED_DEMON_BOARDS,
  },
];

const BY_GAME = new Map<string, GameBoards>(GAMES.map((game) => [game.gameSlug, game]));

function cleanSlug(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function listBoardGames(): GameBoards[] {
  return GAMES.map((game) => ({ ...game, boards: game.boards.map((board) => ({ ...board })) }));
}

/** Every board for one game, or null when the game has no boards registered. */
export function getGameBoards(gameSlug: unknown): GameBoards | null {
  const game = BY_GAME.get(cleanSlug(gameSlug));
  return game ? { ...game, boards: game.boards.map((board) => ({ ...board })) } : null;
}

/**
 * One board. Returns null for an unregistered game *or* an unknown board id, so
 * every caller has exactly one thing to check — a route serving an empty board
 * for a typo'd id is worse than a 404, because it looks like nobody has played.
 */
export function getBoard(gameSlug: unknown, boardId: unknown): BoardDefinition | null {
  const game = BY_GAME.get(cleanSlug(gameSlug));
  if (!game) return null;
  const id = typeof boardId === "string" ? boardId.trim() : "";
  const board = game.boards.find((entry) => entry.id === id);
  return board ? { ...board } : null;
}

export function isBoardSlug(gameSlug: unknown): boolean {
  return BY_GAME.has(cleanSlug(gameSlug));
}

/**
 * Whether `candidate` is a better result than `current` on this board. The one
 * place direction is interpreted — the upsert, the ordering and any later replay
 * pass all route through it, so a board cannot rank one way and accept records
 * the other.
 *
 * A tie is NOT an improvement: equal runs keep the earlier one, which is what
 * makes `recorded_at` a meaningful tiebreak on the board rather than a record of
 * who re-submitted most recently.
 */
export function isBetterValue(board: BoardDefinition | null, candidate: number, current: number): boolean {
  if (!board) return false;
  if (!Number.isFinite(candidate) || !Number.isFinite(current)) return false;
  return board.direction === "lower" ? candidate < current : candidate > current;
}

/** SQL order fragment for a board's ranking. Total, so `rank()` is stable. */
export function boardOrderSql(board: BoardDefinition | null): string {
  const value = board?.direction === "higher" ? "value desc" : "value asc";
  return `${value}, recorded_at asc, player_id asc`;
}

/**
 * A submitted value, coerced to the board's integer unit — or null if it is not
 * a plausible result on this board. Returning null rather than clamping is
 * deliberate: clamping a forged time into range would *store* it, and the whole
 * point of the gate is that an impossible claim leaves no row behind.
 */
export function normalizeBoardValue(board: BoardDefinition | null, value: unknown): number | null {
  if (!board) return null;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  if (number < board.min || number > board.max) return null;
  return number;
}

/** Formats a value for display, in the board's own unit. */
export function formatBoardValue(board: BoardDefinition | null, value: unknown): string {
  const number = Number(value);
  if (!board || !Number.isFinite(number)) return "";
  if (board.unit === "ms") {
    return `${(number / 1000).toFixed(3)}s`;
  }
  return `${(number / 100).toFixed(1)}m`;
}
