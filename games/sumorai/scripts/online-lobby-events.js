function wireOnlineLobbyEvents({
  document,
  gameState,
  getOnlineClient,
  getOnlineSide,
  setIsOnline,
  setOnlineClient,
  setOnlineIsRanked,
  setOnlineQueueCounts,
  setOnlineSide,
  setSideLocked,
  showLobbyPhase,
  showScreen,
  stopAmbient,
  stopSearchDots,
  stopWaitingDots,
  updateQueueHint,
}) {
  document.querySelectorAll('.side-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-card').forEach(card => card.classList.remove('side-card--selected'));
      btn.classList.add('side-card--selected');
      setOnlineSide(btn.dataset.side);
      document.getElementById('side-conflict-error').hidden = true;
    });
  });

  onClick(document, 'btn-side-confirm', () => {
    document.getElementById('side-conflict-error').hidden = true;
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-online-side-back', () => {
    stopSearchDots();
    stopWaitingDots();
    disconnectOnlineClient({ getOnlineClient, setOnlineClient });
    setOnlineQueueCounts(null);
    showScreen('screen-menu');
  });

  onClick(document, 'btn-ranked-match', () => {
    setOnlineIsRanked(true);
    getOnlineClient().findMatch(getOnlineSide(), true);
  });

  onClick(document, 'btn-find-match', () => {
    setOnlineIsRanked(false);
    getOnlineClient().findMatch(getOnlineSide(), false);
  });

  onClick(document, 'btn-play-friend', () => {
    setSideLocked('friend-side-locked');
    showLobbyPhase('friend_options');
  });

  onClick(document, 'btn-lobby-main-back', () => {
    showLobbyPhase('side_select');
  });

  onClick(document, 'btn-cancel-search', () => {
    stopSearchDots();
    getOnlineClient().cancelSearch();
    getOnlineClient().cancelRoom();
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-create-room', () => {
    getOnlineClient().createRoom(getOnlineSide());
  });

  onClick(document, 'btn-join-room-option', () => {
    document.getElementById('room-code-input').value = '';
    showLobbyPhase('join');
  });

  onClick(document, 'btn-friend-options-back', () => {
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-cancel-room', () => {
    stopWaitingDots();
    getOnlineClient().cancelRoom();
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-join-submit', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;
    document.getElementById('searching-label').textContent = 'Joining room\u2026';
    setSideLocked('searching-side-locked');
    showLobbyPhase('searching');
    getOnlineClient().joinRoom(getOnlineSide(), code);
  });

  const roomCodeInput = document.getElementById('room-code-input');
  roomCodeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') document.getElementById('btn-join-submit').click();
  });
  roomCodeInput.addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase();
  });

  onClick(document, 'btn-join-back', () => {
    showLobbyPhase('friend_options');
    setSideLocked('friend-side-locked');
  });

  onClick(document, 'btn-online-rematch', () => {
    setIsOnline(false);
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    if (getOnlineClient()) {
      setSideLocked('online-side-locked');
      updateQueueHint();
      showScreen('screen-online-lobby');
      showLobbyPhase('main');
    } else {
      showScreen('screen-menu');
    }
  });

  onClick(document, 'btn-online-result-menu', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    stopSearchDots();
    stopWaitingDots();
    disconnectOnlineClient({ getOnlineClient, setOnlineClient });
    setIsOnline(false);
    showScreen('screen-menu');
  });

  onClick(document, 'btn-ranked-back', () => showScreen('screen-menu'));

  onClick(document, 'btn-disconnected-menu', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    disconnectOnlineClient({ getOnlineClient, setOnlineClient });
    setIsOnline(false);
    showScreen('screen-menu');
  });
}

function disconnectOnlineClient({ getOnlineClient, setOnlineClient }) {
  const client = getOnlineClient();
  if (client) client.disconnect();
  setOnlineClient(null);
}

function onClick(document, id, handler) {
  document.getElementById(id).addEventListener('click', handler);
}

export { wireOnlineLobbyEvents };
