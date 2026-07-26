// Ranked liveness — heartbeats, abandonment resolution, and the lazy maintenance
// sweep. Split out of ranked-match.mts, which owns the writes a *player action*
// causes; this module owns the writes that happen because a player STOPPED acting.
//
// Why heartbeats exist at all: the relay closes the room when a peer drops, so one
// player's machine dying takes their opponent's socket with it. Neither client can
// attest, and the match used to sit `playing` until the 6h TTL voided it — a game
// with an obvious winner producing no rating and no history. The survivor can't
// simply claim the win either, because a player who is losing would unplug and claim
// exactly the same thing, turning an earned win into a `disputed` no-op.
//
// So the server measures presence instead of accepting a claim. Clients post a
// heartbeat throughout a live ranked match and keep posting through their own
// disconnect screen; whoever is still reporting when the other has gone silent wins
// by forfeit. That signal can't be forged in your own favour: quitting is exactly
// what stops producing it. See decideLivenessForfeit for the adjudication rules.
import { RANKED_HEARTBEAT_STALE_SECONDS, decideLivenessForfeit, } from "./ranked-elo.mjs";
import { expireStaleActiveRankedMatches, serializeMatchForPlayer } from "./ranked-shared.mjs";
import { applyResolution, finalizeForfeits } from "./ranked-match.mjs";
// Statuses that no longer accept a heartbeat or a liveness resolution.
const FINISHED_STATUSES = ["resolved", "voided", "disputed"];
function heartbeatColumn(side) {
    return side === "a" ? "heartbeat_a" : "heartbeat_b";
}
// Resolve live matches where exactly one side has gone silent. Runs inside the
// caller's transaction; the row lock is what keeps two concurrent sweeps from
// double-applying ELO.
export async function resolveAbandonedRankedMatches(client, gameSlug, now = null) {
    if (!client || !gameSlug)
        return 0;
    const cutoff = new Date((now ? new Date(now).getTime() : Date.now()) - RANKED_HEARTBEAT_STALE_SECONDS * 1000);
    // Narrow in SQL to matches where at least one side is already past the stale
    // cutoff; decideLivenessForfeit makes the actual call.
    const candidates = await client.query(`select * from ranked_matches
       where game_slug = $1 and status = 'playing'
         and heartbeat_a is not null and heartbeat_b is not null
         and (heartbeat_a < $2 or heartbeat_b < $2)
       for update skip locked`, [gameSlug, cutoff]);
    let resolved = 0;
    for (const row of candidates.rows || []) {
        const decision = decideLivenessForfeit({
            status: row.status,
            reportA: row.report_a,
            reportB: row.report_b,
            heartbeatA: row.heartbeat_a,
            heartbeatB: row.heartbeat_b,
            createdAt: row.created_at,
            now,
        });
        if (decision.action !== "resolve")
            continue;
        await applyResolution(client, {
            row,
            gameSlug,
            outcomeA: decision.outcomeA,
            report: null,
            extraFlags: "abandoned_no_heartbeat",
        });
        resolved += 1;
    }
    return resolved;
}
// Lazy ranked maintenance: resolve abandoned matches, expire lapsed open ones, then
// finalize any forfeit whose grace window has passed.
//
// finalizeForfeits used to run only from the queue writes (enqueue/poll/cancel/start),
// which meant a won-by-forfeit match sat unresolved — no rating, no W/L for either
// player — until somebody happened to queue again for that slug. On a quiet game that
// could be days. Read paths and heartbeats call this so a lapsed forfeit finalizes on
// the next glance at a standing, card, or leaderboard, or within a beat of its
// deadline while somebody is still connected.
//
// Abandonment resolution runs BEFORE expiry so a long match that is still being
// played out isn't voided out from under a decidable forfeit.
//
// Takes its own connection and transaction because every step writes: applying ELO is
// several statements that must commit together, and `for update skip locked` only
// keeps two concurrent sweeps off the same row inside a transaction. Never call these
// steps with a bare pool.
export async function sweepRankedMaintenance(pool, gameSlug, now = null) {
    if (!pool || !gameSlug)
        return false;
    const client = await pool.connect();
    try {
        await client.query("begin");
        await resolveAbandonedRankedMatches(client, gameSlug, now);
        await expireStaleActiveRankedMatches(client, gameSlug);
        await finalizeForfeits(client, gameSlug);
        await client.query("commit");
        return true;
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[ranked] sweepRankedMaintenance error: ${err?.message || err}\n`);
        return false;
    }
    finally {
        client.release();
    }
}
// Stamp this member's presence on a live match, then sweep. The sweep is what makes
// resolution timely without a cron: the surviving client's own beat is the thing that
// notices its opponent went silent.
//
// Returns the match as the caller's client should see it, so a client sitting on a
// disconnect screen learns from its next beat that the match resolved (and how).
export async function recordRankedHeartbeat(pool, { matchId, gameSlug, playerId, now = null }) {
    if (!pool || !matchId || !gameSlug || !playerId)
        return null;
    const client = await pool.connect();
    let side = null;
    try {
        await client.query("begin");
        const found = await client.query(`select * from ranked_matches where match_id=$1 and game_slug=$2 for update`, [matchId, gameSlug]);
        const row = found.rows[0];
        if (!row) {
            await client.query("rollback");
            return { error: "match_not_found" };
        }
        side = row.player_a === playerId ? "a" : row.player_b === playerId ? "b" : null;
        if (!side) {
            await client.query("rollback");
            return { error: "not_a_member" };
        }
        if (FINISHED_STATUSES.includes(row.status)) {
            await client.query("commit");
            return { ok: true, finished: true, status: row.status, match: serializeMatchForPlayer(row, playerId) };
        }
        await client.query(`update ranked_matches set ${heartbeatColumn(side)}=$1 where match_id=$2 and game_slug=$3`, [now ? new Date(now) : new Date(), matchId, gameSlug]);
        await client.query("commit");
    }
    catch (err) {
        await client.query("rollback").catch(() => { });
        process.stderr.write(`[ranked] recordRankedHeartbeat error: ${err?.message || err}\n`);
        return null;
    }
    finally {
        client.release();
    }
    await sweepRankedMaintenance(pool, gameSlug, now);
    // Re-read after the sweep so a match this beat just resolved reports its outcome
    // instead of the pre-sweep status.
    try {
        const after = await pool.query(`select * from ranked_matches where match_id=$1 and game_slug=$2`, [matchId, gameSlug]);
        const row = after.rows[0];
        if (!row)
            return { ok: true, finished: true, status: "voided", match: null };
        return {
            ok: true,
            finished: FINISHED_STATUSES.includes(row.status),
            status: row.status,
            match: serializeMatchForPlayer(row, playerId),
        };
    }
    catch {
        // The beat itself landed; a failed re-read just means this response can't say
        // whether the match moved on. The next beat will.
        return { ok: true, finished: false, status: "playing", match: null };
    }
}
