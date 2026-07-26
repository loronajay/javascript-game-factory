// Per-game profile badges: read a player's earned set, and (for trusted server
// paths only) award an awardable one.
//
// Reading merges two sources — badges DERIVED from owned entitlements, computed here
// and never stored, and badges explicitly AWARDED into game_player_badges. See
// services/game-badge-catalog.mts for why the split exists.
import { cleanPlayerId, isValidGameSocialSlug, logGameSocialError, } from "./game-social-shared.mjs";
import { derivedBadgesForEntitlements, findGameBadge, isAwardableGameBadge, serializeBadge, } from "../../services/game-badge-catalog.mjs";
// Public read. Derived badges come first; within each group the catalog's order wins,
// so a profile's badge row is stable rather than dependent on purchase timing.
export async function getGamePlayerBadges(pool, { gameSlug, playerId }) {
    const target = cleanPlayerId(playerId);
    if (!pool || !isValidGameSocialSlug(gameSlug) || !target)
        return null;
    try {
        const [entitlements, awarded] = await Promise.all([
            pool.query(`select entitlement_id from game_entitlements where player_id = $1 and game_slug = $2`, [target, gameSlug]),
            pool.query(`select badge_id, source, awarded_at from game_player_badges where player_id = $1 and game_slug = $2`, [target, gameSlug]),
        ]);
        const derived = derivedBadgesForEntitlements(gameSlug, (entitlements.rows || []).map((row) => row.entitlement_id));
        const seen = new Set(derived.map((badge) => badge.badgeId));
        const explicit = (awarded.rows || [])
            .map((row) => {
            const badge = findGameBadge(gameSlug, row.badge_id);
            // A row whose badge left the catalog is skipped rather than rendered blank.
            if (!badge || seen.has(badge.id))
                return null;
            seen.add(badge.id);
            return serializeBadge(badge, { earnedAt: row.awarded_at, source: row.source });
        })
            .filter(Boolean);
        return { gameSlug, playerId: target, badges: [...derived, ...explicit] };
    }
    catch (err) {
        logGameSocialError("getGamePlayerBadges", err);
        return null;
    }
}
// Grant an awardable badge. Trusted server paths only — there is no public route to
// this, and a derived badge id is refused outright so the entitlement stays the only
// thing that can earn one.
export async function awardGameBadge(pool, { gameSlug, playerId, badgeId, source = "award" }) {
    const target = cleanPlayerId(playerId);
    const id = typeof badgeId === "string" ? badgeId.trim().slice(0, 120) : "";
    if (!pool || !isValidGameSocialSlug(gameSlug))
        return { error: "invalid_game_slug" };
    if (!target || !id)
        return { error: "missing_badge" };
    if (!isAwardableGameBadge(gameSlug, id))
        return { error: "badge_not_awardable" };
    try {
        await pool.query(`insert into game_player_badges (player_id, game_slug, badge_id, source)
       values ($1, $2, $3, $4) on conflict do nothing`, [target, gameSlug, id, String(source || "award").slice(0, 60)]);
        return { status: "awarded", badgeId: id, playerId: target };
    }
    catch (err) {
        logGameSocialError("awardGameBadge", err);
        return null;
    }
}
