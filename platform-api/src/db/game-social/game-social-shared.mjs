// Shared helpers for the per-game social graph (friends / requests / blocks /
// badges). Split out so each concern module draws slug validation, id cleaning,
// canonical-pair ordering, and row shaping from one source without a cycle.
//
// This module and its siblings must never touch the factory-wide relationship or
// message tables -- see tests/architecture.test.mjs, which enforces it.
//
// Rank tiers come from the shared ranked-elo helper rather than a second threshold
// table, so a friends row and a leaderboard row can never disagree about a tier.
import { rankTier } from "../ranked-elo.mjs";
// Only cabinets that have actually wired up a client belong here. An unknown slug
// is rejected at the db layer as well as the route layer, so a typo or a probe
// can't quietly create a social graph for a game that has none.
export const GAME_SOCIAL_SLUGS = new Set(["tactical-arena"]);
export function isValidGameSocialSlug(slug) {
    return typeof slug === "string" && GAME_SOCIAL_SLUGS.has(slug);
}
export function cleanPlayerId(value) {
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
export function cleanRequestId(value) {
    const id = Math.floor(Number(value));
    return Number.isFinite(id) && id > 0 ? id : null;
}
export function cleanLimit(value, { fallback = 25, max = 100 } = {}) {
    const limit = Math.floor(Number(value));
    if (!Number.isFinite(limit) || limit <= 0)
        return fallback;
    return Math.min(limit, max);
}
// Friendships are stored once per pair, lowest id first, so "are these two
// friends" is a single primary-key lookup instead of an OR across two columns.
export function canonicalPair(playerIdA, playerIdB) {
    const a = cleanPlayerId(playerIdA);
    const b = cleanPlayerId(playerIdB);
    if (!a || !b || a === b)
        return null;
    return a < b ? [a, b] : [b, a];
}
export function serializeFriendRequest(row) {
    if (!row)
        return null;
    return {
        requestId: String(row.id),
        gameSlug: row.game_slug,
        requesterPlayerId: row.requester_player_id,
        recipientPlayerId: row.recipient_player_id,
        status: row.status,
        createdAt: row.created_at,
        respondedAt: row.responded_at || null,
        // Present when the query joined the other player's display fields.
        player: row.other_player_id ? serializePlayerSummary(row) : null,
    };
}
// The display shape every social surface renders: who they are plus their
// Tactical Arena standing. `other_player_id` is the joined counterpart of
// whichever row this is (friend, requester, or search hit).
export function serializePlayerSummary(row) {
    if (!row)
        return null;
    const raw = row.rating == null ? null : Number(row.rating);
    const rating = Number.isFinite(raw) ? raw : null;
    // A player with no rating row for this game has no tier yet — null, not Bronze,
    // so the UI can tell "unranked" apart from "lowest rank".
    const tier = rating == null ? null : rankTier(rating);
    return {
        playerId: row.other_player_id || row.player_id || "",
        displayName: row.profile_name || null,
        tagline: row.title || null,
        avatarUnit: row.avatar_unit || null,
        avatarSkin: row.avatar_skin || null,
        rating,
        tier: tier ? { id: tier.id, label: tier.label } : null,
        wins: Number(row.wins) || 0,
        losses: Number(row.losses) || 0,
        draws: Number(row.draws) || 0,
    };
}
// The select-list + joins every player-summary query shares. `alias` is the table
// carrying the counterpart id, and `idColumn` the column on it.
export function playerSummarySelect(alias, idColumn) {
    return `${alias}.${idColumn} as other_player_id,
          pp.profile_name,
          rp.title, rp.avatar_unit, rp.avatar_skin,
          gr.rating, gr.wins, gr.losses, gr.draws`;
}
export function playerSummaryJoins(alias, idColumn, slugParam) {
    return `left join player_profiles pp on pp.player_id = ${alias}.${idColumn}
          left join ranked_profiles rp on rp.player_id = ${alias}.${idColumn} and rp.game_slug = ${slugParam}
          left join game_ratings   gr on gr.player_id = ${alias}.${idColumn} and gr.game_slug = ${slugParam}`;
}
export function logGameSocialError(operation, err) {
    process.stderr.write(`[game-social] ${operation} error: ${err?.message || err}\n`);
}
