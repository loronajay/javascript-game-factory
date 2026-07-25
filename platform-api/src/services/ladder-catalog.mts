// The platform ladder registry — the single plug-in point for "Top Ladder Rankings".
//
// Adding a game's ladder is one entry in LADDERS below. Nothing else on the platform
// side changes: the placement query, the public board route, the profile rail, and the
// /me + /player rankings panels all read this registry.
//
// A ladder must be backed by a rating source the server already owns. Today that is
// game_ratings (ELO), written by POST /ratings/:slug and by the ranked match reporter.
// When a second source appears (e.g. a high-score table), add its `source` value here
// and give db/ladders.mts a branch for it — do not fork the registry.

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
  source: "game-ratings";
  // Suffix on the rating value when shown as a label ("1284 ELO").
  unitLabel: string;
  // Placement games required before a player appears on the ladder at all.
  minMatches: number;
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
export function formatLadderRating(ladder: LadderDefinition | null, rating: unknown): string {
  const value = Math.round(Number(rating));
  if (!Number.isFinite(value)) return "";
  const unit = ladder?.unitLabel || "";
  return unit ? `${value} ${unit}` : String(value);
}
