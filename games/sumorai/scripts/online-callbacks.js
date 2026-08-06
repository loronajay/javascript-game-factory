function wireOnlineCallbacks({
  buildForfeitSessionId,
  createPlatformApiClient,
  gameState,
  getOnlineIdentity,
  getOnlineIsRanked,
  getOnlineMatchSeed,
  getOnlineRemoteIdentity,
  routeRemoteInput,
  normalizeOnlineStagePlan,
  onOpponentLeftResults,
  onlineClient,
  receiveRematchStart,
  receiveRematchState,
  setIsOnline,
  setOnlineClockOffset,
  setOnlineMatchSeed,
  setOnlineQueueCounts,
  setOnlineRemoteIdentity,
  setOnlineStagePlan,
  setOnlineStartAt,
  showLobbyPhase,
  showScreen,
  startOnlineMatch,
  startSearchDots,
  startWaitingDots,
  stopAmbient,
  stopSearchDots,
  stopWaitingDots,
  updateQueueHint,
  setSideLocked,
  document,
}) {
  onlineClient.cb.onConnected = () => {
    onlineClient.requestQueueStatus();
  };

  onlineClient.cb.onQueueCounts = (counts) => {
    setOnlineQueueCounts(counts);
    updateQueueHint();
  };

  onlineClient.cb.onSearching = () => {
    setSideLocked('searching-side-locked');
    startSearchDots(getOnlineIsRanked() ? 'Searching Ranked' : 'Searching');
    showLobbyPhase('searching');
  };

  onlineClient.cb.onSearchCancelled = () => {
    stopSearchDots();
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  };

  onlineClient.cb.onRoomCreated = (code) => {
    document.getElementById('room-code-display').textContent = code;
    startWaitingDots();
    showLobbyPhase('create');
  };

  onlineClient.cb.onMatchReady = ({ seed, matchSettings, serverNow, startAt }) => {
    const stagePlan = normalizeOnlineStagePlan(matchSettings, seed);
    if (!stagePlan) {
      onlineClient.cb.onError?.('MATCH_SETTINGS_MISSING', 'Server did not provide Sumorai stage settings');
      return;
    }
    stopSearchDots();
    stopWaitingDots();
    setOnlineMatchSeed(stagePlan.seed);
    setOnlineStagePlan(stagePlan);
    setOnlineClockOffset(serverNow - Date.now());
    setOnlineStartAt(startAt);
    startOnlineMatch();
  };

  onlineClient.cb.onRemoteProfile = (profile) => {
    setOnlineRemoteIdentity(profile);
  };

  onlineClient.cb.onRemoteInput = (snap) => {
    routeRemoteInput(snap);
  };

  onlineClient.cb.onRematch = state => receiveRematchState?.(state);
  onlineClient.cb.onRematchStart = start => receiveRematchStart?.(start);

  onlineClient.cb.onSideConflict = () => {
    stopSearchDots();
    stopWaitingDots();
    document.querySelectorAll('.side-card').forEach(card => card.classList.remove('side-card--selected'));
    document.getElementById('side-conflict-error').hidden = false;
    showScreen('screen-online-lobby');
    showLobbyPhase('side_select');
  };

  onlineClient.cb.onPartnerLeft = () => {
    const matchAlreadyEnded = gameState.phase === 'match_end';
    stopSearchDots();
    stopWaitingDots();
    onlineClient.stopPinging();
    maybeAwardForfeitWin({
      buildForfeitSessionId,
      createPlatformApiClient,
      gameState,
      getOnlineIdentity,
      getOnlineIsRanked,
      getOnlineMatchSeed,
      getOnlineRemoteIdentity,
    });

    setIsOnline(false);
    setOnlineRemoteIdentity(null);
    stopAmbient();
    // Leaving a completed relay room is normal when either player chooses Rematch/Menu.
    // Keep the result intact instead of replacing it with a misleading disconnect screen.
    if (matchAlreadyEnded) {
      onOpponentLeftResults?.();
      return;
    }
    gameState.phase = 'menu';
    showScreen('screen-online-disconnected');
  };

  onlineClient.cb.onError = (code, message) => {
    console.warn('[Sumorai Online] error:', code, message);
  };
}

function maybeAwardForfeitWin({
  buildForfeitSessionId,
  createPlatformApiClient,
  gameState,
  getOnlineIdentity,
  getOnlineIsRanked,
  getOnlineMatchSeed,
  getOnlineRemoteIdentity,
}) {
  const activePhasesForForfeit = new Set(['online_countdown', 'round_start', 'active', 'round_end']);
  const identity = getOnlineIdentity();
  const remoteIdentity = getOnlineRemoteIdentity();
  if (!getOnlineIsRanked() || !activePhasesForForfeit.has(gameState.phase)
      || !identity?.playerId || !remoteIdentity?.playerId) {
    return false;
  }

  const apiClient = createPlatformApiClient();
  if (typeof apiClient?.updateGameRating !== 'function') return false;

  apiClient.updateGameRating('sumorai-ranked', {
    opponentPlayerId: remoteIdentity.playerId,
    outcome: 'win',
    sessionId: buildForfeitSessionId(getOnlineMatchSeed()),
  }).catch(() => {});
  return true;
}

export { maybeAwardForfeitWin, wireOnlineCallbacks };
