// Single-player sanctioned matches keep Arcade. Online style is frozen by the
// server into the match, never inferred from this device's setup preference.
export function localBowlingStyle(session) {
  return !session.campaignMatch && !session.tournamentMatch && !session.tutorialMatch
    && session.setup?.bowlingStyle === '3d' ? '3d' : 'arcade';
}

export function matchUses3d(session) {
  if (session.match?.bowlingStyle !== '3d') return false;
  return session.onlineMatch
    ? session.match?.playType === 'online'
    : ['cpu', 'hotseat'].includes(session.match?.playType);
}
