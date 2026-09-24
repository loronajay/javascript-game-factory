// Atomic ticket settlement for cabinet results (POST /games/:slug/results).
//
// The shape follows db/achievements' submitAchievementRun, the reference
// settlement: normalize before touching the database, then one transaction
// that deduplicates the result, evaluates the payout, credits the ledger and
// stores the verdict beside the result. A retry of the same result id returns
// the STORED verdict — never a re-evaluation, so a rule change cannot pay an
// old result twice and a retry that changed its claim changes nothing.
//
// ## The time-budget fence
//
// A result is a claim from a browser (see each game's normalizer for its
// evidence standing). The fence bounds what a forger can mint: a new result
// may not claim more play time than has passed since the player's previous
// result in ANY cabinet on this path. Honest play always passes — a match
// cannot end sooner after the last one ended than it lasted — while a script
// posting results back to back earns nothing past the first. A fenced result
// is still stored, at zero, so it cannot be retried later once time has
// passed. The slack absorbs clock and network skew between the two requests.

import { normalizeGameResult } from "../services/game-result-catalog.mjs";
import { evaluateTicketReward, type TicketRewardBreakdown } from "../services/ticket-reward-catalog.mjs";
import { awardTicketsInTransaction, getTicketWalletInTransaction } from "./tickets.mjs";

const FENCE_RATIO = 0.9;
const FENCE_SLACK_MS = 10_000;

function storedBreakdown(value: unknown): TicketRewardBreakdown & { fence?: string } {
  const source: any = value && typeof value === "object" ? value : {};
  const repeatable: any = source.repeatable && typeof source.repeatable === "object" ? source.repeatable : { total: 0 };
  return {
    ...source,
    repeatable: { ...repeatable, total: Math.max(0, Number(repeatable.total) || 0) },
    achievements: Array.isArray(source.achievements) ? source.achievements : [],
    achievementTotal: Math.max(0, Number(source.achievementTotal) || 0),
    total: Math.max(0, Number(source.total) || 0),
  };
}

function presentTickets(awarded: number, balance: number | null, reward: TicketRewardBreakdown) {
  return {
    awarded,
    balance,
    repeatable: reward.repeatable.total,
    achievements: reward.achievementTotal,
    breakdown: reward,
  };
}

export function fitsTimeBudget(elapsedMs: number, claimedMs: number): boolean {
  return elapsedMs >= claimedMs * FENCE_RATIO - FENCE_SLACK_MS;
}

export async function submitGameResult(pool: any, params: any = {}): Promise<any> {
  const playerId = typeof params.playerId === "string" ? params.playerId.trim() : "";
  const gameSlug = typeof params.gameSlug === "string" ? params.gameSlug.trim().toLowerCase() : "";
  if (!playerId) return { error: "invalid_player" };

  const normalized = normalizeGameResult(gameSlug, params.result);
  if (normalized.error !== undefined) return { error: normalized.error };
  const result = normalized.result;
  const { resultId, durationMs } = result;

  const client = await pool.connect();
  try {
    await client.query("begin");
    // Per PLAYER, not per game: the time-budget fence spans every cabinet on
    // this path, so two concurrent submissions must see each other.
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`game-results:${playerId}`]);

    const prior = await client.query(
      `select ticket_awarded, ticket_breakdown
       from game_ticket_results
       where player_id = $1 and game_slug = $2 and result_id = $3`,
      [playerId, gameSlug, resultId],
    );
    if (prior.rows?.length) {
      const reward = storedBreakdown(prior.rows[0].ticket_breakdown);
      const awarded = Math.max(0, Number(prior.rows[0].ticket_awarded) || 0);
      const wallet = await getTicketWalletInTransaction(client, playerId);
      await client.query("commit");
      return { resultId, tickets: { ...presentTickets(awarded, wallet?.balance ?? null, reward), replayed: true } };
    }

    const last = await client.query(
      `select extract(epoch from (now() - submitted_at)) * 1000 as elapsed_ms
       from game_ticket_results
       where player_id = $1
       order by submitted_at desc
       limit 1`,
      [playerId],
    );
    const elapsedMs = last.rows?.length ? Number(last.rows[0].elapsed_ms) : Number.POSITIVE_INFINITY;

    let reward: TicketRewardBreakdown & { fence?: string };
    if (fitsTimeBudget(elapsedMs, durationMs)) {
      reward = evaluateTicketReward(gameSlug, { result });
    } else {
      reward = { repeatable: { total: 0 }, achievements: [], achievementTotal: 0, total: 0, fence: "time_budget" };
    }
    const awarded = reward.total;
    if (awarded > 0) {
      await awardTicketsInTransaction(client, {
        playerId,
        transactionKey: `game-result:${gameSlug}:${resultId}`,
        amount: awarded,
        reason: "game_result",
        metadata: { gameSlug, resultId, reward },
      });
    }
    await client.query(
      `insert into game_ticket_results
         (player_id, game_slug, result_id, result, duration_ms, ticket_awarded, ticket_breakdown, submitted_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, now())
       on conflict (player_id, game_slug, result_id) do nothing`,
      [playerId, gameSlug, resultId, JSON.stringify(result), durationMs, awarded, JSON.stringify(reward)],
    );
    const wallet = await getTicketWalletInTransaction(client, playerId);
    await client.query("commit");
    return { resultId, tickets: presentTickets(awarded, wallet?.balance ?? null, reward) };
  } catch (err) {
    try { await client.query("rollback"); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}
