export const PLAYER_LEVEL_CELEBRATION_STORAGE_KEY = "yam-bowling.player-level-celebrations.v1";

const SCHEMA_VERSION = 1;
const MAX_PENDING = 100;

function safeLevel(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(30, parsed)) : 1;
}

function emptyRecord() {
  return { version: SCHEMA_VERSION, players: {} };
}

function normalizeEquipment(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.scope !== "string" || typeof raw.slot !== "string" || typeof raw.itemId !== "string") return null;
  return { scope: raw.scope, slot: raw.slot, itemId: raw.itemId };
}

function normalizeReward(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.label !== "string") return null;
  return {
    id: raw.id,
    family: typeof raw.family === "string" ? raw.family : "reward",
    label: raw.label,
    level: safeLevel(raw.level),
    equipment: normalizeEquipment(raw.equipment),
  };
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== SCHEMA_VERSION) return emptyRecord();
  const players = {};
  for (const [playerId, value] of Object.entries(raw.players || {})) {
    if (!playerId || !value || typeof value !== "object") continue;
    const pending = Array.isArray(value.pending) ? value.pending.flatMap((event) => {
      if (!event || typeof event.id !== "string" || !event.id || !Array.isArray(event.rewards)) return [];
      const rewards = event.rewards.map(normalizeReward).filter(Boolean);
      return [{
        track: "player",
        id: event.id,
        fromLevel: safeLevel(event.fromLevel),
        toLevel: safeLevel(event.toLevel),
        rewards,
      }];
    }).slice(-MAX_PENDING) : [];
    players[playerId] = { level: safeLevel(value.level), pending };
  }
  return { version: SCHEMA_VERSION, players };
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function createPlayerLevelCelebrationQueue({ storage = defaultStorage(), rewards } = {}) {
  let record;
  try {
    record = normalizeRecord(JSON.parse(storage?.getItem?.(PLAYER_LEVEL_CELEBRATION_STORAGE_KEY) || "null"));
  } catch {
    record = emptyRecord();
  }

  function persist() {
    try {
      storage?.setItem?.(PLAYER_LEVEL_CELEBRATION_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Presentation state is recoverable; storage must never block sync.
    }
  }

  function observe(playerId, player) {
    if (typeof playerId !== "string" || !playerId || !player || typeof player !== "object") return [];
    const nextLevel = safeLevel(player.level);
    if (!record.players[playerId]) {
      record.players[playerId] = { level: nextLevel, pending: [] };
      persist();
      return [];
    }

    const state = record.players[playerId];
    const previousLevel = state.level;
    const added = [];
    if (nextLevel > previousLevel) {
      const earned = rewards?.rewardsBetween?.({ fromLevel: previousLevel, toLevel: nextLevel }) || [];
      if (earned.length) {
        const event = {
          track: "player",
          id: `player:${previousLevel}-${nextLevel}`,
          fromLevel: previousLevel,
          toLevel: nextLevel,
          rewards: earned.map(normalizeReward).filter(Boolean),
        };
        state.pending.push(event);
        added.push(event);
      }
    }
    state.level = Math.max(previousLevel, nextLevel);
    state.pending = state.pending.slice(-MAX_PENDING);
    persist();
    return added.map((event) => structuredClone(event));
  }

  function list(playerId) {
    return (record.players[playerId]?.pending || []).map((event) => structuredClone(event));
  }

  function peek(playerId) {
    return list(playerId)[0] || null;
  }

  function acknowledge(playerId, eventId) {
    const player = record.players[playerId];
    if (!player || typeof eventId !== "string") return false;
    const next = player.pending.filter((event) => event.id !== eventId);
    if (next.length === player.pending.length) return false;
    player.pending = next;
    persist();
    return true;
  }

  return { acknowledge, list, observe, peek };
}
