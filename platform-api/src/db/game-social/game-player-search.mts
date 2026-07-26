// Player discovery for a game's friends surface.
//
// Deliberately scoped to players who have actually PLAYED this game (they have a
// game_ratings row for the slug) rather than every account on the platform — a
// Tactical Arena friends list should surface people you can play Tactical Arena
// with, and each hit arrives with the standing the UI wants to show anyway.
//
// Every hit carries its relationship to the viewer (`friend` / `request-sent` /
// `request-received` / `none`) so the search row can render the right action button
// without a second round trip. Blocked pairs are filtered out in both directions.

import {
  cleanLimit,
  cleanPlayerId,
  isValidGameSocialSlug,
  logGameSocialError,
  serializePlayerSummary,
} from "./game-social-shared.mjs";

function cleanQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

// Escape LIKE wildcards so a query of "100%" searches for that text rather than
// matching everything.
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export async function searchGamePlayers(pool: any, { gameSlug, viewerPlayerId, query, limit }: any): Promise<any> {
  const viewer = cleanPlayerId(viewerPlayerId);
  const search = cleanQuery(query);
  if (!pool || !isValidGameSocialSlug(gameSlug) || !viewer) return null;
  if (!search) return { gameSlug, query: "", results: [] };

  const cap = cleanLimit(limit, { fallback: 25, max: 50 });

  try {
    const res = await pool.query(
      `select gr.player_id as other_player_id,
              pp.profile_name,
              rp.title, rp.avatar_unit, rp.avatar_skin,
              gr.rating, gr.wins, gr.losses, gr.draws,
              exists (
                select 1 from game_friendships f
                 where f.game_slug = $1
                   and f.player_id_a = least($2, gr.player_id)
                   and f.player_id_b = greatest($2, gr.player_id)
              ) as is_friend,
              (
                select r.id from game_friend_requests r
                 where r.game_slug = $1 and r.status = 'pending'
                   and r.requester_player_id = $2 and r.recipient_player_id = gr.player_id
                 limit 1
              ) as outgoing_request_id,
              (
                select r.id from game_friend_requests r
                 where r.game_slug = $1 and r.status = 'pending'
                   and r.requester_player_id = gr.player_id and r.recipient_player_id = $2
                 limit 1
              ) as incoming_request_id
         from game_ratings gr
         left join player_profiles pp on pp.player_id = gr.player_id
         left join ranked_profiles rp on rp.player_id = gr.player_id and rp.game_slug = $1
        where gr.game_slug = $1
          and gr.player_id <> $2
          and (pp.profile_name ilike $3 escape '\\' or rp.title ilike $3 escape '\\' or gr.player_id = $4)
          and not exists (
            select 1 from game_friend_blocks b
             where b.game_slug = $1
               and ((b.blocker_player_id = $2 and b.blocked_player_id = gr.player_id)
                 or (b.blocker_player_id = gr.player_id and b.blocked_player_id = $2))
          )
        order by gr.rating desc nulls last, pp.profile_name asc nulls last, gr.player_id asc
        limit $5`,
      [gameSlug, viewer, likePattern(search), search, cap],
    );

    return {
      gameSlug,
      query: search,
      results: (res.rows || []).map((row: any) => ({
        ...serializePlayerSummary(row),
        relationship: relationshipFor(row),
        requestId: row.outgoing_request_id
          ? String(row.outgoing_request_id)
          : (row.incoming_request_id ? String(row.incoming_request_id) : null),
      })),
    };
  } catch (err: any) {
    logGameSocialError("searchGamePlayers", err);
    return null;
  }
}

function relationshipFor(row: any): string {
  if (row.is_friend) return "friend";
  if (row.outgoing_request_id) return "request-sent";
  if (row.incoming_request_id) return "request-received";
  return "none";
}

// The viewer's relationship to one specific player. The profile viewer opens on a
// single player, so it asks this instead of searching.
export async function getGamePlayerRelationship(pool: any, { gameSlug, viewerPlayerId, playerId }: any): Promise<any> {
  const viewer = cleanPlayerId(viewerPlayerId);
  const target = cleanPlayerId(playerId);
  if (!pool || !isValidGameSocialSlug(gameSlug) || !viewer || !target) return null;
  if (viewer === target) return { gameSlug, playerId: target, relationship: "self", requestId: null, blocked: false };

  try {
    const res = await pool.query(
      `select
         exists (
           select 1 from game_friendships f
            where f.game_slug = $1
              and f.player_id_a = least($2, $3) and f.player_id_b = greatest($2, $3)
         ) as is_friend,
         (
           select r.id from game_friend_requests r
            where r.game_slug = $1 and r.status = 'pending'
              and r.requester_player_id = $2 and r.recipient_player_id = $3 limit 1
         ) as outgoing_request_id,
         (
           select r.id from game_friend_requests r
            where r.game_slug = $1 and r.status = 'pending'
              and r.requester_player_id = $3 and r.recipient_player_id = $2 limit 1
         ) as incoming_request_id,
         exists (
           select 1 from game_friend_blocks b
            where b.game_slug = $1 and b.blocker_player_id = $2 and b.blocked_player_id = $3
         ) as i_blocked_them,
         exists (
           select 1 from game_friend_blocks b
            where b.game_slug = $1 and b.blocker_player_id = $3 and b.blocked_player_id = $2
         ) as they_blocked_me`,
      [gameSlug, viewer, target],
    );
    const row = res.rows?.[0] || {};
    const blocked = Boolean(row.i_blocked_them) || Boolean(row.they_blocked_me);
    return {
      gameSlug,
      playerId: target,
      relationship: blocked ? "blocked" : relationshipFor(row),
      requestId: row.outgoing_request_id
        ? String(row.outgoing_request_id)
        : (row.incoming_request_id ? String(row.incoming_request_id) : null),
      blocked,
      // Only the viewer's own block is actionable (they can undo it); being blocked
      // by someone else is reported as a plain block with nothing to undo.
      blockedByMe: Boolean(row.i_blocked_them),
    };
  } catch (err: any) {
    logGameSocialError("getGamePlayerRelationship", err);
    return null;
  }
}
