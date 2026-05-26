function startOnlineMatchSession({
  ROLLBACK_WINDOW,
  factoryName,
  gameState,
  onlineClient,
  onlineIdentity,
  onlineRemoteIdentity,
  onlineSide,
  setIsOnline,
  setLabels,
  setOnlinePartnerEnd,
  setOnlinePartnerGraceTicks,
  setOnlineRemoteLastInput,
  setResimulating,
  setRollbackCounters,
  setRollbackState,
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
  setIsOnline(true);
  setOnlineRemoteLastInput(null);
  setOnlinePartnerEnd(null);
  setOnlinePartnerGraceTicks(0);
  setRollbackState({
    localFrame: 0,
    stateBuffer: new Array(ROLLBACK_WINDOW),
    localInputs: new Array(ROLLBACK_WINDOW),
    predicted: new Array(ROLLBACK_WINDOW),
  });
  setResimulating(false);
  setRollbackCounters({
    rollbacksThisSec: 0,
    displayRollbacks: 0,
    secStartFrame: 0,
  });

  onlineClient.startPinging();
  gameState.phase = 'online_countdown';
  showScreen('screen-game');
  startAmbient();
}

export { startOnlineMatchSession };
