function publishOnlineMatchResult({
  createPlatformApiClient,
  gameState,
  onlineIdentity,
  onlineIsRanked,
  onlineMatchSeed,
  onlineRemoteIdentity,
  onlineSide,
  publishMatchActivity,
  winner,
}) {
  const myResult = winner === onlineSide ? 'win' : 'loss';
  const sessionId = `sumorai:${onlineMatchSeed}`;

  publishMatchActivity({
    result: myResult,
    mySide: onlineSide,
    p1Wins: gameState.p1.wins,
    p2Wins: gameState.p2.wins,
    myProfile: onlineIdentity,
    opponentProfile: onlineRemoteIdentity,
    sessionId,
  }).catch(() => {});

  if (!onlineIsRanked || !onlineIdentity?.playerId || !onlineRemoteIdentity?.playerId) return;

  const apiClient = createPlatformApiClient();
  if (typeof apiClient?.updateGameRating === 'function') {
    apiClient.updateGameRating('sumorai-ranked', {
      opponentPlayerId: onlineRemoteIdentity.playerId,
      outcome: myResult,
      sessionId,
    }).catch(() => {});
  }
}

async function renderOnlineResultRating({
  createPlatformApiClient,
  document,
  onlineIdentity,
  renderRating,
}) {
  const playerId = onlineIdentity?.playerId;
  if (!playerId) return false;

  try {
    const apiClient = createPlatformApiClient();
    const rating = await apiClient.getGameRating('sumorai-ranked', playerId);
    return renderRating(document, rating);
  } catch {
    return false;
  }
}

async function renderRankedProfile({
  buildOnlineIdentity,
  createPlatformApiClient,
  document,
  factoryProfile,
  onlineIdentity,
  renderDefault,
  renderError,
  renderLoading,
  renderRating,
  renderSignedOut,
  showScreen,
}) {
  showScreen('screen-ranked-profile');
  const identity = onlineIdentity ?? buildOnlineIdentity(factoryProfile);
  const playerId = identity?.playerId;
  if (!playerId) {
    renderSignedOut(document);
    return;
  }

  renderLoading(document);
  try {
    const apiClient = createPlatformApiClient();
    const rating = await apiClient.getGameRating('sumorai-ranked', playerId);
    if (rating) renderRating(document, rating);
    else renderDefault(document);
  } catch {
    renderError(document);
  }
}

export {
  publishOnlineMatchResult,
  renderOnlineResultRating,
  renderRankedProfile,
};
