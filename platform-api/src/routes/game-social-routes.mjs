import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isValidGameSocialSlug } from "../db/game-social.mjs";
// Per-game social graph: friends, requests, blocks, discovery, and profile badges.
// Every route is game-scoped and requires a signed-in account; the acting player is
// always the token's playerId, never a body field.
//
//   GET    /games/:slug/social/friends                    my friends list
//   DELETE /games/:slug/social/friends/:playerId          remove a friend
//   GET    /games/:slug/social/requests                   my pending requests (both ways)
//   POST   /games/:slug/social/requests                   send { recipientPlayerId }
//   POST   /games/:slug/social/requests/:id/accept        accept (recipient only)
//   POST   /games/:slug/social/requests/:id/decline       decline (recipient only)
//   DELETE /games/:slug/social/requests/:id               cancel my own pending request
//   GET    /games/:slug/social/blocks                     players I have blocked
//   POST   /games/:slug/social/blocks/:playerId           block
//   DELETE /games/:slug/social/blocks/:playerId           unblock
//   GET    /games/:slug/social/search?q=                  find players of this game
//   GET    /games/:slug/social/relationship/:playerId     my relationship to one player
//   GET    /games/:slug/social/badges/:playerId           a player's earned badges
const ROUTES = Object.freeze([
    ["friends", /^\/games\/([^/]+)\/social\/friends$/],
    ["friend", /^\/games\/([^/]+)\/social\/friends\/([^/]+)$/],
    ["requests", /^\/games\/([^/]+)\/social\/requests$/],
    ["requestAccept", /^\/games\/([^/]+)\/social\/requests\/([^/]+)\/accept$/],
    ["requestDecline", /^\/games\/([^/]+)\/social\/requests\/([^/]+)\/decline$/],
    ["request", /^\/games\/([^/]+)\/social\/requests\/([^/]+)$/],
    ["blocks", /^\/games\/([^/]+)\/social\/blocks$/],
    ["block", /^\/games\/([^/]+)\/social\/blocks\/([^/]+)$/],
    ["search", /^\/games\/([^/]+)\/social\/search$/],
    ["relationship", /^\/games\/([^/]+)\/social\/relationship\/([^/]+)$/],
    ["badges", /^\/games\/([^/]+)\/social\/badges\/([^/]+)$/],
]);
// Refusals the db layer can return, mapped to the status the client should see.
const ERROR_STATUS = Object.freeze({
    invalid_game_slug: 400,
    missing_player: 400,
    missing_request: 400,
    missing_badge: 400,
    invalid_action: 400,
    cannot_friend_self: 400,
    cannot_block_self: 400,
    badge_not_awardable: 400,
    already_friends: 409,
    request_not_pending: 409,
    blocked: 403,
    not_recipient: 403,
    request_not_found: 404,
    not_friends: 404,
    not_blocked: 404,
});
function matchRoute(pathname) {
    for (const [name, pattern] of ROUTES) {
        const match = pathname.match(pattern);
        if (match)
            return { name, params: match.slice(1).map((value) => decodeURIComponent(value)) };
    }
    return null;
}
export async function handleGameSocialRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const route = matchRoute(pathname);
    if (!route)
        return false;
    const gameSlug = route.params[0];
    if (!isValidGameSocialSlug(gameSlug)) {
        writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
        return true;
    }
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    const playerId = authClaims.playerId;
    const fail = (error, fallbackStatus = 500) => {
        writeJson(res, ERROR_STATUS[error] || fallbackStatus, { status: "error", error, timestamp }, requestOrigin);
        return true;
    };
    // The db layer returns null only for an unexpected failure (it has already logged
    // the cause); a refusal comes back as { error }.
    const send = (result, unavailableError, payloadKey) => {
        if (!result)
            return fail(unavailableError);
        if (result.error)
            return fail(result.error);
        writeJson(res, 200, payloadKey ? { [payloadKey]: result } : result, requestOrigin);
        return true;
    };
    const { name, params } = route;
    if (name === "friends" && method === "GET") {
        return send(await services.listGameFriends(gameSlug, { playerId }), "friends_unavailable", "friends");
    }
    if (name === "friend" && method === "DELETE") {
        return send(await services.removeGameFriend(gameSlug, { playerId, otherPlayerId: params[1] }), "remove_failed", "");
    }
    if (name === "requests" && method === "GET") {
        return send(await services.listGameFriendRequests(gameSlug, { playerId }), "requests_unavailable", "requests");
    }
    if (name === "requests" && method === "POST") {
        const body = await readJsonBody(req);
        if (!body.ok)
            return fail(body.error || "invalid_body", 400);
        const recipientPlayerId = body.value?.recipientPlayerId;
        if (typeof recipientPlayerId !== "string" || !recipientPlayerId.trim())
            return fail("missing_player", 400);
        return send(await services.sendGameFriendRequest(gameSlug, { requesterPlayerId: playerId, recipientPlayerId }), "request_failed", "");
    }
    if ((name === "requestAccept" || name === "requestDecline") && method === "POST") {
        const action = name === "requestAccept" ? "accept" : "decline";
        return send(await services.respondToGameFriendRequest(gameSlug, { requestId: params[1], playerId, action }), "respond_failed", "");
    }
    if (name === "request" && method === "DELETE") {
        return send(await services.cancelGameFriendRequest(gameSlug, { requestId: params[1], playerId }), "cancel_failed", "");
    }
    if (name === "blocks" && method === "GET") {
        return send(await services.listGameBlocks(gameSlug, { playerId }), "blocks_unavailable", "blocks");
    }
    if (name === "block" && method === "POST") {
        return send(await services.blockGamePlayer(gameSlug, { playerId, otherPlayerId: params[1] }), "block_failed", "");
    }
    if (name === "block" && method === "DELETE") {
        return send(await services.unblockGamePlayer(gameSlug, { playerId, otherPlayerId: params[1] }), "unblock_failed", "");
    }
    if (name === "search" && method === "GET") {
        const url = new URL(req.url || "/", "http://localhost");
        const result = await services.searchGamePlayers(gameSlug, {
            viewerPlayerId: playerId,
            query: url.searchParams.get("q") || "",
            limit: url.searchParams.get("limit"),
        });
        return send(result, "search_unavailable", "search");
    }
    if (name === "relationship" && method === "GET") {
        return send(await services.getGamePlayerRelationship(gameSlug, { viewerPlayerId: playerId, playerId: params[1] }), "relationship_unavailable", "relationship");
    }
    if (name === "badges" && method === "GET") {
        return send(await services.getGamePlayerBadges(gameSlug, { playerId: params[1] }), "badges_unavailable", "badges");
    }
    return false;
}
