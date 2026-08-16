export const MASTERY_CELEBRATION_STORAGE_KEY = "yam-bowling.mastery-celebrations.v1";

const SCHEMA_VERSION = 1;
const MAX_PENDING = 100;

function safeLevel(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(30, parsed)) : 1;
}

function emptyRecord() {
  return { version: SCHEMA_VERSION, players: {} };
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== SCHEMA_VERSION) return emptyRecord();
  const players = {};
  for (const [playerId, value] of Object.entries(raw.players || {})) {
    if (!playerId || !value || typeof value !== "object") continue;
    const levels = {};
    for (const [slug, level] of Object.entries(value.levels || {})) {
      if (typeof slug === "string" && slug) levels[slug] = safeLevel(level);
    }
    const pending = Array.isArray(value.pending) ? value.pending.filter((event) => (
      event && typeof event.id === "string" && event.id
      && typeof event.characterSlug === "string" && event.characterSlug
      && Array.isArray(event.rewards)
    )).slice(-MAX_PENDING) : [];
    players[playerId] = { levels, pending };
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

export function createMasteryCelebrationQueue({ storage = defaultStorage(), rewards } = {}) {
  let record;
  try {
    record = normalizeRecord(JSON.parse(storage?.getItem?.(MASTERY_CELEBRATION_STORAGE_KEY) || "null"));
  } catch {
    record = emptyRecord();
  }

  function persist() {
    try {
      storage?.setItem?.(MASTERY_CELEBRATION_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Presentation state is recoverable; a storage failure must not block sync.
    }
  }

  function observe(playerId, bowlers) {
    if (typeof playerId !== "string" || !playerId || !Array.isArray(bowlers)) return [];
    const valid = bowlers.filter((entry) => entry && typeof entry.slug === "string" && entry.slug);
    if (!record.players[playerId]) {
      record.players[playerId] = {
        levels: Object.fromEntries(valid.map((entry) => [entry.slug, safeLevel(entry.level)])),
        pending: [],
      };
      persist();
      return [];
    }

    const player = record.players[playerId];
    const added = [];
    for (const bowler of valid) {
      const nextLevel = safeLevel(bowler.level);
      const previousLevel = player.levels[bowler.slug] || 1;
      if (nextLevel > previousLevel) {
        const earned = rewards?.rewardsBetween?.({
          characterSlug: bowler.slug,
          characterName: bowler.name,
          fromLevel: previousLevel,
          toLevel: nextLevel,
        }) || [];
        if (earned.length) {
          const event = {
            id: `${bowler.slug}:${previousLevel}-${nextLevel}`,
            characterSlug: bowler.slug,
            characterName: bowler.name || bowler.slug,
            fromLevel: previousLevel,
            toLevel: nextLevel,
            rewards: earned.map((reward) => ({ id: reward.id, label: reward.label, level: reward.level })),
          };
          player.pending.push(event);
          added.push(event);
        }
      }
      player.levels[bowler.slug] = Math.max(previousLevel, nextLevel);
    }
    player.pending = player.pending.slice(-MAX_PENDING);
    persist();
    return added.map((event) => structuredClone(event));
  }

  function list(playerId) {
    const pending = record.players[playerId]?.pending || [];
    return pending.map((event) => structuredClone(event));
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

