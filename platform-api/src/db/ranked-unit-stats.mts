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
export const SQUAD_MAX_UNITS = 8;

// Canonicalize a reported final board into a stable, comparable shape, or null if the
// payload is malformed. Sorting by id makes agreement order-independent and gives both
// sides an identical canonical form to compare.
export function normalizeUnitResults(raw: any): any {
  if (!raw || typeof raw !== "object") return null;
  const list = Array.isArray(raw.units) ? raw.units : null;
  if (!list || list.length === 0 || list.length > UNIT_REPORT_MAX_UNITS) return null;

  const units = [];
  for (const u of list) {
    if (!u || typeof u !== "object") return null;
    const id = typeof u.id === "string" ? u.id.slice(0, UNIT_ID_MAX_LENGTH) : null;
    const type = typeof u.type === "string" ? u.type.slice(0, UNIT_TYPE_MAX_LENGTH) : null;
    const seat = Number(u.seat);
    if (!id || !type || !(seat === 1 || seat === 2)) return null;
    const alive = Boolean(u.alive);
    const kills = Number.isInteger(u.kills) && u.kills >= 0 ? Math.min(u.kills, 99) : 0;
    units.push({ id, seat, type, alive, kills });
  }
  units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { units };
}

// True only when both reports are well-formed and describe the identical final board.
export function unitReportsAgree(a: any, b: any): boolean {
  const na = normalizeUnitResults(a);
  const nb = normalizeUnitResults(b);
  if (!na || !nb) return false;
  if (na.units.length !== nb.units.length) return false;
  for (let i = 0; i < na.units.length; i += 1) {
    const x = na.units[i];
    const y = nb.units[i];
    if (x.id !== y.id || x.seat !== y.seat || x.type !== y.type || x.alive !== y.alive || x.kills !== y.kills) {
      return false;
    }
  }
  return true;
}

// Per-(seat, unitType) stat deltas for an agreed board. `outcomeA` is the resolved
// result from seat 1's (player_a's) perspective: win|loss|draw. seat 1 = player_a,
// seat 2 = player_b (enforced by the ranked rendezvous: player_a is the lobby owner).
export function unitStatDeltas(canonical: any, { outcomeA }: any): any[] {
  const norm = normalizeUnitResults(canonical);
  if (!norm) return [];
  const winnerSeat = outcomeA === "win" ? 1 : outcomeA === "loss" ? 2 : 0;
  return norm.units.map((u: any) => ({
    seat: u.seat,
    unitType: u.type,
    games: 1,
    wins: u.seat === winnerSeat ? 1 : 0,
    kills: u.kills || 0,
    survivals: u.alive ? 1 : 0,
  }));
}

// A squad is a short list of unit-type ids, stored per match for history display.
export function normalizeSquad(raw: any): any {
  if (!Array.isArray(raw)) return null;
  const squad = raw
    .filter((t) => typeof t === "string")
    .map((t) => t.slice(0, UNIT_TYPE_MAX_LENGTH))
    .slice(0, SQUAD_MAX_UNITS);
  return squad.length ? squad : null;
}
