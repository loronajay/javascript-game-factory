// Ranked match lifecycle — matchmaking (enqueue/poll/cancel), match start, result
// attestation + ELO resolution, forfeit finalization, per-unit stat crediting, and the
// lobby-code rendezvous. Split out of ranked.mts. All the DB writes that mutate a ranked
// match live here; shared row-serialization / stale-expiry / flag helpers come from
// ranked-shared.mts.

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
  ratingWindow,
  sameOpponentGainFactor,
} from "./ranked-elo.mjs";
import {
  normalizeSquad,
  normalizeUnitResults,
  unitReportsAgree,
  unitStatDeltas,
} from "./ranked-unit-stats.mjs";
import { appendFlag, expireStaleActiveRankedMatches, serializeMatchForPlayer } from "./ranked-shared.mjs";

async function loadRating(client: any, gameSlug: any, playerId: any): Promise<any> {
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
async function tryPair(client: any, { playerId, gameSlug, rating }: any): Promise<any> {
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
export async function enqueueRanked(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rating } = await loadRating(client, gameSlug, playerId);
    await expireStaleActiveRankedMatches(client, gameSlug);
    await finalizeForfeits(client, gameSlug);

    // If the player already holds an unresolved match, hand it back instead of queueing.
    const active = await client.query(
      `select * from ranked_matches
        where game_slug = $1 and (player_a = $2 or player_b = $2)
          and status in ('active','playing','pending_forfeit')
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
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] enqueueRanked error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

// Poll the queue: finalize any lapsed forfeits, hand back a brokered match if one
// exists, otherwise re-attempt pairing (the caller's window has grown while waiting).
export async function pollRanked(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await expireStaleActiveRankedMatches(client, gameSlug);
    await finalizeForfeits(client, gameSlug);

    const active = await client.query(
      `select * from ranked_matches
        where game_slug = $1 and (player_a = $2 or player_b = $2)
          and status in ('active','playing','pending_forfeit')
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
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] pollRanked error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

export async function cancelRanked(pool: any, { playerId, gameSlug }: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await expireStaleActiveRankedMatches(client, gameSlug);
    await finalizeForfeits(client, gameSlug);

    const active = await client.query(
      `select * from ranked_matches
        where game_slug=$1 and (player_a=$2 or player_b=$2) and status='active'
        order by created_at desc limit 1
        for update`,
      [gameSlug, playerId],
    );
    const row = active.rows[0];
    if (row) {
      const flags = appendFlag(row.flags, "cancelled_before_start");
      await client.query(
        `update ranked_matches set status='voided', flags=$1, resolved_at=now()
          where match_id=$2 and game_slug=$3`,
        [flags, row.match_id, gameSlug],
      );
      await client.query(
        `update ranked_queue set status='cancelled', match_id=null
          where game_slug=$1 and match_id=$2`,
        [gameSlug, row.match_id],
      );
      await client.query("commit");
      return {
        ok: true,
        cancelledMatch: true,
        match: serializeMatchForPlayer({ ...row, status: "voided", flags }, playerId),
      };
    }

    await client.query(
      `update ranked_queue set status='cancelled', match_id=null
        where player_id=$1 and game_slug=$2 and status='waiting'`,
      [playerId, gameSlug],
    );
    await client.query("commit");
    return { ok: true };
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] cancelRanked error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

export async function startRankedMatch(pool: any, { matchId, gameSlug, playerId }: any): Promise<any> {
  if (!pool || !matchId || !gameSlug || !playerId) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await expireStaleActiveRankedMatches(client, gameSlug);
    await finalizeForfeits(client, gameSlug);

    const found = await client.query(
      `select * from ranked_matches where match_id=$1 and game_slug=$2 for update`,
      [matchId, gameSlug],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("rollback");
      return { error: "match_not_found" };
    }
    if (row.player_a !== playerId && row.player_b !== playerId) {
      await client.query("rollback");
      return { error: "not_a_member" };
    }
    if (["resolved", "voided", "disputed"].includes(row.status)) {
      await client.query("commit");
      return { ok: true, alreadyResolved: true, status: row.status, match: serializeMatchForPlayer(row, playerId) };
    }

    if (row.status === "active") {
      await client.query(
        `update ranked_matches set status='playing' where match_id=$1 and game_slug=$2`,
        [matchId, gameSlug],
      );
      await client.query(
        `update ranked_queue set status='cancelled', match_id=null
          where game_slug=$1 and match_id=$2`,
        [gameSlug, matchId],
      );
      row.status = "playing";
    }

    await client.query("commit");
    return { ok: true, status: row.status, match: serializeMatchForPlayer(row, playerId) };
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] startRankedMatch error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

async function countPriorMeetings(client: any, gameSlug: any, playerA: any, playerB: any): Promise<number> {
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
async function applyResolution(client: any, { row, gameSlug, outcomeA, report, extraFlags }: any): Promise<any> {
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

  // Per-unit stats are a side effect of resolution: credit only when BOTH final-board
  // reports are present and agree; on conflict, credit nothing and flag the row.
  const bothReported = row.unit_report_a != null && row.unit_report_b != null;
  const unitsAgree = bothReported && unitReportsAgree(row.unit_report_a, row.unit_report_b);
  if (bothReported && !unitsAgree) flags = appendFlag(flags, "unit_report_conflict");

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

  if (unitsAgree) {
    await creditUnitStats(client, {
      gameSlug,
      playerAId: row.player_a,
      playerBId: row.player_b,
      canonical: row.unit_report_a,
      outcomeA,
    });
  }

  return {
    ok: true,
    status: "resolved",
    outcomeA,
    ratingA: { playerId: row.player_a, before: a.rating, after: newRatingA },
    ratingB: { playerId: row.player_b, before: b.rating, after: newRatingB },
  };
}

// Aggregate an agreed final board into ranked_unit_stats for both players. seat 1 maps
// to player_a, seat 2 to player_b. Runs inside the resolving transaction.
async function creditUnitStats(client: any, { gameSlug, playerAId, playerBId, canonical, outcomeA }: any): Promise<void> {
  const deltas = unitStatDeltas(canonical, { outcomeA });
  const upsert = `
    insert into ranked_unit_stats (player_id, game_slug, unit_type, games, wins, kills, survivals)
    values ($1,$2,$3,$4,$5,$6,$7)
    on conflict (player_id, game_slug, unit_type) do update
      set games = ranked_unit_stats.games + excluded.games,
          wins = ranked_unit_stats.wins + excluded.wins,
          kills = ranked_unit_stats.kills + excluded.kills,
          survivals = ranked_unit_stats.survivals + excluded.survivals`;
  for (const d of deltas) {
    const playerId = d.seat === 1 ? playerAId : playerBId;
    await client.query(upsert, [playerId, gameSlug, d.unitType, d.games, d.wins, d.kills, d.survivals]);
  }
}

// Store the reporting side's squad + final-board report before the resolution decision,
// so the agreement check has both when the second attestation resolves the match. Also
// mutates the in-memory row so a same-call resolve sees the just-stored report.
async function storeReporterUnitReport(client: any, { row, gameSlug, reporterSide, squad, unitResults }: any): Promise<void> {
  const cleanSquad = normalizeSquad(squad);
  const cleanUnits = normalizeUnitResults(unitResults);
  if (!cleanSquad && !cleanUnits) return; // legacy client: nothing to persist
  const squadCol = reporterSide === "a" ? "squad_a" : "squad_b";
  const reportCol = reporterSide === "a" ? "unit_report_a" : "unit_report_b";
  await client.query(
    `update ranked_matches set ${squadCol}=$1, ${reportCol}=$2 where match_id=$3 and game_slug=$4`,
    [cleanSquad ? JSON.stringify(cleanSquad) : null, cleanUnits ? JSON.stringify(cleanUnits) : null, row.match_id, gameSlug],
  );
  row[squadCol] = cleanSquad;
  row[reportCol] = cleanUnits;
}

// Resolve any pending_forfeit matches whose grace window has lapsed. Lazy (called
// on poll/report) so no cron is required.
export async function finalizeForfeits(client: any, gameSlug: any): Promise<void> {
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
export async function reportRankedResult(pool: any, { matchId, gameSlug, reporterPlayerId, outcome, squad, unitResults, minMatchSeconds, now }: any): Promise<any> {
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

    // Persist this side's squad + final board first, so a resolve triggered by this same
    // call (dual attestation) can verify agreement against both reports.
    await storeReporterUnitReport(client, { row, gameSlug, reporterSide, squad, unitResults });

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
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] reportRankedResult error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}

// Rendezvous: seat 1 (player_a) publishes the relay room code it created so seat 2
// can join the same lobby. First write wins (idempotent); only the owner may set it.
export async function setRankedLobbyCode(pool: any, { matchId, gameSlug, reporterPlayerId, lobbyCode }: any): Promise<any> {
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
  } catch (err: any) {
    await client.query("rollback").catch(() => {});
    process.stderr.write(`[ranked] setRankedLobbyCode error: ${err?.message || err}\n`);
    return null;
  } finally {
    client.release();
  }
}
