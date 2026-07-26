// Per-game friendships: list and remove. Rows are only ever CREATED by the accept
// path in game-friend-requests.mts, so there is no add here — a friendship without a
// request behind it should be impossible.
import { canonicalPair, cleanPlayerId, isValidGameSocialSlug, logGameSocialError, serializePlayerSummary, } from "./game-social-shared.mjs";
// A friendship row stores the pair sorted, so listing "my friends" means reading the
// other column depending on which side I am. The union below does that in one query
// and joins each friend's display + Tactical Arena standing fields.
export async function listGameFriends(pool, { gameSlug, playerId }) {
    const me = cleanPlayerId(playerId);
    if (!pool || !isValidGameSocialSlug(gameSlug) || !me)
        return null;
    try {
        const res = await pool.query(`with my_friends as (
         select player_id_b as other_player_id, created_at
           from game_friendships where game_slug = $1 and player_id_a = $2
         union all
         select player_id_a as other_player_id, created_at
           from game_friendships where game_slug = $1 and player_id_b = $2
       )
       select f.other_player_id, f.created_at,
              pp.profile_name,
              rp.title, rp.avatar_unit, rp.avatar_skin,
              gr.rating, gr.wins, gr.losses, gr.draws
         from my_friends f
         left join player_profiles pp on pp.player_id = f.other_player_id
         left join ranked_profiles rp on rp.player_id = f.other_player_id and rp.game_slug = $1
         left join game_ratings   gr on gr.player_id = f.other_player_id and gr.game_slug = $1
        order by gr.rating desc nulls last, pp.profile_name asc nulls last, f.other_player_id asc
        limit 500`, [gameSlug, me]);
        return {
            gameSlug,
            playerId: me,
            friends: (res.rows || []).map((row) => ({
                ...serializePlayerSummary(row),
                friendsSince: row.created_at,
            })),
        };
    }
    catch (err) {
        logGameSocialError("listGameFriends", err);
        return null;
    }
}
// Hard delete — v1 keeps no friendship history. Removing is symmetric: either side
// deletes the single shared row.
export async function removeGameFriend(pool, { gameSlug, playerId, otherPlayerId }) {
    if (!pool || !isValidGameSocialSlug(gameSlug))
        return { error: "invalid_game_slug" };
    const pair = canonicalPair(playerId, otherPlayerId);
    if (!pair)
        return { error: "missing_player" };
    try {
        const res = await pool.query(`delete from game_friendships
        where game_slug = $1 and player_id_a = $2 and player_id_b = $3
        returning game_slug`, [gameSlug, pair[0], pair[1]]);
        if (!res.rows?.length)
            return { error: "not_friends" };
        return { status: "removed", playerId: cleanPlayerId(otherPlayerId) };
    }
    catch (err) {
        logGameSocialError("removeGameFriend", err);
        return null;
    }
}
// Whether two players are friends in this game. Used by any future feature that
// needs friendship as a precondition (game-scoped DMs, for one).
export async function areGameFriends(pool, { gameSlug, playerId, otherPlayerId }) {
    if (!pool || !isValidGameSocialSlug(gameSlug))
        return false;
    const pair = canonicalPair(playerId, otherPlayerId);
    if (!pair)
        return false;
    try {
        const res = await pool.query(`select 1 from game_friendships where game_slug = $1 and player_id_a = $2 and player_id_b = $3 limit 1`, [gameSlug, pair[0], pair[1]]);
        return (res.rows || []).length > 0;
    }
    catch (err) {
        logGameSocialError("areGameFriends", err);
        return false;
    }
}
