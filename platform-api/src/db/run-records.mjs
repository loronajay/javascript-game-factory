// Solo run records: a player's best on each board, and the public boards built
// from them.
//
// The platform's second rating source. db/ratings.mts owns head-to-head ELO;
// this owns solo bests. Both are read by db/ladders.mts through one registry, so
// a board can be promoted to the cross-game rail without either side learning
// about the other.
//
// Everything about *what a board is* — its direction, its unit, its plausibility
// bounds — lives in services/leaderboard-catalog. This module owns the rows.
// That is the same split game-loadouts keeps with speed-demon-catalog, and it is
// why adding a board needs no change here at all.
//
// ## Submission is a claim, and it is stored as one
//
// A run arrives from a game client, so its value is attacker-controlled. Three
// things happen to it, in order:
//
//   1. The catalog refuses values outside the board's plausibility bounds. That
//      throws out the impossible, not the merely suspicious.
//   2. The run is stored with `verified = false` and its input log alongside.
//   3. A later replay pass — deliberately not built yet — reproduces the value
//      from the log through the deterministic sim and settles `verified`.
//
// Step 3 is the actual guarantee, and the reason step 2 keeps the log rather
// than only the number: without it, retrofitting verification would mean
// discarding every record already set. Callers that care about integrity read
// `verified`; the board query exposes it per row rather than deciding for them.
import { boardOrderSql, getBoard, getGameBoards, formatBoardValue, isBetterValue, normalizeBoardValue, } from "../services/leaderboard-catalog.mjs";
/**
 * Cap on a stored input log, in entries. A log is bounded in practice — a two
 * minute run at 60Hz with an input on a generous fraction of ticks is nowhere
 * near this — so the cap only bites on a payload built to be large. It is
 * enforced before the log is written rather than after, so an oversized claim
 * costs a rejection instead of a row.
 */
export const MAX_INPUT_LOG_ENTRIES = 20_000;
function cleanText(value, maxLength = 120) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function clampLimit(value, fallback, max) {
    const limit = Math.floor(Number(value));
    if (!Number.isFinite(limit) || limit <= 0)
        return fallback;
    return Math.min(limit, max);
}
/**
 * The submitted log, or null. Kept as opaque JSON: the shape belongs to the
 * game's sim/input-log.js, and a validator here would be a third copy of it,
 * free to drift from the two that actually replay it. What this does enforce is
 * the size bound, which is a storage concern rather than a game one.
 */
function normalizeInputLog(value) {
    if (value === null || value === undefined)
        return { ok: true, log: null };
    if (!Array.isArray(value))
        return { ok: false, log: null };
    if (value.length > MAX_INPUT_LOG_ENTRIES)
        return { ok: false, log: null };
    return { ok: true, log: value };
}
function toRecord(row, board) {
    const value = Number(row.value) || 0;
    return {
        playerId: row.player_id,
        boardId: row.board_id,
        boardLabel: board?.label || row.board_id,
        value,
        valueLabel: formatBoardValue(board, value),
        unit: board?.unit || "",
        direction: board?.direction || "lower",
        modelId: row.model_id || "",
        trackId: row.track_id || "",
        verified: row.verified === true,
        recordedAt: row.recorded_at || null,
    };
}
/**
 * Records a run, keeping it only if it beats the player's stored best.
 *
 * Returns `{ improved, record }` either way, so the client can say "personal
 * best" or "not your best" without a second read. `improved: false` is a normal
 * outcome, not a failure — most runs are not a best.
 *
 * The comparison is done in SQL rather than read-then-write on purpose: two
 * tabs finishing runs at once would otherwise race, and the loser could be the
 * faster one. `isBetterValue` is still the authority on direction — the
 * predicate below is generated from it rather than hardcoded per branch.
 */
export async function recordRun(pool, params = {}) {
    const gameSlug = cleanText(params.gameSlug, 60).toLowerCase();
    const playerId = cleanText(params.playerId, 120);
    const board = getBoard(gameSlug, params.boardId);
    if (!pool || !playerId || !board)
        return null;
    const value = normalizeBoardValue(board, params.value);
    if (value === null)
        return { error: "implausible_value" };
    const { ok, log } = normalizeInputLog(params.inputLog);
    if (!ok)
        return { error: "invalid_input_log" };
    // Generated from the board's direction so the stored comparison and the
    // in-process one (isBetterValue) cannot disagree about which way is better.
    const beats = board.direction === "lower" ? "excluded.value < game_run_records.value" : "excluded.value > game_run_records.value";
    try {
        const res = await pool.query(`insert into game_run_records
         (player_id, game_slug, board_id, value, model_id, track_id, input_log, verified, recorded_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, false, now())
       on conflict (player_id, game_slug, board_id) do update
         set value       = excluded.value,
             model_id    = excluded.model_id,
             track_id    = excluded.track_id,
             input_log   = excluded.input_log,
             -- A new best is unverified evidence again: the old row's verdict
             -- belonged to a different run and must not carry over to this one.
             verified    = false,
             verified_at = null,
             recorded_at = excluded.recorded_at
       where ${beats}
       returning *`, [
            playerId,
            gameSlug,
            board.id,
            value,
            cleanText(params.modelId, 60) || null,
            cleanText(params.trackId, 60) || null,
            log === null ? null : JSON.stringify(log),
        ]);
        if (res.rows?.length) {
            return { improved: true, record: toRecord(res.rows[0], board) };
        }
        // The insert was suppressed by the `where`, which means a better row is
        // already there. Read it back so the caller can show what they have to beat.
        const existing = await pool.query(`select * from game_run_records where player_id = $1 and game_slug = $2 and board_id = $3`, [playerId, gameSlug, board.id]);
        return {
            improved: false,
            record: existing.rows?.length ? toRecord(existing.rows[0], board) : null,
        };
    }
    catch (err) {
        process.stderr.write(`[run-records] recordRun error: ${err?.message || err}\n`);
        return null;
    }
}
/**
 * Every board record a player holds for one game. Public: a personal best is a
 * boast, not a secret, and the profile surfaces need to read other people's.
 *
 * The input log is deliberately not selected — it is evidence for the replay
 * pass, not display data, and it is by far the largest column.
 */
export async function getPlayerRunRecords(pool, params = {}) {
    const gameSlug = cleanText(params.gameSlug, 60).toLowerCase();
    const playerId = cleanText(params.playerId, 120);
    const game = getGameBoards(gameSlug);
    if (!pool || !playerId || !game)
        return null;
    try {
        const res = await pool.query(`select player_id, board_id, value, model_id, track_id, verified, recorded_at
         from game_run_records
        where player_id = $1 and game_slug = $2`, [playerId, gameSlug]);
        const byBoard = new Map((res.rows || []).map((row) => [row.board_id, row]));
        // Ordered by the catalog, not by the query, so a player with gaps still
        // reads as one board list in a stable order rather than as whatever they
        // happen to have set.
        const records = game.boards.map((board) => {
            const row = byBoard.get(board.id);
            return row ? toRecord(row, board) : { boardId: board.id, boardLabel: board.label, value: null, valueLabel: "", unit: board.unit, direction: board.direction, verified: false };
        });
        return { playerId, gameSlug, title: game.title, records };
    }
    catch (err) {
        process.stderr.write(`[run-records] getPlayerRunRecords error: ${err?.message || err}\n`);
        return null;
    }
}
/**
 * Public top-N for one board. Unregistered game or unknown board returns null so
 * the route 404s rather than serving an empty board for a typo.
 *
 * `verified` rides along per entry instead of being filtered here. Hiding
 * unverified runs today would show an empty board, because nothing is verified
 * until the replay pass exists; surfacing the flag lets the client mark them and
 * lets a later policy change be a client change.
 */
export async function getBoardStandings(pool, params = {}) {
    const gameSlug = cleanText(params.gameSlug, 60).toLowerCase();
    const board = getBoard(gameSlug, params.boardId);
    const limit = clampLimit(params.limit, 25, 100);
    if (!pool || !board)
        return null;
    try {
        const res = await pool.query(`select r.player_id, r.value, r.model_id, r.track_id, r.verified, r.recorded_at,
              pp.profile_name, pp.avatar_asset_id
         from game_run_records r
         left join player_profiles pp on pp.player_id = r.player_id
        where r.game_slug = $1 and r.board_id = $2
        order by ${boardOrderSql(board)}
        limit $3`, [gameSlug, board.id, limit]);
        const entries = (res.rows || []).map((row, index) => {
            const value = Number(row.value) || 0;
            return {
                rank: index + 1,
                playerId: row.player_id,
                displayName: row.profile_name || "",
                avatarAssetId: row.avatar_asset_id || "",
                value,
                valueLabel: formatBoardValue(board, value),
                modelId: row.model_id || "",
                trackId: row.track_id || "",
                verified: row.verified === true,
                recordedAt: row.recorded_at || null,
            };
        });
        return { gameSlug, ...board, entries };
    }
    catch (err) {
        process.stderr.write(`[run-records] getBoardStandings error: ${err?.message || err}\n`);
        return null;
    }
}
/**
 * One player's rank on one board, and the board's size. This is what db/ladders
 * calls to build a run-records ladder placement, and it is kept here rather than
 * there so the ordering used to rank is the same fragment the board query uses.
 *
 * Exported separately from getBoardStandings because a placement needs the whole
 * board ranked to find one player, which a top-N read cannot answer.
 */
export async function getBoardPlacement(pool, params = {}) {
    const gameSlug = cleanText(params.gameSlug, 60).toLowerCase();
    const playerId = cleanText(params.playerId, 120);
    const board = getBoard(gameSlug, params.boardId);
    if (!pool || !playerId || !board)
        return null;
    try {
        const res = await pool.query(`with standings as (
         select player_id, value, model_id, track_id, verified, recorded_at,
                rank() over (order by ${boardOrderSql(board)}) as placement,
                count(*) over () as total_players
           from game_run_records
          where game_slug = $1 and board_id = $2
       )
       select * from standings where player_id = $3`, [gameSlug, board.id, playerId]);
        if (!res.rows?.length)
            return null;
        const row = res.rows[0];
        const value = Number(row.value) || 0;
        return {
            ...toRecord({ ...row, board_id: board.id }, board),
            rank: Number(row.placement) || 0,
            totalPlayers: Number(row.total_players) || 0,
            value,
        };
    }
    catch (err) {
        process.stderr.write(`[run-records] getBoardPlacement error: ${err?.message || err}\n`);
        return null;
    }
}
export { isBetterValue };
