import { randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_RATING, RANKED_BOARD, SAME_OPPONENT_WINDOW_HOURS, banFirstIndex, computeRankedRatings, decideForfeitFinalize, decideReport, outcomeScoreA, provisionalK, rankTier, ratingWindow, sameOpponentGainFactor, } from "./ranked-elo.mjs";
import { normalizeSquad, normalizeUnitResults, unitReportsAgree, unitStatDeltas, } from "./ranked-unit-stats.mjs";
// Same slug shape as the rest of the game-scoped routes.
export function isValidRankedSlug(slug) {
    return typeof slug === "string" && /^[a-z0-9-]{1,60}$/.test(slug);
}
function appendFlag(existing, flag) {
    if (!flag)
        return existing || null;
    const set = new Set(String(existing || "").split(",").map((s) => s.trim()).filter(Boolean));
    set.add(flag);
    return Array.from(set).join(",");
}
// Shape a match row for one player's client. Never leaks anything the player
// shouldn't derive; the token is the shared secret both members legitimately hold.
export function serializeMatchForPlayer(row, playerId) {
    if (!row)
        return null;
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
    if (!row.outcome_a)
        return null;
    const isA = row.player_a === playerId;
    if (row.outcome_a === "draw")
        return "draw";
    const aWon = row.outcome_a === "win";
    return (isA ? aWon : !aWon) ? "win" : "loss";
}
async function loadRating(client, gameSlug, playerId) {
    const res = await client.query(`select rating, wins, losses, draws from game_ratings where player_id = $1 and game_slug = $2`, [playerId, gameSlug]);
    const row = res.rows[0];
    const rating = row ? row.rating : DEFAULT_RATING;
    const games = row ? (row.wins || 0) + (row.losses || 0) + (row.draws || 0) : 0;
    return { rating, games };
}
// Find a compatible waiting opponent and broker a match, or return null. Also
// upserts the caller into the queue as matched when a pairing is made.
async function tryPair(client, { playerId, gameSlug, rating }) {
    const candidates = await client.query(`select player_id, rating,
            extract(epoch from (now() - enqueued_at)) as wait_seconds
       from ranked_queue
      where game_slug = $1 and status = 'waiting' and player_id <> $2
      order by enqueued_at asc
      for update skip locked`, [gameSlug, playerId]);
    let opponent = null;
    for (const cand of candidates.rows) {
        const window = Math.max(ratingWindow(cand.wait_seconds), ratingWindow(0));
        if (Math.abs((cand.rating || DEFAULT_RATING) - rating) <= window) {
            opponent = cand;
            break;
        }
    }
    if (!opponent)
        return null;
    const matchId = randomUUID();
    const seed = randomUUID();
    const token = randomBytes(16).toString("hex");
    const playerA = opponent.player_id;
    const playerB = playerId;
    const ratingA = opponent.rating ?? DEFAULT_RATING;
    const ratingB = rating;
    const banFirst = banFirstIndex(seed) === 0 ? playerA : playerB;
    await client.query(`insert into ranked_matches
       (match_id, game_slug, player_a, player_b, rating_a_before, rating_b_before, board, seed, token, ban_first, status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active', now())`, [matchId, gameSlug, playerA, playerB, ratingA, ratingB, RANKED_BOARD, seed, token, banFirst]);
    await client.query(`update ranked_queue set status='matched', match_id=$1 where game_slug=$2 and player_id = $3`, [matchId, gameSlug, playerA]);
    await client.query(`insert into ranked_queue (player_id, game_slug, rating, status, match_id, enqueued_at)
     values ($1,$2,$3,'matched',$4, now())
     on conflict (player_id, game_slug) do update set status='matched', match_id=excluded.match_id, rating=excluded.rating`, [playerB, gameSlug, ratingB, matchId]);
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
    if (!pool || !playerId || !gameSlug)
        return null;
    const client = await pool.connect();
    try {
        await client.query("begin");
        const { rating } = await loadRating(client, gameSlug, playerId);
        // If the player already holds an unresolved match, hand it back instead of queueing.
        const active = await client.query(`select * from ranked_matches
        where game_slug = $1 and (player_a = $2 or player_b = $2)
          and status in ('active','pending_forfeit')
        order by created_at desc limit 1`, [gameSlug, playerId]);
        if (active.rows[0]) {
            await client.query("commit");
            return { status: "matched", match: serializeMatchForPlayer(active.rows[0], playerId) };
        }
        const paired = await tryPair(client, { playerId, gameSlug, rating });
        if (paired) {
            await client.query("commit");
            return { status: "matched", match: serializeMatchForPlayer(paired, playerId) };
        }
        await client.query(`insert into ranked_queue (player_id, game_slug, rating, status, match_id, enqueued_at)
       values ($1,$2,$3,'waiting', null, now())
       on conflict (player_id, game_slug) do update
         set status='waiting', match_id=null, rating=excluded.rating,
             enqueued_at = case when ranked_queue.status='waiting' then ranked_queue.enqueued_at else now() end`, [playerId, gameSlug, rating]);
        await client.query("commit");
        return { status: "waiting" };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[ranked] enqueueRanked error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
}
// Poll the queue: finalize any lapsed forfeits, hand back a brokered match if one
// exists, otherwise re-attempt pairing (the caller's window has grown while waiting).
export async function pollRanked(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await finalizeForfeits(client, gameSlug);
        const active = await client.query(`select * from ranked_matches
        where game_slug = $1 and (player_a = $2 or player_b = $2)
          and status in ('active','pending_forfeit')
        order by created_at desc limit 1`, [gameSlug, playerId]);
        if (active.rows[0]) {
            await client.query("commit");
            return { status: "matched", match: serializeMatchForPlayer(active.rows[0], playerId) };
        }
        const queued = await client.query(`select status, extract(epoch from (now() - enqueued_at)) as wait_seconds
         from ranked_queue where player_id = $1 and game_slug = $2`, [playerId, gameSlug]);
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
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[ranked] pollRanked error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
}
export async function cancelRanked(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        await pool.query(`update ranked_queue set status='cancelled', match_id=null
        where player_id=$1 and game_slug=$2 and status='waiting'`, [playerId, gameSlug]);
        return { ok: true };
    }
    catch (err) {
        process.stderr.write(`[ranked] cancelRanked error: ${err?.message || err}\n`);
        return null;
    }
}
async function countPriorMeetings(client, gameSlug, playerA, playerB) {
    const res = await client.query(`select count(*)::int as n from ranked_matches
      where game_slug = $1 and status = 'resolved'
        and resolved_at > now() - ($2 || ' hours')::interval
        and ((player_a = $3 and player_b = $4) or (player_a = $4 and player_b = $3))`, [gameSlug, String(SAME_OPPONENT_WINDOW_HOURS), playerA, playerB]);
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
    if (gainFactor < 1)
        flags = appendFlag(flags, "same_opponent_damped");
    if (extraFlags)
        flags = appendFlag(flags, extraFlags);
    // Per-unit stats are a side effect of resolution: credit only when BOTH final-board
    // reports are present and agree; on conflict, credit nothing and flag the row.
    const bothReported = row.unit_report_a != null && row.unit_report_b != null;
    const unitsAgree = bothReported && unitReportsAgree(row.unit_report_a, row.unit_report_b);
    if (bothReported && !unitsAgree)
        flags = appendFlag(flags, "unit_report_conflict");
    await client.query(`update ranked_matches
        set status='resolved', outcome_a=$1, rating_a_after=$2, rating_b_after=$3,
            report_a=$4, report_b=$5, flags=$6, resolved_at=now()
      where match_id=$7 and game_slug=$8`, [
        outcomeA,
        newRatingA,
        newRatingB,
        report?.side === "a" ? report.outcome : row.report_a,
        report?.side === "b" ? report.outcome : row.report_b,
        flags,
        row.match_id,
        gameSlug,
    ]);
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
async function creditUnitStats(client, { gameSlug, playerAId, playerBId, canonical, outcomeA }) {
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
async function storeReporterUnitReport(client, { row, gameSlug, reporterSide, squad, unitResults }) {
    const cleanSquad = normalizeSquad(squad);
    const cleanUnits = normalizeUnitResults(unitResults);
    if (!cleanSquad && !cleanUnits)
        return; // legacy client: nothing to persist
    const squadCol = reporterSide === "a" ? "squad_a" : "squad_b";
    const reportCol = reporterSide === "a" ? "unit_report_a" : "unit_report_b";
    await client.query(`update ranked_matches set ${squadCol}=$1, ${reportCol}=$2 where match_id=$3 and game_slug=$4`, [cleanSquad ? JSON.stringify(cleanSquad) : null, cleanUnits ? JSON.stringify(cleanUnits) : null, row.match_id, gameSlug]);
    row[squadCol] = cleanSquad;
    row[reportCol] = cleanUnits;
}
// Resolve any pending_forfeit matches whose grace window has lapsed. Lazy (called
// on poll/report) so no cron is required.
export async function finalizeForfeits(client, gameSlug) {
    const pending = await client.query(`select * from ranked_matches
       where game_slug = $1 and status = 'pending_forfeit' and forfeit_deadline <= now()
       for update skip locked`, [gameSlug]);
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
export async function reportRankedResult(pool, { matchId, gameSlug, reporterPlayerId, outcome, squad, unitResults, minMatchSeconds, now }) {
    if (!pool || !matchId || !gameSlug || !reporterPlayerId)
        return null;
    const client = await pool.connect();
    try {
        await client.query("begin");
        const found = await client.query(`select * from ranked_matches where match_id=$1 and game_slug=$2 for update`, [matchId, gameSlug]);
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
            await client.query(`update ranked_matches set status='voided', report_a=$1, report_b=$2, flags=$3, resolved_at=now()
          where match_id=$4 and game_slug=$5`, [
                reporterSide === "a" ? outcome : row.report_a,
                reporterSide === "b" ? outcome : row.report_b,
                appendFlag(row.flags, "short_match"),
                matchId,
                gameSlug,
            ]);
            await client.query("commit");
            return { ok: true, status: "voided", reason: decision.reason };
        }
        if (decision.action === "dispute") {
            await client.query(`update ranked_matches set status='disputed', report_a=$1, report_b=$2, flags=$3, resolved_at=now()
          where match_id=$4 and game_slug=$5`, [
                reporterSide === "a" ? outcome : row.report_a,
                reporterSide === "b" ? outcome : row.report_b,
                appendFlag(row.flags, "report_conflict"),
                matchId,
                gameSlug,
            ]);
            await client.query("commit");
            return { ok: true, status: "disputed", reason: decision.reason };
        }
        if (decision.action === "forfeit_pending") {
            await client.query(`update ranked_matches set status='pending_forfeit', report_a=$1, report_b=$2, forfeit_deadline=$3
          where match_id=$4 and game_slug=$5`, [
                reporterSide === "a" ? outcome : row.report_a,
                reporterSide === "b" ? outcome : row.report_b,
                decision.deadline,
                matchId,
                gameSlug,
            ]);
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
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[ranked] reportRankedResult error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
}
// Rendezvous: seat 1 (player_a) publishes the relay room code it created so seat 2
// can join the same lobby. First write wins (idempotent); only the owner may set it.
export async function setRankedLobbyCode(pool, { matchId, gameSlug, reporterPlayerId, lobbyCode }) {
    if (!pool || !matchId || !gameSlug || !reporterPlayerId || !lobbyCode)
        return null;
    const client = await pool.connect();
    try {
        await client.query("begin");
        const found = await client.query(`select * from ranked_matches where match_id=$1 and game_slug=$2 for update`, [matchId, gameSlug]);
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
            await client.query(`update ranked_matches set lobby_code=$1 where match_id=$2 and game_slug=$3`, [code, matchId, gameSlug]);
            row.lobby_code = code;
        }
        await client.query("commit");
        return { ok: true, match: serializeMatchForPlayer(row, reporterPlayerId) };
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[ranked] setRankedLobbyCode error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
}
// --- Ranked identity (cosmetic profile) --------------------------------------
// Title/avatar are cosmetic and derived; they never enter the online state hash or
// authoritative battle state. The server owns them so opponents can read a card.
export const RANKED_TITLE_MAX_LENGTH = 60;
const AVATAR_ID_MAX_LENGTH = 60;
function sanitizeTitle(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim().replace(/\s+/g, " ").slice(0, RANKED_TITLE_MAX_LENGTH);
    return trimmed.length ? trimmed : null;
}
// Avatar unit/skin ids are opaque strings — ownership is client-gated (v1). The
// server only rejects absurd lengths and empties so a bad payload can't poison the row.
function sanitizeAvatarId(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed.length || trimmed.length > AVATAR_ID_MAX_LENGTH)
        return null;
    return trimmed;
}
// Shared rating+tier+record read used by both the me-standing and the public card.
async function loadRatingRecord(pool, gameSlug, playerId) {
    const res = await pool.query(`select rating, wins, losses, draws, last_match_at from game_ratings where player_id=$1 and game_slug=$2`, [playerId, gameSlug]);
    const r = res.rows[0] || { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0, last_match_at: null };
    const tier = rankTier(r.rating);
    return {
        rating: r.rating,
        tier: { id: tier.id, label: tier.label },
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        lastMatchAt: r.last_match_at,
    };
}
export async function getRankedProfile(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const res = await pool.query(`select title, avatar_unit, avatar_skin, updated_at from ranked_profiles where player_id=$1 and game_slug=$2`, [playerId, gameSlug]);
        const row = res.rows[0] || null;
        return {
            title: row?.title || null,
            avatarUnit: row?.avatar_unit || null,
            avatarSkin: row?.avatar_skin || null,
            updatedAt: row?.updated_at || null,
        };
    }
    catch (err) {
        process.stderr.write(`[ranked] getRankedProfile error: ${err?.message || err}\n`);
        return null;
    }
}
// Upsert my ranked identity. Patch semantics: an undefined field keeps the stored
// value; an explicit null (or blank string) clears it. A null avatar unit also
// clears the skin (a skin is meaningless without its unit).
export async function saveRankedProfile(pool, { playerId, gameSlug, title, avatarUnit, avatarSkin }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const existing = await getRankedProfile(pool, { playerId, gameSlug });
        const nextTitle = title === undefined ? (existing?.title ?? null) : sanitizeTitle(title);
        let nextUnit = avatarUnit === undefined ? (existing?.avatarUnit ?? null) : sanitizeAvatarId(avatarUnit);
        let nextSkin = avatarSkin === undefined ? (existing?.avatarSkin ?? null) : sanitizeAvatarId(avatarSkin);
        if (!nextUnit)
            nextSkin = null;
        await pool.query(`insert into ranked_profiles (player_id, game_slug, title, avatar_unit, avatar_skin, updated_at)
       values ($1,$2,$3,$4,$5, now())
       on conflict (player_id, game_slug) do update
         set title=excluded.title, avatar_unit=excluded.avatar_unit,
             avatar_skin=excluded.avatar_skin, updated_at=now()`, [playerId, gameSlug, nextTitle, nextUnit, nextSkin]);
        return { title: nextTitle, avatarUnit: nextUnit, avatarSkin: nextSkin };
    }
    catch (err) {
        process.stderr.write(`[ranked] saveRankedProfile error: ${err?.message || err}\n`);
        return null;
    }
}
// Public read: another player's ranked card (rating/tier/record + cosmetic identity).
// Deliberately omits activeMatch/token and anything else private.
export async function getPublicRankedCard(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const record = await loadRatingRecord(pool, gameSlug, playerId);
        const profile = await getRankedProfile(pool, { playerId, gameSlug });
        return {
            playerId,
            gameSlug,
            ...record,
            title: profile?.title || null,
            avatarUnit: profile?.avatarUnit || null,
            avatarSkin: profile?.avatarSkin || null,
        };
    }
    catch (err) {
        process.stderr.write(`[ranked] getPublicRankedCard error: ${err?.message || err}\n`);
        return null;
    }
}
// Read a player's ranked standing (rating + tier + record + cosmetic profile) and
// any live match. This is the me-view: it may include the private active-match token.
export async function getRankedStanding(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const record = await loadRatingRecord(pool, gameSlug, playerId);
        const profile = await getRankedProfile(pool, { playerId, gameSlug });
        const activeRes = await pool.query(`select * from ranked_matches
        where game_slug=$1 and (player_a=$2 or player_b=$2) and status in ('active','pending_forfeit')
        order by created_at desc limit 1`, [gameSlug, playerId]);
        return {
            playerId,
            gameSlug,
            ...record,
            title: profile?.title || null,
            avatarUnit: profile?.avatarUnit || null,
            avatarSkin: profile?.avatarSkin || null,
            activeMatch: activeRes.rows[0] ? serializeMatchForPlayer(activeRes.rows[0], playerId) : null,
        };
    }
    catch (err) {
        process.stderr.write(`[ranked] getRankedStanding error: ${err?.message || err}\n`);
        return null;
    }
}
// Per-unit ranked record for a player (games/wins/kills/survivals), highest-use first.
// Public read — no private fields involved.
export async function getRankedUnitStats(pool, { playerId, gameSlug }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    try {
        const res = await pool.query(`select unit_type, games, wins, kills, survivals from ranked_unit_stats
        where player_id=$1 and game_slug=$2
        order by games desc, wins desc, unit_type asc`, [playerId, gameSlug]);
        return {
            playerId,
            gameSlug,
            units: (res.rows || []).map((r) => ({
                unitType: r.unit_type,
                games: r.games,
                wins: r.wins,
                kills: r.kills,
                survivals: r.survivals,
            })),
        };
    }
    catch (err) {
        process.stderr.write(`[ranked] getRankedUnitStats error: ${err?.message || err}\n`);
        return null;
    }
}
// Recent resolved ranked matches for a player, shaped to that player's perspective
// (my outcome, my rating delta, my/opponent squads). Public read.
export async function getRankedMatches(pool, { playerId, gameSlug, limit }) {
    if (!pool || !playerId || !gameSlug)
        return null;
    const cap = Math.max(1, Math.min(Number(limit) || 10, 25));
    try {
        const res = await pool.query(`select match_id, player_a, player_b, outcome_a, rating_a_before, rating_b_before,
              rating_a_after, rating_b_after, squad_a, squad_b, resolved_at
         from ranked_matches
        where game_slug=$1 and status='resolved' and (player_a=$2 or player_b=$2)
        order by resolved_at desc limit $3`, [gameSlug, playerId, cap]);
        const matches = (res.rows || []).map((r) => {
            const isA = r.player_a === playerId;
            const outcome = r.outcome_a === "draw"
                ? "draw"
                : (isA ? r.outcome_a : r.outcome_a === "win" ? "loss" : "win");
            const before = isA ? r.rating_a_before : r.rating_b_before;
            const after = isA ? r.rating_a_after : r.rating_b_after;
            return {
                matchId: r.match_id,
                opponentPlayerId: isA ? r.player_b : r.player_a,
                outcome,
                ratingBefore: before,
                ratingAfter: after,
                ratingDelta: (after ?? before) - before,
                mySquad: isA ? r.squad_a : r.squad_b,
                opponentSquad: isA ? r.squad_b : r.squad_a,
                resolvedAt: r.resolved_at,
            };
        });
        return { playerId, gameSlug, matches };
    }
    catch (err) {
        process.stderr.write(`[ranked] getRankedMatches error: ${err?.message || err}\n`);
        return null;
    }
}
// Top-N ranked ladder for a game, by rating, with each entry's cosmetic identity
// folded in. Public read. Only players with a rating row for this slug appear.
export async function getRankedLeaderboard(pool, { gameSlug, limit }) {
    if (!pool || !gameSlug)
        return null;
    const cap = Math.max(1, Math.min(Number(limit) || 25, 100));
    try {
        const res = await pool.query(`select r.player_id, r.rating, r.wins, r.losses, r.draws,
              p.title, p.avatar_unit, p.avatar_skin
         from game_ratings r
         left join ranked_profiles p
           on p.player_id = r.player_id and p.game_slug = r.game_slug
        where r.game_slug = $1
        order by r.rating desc, (r.wins - r.losses) desc, r.player_id asc
        limit $2`, [gameSlug, cap]);
        const entries = (res.rows || []).map((row, i) => {
            const tier = rankTier(row.rating);
            return {
                rank: i + 1,
                playerId: row.player_id,
                rating: row.rating,
                tier: { id: tier.id, label: tier.label },
                wins: row.wins,
                losses: row.losses,
                draws: row.draws,
                title: row.title || null,
                avatarUnit: row.avatar_unit || null,
                avatarSkin: row.avatar_skin || null,
            };
        });
        return { gameSlug, entries };
    }
    catch (err) {
        process.stderr.write(`[ranked] getRankedLeaderboard error: ${err?.message || err}\n`);
        return null;
    }
}
