// Canonical match-history contract.
//
// Every "match history" surface reads exactly one shape, produced here: the Ranked
// profile's recent-matches list, the in-depth match popup, and the general (all-modes)
// history tab that comes later. Source subsystems own their own storage and adapt their
// rows into a `MatchHistoryRecord`; this module owns perspective, derivation, and
// normalization so no surface has to re-derive "did I win" or "what was my delta".
//
// Design rules, in the order they matter:
//
//  1. Participant-shaped, not me/opponent-shaped. Ranked is 1v1 today, but Tactical
//     Arena already plays 3/4-player FFA and 2v2 Teams, so the contract carries a
//     participant list with seat/team and lets the renderer collapse it to "you vs
//     them". Adding a casual-match source later must not change this shape.
//  2. Viewer-relative, never viewer-stored. A match is stored once; `viewerPlayerId`
//     decides ordering (viewer first) and the `viewer` convenience projection. The same
//     row shapes differently for each of its members and for a third-party spectator.
//  3. Nothing is invented. Any field the source cannot attest is `null`, never a
//     plausible default. `verified` states whether the per-unit detail was
//     cross-attested by both clients; callers must present unverified detail as
//     self-reported rather than as fact.
//  4. Note vocabularies are source-specific (ranked has its own anti-cheat flags), so
//     adapters supply `{ code, text }` pairs and this module only normalizes them.
//
// Pure and deterministic: no db handle, no clock. All shaping is unit-testable.

export const MATCH_HISTORY_CONTRACT_VERSION = 1;

const VALID_OUTCOMES = new Set(["win", "loss", "draw"]);
const VALID_STATUSES = new Set(["resolved", "voided", "disputed"]);
const MAX_PARTICIPANTS = 8;
const MAX_UNITS = 32;
const MAX_NOTES = 8;
const MAX_SQUAD = 8;

function text(value: any, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function isoOrNull(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Guarded against JS's helpful coercions: Number(null) and Number("") are both 0, which
// would turn "this match has no after-rating" into a -1200 rating delta.
function intOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function outcomeOrNull(value: any): string | null {
  return VALID_OUTCOMES.has(value) ? value : null;
}

// Elapsed wall time between the two source timestamps. Negative or partial pairs are
// null rather than 0 — an unknown duration must not read as an instant match.
function durationBetween(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function normalizeUnit(raw: any): any | null {
  if (!raw || typeof raw !== "object") return null;
  const seat = intOrNull(raw.seat);
  const unitType = text(raw.unitType ?? raw.type, 40);
  if (seat === null || !unitType) return null;
  return {
    id: text(raw.id, 64),
    unitType,
    seat,
    alive: Boolean(raw.alive),
    kills: Math.max(0, intOrNull(raw.kills) ?? 0),
  };
}

function normalizeUnits(raw: any): any[] | null {
  if (!Array.isArray(raw)) return null;
  const units = raw.map(normalizeUnit).filter(Boolean).slice(0, MAX_UNITS);
  return units.length ? units : null;
}

function normalizeSquad(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => text(entry, 40)).filter(Boolean).slice(0, MAX_SQUAD) as string[];
}

function normalizeNotes(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((note) => {
      const code = text(note?.code, 60);
      const body = text(note?.text, 200);
      return code && body ? { code, text: body } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_NOTES);
}

// Per-seat unit tallies from the (cross-attested) final board. Returned as a map so a
// participant list of any size can look up its own row.
function talliesBySeat(units: any[] | null): Map<number, any> {
  const tallies = new Map<number, any>();
  for (const unit of units || []) {
    const tally = tallies.get(unit.seat) || { unitsTotal: 0, unitsAlive: 0, unitsLost: 0, kills: 0 };
    tally.unitsTotal += 1;
    if (unit.alive) tally.unitsAlive += 1;
    else tally.unitsLost += 1;
    tally.kills += unit.kills;
    tallies.set(unit.seat, tally);
  }
  return tallies;
}

function normalizeParticipant(raw: any, { viewerPlayerId, units, tallies }: any): any {
  const playerId = text(raw?.playerId, 120);
  const seat = intOrNull(raw?.seat);
  const ratingBefore = intOrNull(raw?.ratingBefore);
  const ratingAfter = intOrNull(raw?.ratingAfter);
  const tally = seat === null ? null : tallies.get(seat) || null;
  // The final board is the better squad source when it exists: it is the board BOTH
  // clients attested, where `squad` is one player's self-report.
  const fromBoard = units
    ? units.filter((unit: any) => unit.seat === seat).map((unit: any) => unit.unitType)
    : null;
  return {
    playerId,
    seat,
    team: intOrNull(raw?.team) ?? seat,
    isViewer: Boolean(playerId && viewerPlayerId && playerId === viewerPlayerId),
    displayName: text(raw?.displayName),
    title: text(raw?.title),
    avatarUnit: text(raw?.avatarUnit, 40),
    avatarSkin: text(raw?.avatarSkin, 60),
    outcome: outcomeOrNull(raw?.outcome),
    ratingBefore,
    ratingAfter,
    ratingDelta: ratingBefore !== null && ratingAfter !== null ? ratingAfter - ratingBefore : null,
    squad: fromBoard && fromBoard.length ? fromBoard.slice(0, MAX_SQUAD) : normalizeSquad(raw?.squad),
    unitsTotal: tally ? tally.unitsTotal : null,
    unitsAlive: tally ? tally.unitsAlive : null,
    unitsLost: tally ? tally.unitsLost : null,
  };
}

// Viewer first, then ascending seat. Stable ordering keeps a rendered row from
// reshuffling between the list and the detail popup.
function orderParticipants(participants: any[]): any[] {
  return participants.slice().sort((a, b) => {
    if (a.isViewer !== b.isViewer) return a.isViewer ? -1 : 1;
    return (a.seat ?? 0) - (b.seat ?? 0);
  });
}

/**
 * Shape one recorded match into the canonical contract.
 *
 * `record` is the source-adapter input:
 *   { matchId, gameSlug, source, mode, status, rated, board, startedAt, endedAt,
 *     turns, verified, participants[], units[]|null, notes[] }
 *
 * `options.detail` includes the per-unit final board in the output; the list view omits
 * it. Both views derive every other field identically, so a row and its popup can never
 * disagree about the outcome or the rating delta.
 */
export function buildMatchHistoryEntry(record: any, { viewerPlayerId = null, detail = false }: any = {}): any {
  if (!record || typeof record !== "object") return null;
  const matchId = text(record.matchId, 200);
  const gameSlug = text(record.gameSlug, 60);
  if (!matchId || !gameSlug) return null;

  const verified = Boolean(record.verified);
  // Per-unit detail is only ever exposed when both clients attested the same final
  // board. An unverified board is one player's word and is dropped rather than shown.
  const units = verified ? normalizeUnits(record.units) : null;
  const tallies = talliesBySeat(units);
  const viewerId = text(viewerPlayerId, 120);

  const participants = orderParticipants(
    (Array.isArray(record.participants) ? record.participants : [])
      .slice(0, MAX_PARTICIPANTS)
      .map((raw: any) => normalizeParticipant(raw, { viewerPlayerId: viewerId, units, tallies })),
  );

  const startedAt = isoOrNull(record.startedAt);
  const endedAt = isoOrNull(record.endedAt);
  const me = participants.find((p: any) => p.isViewer) || null;

  const entry: any = {
    contractVersion: MATCH_HISTORY_CONTRACT_VERSION,
    matchId,
    gameSlug,
    source: text(record.source, 40) || "unknown",
    mode: text(record.mode, 40) || null,
    status: VALID_STATUSES.has(record.status) ? record.status : "resolved",
    rated: Boolean(record.rated),
    board: text(record.board, 20),
    startedAt,
    endedAt,
    durationMs: durationBetween(startedAt, endedAt),
    turns: verified ? intOrNull(record.turns) : null,
    verified,
    viewer: me
      ? {
        playerId: me.playerId,
        seat: me.seat,
        outcome: me.outcome,
        ratingBefore: me.ratingBefore,
        ratingAfter: me.ratingAfter,
        ratingDelta: me.ratingDelta,
      }
      : null,
    participants,
    notes: normalizeNotes(record.notes),
    hasDetail: true,
  };

  if (detail) {
    entry.units = (units || []).map((unit: any) => {
      const owner = participants.find((p: any) => p.seat === unit.seat) || null;
      return {
        id: unit.id,
        unitType: unit.unitType,
        seat: unit.seat,
        playerId: owner?.playerId ?? null,
        isViewer: Boolean(owner?.isViewer),
        alive: unit.alive,
        kills: unit.kills,
      };
    });
  }

  return entry;
}
