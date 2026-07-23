// Pure view-model shaping for match history: the compact row in the Ranked profile's
// recent-matches list, and the in-depth detail popup behind it.
//
// The input on both sides is the server's canonical match-history contract
// (platform-api/src/db/match-history.mts) — already viewer-relative, already carrying
// the outcome and rating delta. Nothing here re-derives who won; it only turns attested
// values into display strings and decides what is honest to show when the server says a
// field is unknown.
//
// Kept free of DOM so it is testable under `node --test`; the renderer lives in
// rankedMatchDetail.js / rankedMatchHistory.js.

const OUTCOME_LABELS = Object.freeze({
  win: "Victory",
  loss: "Defeat",
  draw: "Draw",
});

const OUTCOME_MARKS = Object.freeze({
  win: "W",
  loss: "L",
  draw: "D",
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function outcomeCode(entry) {
  const outcome = entry?.viewer?.outcome;
  return OUTCOME_LABELS[outcome] ? outcome : "none";
}

export function outcomeLabel(entry) {
  return OUTCOME_LABELS[outcomeCode(entry)] || "No result";
}

export function outcomeMark(entry) {
  return OUTCOME_MARKS[outcomeCode(entry)] || "–";
}

// A rating delta of exactly 0 is a real, meaningful outcome (damped repeat opponent),
// so it renders as "0" rather than being blanked out. An unknown delta renders as nothing.
export function ratingDeltaText(delta) {
  if (!Number.isFinite(delta)) return "";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function durationText(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function shortDateText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fullDateText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function boardText(board) {
  const value = cleanText(board);
  const match = value.match(/^(\d+)x(\d+)$/i);
  return match ? `${match[1]} x ${match[2]}` : value;
}

// "Commander" is the platform's placeholder profile name, so it loses to a real ranked
// tagline rather than being shown as if the player had chosen it.
export function participantName(participant) {
  if (!participant) return "Commander";
  if (participant.isViewer) return "You";
  const displayName = cleanText(participant.displayName);
  if (displayName && displayName.toLowerCase() !== "commander") return displayName;
  return cleanText(participant.title) || displayName || "Commander";
}

export function opponentsOf(entry) {
  const participants = Array.isArray(entry?.participants) ? entry.participants : [];
  const others = participants.filter((p) => !p.isViewer);
  // A spectator view has no viewer, so every participant is "other" — show them all.
  return others.length ? others : participants;
}

/** Compact row for the recent-matches list. */
export function buildMatchRowView(entry) {
  if (!entry || typeof entry !== "object") return null;
  const opponents = opponentsOf(entry);
  const opponent = opponents[0] || null;
  return {
    matchId: entry.matchId,
    outcome: outcomeCode(entry),
    mark: outcomeMark(entry),
    deltaText: ratingDeltaText(entry.viewer?.ratingDelta),
    opponentName: opponents.map(participantName).join(", ") || "Unknown",
    opponentAvatarUnit: opponent?.avatarUnit || null,
    opponentAvatarSkin: opponent?.avatarSkin || null,
    squad: Array.isArray(entry.participants?.[0]?.squad) ? entry.participants[0].squad : [],
    dateText: shortDateText(entry.endedAt),
    verified: Boolean(entry.verified),
  };
}

function sideView(participant, units) {
  const owned = units.filter((unit) => unit.seat === participant.seat);
  return {
    participant,
    name: participantName(participant),
    isViewer: Boolean(participant.isViewer),
    title: cleanText(participant.title),
    avatarUnit: participant.avatarUnit || null,
    avatarSkin: participant.avatarSkin || null,
    outcome: participant.outcome || null,
    ratingBefore: participant.ratingBefore,
    ratingAfter: participant.ratingAfter,
    deltaText: ratingDeltaText(participant.ratingDelta),
    // A verified board gives real per-unit rows; otherwise fall back to the squad list
    // with no alive/lost claim attached to it.
    units: owned.length
      ? owned.map((unit) => ({ id: unit.id, unitType: unit.unitType, alive: unit.alive, kills: unit.kills }))
      : (participant.squad || []).map((unitType) => ({ id: null, unitType, alive: null, kills: null })),
    unitsLost: participant.unitsLost,
    unitsTotal: participant.unitsTotal,
    survivalText: Number.isFinite(participant.unitsAlive) && Number.isFinite(participant.unitsTotal)
      ? `${participant.unitsAlive}/${participant.unitsTotal} survived`
      : "",
  };
}

/**
 * Full popup view-model. `meta` is only populated with facts the server attested — an
 * unknown length or turn count is dropped from the list rather than shown as a dash,
 * so nothing on screen implies a precision the record does not have.
 */
export function buildMatchDetailView(entry) {
  if (!entry || typeof entry !== "object") return null;
  const units = Array.isArray(entry.units) ? entry.units : [];
  const participants = Array.isArray(entry.participants) ? entry.participants : [];

  const meta = [];
  const played = fullDateText(entry.endedAt);
  if (played) meta.push({ label: "Played", value: played });
  const length = durationText(entry.durationMs);
  if (length) meta.push({ label: "Length", value: length });
  if (Number.isFinite(entry.turns)) meta.push({ label: "Turns", value: String(entry.turns) });
  const board = boardText(entry.board);
  if (board) meta.push({ label: "Board", value: board });

  const viewerDelta = entry.viewer?.ratingDelta;
  return {
    matchId: entry.matchId,
    outcome: outcomeCode(entry),
    outcomeLabel: outcomeLabel(entry),
    verified: Boolean(entry.verified),
    rated: Boolean(entry.rated),
    meta,
    rating: Number.isFinite(entry.viewer?.ratingBefore) && Number.isFinite(entry.viewer?.ratingAfter)
      ? {
        before: entry.viewer.ratingBefore,
        after: entry.viewer.ratingAfter,
        deltaText: ratingDeltaText(viewerDelta),
        direction: viewerDelta > 0 ? "up" : viewerDelta < 0 ? "down" : "flat",
      }
      : null,
    sides: participants.map((participant) => sideView(participant, units)),
    notes: Array.isArray(entry.notes) ? entry.notes.filter((note) => note && note.text) : [],
  };
}
