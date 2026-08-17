import { awardMatchXp } from "./game-xp.mjs";

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;

function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function computeNewRatings(ratingA: number, ratingB: number, outcomeA: number) {
  // outcomeA: 1 = win, 0 = loss, 0.5 = draw
  const eA = eloExpected(ratingA, ratingB);
  const eB = eloExpected(ratingB, ratingA);
  const outcomeB = 1 - outcomeA;
  return {
    newRatingA: Math.max(100, Math.round(ratingA + K_FACTOR * (outcomeA - eA))),
    newRatingB: Math.max(100, Math.round(ratingB + K_FACTOR * (outcomeB - eB))),
  };
}

// The progression half of a reported match, inside the rating transaction.
//
// Two guarantees are load-bearing here. It awards the REPORTER only — XP is
// earned per player from their own bowler, unlike an ELO update which settles
// both sides at once. And it never fails the caller: a progression error must
// not roll back a rating, because a lost level is recoverable from a re-report
// and a lost rating is not.
async function awardProgression(client: any, { reporterPlayerId, gameSlug, sessionId, outcome, progression }: any): Promise<any> {
  if (!progression || typeof progression !== "object") return null;
  try {
    // What the first reporter of this session stamped, so a disputed mode can be
    // clamped to the lesser payout rather than taken on this reporter's word.
    const stamped = await client.query(
      `select mode_id from game_rating_sessions where session_id = $1 and game_slug = $2`,
      [sessionId, gameSlug],
    );
    return await awardMatchXp(client, {
      playerId: reporterPlayerId,
      gameSlug,
      // The rating session id IS the grant id: a rematch is a new session and so
      // automatically a new grant, and a reconnect is neither.
      grantId: sessionId,
      trackId: progression.trackId,
      modeId: progression.modeId,
      attestedModeId: stamped.rows[0]?.mode_id ?? null,
      outcome,
      performance: progression.performance,
      forfeitRole: progression.forfeitRole ?? null,
      stats: progression.stats,
      source: "online-match",
    });
  } catch (err) {
    process.stderr.write(`[ratings] progression award error: ${(err as any)?.message || err}\n`);
    return { awarded: false, reason: "award-failed" };
  }
}

export async function getGameRating(pool: any, playerId: any, gameSlug: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const result = await pool.query(
      `select player_id, game_slug, rating, wins, losses, draws, last_match_at
       from game_ratings where player_id = $1 and game_slug = $2`,
      [playerId, gameSlug],
    );
    if (!result.rows.length) return { playerId, gameSlug, rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0, lastMatchAt: null };
    const row = result.rows[0];
    return {
      playerId:    row.player_id,
      gameSlug:    row.game_slug,
      rating:      row.rating,
      wins:        row.wins,
      losses:      row.losses,
      draws:       row.draws,
      lastMatchAt: row.last_match_at,
    };
  } catch {
    return null;
  }
}

// Updates ELO for both players atomically.
// Returns null if session was already processed (dedup) or on DB error.
// outcome: 'win' | 'loss' | 'draw' — from the perspective of reporterPlayerId.
export async function recordMatchRating(pool: any, { reporterPlayerId, opponentPlayerId, gameSlug, outcome, sessionId, occurredAt, progression, ranked = true }: any): Promise<any> {
  if (!pool || !reporterPlayerId || !opponentPlayerId || !gameSlug || !sessionId) return null;
  if (reporterPlayerId === opponentPlayerId) return null;

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Session dedup — only the first reporter processes the ELO update, because
    // one transaction settles BOTH players' ratings. XP is not like that: each
    // player earns their own and files their own report, so the progression
    // award below runs for every reporter and dedups on its own per-player key.
    // That also means the FIRST reporter decides the stakes. Both clients read
    // `ranked` off the same authoritative match snapshot so they cannot honestly
    // disagree, and if they somehow do, the casual claim is the one that sticks —
    // the safe direction, since it costs nobody a rating.
    const dedup = await client.query(
      `insert into game_rating_sessions (session_id, game_slug, mode_id) values ($1, $2, $3)
       on conflict (session_id, game_slug) do nothing`,
      [sessionId, gameSlug, progression?.modeId ?? null],
    );
    if (dedup.rowCount === 0) {
      // The rating is settled, but this reporter may still be owed their XP.
      // Committing rather than rolling back is what makes the second player's
      // progression land; with no progression block nothing was written and the
      // commit is a no-op.
      const settled = await awardProgression(client, {
        reporterPlayerId, gameSlug, sessionId, outcome, progression,
      });
      await client.query("commit");
      return { ok: true, alreadyProcessed: true, ranked: ranked !== false, progression: settled };
    }

    // A casual match: the session is stamped and the reporter's XP is awarded,
    // but no rating moves and no win/loss is written. The dedup row is still
    // claimed above, because the session id is the XP grant id and the mode
    // stamp both players are clamped against — a casual result is a real result,
    // it just is not a competitive one.
    if (ranked === false) {
      const settled = await awardProgression(client, {
        reporterPlayerId, gameSlug, sessionId, outcome, progression,
      });
      await client.query("commit");
      return { ok: true, ranked: false, progression: settled };
    }

    const now = occurredAt || new Date().toISOString();

    // Fetch both current ratings (default 1200 if new)
    const [rowA, rowB] = await Promise.all([
      client.query(`select rating, wins, losses, draws from game_ratings where player_id=$1 and game_slug=$2`, [reporterPlayerId, gameSlug]),
      client.query(`select rating, wins, losses, draws from game_ratings where player_id=$1 and game_slug=$2`, [opponentPlayerId, gameSlug]),
    ]);

    const rA = rowA.rows[0] ?? { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0 };
    const rB = rowB.rows[0] ?? { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0 };

    const outcomeScore = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
    const { newRatingA, newRatingB } = computeNewRatings(rA.rating, rB.rating, outcomeScore);

    const winsA    = rA.wins    + (outcome === "win"  ? 1 : 0);
    const lossesA  = rA.losses  + (outcome === "loss" ? 1 : 0);
    const drawsA   = rA.draws   + (outcome === "draw" ? 1 : 0);
    const winsB    = rB.wins    + (outcome === "loss" ? 1 : 0);
    const lossesB  = rB.losses  + (outcome === "win"  ? 1 : 0);
    const drawsB   = rB.draws   + (outcome === "draw" ? 1 : 0);

    const upsert = `
      insert into game_ratings (player_id, game_slug, rating, peak_rating, wins, losses, draws, last_match_at)
      values ($1, $2, $3, $3, $4, $5, $6, $7)
      on conflict (player_id, game_slug) do update
        set rating = excluded.rating,
            -- Running max: the ladder badges qualify on the peak, so it must never fall.
            peak_rating = greatest(coalesce(game_ratings.peak_rating, 0), excluded.rating),
            wins = excluded.wins,
            losses = excluded.losses,
            draws = excluded.draws,
            last_match_at = excluded.last_match_at
    `;
    await client.query(upsert, [reporterPlayerId, gameSlug, newRatingA, winsA, lossesA, drawsA, now]);
    await client.query(upsert, [opponentPlayerId, gameSlug, newRatingB, winsB, lossesB, drawsB, now]);

    const granted = await awardProgression(client, {
      reporterPlayerId, gameSlug, sessionId, outcome, progression,
    });

    await client.query("commit");
    return {
      ok: true,
      ranked: true,
      reporter: { playerId: reporterPlayerId, oldRating: rA.rating, newRating: newRatingA },
      opponent: { playerId: opponentPlayerId, oldRating: rB.rating, newRating: newRatingB },
      progression: granted,
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ratings] recordMatchRating error: ${(err as any)?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}
