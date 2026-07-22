// Shared ranked-match helpers used by both the match-lifecycle writes (ranked-match.mts)
// and the read views (ranked-queries.mts): slug validation, per-player row
// serialization, flag accumulation, and stale-active-match expiry. Split out of
// ranked.mts so those two larger modules draw from one source without a circular import.

export const RANKED_ACTIVE_MATCH_TTL_HOURS = 6;

function isOpenRankedMatchStatus(status: any): boolean {
  return status === "active" || status === "playing";
}

// Same slug shape as the rest of the game-scoped routes.
export function isValidRankedSlug(slug: unknown): boolean {
  return typeof slug === "string" && /^[a-z0-9-]{1,60}$/.test(slug);
}

export function appendFlag(existing: any, flag: any): any {
  if (!flag) return existing || null;
  const set = new Set(String(existing || "").split(",").map((s) => s.trim()).filter(Boolean));
  set.add(flag);
  return Array.from(set).join(",");
}

// Shape a match row for one player's client. Never leaks anything the player
// shouldn't derive; the token is the shared secret both members legitimately hold.
export function serializeMatchForPlayer(row: any, playerId: any): any {
  if (!row) return null;
  const isA = row.player_a === playerId;
  return {
    matchId: row.match_id,
    gameSlug: row.game_slug,
    board: row.board,
    seed: row.seed,
    token: row.token,
    status: row.status,
    seat: isA ? 1 : 2,
    bansFirst: row.ban_first === playerId,
    lobbyCode: row.lobby_code || null,
    opponentPlayerId: isA ? row.player_b : row.player_a,
    myRatingBefore: isA ? row.rating_a_before : row.rating_b_before,
    opponentRatingBefore: isA ? row.rating_b_before : row.rating_a_before,
    outcome: resolvedOutcomeForPlayer(row, playerId),
  };
}

function resolvedOutcomeForPlayer(row: any, playerId: any): any {
  if (!row.outcome_a) return null;
  const isA = row.player_a === playerId;
  if (row.outcome_a === "draw") return "draw";
  const aWon = row.outcome_a === "win";
  return (isA ? aWon : !aWon) ? "win" : "loss";
}

function staleActiveCutoff(now: any = new Date()): Date {
  return new Date(new Date(now).getTime() - RANKED_ACTIVE_MATCH_TTL_HOURS * 60 * 60 * 1000);
}

export function isStaleActiveRankedMatch(row: any, now: any = new Date()): boolean {
  if (!row || !isOpenRankedMatchStatus(row.status) || !row.created_at) return false;
  const createdMs = new Date(row.created_at).getTime();
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(nowMs)) return false;
  return nowMs - createdMs > RANKED_ACTIVE_MATCH_TTL_HOURS * 60 * 60 * 1000;
}

export async function expireStaleActiveRankedMatches(client: any, gameSlug: any, now: any = new Date()): Promise<number> {
  if (!client || !gameSlug) return 0;
  const stale = await client.query(
    `select * from ranked_matches
       where game_slug = $1 and status in ('active','playing') and created_at < $2
       for update skip locked`,
    [gameSlug, staleActiveCutoff(now)],
  );
  let expired = 0;
  for (const row of stale.rows || []) {
    if (!isStaleActiveRankedMatch(row, now)) continue;
    await client.query(
      `update ranked_matches set status='voided', flags=$1, resolved_at=now()
          where match_id=$2 and game_slug=$3`,
      [appendFlag(row.flags, "stale_active_expired"), row.match_id, gameSlug],
    );
    await client.query(
      `update ranked_queue set status='cancelled', match_id=null
          where game_slug=$1 and match_id=$2`,
      [gameSlug, row.match_id],
    );
    expired += 1;
  }
  return expired;
}
