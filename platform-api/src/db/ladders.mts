// Platform ladder reads — cross-game standings and a player's placements.
//
// This is the platform-level counterpart to db/ranked-queries.mts. That one is the
// inside-Tactical-Arena view (folds in ranked cosmetics, lives behind the auth-gated
// /ranked family); this one is public, game-agnostic, and driven entirely by the
// registry in services/ladder-catalog.mts. Which games have ladders is a data question
// here, never a code question.
//
// Both reads share one ordering — rating desc, then win differential, then player_id.
// The player_id tiebreak makes the order total, so `rank()` is stable and identical
// between a board row and the same player's profile placement.
//
// ## Two sources, one contract
//
// A ladder is backed either by game_ratings (head-to-head ELO) or by game_run_records
// (a solo board). They live in different tables with different orderings and different
// units, so each gets its own query — but both produce the same placement shape, which
// is what lets the profile rail render them without knowing which it got. The registry
// decides which branch a ladder takes; nothing here names a game.
//
// The two are merged in JS rather than UNIONed in SQL. A union would have to reconcile
// two genuinely different orderings and two meanings of "rating" inside one statement
// to produce a ranking that is then thrown away — the placements are re-sorted by rank
// afterwards regardless. Two clear queries and a sort is the cheaper honest version.

import { formatLadderRating, getLadder, listLadders, type LadderDefinition } from "../services/ladder-catalog.mjs";
import { boardOrderSql, getBoard } from "../services/leaderboard-catalog.mjs";

const LADDER_ORDER = "r.rating desc, (r.wins - r.losses) desc, r.player_id asc";

function clampLimit(value: unknown, fallback: number, max: number): number {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(limit, max);
}

function cleanPlayerId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

// One placement row: where a player currently sits on one game's ladder.
// A superset of the profile `ladderPlacement` contract (gameSlug/rank/ratingLabel/score),
// so it can flow straight into the profile normalizer without reshaping.
function toPlacement(row: any, ladder: LadderDefinition | null): any {
  const rating = Number(row.rating) || 0;
  return {
    gameSlug: row.game_slug,
    title: ladder?.title || row.game_slug,
    cabinetSlug: ladder?.cabinetSlug || row.game_slug,
    rank: Number(row.placement) || 0,
    totalPlayers: Number(row.total_players) || 0,
    rating,
    score: rating,
    ratingLabel: formatLadderRating(ladder, rating),
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    draws: Number(row.draws) || 0,
    lastMatchAt: row.last_match_at || null,
  };
}

// A run-records placement, shaped exactly like an ELO one. `score` and `rating` both
// carry the raw board value so a generic consumer can sort on them, while `ratingLabel`
// is the only thing meant to be read — a time is 11924 in the column and "11.924s" on
// screen. W/L/D are zero because a solo board has no opponent: a lap time is not a
// record against anybody. Reporting zeros rather than omitting the fields keeps the
// placement contract single-shaped, which is the whole point of merging the sources.
function toRunPlacement(row: any, ladder: LadderDefinition): any {
  const value = Number(row.value) || 0;
  return {
    gameSlug: ladder.gameSlug,
    title: ladder.title,
    cabinetSlug: ladder.cabinetSlug,
    rank: Number(row.placement) || 0,
    totalPlayers: Number(row.total_players) || 0,
    rating: value,
    score: value,
    ratingLabel: formatLadderRating(ladder, value),
    wins: 0,
    losses: 0,
    draws: 0,
    lastMatchAt: row.recorded_at || null,
  };
}

// One player's placement on one run-records ladder, or null if they have no record on
// its board. Each such ladder is one query because each names a different board with
// its own ordering; there are a handful of them, and the alternative is a UNION that
// has to carry the direction as data.
async function runRecordPlacement(pool: any, ladder: LadderDefinition, playerId: string): Promise<any> {
  const board = getBoard(ladder.gameSlug, ladder.boardId);
  if (!board) return null;
  try {
    const res = await pool.query(
      `with standings as (
         select player_id, value, recorded_at,
                rank() over (order by ${boardOrderSql(board)}) as placement,
                count(*) over () as total_players
           from game_run_records
          where game_slug = $1 and board_id = $2
       )
       select * from standings where player_id = $3`,
      [ladder.gameSlug, board.id, playerId],
    );
    return res.rows?.length ? toRunPlacement(res.rows[0], ladder) : null;
  } catch (err: any) {
    process.stderr.write(`[ladders] runRecordPlacement error: ${err?.message || err}\n`);
    return null;
  }
}

// Every ladder a player currently places on, best rank first. Players below a ladder's
// placement-game threshold are absent rather than shown as unranked — an empty result
// is the honest "no standings yet" state the profile rail already renders.
export async function getPlayerLadderPlacements(pool: any, params: any = {}): Promise<any> {
  const playerId = cleanPlayerId(params.playerId);
  const limit = clampLimit(params.limit, 10, 50);
  if (!pool || !playerId) return null;

  const ladders = listLadders();
  if (!ladders.length) return { playerId, placements: [] };

  const ratingLadders = ladders.filter((ladder) => ladder.source === "game-ratings");
  const runLadders = ladders.filter((ladder) => ladder.source === "run-records");

  const runPlacements = (
    await Promise.all(runLadders.map((ladder) => runRecordPlacement(pool, ladder, playerId)))
  ).filter(Boolean);

  if (!ratingLadders.length) {
    return {
      playerId,
      placements: runPlacements.sort((a: any, b: any) => a.rank - b.rank).slice(0, limit),
    };
  }

  try {
    const res = await pool.query(
      `with ladder(game_slug, min_matches) as (
         select * from unnest($2::text[], $3::int[])
       ),
       standings as (
         select r.player_id, r.game_slug, r.rating, r.wins, r.losses, r.draws, r.last_match_at,
                rank() over (partition by r.game_slug order by ${LADDER_ORDER}) as placement,
                count(*) over (partition by r.game_slug) as total_players
           from game_ratings r
           join ladder l on l.game_slug = r.game_slug
          where (r.wins + r.losses + r.draws) >= l.min_matches
       )
       select * from standings
        where player_id = $1
        order by placement asc, game_slug asc
        limit $4`,
      [
        playerId,
        ratingLadders.map((ladder) => ladder.gameSlug),
        ratingLadders.map((ladder) => ladder.minMatches),
        limit,
      ],
    );
    const ratingPlacements = (res.rows || []).map((row: any) => toPlacement(row, getLadder(row.game_slug)));
    // Re-sorted across both sources, then trimmed. The SQL limit above only bounds
    // the ELO half — applying the caller's limit before the merge would let a poor
    // ELO placement crowd out a better run-record one.
    return {
      playerId,
      placements: [...ratingPlacements, ...runPlacements]
        .sort((a: any, b: any) => a.rank - b.rank || String(a.gameSlug).localeCompare(String(b.gameSlug)))
        .slice(0, limit),
    };
  } catch (err: any) {
    process.stderr.write(`[ladders] getPlayerLadderPlacements error: ${err?.message || err}\n`);
    return null;
  }
}

// The run-records half of getLadderStandings. Same entry shape as the ELO half — the
// consumer is the same rail — with the win/loss columns zeroed, since a solo board has
// no opponent to have beaten. `verified` rides along because a run's evidence has not
// necessarily been replayed yet, and a board that silently mixed checked and unchecked
// times would be claiming more than it knows.
async function runLadderStandings(pool: any, ladder: LadderDefinition, limit: number): Promise<any> {
  const board = getBoard(ladder.gameSlug, ladder.boardId);
  if (!board) return null;
  try {
    const res = await pool.query(
      `select r.player_id, r.value, r.model_id, r.verified, r.recorded_at,
              pp.profile_name, pp.avatar_asset_id
         from game_run_records r
         left join player_profiles pp on pp.player_id = r.player_id
        where r.game_slug = $1 and r.board_id = $2
        order by ${boardOrderSql(board)}
        limit $3`,
      [ladder.gameSlug, board.id, limit],
    );
    const entries = (res.rows || []).map((row: any, index: number) => {
      const value = Number(row.value) || 0;
      return {
        rank: index + 1,
        playerId: row.player_id,
        displayName: row.profile_name || "",
        avatarAssetId: row.avatar_asset_id || "",
        rating: value,
        ratingLabel: formatLadderRating(ladder, value),
        modelId: row.model_id || "",
        verified: row.verified === true,
        wins: 0,
        losses: 0,
        draws: 0,
        lastMatchAt: row.recorded_at || null,
      };
    });
    return { ...ladder, entries };
  } catch (err: any) {
    process.stderr.write(`[ladders] runLadderStandings error: ${err?.message || err}\n`);
    return null;
  }
}

// Public top-N board for one registered ladder. Unregistered slugs return null so the
// route can 404 rather than silently serving an empty board for a typo'd slug.
export async function getLadderStandings(pool: any, params: any = {}): Promise<any> {
  const ladder = getLadder(params.gameSlug);
  const limit = clampLimit(params.limit, 25, 100);
  if (!pool || !ladder) return null;

  if (ladder.source === "run-records") return runLadderStandings(pool, ladder, limit);

  try {
    const res = await pool.query(
      `select r.player_id, r.rating, r.wins, r.losses, r.draws, r.last_match_at,
              pp.profile_name, pp.avatar_asset_id
         from game_ratings r
         left join player_profiles pp on pp.player_id = r.player_id
        where r.game_slug = $1
          and (r.wins + r.losses + r.draws) >= $2
        order by ${LADDER_ORDER}
        limit $3`,
      [ladder.gameSlug, ladder.minMatches, limit],
    );
    const entries = (res.rows || []).map((row: any, index: number) => {
      const rating = Number(row.rating) || 0;
      return {
        rank: index + 1,
        playerId: row.player_id,
        displayName: row.profile_name || "",
        avatarAssetId: row.avatar_asset_id || "",
        rating,
        ratingLabel: formatLadderRating(ladder, rating),
        wins: Number(row.wins) || 0,
        losses: Number(row.losses) || 0,
        draws: Number(row.draws) || 0,
        lastMatchAt: row.last_match_at || null,
      };
    });
    return { ...ladder, entries };
  } catch (err: any) {
    process.stderr.write(`[ladders] getLadderStandings error: ${err?.message || err}\n`);
    return null;
  }
}
