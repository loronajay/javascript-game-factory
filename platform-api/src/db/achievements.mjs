// Player achievements: the collection rows (migration 048) and the two
// operations on them — submit a run, read a player's collection.
//
// What an achievement IS lives in services/achievement-catalog; this module
// owns the rows. Same split as game-loadouts / run-records.
//
// ## Submission
//
//   1. The game's `normalizeRun` validates the body (or the whole request is
//      refused — nothing is written for an implausible run).
//   2. If this run_id was already recorded for the player, the stored verdict
//      is returned as-is: a retried request hears the same unlock list and
//      nothing is re-evaluated. This is what keeps a client-side toast from
//      replaying and any downstream fan-out from firing twice.
//   3. Otherwise the detector runs against the player's current collection,
//      the new ids are inserted with `on conflict do nothing`, and ONLY ids
//      whose insert returned a row are reported as newly unlocked. Two tabs
//      finishing at once cannot both be told they earned the same thing.
//
// The run summary itself is never stored (see the migration note).
import { evaluateAchievementRun, getAchievementGame, listAchievementGames, presentAchievement, } from "../services/achievement-catalog.mjs";
import { evaluateTicketReward } from "../services/ticket-reward-catalog.mjs";
import { awardTicketsInTransaction, getTicketWalletInTransaction } from "./tickets.mjs";
function cleanText(value, maxLength = 120) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function toIso(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value.toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
async function readOwned(pool, playerId, gameSlug) {
    const res = await pool.query(`select achievement_id, unlocked_at from player_achievements where player_id = $1 and game_slug = $2`, [playerId, gameSlug]);
    return new Map((res.rows || []).map((row) => [row.achievement_id, toIso(row.unlocked_at) || ""]));
}
function summarize(game, owned) {
    const achievements = game.definitions.map((definition) => presentAchievement(definition, owned.get(definition.id) || null));
    return {
        gameSlug: game.gameSlug,
        title: game.title,
        unlocked: achievements.filter((entry) => entry.unlocked).length,
        total: achievements.length,
        achievements,
    };
}
function storedBreakdown(value) {
    const source = value && typeof value === "object" ? value : {};
    const repeatable = source.repeatable && typeof source.repeatable === "object" ? source.repeatable : { total: 0 };
    const achievements = Array.isArray(source.achievements) ? source.achievements : [];
    return {
        repeatable: { ...repeatable, total: Math.max(0, Number(repeatable.total) || 0) },
        achievements,
        achievementTotal: Math.max(0, Number(source.achievementTotal) || 0),
        total: Math.max(0, Number(source.total) || 0),
    };
}
/**
 * Submits one run. Returns `{ unlocked, owned, progress }` where `unlocked`
 * are the definitions this submission earned (masked never — the player just
 * earned them), `owned` is every id now held, and `progress` the per-game
 * count. `{ error }` for a refused body; null for a failed write.
 */
export async function submitAchievementRun(pool, params = {}) {
    const gameSlug = cleanText(params.gameSlug, 60).toLowerCase();
    const playerId = cleanText(params.playerId, 120);
    const game = getAchievementGame(gameSlug);
    if (!pool || !playerId || !game)
        return null;
    const normalized = game.normalizeRun(params.run);
    if (!normalized.ok)
        return { error: normalized.error };
    const run = normalized.run;
    const runId = cleanText(run.runId, 80);
    const client = await pool.connect();
    try {
        await client.query("begin");
        // Serialize concurrent submissions for the same player+game: two runs
        // finishing at once (two tabs, a retry racing its original) must not both
        // evaluate against the same pre-state and both claim a cumulative unlock.
        await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`achievements:${playerId}:${gameSlug}`]);
        const prior = await client.query(`select unlocked_ids, ticket_awarded, ticket_breakdown from game_achievement_runs where player_id = $1 and game_slug = $2 and run_id = $3`, [playerId, gameSlug, runId]);
        const owned = await readOwned(client, playerId, gameSlug);
        let unlockedIds;
        let reward;
        let ticketAwarded;
        if (prior.rows?.length) {
            // Retry: replay the recorded verdict, evaluate nothing.
            unlockedIds = Array.isArray(prior.rows[0].unlocked_ids) ? prior.rows[0].unlocked_ids.filter((id) => typeof id === "string") : [];
            reward = storedBreakdown(prior.rows[0].ticket_breakdown);
            ticketAwarded = Math.max(0, Number(prior.rows[0].ticket_awarded) || 0);
        }
        else {
            const earned = evaluateAchievementRun(game, run, owned.keys());
            unlockedIds = [];
            for (const id of earned) {
                const inserted = await client.query(`insert into player_achievements (player_id, game_slug, achievement_id, run_id, unlocked_at)
           values ($1, $2, $3, $4, now())
           on conflict (player_id, game_slug, achievement_id) do nothing
           returning unlocked_at`, [playerId, gameSlug, id, runId]);
                if (inserted.rows?.length) {
                    unlockedIds.push(id);
                    owned.set(id, toIso(inserted.rows[0].unlocked_at) || new Date().toISOString());
                }
            }
            reward = evaluateTicketReward(gameSlug, { run, unlockedIds });
            ticketAwarded = reward.total;
            if (ticketAwarded > 0) {
                await awardTicketsInTransaction(client, {
                    playerId,
                    transactionKey: `achievement-run:${gameSlug}:${runId}`,
                    amount: ticketAwarded,
                    reason: "game_result",
                    metadata: { gameSlug, runId, reward },
                });
            }
            await client.query(`insert into game_achievement_runs
           (player_id, game_slug, run_id, unlocked_ids, ticket_awarded, ticket_breakdown, submitted_at)
         values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, now())
         on conflict (player_id, game_slug, run_id) do nothing`, [playerId, gameSlug, runId, JSON.stringify(unlockedIds), ticketAwarded, JSON.stringify(reward)]);
        }
        const wallet = await getTicketWalletInTransaction(client, playerId);
        await client.query("commit");
        const unlocked = unlockedIds
            .map((id) => game.definitions.find((definition) => definition.id === id))
            .filter(Boolean)
            .map((definition) => presentAchievement(definition, owned.get(definition.id) || new Date().toISOString()));
        const summary = summarize(game, owned);
        return {
            runId,
            unlocked,
            owned: [...owned.keys()],
            progress: { gameSlug: game.gameSlug, title: game.title, unlocked: summary.unlocked, total: summary.total },
            tickets: {
                awarded: ticketAwarded,
                balance: wallet?.balance ?? null,
                repeatable: reward.repeatable.total,
                achievements: reward.achievementTotal,
                breakdown: reward,
            },
        };
    }
    catch (err) {
        try {
            await client.query("rollback");
        }
        catch { /* connection already gone */ }
        process.stderr.write(`[achievements] submitAchievementRun error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
}
/**
 * A player's collection: every registered game, its definitions (secrets
 * masked while locked) and the player's unlock dates. Public — a trophy case
 * is for showing. `gameSlug` narrows to one game.
 */
export async function getPlayerAchievements(pool, params = {}) {
    const playerId = cleanText(params.playerId, 120);
    const onlySlug = cleanText(params.gameSlug, 60).toLowerCase();
    if (!pool || !playerId)
        return null;
    if (onlySlug && !getAchievementGame(onlySlug))
        return null;
    try {
        const res = await pool.query(onlySlug
            ? `select game_slug, achievement_id, unlocked_at from player_achievements where player_id = $1 and game_slug = $2`
            : `select game_slug, achievement_id, unlocked_at from player_achievements where player_id = $1`, onlySlug ? [playerId, onlySlug] : [playerId]);
        const ownedByGame = new Map();
        for (const row of res.rows || []) {
            if (!ownedByGame.has(row.game_slug))
                ownedByGame.set(row.game_slug, new Map());
            ownedByGame.get(row.game_slug).set(row.achievement_id, toIso(row.unlocked_at) || "");
        }
        const games = listAchievementGames()
            .filter((entry) => !onlySlug || entry.gameSlug === onlySlug)
            .map((entry) => summarize(getAchievementGame(entry.gameSlug), ownedByGame.get(entry.gameSlug) || new Map()));
        return {
            playerId,
            unlocked: games.reduce((sum, game) => sum + game.unlocked, 0),
            total: games.reduce((sum, game) => sum + game.total, 0),
            games,
        };
    }
    catch (err) {
        process.stderr.write(`[achievements] getPlayerAchievements error: ${err?.message || err}\n`);
        return null;
    }
}
