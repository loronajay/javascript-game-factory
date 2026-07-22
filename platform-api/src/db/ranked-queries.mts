// Ranked read views — public cards, me-standing, per-unit stats, match history, and the
// leaderboard. Split out of ranked.mts. These are read-mostly (getRankedStanding also
// lazily expires stale active matches), fold in the cosmetic profile, and never leak
// private fields except the me-standing's own active-match token.

import { DEFAULT_RATING, rankTier } from "./ranked-elo.mjs";
import { serializeMatchForPlayer, expireStaleActiveRankedMatches } from "./ranked-shared.mjs";
import { getRankedProfile } from "./ranked-profile.mjs";

// Shared rating+tier+record read used by both the me-standing and the public card.
async function loadRatingRecord(pool: any, gameSlug: any, playerId: any): Promise<any> {
  const res = await pool.query(
    `select rating, wins, losses, draws, last_match_at from game_ratings where player_id=$1 and game_slug=$2`,
    [playerId, gameSlug],
  );
  const r = res.rows[0] || { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0, last_match_at: null };
  const tier = rankTier(r.rating);
  return {
    rating: r.rating,
    tier: { id: tier.id, label: tier.label },
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    lastMatchAt: r.last_match_at,
  };
}

// Public read: another player's ranked card (rating/tier/record + cosmetic identity).
// Deliberately omits activeMatch/token and anything else private.
export async function getPublicRankedCard(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const record = await loadRatingRecord(pool, gameSlug, playerId);
    const profile = await getRankedProfile(pool, { playerId, gameSlug });
    return {
      playerId,
      gameSlug,
      ...record,
      title: profile?.title || null,
      avatarUnit: profile?.avatarUnit || null,
      avatarSkin: profile?.avatarSkin || null,
    };
  } catch (err: any) {
    process.stderr.write(`[ranked] getPublicRankedCard error: ${err?.message || err}\n`);
    return null;
  }
}

// Read a player's ranked standing (rating + tier + record + cosmetic profile) and
// any live match. This is the me-view: it may include the private active-match token.
export async function getRankedStanding(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const record = await loadRatingRecord(pool, gameSlug, playerId);
    const profile = await getRankedProfile(pool, { playerId, gameSlug });
    await expireStaleActiveRankedMatches(pool, gameSlug);
    const activeRes = await pool.query(
      `select * from ranked_matches
        where game_slug=$1 and (player_a=$2 or player_b=$2) and status in ('active','playing','pending_forfeit')
        order by created_at desc limit 1`,
      [gameSlug, playerId],
    );
    return {
      playerId,
      gameSlug,
      ...record,
      title: profile?.title || null,
      avatarUnit: profile?.avatarUnit || null,
      avatarSkin: profile?.avatarSkin || null,
      activeMatch: activeRes.rows[0] ? serializeMatchForPlayer(activeRes.rows[0], playerId) : null,
    };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedStanding error: ${err?.message || err}\n`);
    return null;
  }
}

// Per-unit ranked record for a player (games/wins/kills/survivals), highest-use first.
// Public read — no private fields involved.
export async function getRankedUnitStats(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const res = await pool.query(
      `select unit_type, games, wins, kills, survivals from ranked_unit_stats
        where player_id=$1 and game_slug=$2
        order by games desc, wins desc, unit_type asc`,
      [playerId, gameSlug],
    );
    return {
      playerId,
      gameSlug,
      units: (res.rows || []).map((r: any) => ({
        unitType: r.unit_type,
        games: r.games,
        wins: r.wins,
        kills: r.kills,
        survivals: r.survivals,
      })),
    };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedUnitStats error: ${err?.message || err}\n`);
    return null;
  }
}

// Recent resolved ranked matches for a player, shaped to that player's perspective
// (my outcome, my rating delta, my/opponent squads). Public read.
export async function getRankedMatches(pool: any, { playerId, gameSlug, limit }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  const cap = Math.max(1, Math.min(Number(limit) || 10, 25));
  try {
    const res = await pool.query(
      `select match_id, player_a, player_b, outcome_a, rating_a_before, rating_b_before,
              rating_a_after, rating_b_after, squad_a, squad_b, resolved_at
         from ranked_matches
        where game_slug=$1 and status='resolved' and (player_a=$2 or player_b=$2)
        order by resolved_at desc limit $3`,
      [gameSlug, playerId, cap],
    );
    const matches = (res.rows || []).map((r: any) => {
      const isA = r.player_a === playerId;
      const outcome = r.outcome_a === "draw"
        ? "draw"
        : (isA ? r.outcome_a : r.outcome_a === "win" ? "loss" : "win");
      const before = isA ? r.rating_a_before : r.rating_b_before;
      const after = isA ? r.rating_a_after : r.rating_b_after;
      return {
        matchId: r.match_id,
        opponentPlayerId: isA ? r.player_b : r.player_a,
        outcome,
        ratingBefore: before,
        ratingAfter: after,
        ratingDelta: (after ?? before) - before,
        mySquad: isA ? r.squad_a : r.squad_b,
        opponentSquad: isA ? r.squad_b : r.squad_a,
        resolvedAt: r.resolved_at,
      };
    });
    return { playerId, gameSlug, matches };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedMatches error: ${err?.message || err}\n`);
    return null;
  }
}

// Top-N ranked ladder for a game, by rating, with each entry's cosmetic identity
// folded in. Public read. Only players with a rating row for this slug appear.
export async function getRankedLeaderboard(pool: any, { gameSlug, limit }: any): Promise<any> {
  if (!pool || !gameSlug) return null;
  const cap = Math.max(1, Math.min(Number(limit) || 25, 100));
  try {
    const res = await pool.query(
      `select r.player_id, r.rating, r.wins, r.losses, r.draws,
              pp.profile_name,
              p.title, p.avatar_unit, p.avatar_skin
         from game_ratings r
         left join player_profiles pp
           on pp.player_id = r.player_id
         left join ranked_profiles p
           on p.player_id = r.player_id and p.game_slug = r.game_slug
        where r.game_slug = $1
        order by r.rating desc, (r.wins - r.losses) desc, r.player_id asc
        limit $2`,
      [gameSlug, cap],
    );
    const entries = (res.rows || []).map((row: any, i: number) => {
      const tier = rankTier(row.rating);
      return {
        rank: i + 1,
        playerId: row.player_id,
        rating: row.rating,
        tier: { id: tier.id, label: tier.label },
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        displayName: row.profile_name || null,
        title: row.title || null,
        avatarUnit: row.avatar_unit || null,
        avatarSkin: row.avatar_skin || null,
      };
    });
    return { gameSlug, entries };
  } catch (err: any) {
    process.stderr.write(`[ranked] getRankedLeaderboard error: ${err?.message || err}\n`);
    return null;
  }
}
