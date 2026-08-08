// The platform ladder registry — the single plug-in point for "Top Ladder Rankings".
//
// Adding a game's ladder is one entry in LADDERS below. Nothing else on the platform
// side changes: the placement query, the public board route, the profile rail, and the
// /me + /player rankings panels all read this registry.
//
// A ladder must be backed by a rating source the server already owns. There are two:
//
//   game-ratings  head-to-head ELO (game_ratings, 018), written by POST /ratings/:slug
//                 and by the ranked match reporter.
//   run-records   solo bests (game_run_records, 036), written by POST
//                 /leaderboards/:slug/runs. One ladder entry names ONE board.
//
// When a third appears, add its `source` value here and give db/ladders.mts a branch
// for it — do not fork the registry.

import { formatBoardValue, getBoard } from "./leaderboard-catalog.mjs";

export interface LadderDefinition {
  // The slug rows are stored under in the rating source. This is NOT always the grid
  // cabinet slug: sumorai stores ranked play under `sumorai-ranked` so casual play
  // never touches the ladder.
  gameSlug: string;
  // Display name for the ladder. Kept here because a rating slug like `sumorai-ranked`
  // has no catalog entry to derive a title from.
  title: string;
  // The grid cabinet this ladder belongs to, for links and preview art.
  cabinetSlug: string;
  source: "game-ratings" | "run-records";
  // Suffix on the rating value when shown as a label ("1284 ELO"). Ignored for
  // run-records ladders, which format through their board's own unit — a time is
  // "11.924s", not "11924 ms", and the board already knows that.
  unitLabel: string;
  // Placement games required before a player appears on the ladder at all.
  // A run-records ladder needs one run to place, so this is always 1 for them.
  minMatches: number;
  // run-records only: which board of that game this ladder is. Required for that
  // source and meaningless for the other — a game has one ELO rating but many boards,
  // which is exactly why only ONE board per cabinet is promoted to the platform rail.
  // The full board set is served by /leaderboards/:slug, which the cabinet reads
  // directly; putting all seven of Speed Demon's here would bury every other game's
  // ladder under one cabinet.
  boardId?: string;
}

const LADDERS: LadderDefinition[] = [
  {
    gameSlug: "tactical-arena",
    title: "Tactical Arena",
    cabinetSlug: "tactical-arena",
    source: "game-ratings",
    unitLabel: "ELO",
    minMatches: 1,
  },
  {
    gameSlug: "sumorai-ranked",
    title: "Sumorai",
    cabinetSlug: "sumorai",
    source: "game-ratings",
    unitLabel: "ELO",
    minMatches: 1,
  },
  // Speed Demon's headline board. The quarter mile is the drag racing distance —
  // it is the mode's default, and it is what a time means to someone who does not
  // play the game. The other six boards are not registered here on purpose; see
  // the note on `boardId` above.
  {
    gameSlug: "speed-demon",
    title: "Speed Demon — Quarter Mile",
    cabinetSlug: "speed-demon",
    source: "run-records",
    unitLabel: "",
    minMatches: 1,
    boardId: "distance:quarter",
  },
];

const BY_SLUG = new Map<string, LadderDefinition>(LADDERS.map((ladder) => [ladder.gameSlug, ladder]));

export function listLadders(): LadderDefinition[] {
  return LADDERS.map((ladder) => ({ ...ladder }));
}

export function getLadder(gameSlug: unknown): LadderDefinition | null {
  const slug = typeof gameSlug === "string" ? gameSlug.trim().toLowerCase() : "";
  const ladder = slug ? BY_SLUG.get(slug) : undefined;
  return ladder ? { ...ladder } : null;
}

export function isLadderSlug(gameSlug: unknown): boolean {
  return getLadder(gameSlug) !== null;
}

// Formats a rating for display. Kept next to the registry so every surface —
// board rows, profile placements, and any later badge pass — reads the same label.
//
// A run-records ladder delegates to its board, because the raw stored value is in
// the board's integer unit and is not a number anyone should read: a quarter mile
// best is 11924 in the column and "11.924s" on screen. Formatting it here with a
// `unitLabel` would be a second, wrong copy of the board's own formatter.
export function formatLadderRating(ladder: LadderDefinition | null, rating: unknown): string {
  if (ladder?.source === "run-records") {
    return formatBoardValue(getBoard(ladder.gameSlug, ladder.boardId), rating);
  }
  const value = Math.round(Number(rating));
  if (!Number.isFinite(value)) return "";
  const unit = ladder?.unitLabel || "";
  return unit ? `${value} ${unit}` : String(value);
}
