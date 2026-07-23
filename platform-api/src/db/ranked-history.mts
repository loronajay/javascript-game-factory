// Ranked match history — the ranked source adapter for the canonical match-history
// contract (match-history.mts). Owns the SQL and the ranked-row -> contract mapping for
// both the recent-matches list and the in-depth single-match detail.
//
// Split out of ranked-queries.mts so the read views stay cohesive: that module answers
// "how is this player doing", this one answers "what happened in these matches".
//
// Two integrity rules make this server-authoritative rather than a replay of whatever a
// client claimed:
//   - The per-unit final board is exposed ONLY when both members' reports are present
//     and agree (the same dual-attestation that gates per-unit stat crediting). One
//     side's unopposed report is never presented as fact.
//   - Squads shown for a verified match are derived from that cross-attested board, not
//     from either player's self-reported squad column.
//
// Reads are public for FINISHED matches (resolved/voided/disputed) so a future general
// history tab can open a match from another player's list. Live matches are never
// readable here: their row carries the lobby token and seed.

import { buildMatchHistoryEntry } from "./match-history.mjs";
import { normalizeUnitResults, unitReportsAgree } from "./ranked-unit-stats.mjs";

const FINISHED_STATUSES = ["resolved", "voided", "disputed"];

// Human-readable explanations for the anti-cheat/lifecycle flags stamped on a ranked
// match row. Anything not listed here is internal bookkeeping and stays hidden.
const RANKED_FLAG_NOTES: Record<string, string> = {
  same_opponent_damped: "Rating change was reduced — you had already faced this opponent recently.",
  unit_report_conflict: "The two final-board reports did not match, so per-unit records were not credited.",
  report_conflict: "Both players claimed the win, so this match was left unresolved.",
  short_match: "This match ended too early to count toward ranked.",
  forfeit: "Resolved by forfeit — a player left before the match finished.",
  cancelled_before_start: "Cancelled before the match started.",
  stale_active_expired: "Abandoned without a reported result.",
};

const MATCH_HISTORY_COLUMNS = `
  m.match_id, m.game_slug, m.player_a, m.player_b, m.outcome_a, m.status, m.board, m.flags,
  m.rating_a_before, m.rating_b_before, m.rating_a_after, m.rating_b_after,
  m.squad_a, m.squad_b, m.unit_report_a, m.unit_report_b,
  m.created_at, m.resolved_at,
  pa.profile_name as name_a, pb.profile_name as name_b,
  ra.title as title_a, ra.avatar_unit as avatar_unit_a, ra.avatar_skin as avatar_skin_a,
  rb.title as title_b, rb.avatar_unit as avatar_unit_b, rb.avatar_skin as avatar_skin_b`;

const MATCH_HISTORY_JOINS = `
  from ranked_matches m
  left join player_profiles pa on pa.player_id = m.player_a
  left join player_profiles pb on pb.player_id = m.player_b
  left join ranked_profiles ra on ra.player_id = m.player_a and ra.game_slug = m.game_slug
  left join ranked_profiles rb on rb.player_id = m.player_b and rb.game_slug = m.game_slug`;

function parseFlags(flags: any): string[] {
  return String(flags || "").split(",").map((flag) => flag.trim()).filter(Boolean);
}

// `outcome_a` is stored from seat 1's perspective; mirror it for seat 2.
function outcomeForSeat(outcomeA: any, seat: number): string | null {
  if (!outcomeA) return null;
  if (outcomeA === "draw") return "draw";
  if (seat === 1) return outcomeA;
  return outcomeA === "win" ? "loss" : "win";
}

export function rankedMatchNotes(row: any, { verified, rated }: any): any[] {
  const notes = parseFlags(row.flags)
    .filter((flag) => RANKED_FLAG_NOTES[flag])
    .map((flag) => ({ code: flag, text: RANKED_FLAG_NOTES[flag] }));
  if (row.status === "voided" && !notes.length) {
    notes.push({ code: "voided", text: "This match was voided and did not affect ranked." });
  }
  if (row.status === "disputed" && !notes.length) {
    notes.push({ code: "disputed", text: "The two players reported different results, so nothing was applied." });
  }
  // Explain a missing unit breakdown rather than silently showing squads only.
  if (rated && !verified) {
    notes.push({
      code: "board_unverified",
      text: "Both players did not confirm the same final board, so the unit breakdown is unavailable.",
    });
  }
  return notes;
}

// Map one joined ranked_matches row onto the source-agnostic contract input.
export function rankedMatchRecord(row: any, gameSlug: any): any {
  const bothReported = row.unit_report_a != null && row.unit_report_b != null;
  const verified = bothReported && unitReportsAgree(row.unit_report_a, row.unit_report_b);
  const canonical = verified ? normalizeUnitResults(row.unit_report_a) : null;
  const rated = row.status === "resolved" && row.rating_a_after != null;

  return {
    matchId: row.match_id,
    gameSlug: row.game_slug || gameSlug,
    source: "ranked",
    mode: "ranked-1v1",
    status: row.status || "resolved",
    rated,
    board: row.board,
    startedAt: row.created_at,
    endedAt: row.resolved_at,
    turns: canonical?.turns ?? null,
    verified,
    units: canonical
      ? canonical.units.map((unit: any) => ({
        id: unit.id,
        unitType: unit.type,
        seat: unit.seat,
        alive: unit.alive,
        kills: unit.kills,
      }))
      : null,
    participants: [
      {
        playerId: row.player_a,
        seat: 1,
        team: 1,
        outcome: outcomeForSeat(row.outcome_a, 1),
        ratingBefore: row.rating_a_before,
        ratingAfter: row.rating_a_after,
        squad: row.squad_a,
        displayName: row.name_a,
        title: row.title_a,
        avatarUnit: row.avatar_unit_a,
        avatarSkin: row.avatar_skin_a,
      },
      {
        playerId: row.player_b,
        seat: 2,
        team: 2,
        outcome: outcomeForSeat(row.outcome_a, 2),
        ratingBefore: row.rating_b_before,
        ratingAfter: row.rating_b_after,
        squad: row.squad_b,
        displayName: row.name_b,
        title: row.title_b,
        avatarUnit: row.avatar_unit_b,
        avatarSkin: row.avatar_skin_b,
      },
    ],
    notes: rankedMatchNotes(row, { verified, rated }),
  };
}

// Recent resolved ranked matches for a player, each shaped to that player's
// perspective. Public read.
export async function getRankedMatches(pool: any, { playerId, gameSlug, limit }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  const cap = Math.max(1, Math.min(Number(limit) || 10, 50));
  try {
    const res = await pool.query(
      `select ${MATCH_HISTORY_COLUMNS} ${MATCH_HISTORY_JOINS}
        where m.game_slug=$1 and m.status='resolved' and (m.player_a=$2 or m.player_b=$2)
        order by m.resolved_at desc limit $3`,
      [gameSlug, playerId, cap],
    );
    const matches = (res.rows || [])
      .map((row: any) => buildMatchHistoryEntry(rankedMatchRecord(row, gameSlug), { viewerPlayerId: playerId }))
      .filter(Boolean);
    return { playerId, gameSlug, matches };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedMatches error: ${err?.message || err}\n`);
    return null;
  }
}

// One finished ranked match in full, shaped to `viewerPlayerId`'s perspective. The
// perspective must be a member of the match; a caller who is not a member may still
// read it (the list is public too) but gets the neutral, seat-ordered shape.
export async function getRankedMatchDetail(pool: any, { matchId, gameSlug, viewerPlayerId }: any): Promise<any> {
  if (!pool || !matchId || !gameSlug) return null;
  try {
    const res = await pool.query(
      `select ${MATCH_HISTORY_COLUMNS} ${MATCH_HISTORY_JOINS}
        where m.game_slug=$1 and m.match_id=$2 and m.status = any($3::text[])
        limit 1`,
      [gameSlug, matchId, FINISHED_STATUSES],
    );
    const row = res.rows?.[0];
    if (!row) return { error: "match_not_found" };
    const isMember = viewerPlayerId === row.player_a || viewerPlayerId === row.player_b;
    if (viewerPlayerId && !isMember) return { error: "not_a_member" };
    return {
      match: buildMatchHistoryEntry(rankedMatchRecord(row, gameSlug), {
        viewerPlayerId: isMember ? viewerPlayerId : null,
        detail: true,
      }),
    };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedMatchDetail error: ${err?.message || err}\n`);
    return null;
  }
}
