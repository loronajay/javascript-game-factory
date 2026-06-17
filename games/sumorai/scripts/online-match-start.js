function startOnlineMatchSession({
  factoryName,
  gameState,
  onlineClient,
  onlineIdentity,
  onlineRemoteIdentity,
  onlineSide,
  setIsOnline,
  setLabels,
  showScreen,
  startAmbient,
}) {
  const myName = onlineIdentity?.displayName || factoryName;
  const remoteName = onlineRemoteIdentity?.displayName || 'Opponent';
  setLabels({
    p1: onlineSide === 'p1' ? myName : remoteName,
    p2: onlineSide === 'p2' ? myName : remoteName,
  });

  gameState.roundTarget = 3;
  gameState.pendingRoundEnd = null;
  setIsOnline(true);

  // The rollback session itself is armed per round (see _ensureOnlineSession in game.js);
  // this helper only handles match-level setup: labels, format, ambient audio, and ping.
  onlineClient.startPinging();
  gameState.phase = 'online_countdown';
  showScreen('screen-game');
  startAmbient();
}

export { startOnlineMatchSession };
