// Per-game friend requests: send, accept, decline, cancel, list.
//
// Accepting is the only path that creates a friendship row, and it does both writes
// in one transaction — a request can never end up accepted without the friendship
// existing. Blocks are checked inside that same transaction rather than beforehand,
// so a block landing mid-flight still wins.
import { canonicalPair, cleanPlayerId, cleanRequestId, isValidGameSocialSlug, logGameSocialError, playerSummaryJoins, playerSummarySelect, serializeFriendRequest, } from "./game-social-shared.mjs";
async function pairIsBlocked(client, gameSlug, a, b) {
    const res = await client.query(`select 1 from game_friend_blocks
      where game_slug = $1
        and ((blocker_player_id = $2 and blocked_player_id = $3)
          or (blocker_player_id = $3 and blocked_player_id = $2))
      limit 1`, [gameSlug, a, b]);
    return (res.rows || []).length > 0;
}
async function alreadyFriends(client, gameSlug, a, b) {
    const pair = canonicalPair(a, b);
    if (!pair)
        return false;
    const res = await client.query(`select 1 from game_friendships where game_slug = $1 and player_id_a = $2 and player_id_b = $3 limit 1`, [gameSlug, pair[0], pair[1]]);
    return (res.rows || []).length > 0;
}
// Send a request. Returns `{ error }` for every refusable case so the route can map
// it to a status code, and `{ status: "auto_accepted" }` when the recipient already
// had a pending request out to the sender — two people clicking Add at the same time
// plainly means yes, and leaving both requests pending would strand them.
export async function sendGameFriendRequest(pool, { gameSlug, requesterPlayerId, recipientPlayerId }) {
    const requester = cleanPlayerId(requesterPlayerId);
    const recipient = cleanPlayerId(recipientPlayerId);
    if (!pool || !isValidGameSocialSlug(gameSlug))
        return { error: "invalid_game_slug" };
    if (!requester || !recipient)
        return { error: "missing_player" };
    if (requester === recipient)
        return { error: "cannot_friend_self" };
    const client = await pool.connect();
    try {
        await client.query("begin");
        if (await pairIsBlocked(client, gameSlug, requester, recipient)) {
            await client.query("commit");
            return { error: "blocked" };
        }
        if (await alreadyFriends(client, gameSlug, requester, recipient)) {
            await client.query("commit");
            return { error: "already_friends" };
        }
        // An inbound pending request from the recipient turns this into an accept.
        const inbound = await client.query(`select id from game_friend_requests
        where game_slug = $1 and requester_player_id = $2 and recipient_player_id = $3 and status = 'pending'
        for update`, [gameSlug, recipient, requester]);
        if (inbound.rows?.length) {
            await client.query(`update game_friend_requests set status = 'accepted', responded_at = now() where id = $1`, [inbound.rows[0].id]);
            const pair = canonicalPair(requester, recipient);
            await client.query(`insert into game_friendships (game_slug, player_id_a, player_id_b)
         values ($1, $2, $3) on conflict do nothing`, [gameSlug, pair[0], pair[1]]);
            await client.query("commit");
            return { status: "auto_accepted", requestId: String(inbound.rows[0].id) };
        }
        const existing = await client.query(`select id from game_friend_requests
        where game_slug = $1 and requester_player_id = $2 and recipient_player_id = $3 and status = 'pending'
        limit 1`, [gameSlug, requester, recipient]);
        if (existing.rows?.length) {
            await client.query("commit");
            return { status: "pending", requestId: String(existing.rows[0].id) };
        }
        const inserted = await client.query(`insert into game_friend_requests (game_slug, requester_player_id, recipient_player_id, status)
       values ($1, $2, $3, 'pending')
       returning id`, [gameSlug, requester, recipient]);
        await client.query("commit");
        return { status: "pending", requestId: String(inserted.rows[0].id) };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        logGameSocialError("sendGameFriendRequest", err);
        return null;
    }
    finally {
        client.release();
    }
}
// Accept or decline a request. Only the RECIPIENT may do either; the requester's
// equivalent is cancelGameFriendRequest below.
export async function respondToGameFriendRequest(pool, { gameSlug, requestId, playerId, action }) {
    const responder = cleanPlayerId(playerId);
    const id = cleanRequestId(requestId);
    if (!pool || !isValidGameSocialSlug(gameSlug))
        return { error: "invalid_game_slug" };
    if (!responder || !id)
        return { error: "missing_request" };
    if (action !== "accept" && action !== "decline")
        return { error: "invalid_action" };
    const client = await pool.connect();
    try {
        await client.query("begin");
        const res = await client.query(`select * from game_friend_requests where id = $1 and game_slug = $2 for update`, [id, gameSlug]);
        const row = res.rows?.[0];
        if (!row) {
            await client.query("commit");
            return { error: "request_not_found" };
        }
        if (row.recipient_player_id !== responder) {
            await client.query("commit");
            return { error: "not_recipient" };
        }
        if (row.status !== "pending") {
            await client.query("commit");
            return { error: "request_not_pending" };
        }
        if (action === "decline") {
            await client.query(`update game_friend_requests set status = 'declined', responded_at = now() where id = $1`, [id]);
            await client.query("commit");
            return { status: "declined", requestId: String(id) };
        }
        if (await pairIsBlocked(client, gameSlug, row.requester_player_id, responder)) {
            await client.query("commit");
            return { error: "blocked" };
        }
        await client.query(`update game_friend_requests set status = 'accepted', responded_at = now() where id = $1`, [id]);
        const pair = canonicalPair(row.requester_player_id, responder);
        if (pair) {
            await client.query(`insert into game_friendships (game_slug, player_id_a, player_id_b)
         values ($1, $2, $3) on conflict do nothing`, [gameSlug, pair[0], pair[1]]);
        }
        await client.query("commit");
        return { status: "accepted", requestId: String(id), friendPlayerId: row.requester_player_id };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        logGameSocialError("respondToGameFriendRequest", err);
        return null;
    }
    finally {
        client.release();
    }
}
// Withdraw your own outstanding request.
export async function cancelGameFriendRequest(pool, { gameSlug, requestId, playerId }) {
    const requester = cleanPlayerId(playerId);
    const id = cleanRequestId(requestId);
    if (!pool || !isValidGameSocialSlug(gameSlug))
        return { error: "invalid_game_slug" };
    if (!requester || !id)
        return { error: "missing_request" };
    try {
        const res = await pool.query(`update game_friend_requests
          set status = 'canceled', responded_at = now()
        where id = $1 and game_slug = $2 and requester_player_id = $3 and status = 'pending'
        returning id`, [id, gameSlug, requester]);
        if (!res.rows?.length)
            return { error: "request_not_found" };
        return { status: "canceled", requestId: String(id) };
    }
    catch (err) {
        logGameSocialError("cancelGameFriendRequest", err);
        return null;
    }
}
// Both directions of a player's outstanding requests, each carrying the other
// player's display summary so the panel renders without a second round trip.
export async function listGameFriendRequests(pool, { gameSlug, playerId }) {
    const me = cleanPlayerId(playerId);
    if (!pool || !isValidGameSocialSlug(gameSlug) || !me)
        return null;
    try {
        const incoming = await pool.query(`select r.*, ${playerSummarySelect("r", "requester_player_id")}
         from game_friend_requests r
         ${playerSummaryJoins("r", "requester_player_id", "$1")}
        where r.game_slug = $1 and r.recipient_player_id = $2 and r.status = 'pending'
        order by r.created_at desc
        limit 100`, [gameSlug, me]);
        const outgoing = await pool.query(`select r.*, ${playerSummarySelect("r", "recipient_player_id")}
         from game_friend_requests r
         ${playerSummaryJoins("r", "recipient_player_id", "$1")}
        where r.game_slug = $1 and r.requester_player_id = $2 and r.status = 'pending'
        order by r.created_at desc
        limit 100`, [gameSlug, me]);
        return {
            gameSlug,
            playerId: me,
            incoming: (incoming.rows || []).map(serializeFriendRequest).filter(Boolean),
            outgoing: (outgoing.rows || []).map(serializeFriendRequest).filter(Boolean),
        };
    }
    catch (err) {
        logGameSocialError("listGameFriendRequests", err);
        return null;
    }
}
