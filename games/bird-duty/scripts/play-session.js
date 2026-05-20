export const SHOTS_PER_RUN = 10;
export const GAME_OVER_TICKS = 120;

export function createPlaySession() {
  return {
    phase: "running",
    shotsRemaining: SHOTS_PER_RUN,
    score: 0,
    finalScore: null,
    gameOverTicks: 0,
  };
}

export function canFireShot(session) {
  return session.phase === "running" && session.shotsRemaining > 0;
}

export function fireShot(session) {
  if (!canFireShot(session)) return session;
  return {
    ...session,
    shotsRemaining: Math.max(0, session.shotsRemaining - 1),
  };
}

export function updatePlaySession(session, poop) {
  if (session.phase === "game-over") {
    return {
      ...session,
      gameOverTicks: session.gameOverTicks + 1,
    };
  }

  if (session.shotsRemaining > 0 || poop?.phase !== "inactive") return session;

  return {
    ...session,
    phase: "game-over",
    finalScore: session.score,
    gameOverTicks: 0,
  };
}

export function shouldReturnToMenu(session) {
  return session.phase === "game-over" && session.gameOverTicks >= GAME_OVER_TICKS;
}
