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
export async function recordMatchRating(pool: any, { reporterPlayerId, opponentPlayerId, gameSlug, outcome, sessionId, occurredAt }: any): Promise<any> {
  if (!pool || !reporterPlayerId || !opponentPlayerId || !gameSlug || !sessionId) return null;
  if (reporterPlayerId === opponentPlayerId) return null;

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Session dedup — only the first reporter processes the ELO update
    const dedup = await client.query(
      `insert into game_rating_sessions (session_id, game_slug) values ($1, $2)
       on conflict (session_id, game_slug) do nothing`,
      [sessionId, gameSlug],
    );
    if (dedup.rowCount === 0) {
      await client.query("rollback");
      return { ok: true, alreadyProcessed: true };
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
      insert into game_ratings (player_id, game_slug, rating, wins, losses, draws, last_match_at)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (player_id, game_slug) do update
        set rating = excluded.rating,
            wins = excluded.wins,
            losses = excluded.losses,
            draws = excluded.draws,
            last_match_at = excluded.last_match_at
    `;
    await client.query(upsert, [reporterPlayerId, gameSlug, newRatingA, winsA, lossesA, drawsA, now]);
    await client.query(upsert, [opponentPlayerId, gameSlug, newRatingB, winsB, lossesB, drawsB, now]);

    await client.query("commit");
    return {
      ok: true,
      reporter: { playerId: reporterPlayerId, oldRating: rA.rating, newRating: newRatingA },
      opponent: { playerId: opponentPlayerId, oldRating: rB.rating, newRating: newRatingB },
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ratings] recordMatchRating error: ${(err as any)?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}
