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
import { formatLadderRating, getLadder, listLadders } from "../services/ladder-catalog.mjs";
const LADDER_ORDER = "r.rating desc, (r.wins - r.losses) desc, r.player_id asc";
function clampLimit(value, fallback, max) {
    const limit = Math.floor(Number(value));
    if (!Number.isFinite(limit) || limit <= 0)
        return fallback;
    return Math.min(limit, max);
}
function cleanPlayerId(value) {
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
// One placement row: where a player currently sits on one game's ladder.
// A superset of the profile `ladderPlacement` contract (gameSlug/rank/ratingLabel/score),
// so it can flow straight into the profile normalizer without reshaping.
function toPlacement(row, ladder) {
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
// Every ladder a player currently places on, best rank first. Players below a ladder's
// placement-game threshold are absent rather than shown as unranked — an empty result
// is the honest "no standings yet" state the profile rail already renders.
export async function getPlayerLadderPlacements(pool, params = {}) {
    const playerId = cleanPlayerId(params.playerId);
    const limit = clampLimit(params.limit, 10, 50);
    if (!pool || !playerId)
        return null;
    const ladders = listLadders();
    if (!ladders.length)
        return { playerId, placements: [] };
    try {
        const res = await pool.query(`with ladder(game_slug, min_matches) as (
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
        limit $4`, [
            playerId,
            ladders.map((ladder) => ladder.gameSlug),
            ladders.map((ladder) => ladder.minMatches),
            limit,
        ]);
        return {
            playerId,
            placements: (res.rows || []).map((row) => toPlacement(row, getLadder(row.game_slug))),
        };
    }
    catch (err) {
        process.stderr.write(`[ladders] getPlayerLadderPlacements error: ${err?.message || err}\n`);
        return null;
    }
}
// Public top-N board for one registered ladder. Unregistered slugs return null so the
// route can 404 rather than silently serving an empty board for a typo'd slug.
export async function getLadderStandings(pool, params = {}) {
    const ladder = getLadder(params.gameSlug);
    const limit = clampLimit(params.limit, 25, 100);
    if (!pool || !ladder)
        return null;
    try {
        const res = await pool.query(`select r.player_id, r.rating, r.wins, r.losses, r.draws, r.last_match_at,
              pp.profile_name, pp.avatar_asset_id
         from game_ratings r
         left join player_profiles pp on pp.player_id = r.player_id
        where r.game_slug = $1
          and (r.wins + r.losses + r.draws) >= $2
        order by ${LADDER_ORDER}
        limit $3`, [ladder.gameSlug, ladder.minMatches, limit]);
        const entries = (res.rows || []).map((row, index) => {
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
    }
    catch (err) {
        process.stderr.write(`[ladders] getLadderStandings error: ${err?.message || err}\n`);
        return null;
    }
}
