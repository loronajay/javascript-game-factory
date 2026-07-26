// Per-game blocks. A block is directional but its EFFECT is mutual: while one
// exists, neither player can send the other a request (game-friend-requests.mts
// checks both directions).
//
// Blocking tears down the existing relationship in the same transaction that creates
// the block — otherwise a block could land while a friendship row survived, which is
// exactly the state the player was trying to get out of.
//
// Scope note: a block affects friends/social surfaces only. It does not remove the
// player from ranked matchmaking or the ladder.

import {
  canonicalPair,
  cleanPlayerId,
  isValidGameSocialSlug,
  logGameSocialError,
  serializePlayerSummary,
} from "./game-social-shared.mjs";

export async function blockGamePlayer(pool: any, { gameSlug, playerId, otherPlayerId }: any): Promise<any> {
  const blocker = cleanPlayerId(playerId);
  const blocked = cleanPlayerId(otherPlayerId);
  if (!pool || !isValidGameSocialSlug(gameSlug)) return { error: "invalid_game_slug" };
  if (!blocker || !blocked) return { error: "missing_player" };
  if (blocker === blocked) return { error: "cannot_block_self" };

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into game_friend_blocks (game_slug, blocker_player_id, blocked_player_id)
       values ($1, $2, $3) on conflict do nothing`,
      [gameSlug, blocker, blocked],
    );
    // Any pending request either way is resolved, not left dangling.
    await client.query(
      `update game_friend_requests set status = 'declined', responded_at = now()
        where game_slug = $1 and status = 'pending'
          and ((requester_player_id = $2 and recipient_player_id = $3)
            or (requester_player_id = $3 and recipient_player_id = $2))`,
      [gameSlug, blocker, blocked],
    );
    const pair = canonicalPair(blocker, blocked);
    if (pair) {
      await client.query(
        `delete from game_friendships where game_slug = $1 and player_id_a = $2 and player_id_b = $3`,
        [gameSlug, pair[0], pair[1]],
      );
    }
    await client.query("commit");
    return { status: "blocked", playerId: blocked };
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    logGameSocialError("blockGamePlayer", err);
    return null;
  } finally {
    client.release();
  }
}

// Unblocking only removes the block. It does not restore the friendship that
// blocking deleted — getting back to friends means sending a new request.
export async function unblockGamePlayer(pool: any, { gameSlug, playerId, otherPlayerId }: any): Promise<any> {
  const blocker = cleanPlayerId(playerId);
  const blocked = cleanPlayerId(otherPlayerId);
  if (!pool || !isValidGameSocialSlug(gameSlug)) return { error: "invalid_game_slug" };
  if (!blocker || !blocked) return { error: "missing_player" };

  try {
    const res = await pool.query(
      `delete from game_friend_blocks
        where game_slug = $1 and blocker_player_id = $2 and blocked_player_id = $3
        returning game_slug`,
      [gameSlug, blocker, blocked],
    );
    if (!res.rows?.length) return { error: "not_blocked" };
    return { status: "unblocked", playerId: blocked };
  } catch (err: any) {
    logGameSocialError("unblockGamePlayer", err);
    return null;
  }
}

// The players I have blocked (not the ones who blocked me — that list is
// deliberately not readable).
export async function listGameBlocks(pool: any, { gameSlug, playerId }: any): Promise<any> {
  const me = cleanPlayerId(playerId);
  if (!pool || !isValidGameSocialSlug(gameSlug) || !me) return null;

  try {
    const res = await pool.query(
      `select b.blocked_player_id as other_player_id, b.created_at,
              pp.profile_name,
              rp.title, rp.avatar_unit, rp.avatar_skin,
              gr.rating, gr.wins, gr.losses, gr.draws
         from game_friend_blocks b
         left join player_profiles pp on pp.player_id = b.blocked_player_id
         left join ranked_profiles rp on rp.player_id = b.blocked_player_id and rp.game_slug = $1
         left join game_ratings   gr on gr.player_id = b.blocked_player_id and gr.game_slug = $1
        where b.game_slug = $1 and b.blocker_player_id = $2
        order by b.created_at desc
        limit 200`,
      [gameSlug, me],
    );
    return {
      gameSlug,
      playerId: me,
      blocked: (res.rows || []).map((row: any) => ({
        ...serializePlayerSummary(row),
        blockedAt: row.created_at,
      })),
    };
  } catch (err: any) {
    logGameSocialError("listGameBlocks", err);
    return null;
  }
}
