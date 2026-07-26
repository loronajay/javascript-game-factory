// Auto-awarded badges: the server-known facts that qualify a player, and the write that
// freezes a qualification into game_player_badges.
//
// Split out of game-badges.mts so that module stays a read/serialize path. Everything
// here reads tables the player cannot write directly (ranked results, campaign
// completion), so a qualification can never be claimed by a tampered client.
//
// Why freeze at all, rather than derive on every read: a derived badge is recomputed
// from current state, so any fact that can be undone would silently revoke it.
// game_campaign_progress rows are deleted by the in-game Reset Progress action, so
// "completed the campaign" only works as a one-time award.
import { autoAwardableGameBadges } from "../../services/game-badge-catalog.mjs";
import { logGameSocialError } from "./game-social-shared.mjs";
// The mission whose completion means "finished the campaign". Per game, because only the
// game knows which of its missions is last (tactical-arena: src/campaign/campaignConstants.js).
const CAMPAIGN_FINALE_MISSION_ID = Object.freeze({
    "tactical-arena": "the-final-battle",
});
// What the server knows about a player that a badge rule may qualify on. Read-only, and
// deliberately narrow — add a fact here rather than letting a badge rule run its own SQL.
export async function loadPlayerBadgeFacts(pool, { gameSlug, playerId }) {
    const finaleMissionId = CAMPAIGN_FINALE_MISSION_ID[gameSlug] || "";
    const [ranked, campaign] = await Promise.all([
        // A game_ratings row exists only once a ranked match has RESOLVED, so this means
        // "played ranked", not "queued for it".
        pool.query(`select 1 from game_ratings where player_id = $1 and game_slug = $2 limit 1`, [playerId, gameSlug]),
        finaleMissionId
            ? pool.query(`select 1 from game_campaign_progress
          where player_id = $1 and game_slug = $2 and mission_id = $3 and completed_at is not null
          limit 1`, [playerId, gameSlug, finaleMissionId])
            : Promise.resolve({ rows: [] }),
    ]);
    return {
        playedRanked: (ranked.rows || []).length > 0,
        campaignComplete: (campaign.rows || []).length > 0,
    };
}
/**
 * Write any badge the player now qualifies for and does not already hold, and return the
 * ids actually inserted. Idempotent (`on conflict do nothing`) and best-effort: a failure
 * here must not fail the badge read that triggered it, so the caller just renders what
 * was already stored and the next read tries again.
 */
export async function syncAutoAwardedBadges(pool, { gameSlug, playerId, heldBadgeIds }) {
    try {
        const held = heldBadgeIds instanceof Set ? heldBadgeIds : new Set(heldBadgeIds || []);
        const facts = await loadPlayerBadgeFacts(pool, { gameSlug, playerId });
        const pending = autoAwardableGameBadges(gameSlug, facts).filter((badge) => !held.has(badge.id));
        if (!pending.length)
            return [];
        const awarded = [];
        for (const badge of pending) {
            // "auto" distinguishes a server-qualified award from one a trusted path granted
            // by hand (awardGameBadge, which defaults to "award").
            const source = "auto";
            const res = await pool.query(`insert into game_player_badges (player_id, game_slug, badge_id, source)
         values ($1, $2, $3, $4) on conflict do nothing
         returning badge_id`, [playerId, gameSlug, badge.id, source]);
            if ((res.rows || []).length)
                awarded.push(badge.id);
        }
        return awarded;
    }
    catch (err) {
        logGameSocialError("syncAutoAwardedBadges", err);
        return [];
    }
}
