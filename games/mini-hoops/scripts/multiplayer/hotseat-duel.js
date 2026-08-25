import { normalizeMatchConfig } from "./match-config.js";

export const LOCAL_DUEL_PLAYING = "playing";
export const LOCAL_DUEL_PASS = "pass";
export const LOCAL_DUEL_COMPLETE = "complete";

function emptyPlayer(index) {
  return { name: `Player ${index + 1}`, score: 0, shots: 0, made: 0, accuracy: 0, bestStreak: 0 };
}

function normalizeSummary(value = {}) {
  const shots = Math.max(0, Math.floor(Number(value.shots) || 0));
  const made = Math.max(0, Math.min(shots || Infinity, Math.floor(Number(value.made) || 0)));
  return {
    score: Math.max(0, Math.floor(Number(value.score) || 0)),
    shots,
    made,
    accuracy: shots ? Math.round((made / shots) * 100) : 0,
    bestStreak: Math.max(0, Math.floor(Number(value.bestStreak) || 0)),
  };
}

export function createHotseatDuel(config) {
  return {
    phase: LOCAL_DUEL_PLAYING,
    config: normalizeMatchConfig(config),
    activePlayerIndex: 0,
    players: [emptyPlayer(0), emptyPlayer(1)],
    winnerIndexes: [],
  };
}

export function completeHotseatTurn(duel, summary) {
  if (!duel || duel.phase === LOCAL_DUEL_COMPLETE) return duel;
  Object.assign(duel.players[duel.activePlayerIndex], normalizeSummary(summary));
  if (duel.activePlayerIndex === 0) {
    duel.activePlayerIndex = 1;
    duel.phase = LOCAL_DUEL_PASS;
    return duel;
  }

  const best = Math.max(...duel.players.map(({ score }) => score));
  duel.winnerIndexes = duel.players
    .map(({ score }, index) => score === best ? index : -1)
    .filter((index) => index >= 0);
  duel.phase = LOCAL_DUEL_COMPLETE;
  return duel;
}

export function resumeHotseatDuel(duel) {
  if (duel?.phase === LOCAL_DUEL_PASS) duel.phase = LOCAL_DUEL_PLAYING;
  return duel;
}
