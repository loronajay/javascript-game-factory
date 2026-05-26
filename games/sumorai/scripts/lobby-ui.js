const LOBBY_PHASE_IDS = {
  side_select: 'lobby-phase-side-select',
  main: 'lobby-phase-main',
  searching: 'lobby-phase-searching',
  friend_options: 'lobby-phase-friend-options',
  create: 'lobby-phase-create',
  join: 'lobby-phase-join',
};

function sideLockedText(onlineSide) {
  return onlineSide === 'p1' ? 'Playing as P1 (Left)' : 'Playing as P2 (Right)';
}

function queueHintText(queueCounts, onlineSide) {
  if (!queueCounts) return '';
  const other = onlineSide === 'p1' ? 'p2' : 'p1';
  const count = queueCounts[other];
  if (!Number.isFinite(count)) return '';
  return count === 0 ? 'No opponents searching yet'
                     : `${count} ${count === 1 ? 'player' : 'players'} searching`;
}

function createLobbyUi({
  document,
  getOnlineSide,
  getQueueCounts,
  setLobbyPhase,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let searchDotsInterval = null;
  let waitingDotsInterval = null;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('screen--active'));
    document.getElementById(id).classList.add('screen--active');
  }

  function showLobbyPhase(phase) {
    document.querySelectorAll('.lobby-phase').forEach(el => { el.hidden = true; });
    document.getElementById(LOBBY_PHASE_IDS[phase]).hidden = false;
    setLobbyPhase(phase);
  }

  function stopSearchDots() {
    if (searchDotsInterval) {
      clearIntervalFn(searchDotsInterval);
      searchDotsInterval = null;
    }
  }

  function startSearchDots(baseText = 'Searching') {
    stopSearchDots();
    let tick = 0;
    const el = document.getElementById('searching-label');
    searchDotsInterval = setIntervalFn(() => {
      if (el) el.textContent = baseText + '.'.repeat(tick % 4);
      tick++;
    }, 400);
  }

  function stopWaitingDots() {
    if (waitingDotsInterval) {
      clearIntervalFn(waitingDotsInterval);
      waitingDotsInterval = null;
    }
  }

  function startWaitingDots() {
    stopWaitingDots();
    let tick = 0;
    const el = document.getElementById('room-waiting-text');
    waitingDotsInterval = setIntervalFn(() => {
      if (el) el.textContent = 'Waiting for partner' + '.'.repeat(tick % 4);
      tick++;
    }, 400);
  }

  function updateQueueHint() {
    const el = document.getElementById('queue-hint');
    if (el) el.textContent = queueHintText(getQueueCounts(), getOnlineSide());
  }

  function setSideLocked(elId) {
    const el = document.getElementById(elId);
    if (el) el.textContent = sideLockedText(getOnlineSide());
  }

  return {
    showScreen,
    showLobbyPhase,
    stopSearchDots,
    startSearchDots,
    stopWaitingDots,
    startWaitingDots,
    updateQueueHint,
    setSideLocked,
  };
}

export { createLobbyUi, LOBBY_PHASE_IDS, queueHintText, sideLockedText };
