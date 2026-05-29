import {
  isPlainObject,
  normalizeActivityItem,
  normalizeIdentity,
  sanitizeSingleLine,
} from "./activity-normalize.mjs";
import type { ActivityItem } from "./activity-normalize.mjs";

interface ActivityBuildOptions {
  actorDisplayName?: unknown;
  actorPlayerId?: unknown;
  visibility?: unknown;
  createdAt?: unknown;
  sessionId?: unknown;
}

function actorNameFromOptions(options: ActivityBuildOptions = {}): string {
  return sanitizeSingleLine(options?.actorDisplayName, 60) || "A pilot";
}

export function buildLoversLostRunActivity(runSummary: unknown, options: ActivityBuildOptions = {}): ActivityItem {
  const summary = isPlainObject(runSummary) ? runSummary : {};
  const actorDisplayName = actorNameFromOptions(options);
  const outcome = sanitizeSingleLine(summary.outcome, 24).toLowerCase() || "game_over";
  let text = `${actorDisplayName} finished a Lovers Lost run.`;
  if (outcome === "reunion") {
    text = `${actorDisplayName} reunited both lovers in Lovers Lost with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else if (outcome === "partial") {
    text = `${actorDisplayName} carried one lover to the finish in Lovers Lost for ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else if (summary.disconnectNote) {
    text = `${actorDisplayName} ended a Lovers Lost run after a disconnect with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else {
    text = `${actorDisplayName} timed out in Lovers Lost with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "lovers-lost",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: options?.createdAt,
    metadata: {
      outcome,
      totalScore: Math.max(0, Math.floor(Number(summary.totalScore) || 0)),
      elapsedFrames: Math.max(0, Math.floor(Number(summary.elapsedFrames) || 0)),
      boyFinished: !!summary.boyFinished,
      girlFinished: !!summary.girlFinished,
      disconnectNote: !!summary.disconnectNote,
      sessionId: sanitizeSingleLine(options?.sessionId, 120),
      boyIdentity: normalizeIdentity(summary.boyIdentity),
      girlIdentity: normalizeIdentity(summary.girlIdentity),
    },
  });
}

export function buildSumoraiMatchActivity(match: unknown, options: ActivityBuildOptions = {}): ActivityItem {
  const source = isPlainObject(match) ? match : {};
  const myProfile = normalizeIdentity(source.myProfile);
  const opponentProfile = normalizeIdentity(source.opponentProfile);
  const actorDisplayName = myProfile.displayName || actorNameFromOptions(options);
  const result = sanitizeSingleLine(source.result, 24).toLowerCase() || "loss";
  const opponentName = opponentProfile.displayName || "an opponent";
  const p1Wins = Math.max(0, Math.floor(Number(source.p1Wins) || 0));
  const p2Wins = Math.max(0, Math.floor(Number(source.p2Wins) || 0));
  const myWins = source.mySide === "p1" ? p1Wins : p2Wins;
  const oppWins = source.mySide === "p1" ? p2Wins : p1Wins;

  let text;
  if (result === "forfeit_win") {
    text = `${actorDisplayName} won a Sumorai match by forfeit against ${opponentName}.`;
  } else if (result === "win") {
    text = `${actorDisplayName} defeated ${opponentName} in Sumorai (${myWins}-${oppWins}).`;
  } else {
    text = `${actorDisplayName} lost a Sumorai match to ${opponentName} (${myWins}-${oppWins}).`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: myProfile.playerId || sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "sumorai",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: source.createdAt || options?.createdAt,
    metadata: {
      matchResult: result,
      mySide: sanitizeSingleLine(source.mySide, 4),
      p1Wins,
      p2Wins,
      opponentDisplayName: opponentProfile.displayName,
      sessionId: sanitizeSingleLine(source.sessionId, 120) || sanitizeSingleLine(options?.sessionId, 120),
      myProfile,
      opponentProfile,
    },
  });
}

export function buildCreatureBattlerMatchActivity(match: unknown, options: ActivityBuildOptions = {}): ActivityItem {
  const source = isPlainObject(match) ? match : {};
  const myProfile = normalizeIdentity(source.myProfile);
  const opponentProfile = normalizeIdentity(source.opponentProfile);
  const actorDisplayName = myProfile.displayName || actorNameFromOptions(options);
  const result = sanitizeSingleLine(source.result, 24).toLowerCase() || 'loss';
  const opponentName = opponentProfile.displayName || 'an opponent';

  let text;
  if (result === 'win') {
    text = `${actorDisplayName} won a Creature Battler match against ${opponentName}.`;
  } else if (result === 'draw') {
    text = `${actorDisplayName} fought to a draw in Creature Battler against ${opponentName}.`;
  } else {
    text = `${actorDisplayName} lost a Creature Battler match to ${opponentName}.`;
  }

  return normalizeActivityItem({
    type: 'game-result',
    actorPlayerId: myProfile.playerId || sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: 'creature-battler',
    summary: text,
    visibility: options?.visibility || 'friends',
    createdAt: source.createdAt || options?.createdAt,
    metadata: {
      matchResult: result,
      opponentDisplayName: opponentProfile.displayName,
      playerTeam: Array.isArray(source.playerTeam) ? source.playerTeam : [],
      opponentTeam: Array.isArray(source.opponentTeam) ? source.opponentTeam : [],
      sessionId: sanitizeSingleLine(source.sessionId, 120) || sanitizeSingleLine(options?.sessionId, 120),
      myProfile,
      opponentProfile,
    },
  });
}

export function buildBattleshitsMatchActivity(match: unknown, options: ActivityBuildOptions = {}): ActivityItem {
  const source = isPlainObject(match) ? match : {};
  const myProfile = normalizeIdentity(source.myProfile);
  const opponentProfile = normalizeIdentity(source.opponentProfile);
  const actorDisplayName = myProfile.displayName || actorNameFromOptions(options);
  const result = sanitizeSingleLine(source.result, 24).toLowerCase() || "loss";
  const opponentName = opponentProfile.displayName || "an opponent";

  let text = `${actorDisplayName} finished a Battleshits match against ${opponentName}.`;
  if (result === "win") {
    text = `${actorDisplayName} won a Battleshits match against ${opponentName}.`;
  } else if (result === "forfeit_win") {
    text = `${actorDisplayName} won a Battleshits match by forfeit against ${opponentName}.`;
  } else {
    text = `${actorDisplayName} lost a Battleshits match to ${opponentName}.`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: myProfile.playerId || sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "battleshits",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: source.createdAt || options?.createdAt,
    metadata: {
      matchResult: result,
      opponentDisplayName: opponentProfile.displayName,
      matchmakingMode: sanitizeSingleLine(source.matchmakingMode, 40),
      roomCode: sanitizeSingleLine(source.roomCode, 20),
      sessionId: sanitizeSingleLine(source.sessionId, 120) || sanitizeSingleLine(options?.sessionId, 120),
      myProfile,
      opponentProfile,
    },
  });
}
