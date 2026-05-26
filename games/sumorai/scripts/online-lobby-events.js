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
  playSound = () => {},
}) {
  document.querySelectorAll('.side-card').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('ching');
      document.querySelectorAll('.side-card').forEach(card => card.classList.remove('side-card--selected'));
      btn.classList.add('side-card--selected');
      setOnlineSide(btn.dataset.side);
      document.getElementById('side-conflict-error').hidden = true;
    });
  });

  onClick(document, 'btn-side-confirm', () => {
    playSound('ching');
    document.getElementById('side-conflict-error').hidden = true;
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-online-side-back', () => {
    playSound('swing');
    stopSearchDots();
    stopWaitingDots();
    disconnectOnlineClient({ getOnlineClient, setOnlineClient });
    setOnlineQueueCounts(null);
    showScreen('screen-menu');
  });

  onClick(document, 'btn-ranked-match', () => {
    playSound('ching');
    setOnlineIsRanked(true);
    getOnlineClient().findMatch(getOnlineSide(), true);
  });

  onClick(document, 'btn-find-match', () => {
    playSound('ching');
    setOnlineIsRanked(false);
    getOnlineClient().findMatch(getOnlineSide(), false);
  });

  onClick(document, 'btn-play-friend', () => {
    playSound('ching');
    setSideLocked('friend-side-locked');
    showLobbyPhase('friend_options');
  });

  onClick(document, 'btn-lobby-main-back', () => {
    playSound('swing');
    showLobbyPhase('side_select');
  });

  onClick(document, 'btn-cancel-search', () => {
    playSound('swing');
    stopSearchDots();
    getOnlineClient().cancelSearch();
    getOnlineClient().cancelRoom();
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-create-room', () => {
    playSound('ching');
    getOnlineClient().createRoom(getOnlineSide());
  });

  onClick(document, 'btn-join-room-option', () => {
    playSound('ching');
    document.getElementById('room-code-input').value = '';
    showLobbyPhase('join');
  });

  onClick(document, 'btn-friend-options-back', () => {
    playSound('swing');
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-cancel-room', () => {
    playSound('swing');
    stopWaitingDots();
    getOnlineClient().cancelRoom();
    setSideLocked('online-side-locked');
    updateQueueHint();
    showLobbyPhase('main');
  });

  onClick(document, 'btn-join-submit', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;
    playSound('ching');
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
    playSound('swing');
    showLobbyPhase('friend_options');
    setSideLocked('friend-side-locked');
  });

  onClick(document, 'btn-online-rematch', () => {
    playSound('ching');
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
    playSound('swing');
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    stopSearchDots();
    stopWaitingDots();
    disconnectOnlineClient({ getOnlineClient, setOnlineClient });
    setIsOnline(false);
    showScreen('screen-menu');
  });

  onClick(document, 'btn-ranked-back', () => { playSound('swing'); showScreen('screen-menu'); });

  onClick(document, 'btn-disconnected-menu', () => {
    playSound('swing');
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
