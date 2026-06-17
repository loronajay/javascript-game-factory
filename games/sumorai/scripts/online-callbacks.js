function wireOnlineCallbacks({
  buildForfeitSessionId,
  createPlatformApiClient,
  gameState,
  getOnlineIdentity,
  getOnlineIsRanked,
  getOnlineMatchSeed,
  getOnlineRemoteIdentity,
  getOnlineSession,
  normalizeOnlineStagePlan,
  onlineClient,
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
    // The rollback session owns prediction, misprediction detection, and resimulation. It
    // also rejects inputs tagged with a different round (epoch), so a late input from the
    // previous round cannot corrupt this round's confirmed-frame tracking.
    const session = getOnlineSession();
    if (session) session.onRemoteInput(snap.seq, snap, snap.adv, snap.epoch);
  };

  onlineClient.cb.onSideConflict = () => {
    stopSearchDots();
    stopWaitingDots();
    document.querySelectorAll('.side-card').forEach(card => card.classList.remove('side-card--selected'));
    document.getElementById('side-conflict-error').hidden = false;
    showScreen('screen-online-lobby');
    showLobbyPhase('side_select');
  };

  onlineClient.cb.onPartnerLeft = () => {
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
    gameState.phase = 'menu';
    stopAmbient();
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
