import { randomBytes, randomUUID } from "node:crypto";

import {
  DEFAULT_RATING,
  RANKED_BOARD,
  SAME_OPPONENT_WINDOW_HOURS,
  banFirstIndex,
  computeRankedRatings,
  decideForfeitFinalize,
  decideReport,
  outcomeScoreA,
  provisionalK,
  rankTier,
  ratingWindow,
  sameOpponentGainFactor,
} from "./ranked-elo.mjs";

// Same slug shape as the rest of the game-scoped routes.
export function isValidRankedSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9-]{1,60}$/.test(slug);
}

function appendFlag(existing, flag) {
  if (!flag) return existing || null;
  const set = new Set(String(existing || "").split(",").map((s) => s.trim()).filter(Boolean));
  set.add(flag);
  return Array.from(set).join(",");
}

// Shape a match row for one player's client. Never leaks anything the player
// shouldn't derive; the token is the shared secret both members legitimately hold.
export function serializeMatchForPlayer(row, playerId) {
  if (!row) return null;
  const isA = row.player_a === playerId;
  return {
    matchId: row.match_id,
    gameSlug: row.game_slug,
    board: row.board,
    seed: row.seed,
    token: row.token,
    status: row.status,
    seat: isA ? 1 : 2,
    bansFirst: row.ban_first === playerId,
    lobbyCode: row.lobby_code || null,
    opponentPlayerId: isA ? row.player_b : row.player_a,
    myRatingBefore: isA ? row.rating_a_before : row.rating_b_before,
    opponentRatingBefore: isA ? row.rating_b_before : row.rating_a_before,
    outcome: resolvedOutcomeForPlayer(row, playerId),
  };
}

function resolvedOutcomeForPlayer(row, playerId) {
  if (!row.outcome_a) return null;
  const isA = row.player_a === playerId;
  if (row.outcome_a === "draw") return "draw";
  const aWon = row.outcome_a === "win";
  return (isA ? aWon : !aWon) ? "win" : "loss";
}

async function loadRating(client, gameSlug, playerId) {
  const res = await client.query(
    `select rating, wins, losses, draws from game_ratings where player_id = $1 and game_slug = $2`,
    [playerId, gameSlug],
  );
  const row = res.rows[0];
  const rating = row ? row.rating : DEFAULT_RATING;
  const games = row ? (row.wins || 0) + (row.losses || 0) + (row.draws || 0) : 0;
  return { rating, games };
}

// Find a compatible waiting opponent and broker a match, or return null. Also
// upserts the caller into the queue as matched when a pairing is made.
async function tryPair(client, { playerId, gameSlug, rating }) {
  const candidates = await client.query(
    `select player_id, rating,
            extract(epoch from (now() - enqueued_at)) as wait_seconds
       from ranked_queue
      where game_slug = $1 and status = 'waiting' and player_id <> $2
      order by enqueued_at asc
      for update skip locked`,
    [gameSlug, playerId],
  );

  let opponent = null;
  for (const cand of candidates.rows) {
    const window = Math.max(ratingWindow(cand.wait_seconds), ratingWindow(0));
    if (Math.abs((cand.rating || DEFAULT_RATING) - rating) <= window) {
      opponent = cand;
      break;
    }
  }
  if (!opponent) return null;

  const matchId = randomUUID();
  const seed = randomUUID();
  const token = randomBytes(16).toString("hex");
  const playerA = opponent.player_id;
  const playerB = playerId;
  const ratingA = opponent.rating ?? DEFAULT_RATING;
  const ratingB = rating;
  const banFirst = banFirstIndex(seed) === 0 ? playerA : playerB;

  await client.query(
    `insert into ranked_matches
       (match_id, game_slug, player_a, player_b, rating_a_before, rating_b_before, board, seed, token, ban_first, status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active', now())`,
    [matchId, gameSlug, playerA, playerB, ratingA, ratingB, RANKED_BOARD, seed, token, banFirst],
  );
  await client.query(
    `update ranked_queue set status='matched', match_id=$1 where game_slug=$2 and player_id = $3`,
    [matchId, gameSlug, playerA],
  );
  await client.query(
    `insert into ranked_queue (player_id, game_slug, rating, status, match_id, enqueued_at)
     values ($1,$2,$3,'matched',$4, now())
     on conflict (player_id, game_slug) do update set status='matched', match_id=excluded.match_id, rating=excluded.rating`,
    [playerB, gameSlug, ratingB, matchId],
  );

  return {
    match_id: matchId,
    game_slug: gameSlug,
    player_a: playerA,
    player_b: playerB,
    rating_a_before: ratingA,
    rating_b_before: ratingB,
    board: RANKED_BOARD,
    seed,
    token,
    ban_first: banFirst,
    status: "active",
  };
}

// Enqueue for ranked. Rating is always read server-side — the client never gets to
// declare its own rating for matchmaking.
export async function enqueueRanked(pool, { playerId, gameSlug }) {
  if (!pool || !playerId || !gameSlug) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rating } = await loadRating(client, gameSlug, playerId);

    // If the player already holds an unresolved match, hand it back instead of queueing.
    const active = await client.query(
      `select * from ranked_matches
        where game_slug = $1 and (player_a = $2 or player_b = $2)
          and status in ('active','pending_forfeit')
        order by created_at desc limit 1`,
      [gameSlug, playerId],
    );
    if (active.rows[0]) {
      await client.query("commit");
      return { status: "matched", match: serializeMatchForPlayer(active.rows[0], playerId) };
    }

    const paired = await tryPair(client, { playerId, gameSlug, rating });
    if (paired) {
      await client.query("commit");
      return { status: "matched", match: serializeMatchForPlayer(paired, playerId) };
    }

    await client.query(
      `insert into ranked_queue (player_id, game_slug, rating, status, match_id, enqueued_at)
       values ($1,$2,$3,'waiting', null, now())
       on conflict (player_id, game_slug) do update
         set status='waiting', match_id=null, rating=excluded.rating,
             enqueued_at = case when ranked_queue.status='waiting' then ranked_queue.enqueued_at else now() end`,
      [playerId, gameSlug, rating],
    );
    await client.query("commit");
    return { status: "waiting" };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] enqueueRanked error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

// Poll the queue: finalize any lapsed forfeits, hand back a brokered match if one
// exists, otherwise re-attempt pairing (the caller's window has grown while waiting).
export async function pollRanked(pool, { playerId, gameSlug }) {
  if (!pool || !playerId || !gameSlug) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await finalizeForfeits(client, gameSlug);

    const active = await client.query(
      `select * from ranked_matches
        where game_slug = $1 and (player_a = $2 or player_b = $2)
          and status in ('active','pending_forfeit')
        order by created_at desc limit 1`,
      [gameSlug, playerId],
    );
    if (active.rows[0]) {
      await client.query("commit");
      return { status: "matched", match: serializeMatchForPlayer(active.rows[0], playerId) };
    }

    const queued = await client.query(
      `select status, extract(epoch from (now() - enqueued_at)) as wait_seconds
         from ranked_queue where player_id = $1 and game_slug = $2`,
      [playerId, gameSlug],
    );
    const row = queued.rows[0];
    if (!row || row.status === "cancelled") {
      await client.query("commit");
      return { status: "idle" };
    }

    const { rating } = await loadRating(client, gameSlug, playerId);
    const paired = await tryPair(client, { playerId, gameSlug, rating });
    if (paired) {
      await client.query("commit");
      return { status: "matched", match: serializeMatchForPlayer(paired, playerId) };
    }
    await client.query("commit");
    return { status: "waiting", waitSeconds: Math.round(row.wait_seconds || 0) };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] pollRanked error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

export async function cancelRanked(pool, { playerId, gameSlug }) {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    await pool.query(
      `update ranked_queue set status='cancelled', match_id=null
        where player_id=$1 and game_slug=$2 and status='waiting'`,
      [playerId, gameSlug],
    );
    return { ok: true };
  } catch (err) {
    process.stderr.write(`[ranked] cancelRanked error: ${err?.message || err}\n`);
    return null;
  }
}

async function countPriorMeetings(client, gameSlug, playerA, playerB) {
  const res = await client.query(
    `select count(*)::int as n from ranked_matches
      where game_slug = $1 and status = 'resolved'
        and resolved_at > now() - ($2 || ' hours')::interval
        and ((player_a = $3 and player_b = $4) or (player_a = $4 and player_b = $3))`,
    [gameSlug, String(SAME_OPPONENT_WINDOW_HOURS), playerA, playerB],
  );
  return res.rows[0]?.n || 0;
}

// Applies ELO for a resolved match to game_ratings (the shared ratings table) and
// stamps the ranked_matches row. Provisional K + same-opponent gain damping happen
// here via the pure helpers.
async function applyResolution(client, { row, gameSlug, outcomeA, report, extraFlags }) {
  const a = await loadRating(client, gameSlug, row.player_a);
  const b = await loadRating(client, gameSlug, row.player_b);
  const priorMeetings = await countPriorMeetings(client, gameSlug, row.player_a, row.player_b);
  const gainFactor = sameOpponentGainFactor(priorMeetings);

  const score = outcomeScoreA(outcomeA);
  const { newRatingA, newRatingB } = computeRankedRatings({
    ratingA: a.rating,
    ratingB: b.rating,
    outcomeA: score,
    kA: provisionalK(a.games),
    kB: provisionalK(b.games),
    gainFactorA: gainFactor,
    gainFactorB: gainFactor,
  });

  const aWin = outcomeA === "win" ? 1 : 0;
  const aLoss = outcomeA === "loss" ? 1 : 0;
  const aDraw = outcomeA === "draw" ? 1 : 0;

  const upsert = `
    insert into game_ratings (player_id, game_slug, rating, wins, losses, draws, last_match_at)
    values ($1,$2,$3,$4,$5,$6, now())
    on conflict (player_id, game_slug) do update
      set rating = excluded.rating,
          wins = game_ratings.wins + excluded.wins,
          losses = game_ratings.losses + excluded.losses,
          draws = game_ratings.draws + excluded.draws,
          last_match_at = excluded.last_match_at`;
  await client.query(upsert, [row.player_a, gameSlug, newRatingA, aWin, aLoss, aDraw]);
  await client.query(upsert, [row.player_b, gameSlug, newRatingB, aLoss, aWin, aDraw]);

  let flags = row.flags || null;
  if (gainFactor < 1) flags = appendFlag(flags, "same_opponent_damped");
  if (extraFlags) flags = appendFlag(flags, extraFlags);

  await client.query(
    `update ranked_matches
        set status='resolved', outcome_a=$1, rating_a_after=$2, rating_b_after=$3,
            report_a=$4, report_b=$5, flags=$6, resolved_at=now()
      where match_id=$7 and game_slug=$8`,
    [
      outcomeA,
      newRatingA,
      newRatingB,
      report?.side === "a" ? report.outcome : row.report_a,
      report?.side === "b" ? report.outcome : row.report_b,
      flags,
      row.match_id,
      gameSlug,
    ],
  );

  return {
    ok: true,
    status: "resolved",
    outcomeA,
    ratingA: { playerId: row.player_a, before: a.rating, after: newRatingA },
    ratingB: { playerId: row.player_b, before: b.rating, after: newRatingB },
  };
}

// Resolve any pending_forfeit matches whose grace window has lapsed. Lazy (called
// on poll/report) so no cron is required.
export async function finalizeForfeits(client, gameSlug) {
  const pending = await client.query(
    `select * from ranked_matches
       where game_slug = $1 and status = 'pending_forfeit' and forfeit_deadline <= now()
       for update skip locked`,
    [gameSlug],
  );
  for (const row of pending.rows) {
    const decision = decideForfeitFinalize({
      reportA: row.report_a,
      reportB: row.report_b,
      forfeitDeadline: row.forfeit_deadline,
    });
    if (decision.action === "resolve") {
      await applyResolution(client, { row, gameSlug, outcomeA: decision.outcomeA, report: null, extraFlags: "forfeit" });
    }
  }
}

// Record a member's attestation of the match result and resolve when the trust
// rules allow. This is the endpoint that replaces sumorai's blind self-report.
export async function reportRankedResult(pool, { matchId, gameSlug, reporterPlayerId, outcome, minMatchSeconds, now }) {
  if (!pool || !matchId || !gameSlug || !reporterPlayerId) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const found = await client.query(
      `select * from ranked_matches where match_id=$1 and game_slug=$2 for update`,
      [matchId, gameSlug],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("rollback");
      return { error: "match_not_found" };
    }
    const reporterSide = row.player_a === reporterPlayerId ? "a" : row.player_b === reporterPlayerId ? "b" : null;
    if (!reporterSide) {
      await client.query("rollback");
      return { error: "not_a_member" };
    }
    if (["resolved", "voided", "disputed"].includes(row.status)) {
      await client.query("commit");
      return { ok: true, alreadyResolved: true, status: row.status, match: serializeMatchForPlayer(row, reporterPlayerId) };
    }

    const createdMs = new Date(row.created_at).getTime();
    const nowMs = now ? new Date(now).getTime() : Date.now();
    const matchAgeSeconds = (nowMs - createdMs) / 1000;

    const decision = decideReport({
      reporterSide,
      outcome,
      existingReportA: row.report_a,
      existingReportB: row.report_b,
      matchAgeSeconds,
      minMatchSeconds,
      now,
    });

    if (decision.action === "reject") {
      await client.query("rollback");
      return { error: decision.reason };
    }

    if (decision.action === "void") {
      await client.query(
        `update ranked_matches set status='voided', report_a=$1, report_b=$2, flags=$3, resolved_at=now()
          where match_id=$4 and game_slug=$5`,
        [
          reporterSide === "a" ? outcome : row.report_a,
          reporterSide === "b" ? outcome : row.report_b,
          appendFlag(row.flags, "short_match"),
          matchId,
          gameSlug,
        ],
      );
      await client.query("commit");
      return { ok: true, status: "voided", reason: decision.reason };
    }

    if (decision.action === "dispute") {
      await client.query(
        `update ranked_matches set status='disputed', report_a=$1, report_b=$2, flags=$3, resolved_at=now()
          where match_id=$4 and game_slug=$5`,
        [
          reporterSide === "a" ? outcome : row.report_a,
          reporterSide === "b" ? outcome : row.report_b,
          appendFlag(row.flags, "report_conflict"),
          matchId,
          gameSlug,
        ],
      );
      await client.query("commit");
      return { ok: true, status: "disputed", reason: decision.reason };
    }

    if (decision.action === "forfeit_pending") {
      await client.query(
        `update ranked_matches set status='pending_forfeit', report_a=$1, report_b=$2, forfeit_deadline=$3
          where match_id=$4 and game_slug=$5`,
        [
          reporterSide === "a" ? outcome : row.report_a,
          reporterSide === "b" ? outcome : row.report_b,
          decision.deadline,
          matchId,
          gameSlug,
        ],
      );
      await client.query("commit");
      return { ok: true, status: "pending_forfeit", forfeitDeadline: decision.deadline };
    }

    // resolve
    const result = await applyResolution(client, {
      row,
      gameSlug,
      outcomeA: decision.outcomeA,
      report: decision.report,
    });
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] reportRankedResult error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

// Rendezvous: seat 1 (player_a) publishes the relay room code it created so seat 2
// can join the same lobby. First write wins (idempotent); only the owner may set it.
export async function setRankedLobbyCode(pool, { matchId, gameSlug, reporterPlayerId, lobbyCode }) {
  if (!pool || !matchId || !gameSlug || !reporterPlayerId || !lobbyCode) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const found = await client.query(
      `select * from ranked_matches where match_id=$1 and game_slug=$2 for update`,
      [matchId, gameSlug],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("rollback");
      return { error: "match_not_found" };
    }
    if (row.player_a !== reporterPlayerId) {
      await client.query("rollback");
      return { error: "not_lobby_owner" };
    }
    if (!row.lobby_code) {
      const code = String(lobbyCode).slice(0, 16);
      await client.query(
        `update ranked_matches set lobby_code=$1 where match_id=$2 and game_slug=$3`,
        [code, matchId, gameSlug],
      );
      row.lobby_code = code;
    }
    await client.query("commit");
    return { ok: true, match: serializeMatchForPlayer(row, reporterPlayerId) };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] setRankedLobbyCode error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

// Read a player's ranked standing (rating + tier + record) and any live match.
export async function getRankedStanding(pool, { playerId, gameSlug }) {
  if (!pool || !playerId || !gameSlug) return null;
  try {
    const ratingRes = await pool.query(
      `select rating, wins, losses, draws, last_match_at from game_ratings where player_id=$1 and game_slug=$2`,
      [playerId, gameSlug],
    );
    const r = ratingRes.rows[0] || { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0, last_match_at: null };
    const tier = rankTier(r.rating);
    const activeRes = await pool.query(
      `select * from ranked_matches
        where game_slug=$1 and (player_a=$2 or player_b=$2) and status in ('active','pending_forfeit')
        order by created_at desc limit 1`,
      [gameSlug, playerId],
    );
    return {
      playerId,
      gameSlug,
      rating: r.rating,
      tier: { id: tier.id, label: tier.label },
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      lastMatchAt: r.last_match_at,
      activeMatch: activeRes.rows[0] ? serializeMatchForPlayer(activeRes.rows[0], playerId) : null,
    };
  } catch (err) {
    process.stderr.write(`[ranked] getRankedStanding error: ${err?.message || err}\n`);
    return null;
  }
}
