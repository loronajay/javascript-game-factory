// Pure helpers for ranked per-unit stats (Phase 2 of RANKED_FEATURE_PLAN.md).
//
// Trust model: a ranked match is deterministic lockstep, so at match end BOTH clients
// hold the identical authoritative board. Each side reports the SAME shared final board
// (every unit of both seats, alive/dead + optional kills). Per-unit stats are credited
// only when both members' reports are present AND agree — mirroring the ELO
// dual-attestation. A single client cannot fabricate a unit record on its own.
//
// These helpers are pure and deterministic (no db, no clock) so the agreement and
// aggregation logic is fully unit-testable. The unit report is derived from
// authoritative state on the client, never from the online state hash.
export const UNIT_REPORT_MAX_UNITS = 16;
const UNIT_TYPE_MAX_LENGTH = 40;
const UNIT_ID_MAX_LENGTH = 64;
const MAX_REPORTED_TURNS = 999;
export const SQUAD_MAX_UNITS = 8;
// Canonicalize a reported final board into a stable, comparable shape, or null if the
// payload is malformed. Sorting by id makes agreement order-independent and gives both
// sides an identical canonical form to compare.
//
// `turns` is an optional attested match length that rides along with the board; a client
// that omits it still produces a valid report (see unitReportsAgree).
export function normalizeUnitResults(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const list = Array.isArray(raw.units) ? raw.units : null;
    if (!list || list.length === 0 || list.length > UNIT_REPORT_MAX_UNITS)
        return null;
    const units = [];
    for (const u of list) {
        if (!u || typeof u !== "object")
            return null;
        const id = typeof u.id === "string" ? u.id.slice(0, UNIT_ID_MAX_LENGTH) : null;
        const type = typeof u.type === "string" ? u.type.slice(0, UNIT_TYPE_MAX_LENGTH) : null;
        const seat = Number(u.seat);
        if (!id || !type || !(seat === 1 || seat === 2))
            return null;
        const alive = Boolean(u.alive);
        // null (not 0) when the client did not report kills at all, so unitReportsAgree can
        // tell "no claim" apart from "claimed zero" — see the rollout note there.
        const kills = Number.isInteger(u.kills) && u.kills >= 0 ? Math.min(u.kills, 99) : null;
        units.push({ id, seat, type, alive, kills });
    }
    units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const turns = Number.isInteger(raw.turns) && raw.turns >= 0 ? Math.min(raw.turns, MAX_REPORTED_TURNS) : null;
    return { units, turns };
}
// True only when both reports are well-formed and describe the identical final board.
// `turns` and `kills` are compared only when BOTH sides sent them, so a client that
// predates either field still reaches agreement against one that sends it — a mismatched
// pair would otherwise silently lose per-unit stat crediting during a rollout, including
// the survival stats that already worked.
export function unitReportsAgree(a, b) {
    const na = normalizeUnitResults(a);
    const nb = normalizeUnitResults(b);
    if (!na || !nb)
        return false;
    if (na.units.length !== nb.units.length)
        return false;
    if (na.turns !== null && nb.turns !== null && na.turns !== nb.turns)
        return false;
    for (let i = 0; i < na.units.length; i += 1) {
        const x = na.units[i];
        const y = nb.units[i];
        if (x.id !== y.id || x.seat !== y.seat || x.type !== y.type || x.alive !== y.alive) {
            return false;
        }
        if (x.kills !== null && y.kills !== null && x.kills !== y.kills)
            return false;
    }
    return true;
}
// Per-(seat, unitType) stat deltas for an agreed board. `outcomeA` is the resolved
// result from seat 1's (player_a's) perspective: win|loss|draw. seat 1 = player_a,
// seat 2 = player_b (enforced by the ranked rendezvous: player_a is the lobby owner).
export function unitStatDeltas(canonical, { outcomeA }) {
    const norm = normalizeUnitResults(canonical);
    if (!norm)
        return [];
    const winnerSeat = outcomeA === "win" ? 1 : outcomeA === "loss" ? 2 : 0;
    return norm.units.map((u) => ({
        seat: u.seat,
        unitType: u.type,
        games: 1,
        wins: u.seat === winnerSeat ? 1 : 0,
        kills: u.kills || 0,
        survivals: u.alive ? 1 : 0,
    }));
}
// A squad is a short list of unit-type ids, stored per match for history display.
export function normalizeSquad(raw) {
    if (!Array.isArray(raw))
        return null;
    const squad = raw
        .filter((t) => typeof t === "string")
        .map((t) => t.slice(0, UNIT_TYPE_MAX_LENGTH))
        .slice(0, SQUAD_MAX_UNITS);
    return squad.length ? squad : null;
}
