import { PHASES } from "./config.js";
import { cloneState, createInitialState, hydrateNetworkState } from "./state.js";

export const AUTHORITATIVE_MATCH_MESSAGE_TYPES = Object.freeze([
  "match_state",
  "signal_playback",
  "phase_result",
  "match_ended",
]);

function safeParse(value) {
  if (!value && value !== 0) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeSnapshot(baseState, payload) {
  if (!isPlainObject(payload)) return null;

  const embeddedState = isPlainObject(payload.state)
    ? payload.state
    : isPlainObject(payload.snapshot)
      ? payload.snapshot
      : null;

  const source = embeddedState || payload;
  const base = baseState ? cloneState(baseState) : createInitialState();

  const merged = {
    ...base,
    ...source,
    settings: isPlainObject(source.settings)
      ? { ...(base.settings || {}), ...source.settings }
      : { ...(base.settings || {}) },
    network: isPlainObject(source.network)
      ? { ...(base.network || {}), ...source.network }
      : (base.network ? { ...base.network } : null),
  };

  if (!Array.isArray(source.players)) {
    merged.players = base.players.map((player) => ({ ...player }));
  }

  if (!Array.isArray(source.activeSequence)) {
    merged.activeSequence = [...(base.activeSequence || [])];
  }

  if (!Array.isArray(source.ownerDraft)) {
    merged.ownerDraft = [...(base.ownerDraft || [])];
  }

  if (!isPlainObject(source.copyProgress)) {
    merged.copyProgress = Object.fromEntries(
      Object.entries(base.copyProgress || {}).map(([playerId, progress]) => [playerId, { ...progress }])
    );
  }

  if (!Array.isArray(source.roundResults)) {
    merged.roundResults = (base.roundResults || []).map((result) => ({ ...result }));
  }

  if (!isPlainObject(source.timer)) {
    merged.timer = base.timer ? { ...base.timer } : null;
  }

  if (!isPlainObject(source.playback)) {
    merged.playback = base.playback
      ? { ...base.playback, sequence: [...(base.playback.sequence || [])] }
      : null;
  }

  return merged;
}

function stampAuthorityNetworkMeta(state, context = {}) {
  return {
    ...(state.network || {}),
    authorityMode: "server",
    myClientId: context.myClientId || state.network?.myClientId || null,
    lobbyOwnerId: context.lobbyOwnerId || state.network?.lobbyOwnerId || null,
    hostId: context.hostId || state.network?.hostId || null,
  };
}

export function isAuthoritativeMatchMessageType(messageType) {
  return AUTHORITATIVE_MATCH_MESSAGE_TYPES.includes(String(messageType || ""));
}

export function applyAuthoritativeMatchMessage(currentState, messageType, value, context = {}) {
  if (!isAuthoritativeMatchMessageType(messageType)) return null;

  const payload = safeParse(value);
  if (!isPlainObject(payload)) return null;

  const nextSnapshot = mergeSnapshot(currentState, payload);
  if (!nextSnapshot) return null;

  if (messageType === "signal_playback") {
    nextSnapshot.phase = PHASES.SIGNAL_PLAYBACK;
  } else if (messageType === "match_ended") {
    nextSnapshot.phase = PHASES.MATCH_OVER;
  }

  const hydrated = hydrateNetworkState(nextSnapshot);
  if (!hydrated) return null;

  hydrated.mode = "online";
  hydrated.network = stampAuthorityNetworkMeta(hydrated, context);
  return hydrated;
}
