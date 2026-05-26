function wireSetupEvents({
  document,
  gameState,
  factoryName,
  enterOnlineFlow,
  getBotConfig,
  getSelectedRounds,
  setBotConfig,
  setP1Label,
  setP2Label,
  setSelectedLayout,
  setSelectedRounds,
  showRankedProfile,
  showScreen,
  startMatch,
  stopAmbient,
}) {
  onClick(document, 'btn-local', () => {
    setBotConfig({ ...getBotConfig(), enabled: false });
    setP1Label(factoryName);
    setP2Label('Player 2');
    showScreen('screen-setup');
  });

  onClick(document, 'btn-cpu', () => showScreen('screen-cpu-setup'));
  onClick(document, 'btn-online', () => enterOnlineFlow());
  onClick(document, 'btn-ranked', () => showRankedProfile());

  wireToggleGroup(document, '.side-btn', 'side-btn--active', (btn) => {
    setBotConfig({
      ...getBotConfig(),
      side: btn.dataset.side === 'p1' ? 'p2' : 'p1',
    });
  });

  wireToggleGroup(document, '.diff-btn', 'diff-btn--active', (btn) => {
    setBotConfig({ ...getBotConfig(), difficulty: btn.dataset.difficulty });
  });

  wireToggleGroup(document, '.cpu-round-btn', 'cpu-round-btn--active', (btn) => {
    setSelectedRounds(Number(btn.dataset.rounds));
  });

  wireToggleGroup(document, '.cpu-layout-btn', 'cpu-layout-btn--active', (btn) => {
    setSelectedLayout(btn.dataset.layout);
  });

  onClick(document, 'btn-start-cpu', () => {
    const botConfig = { ...getBotConfig(), enabled: true };
    setBotConfig(botConfig);
    if (botConfig.side === 'p1') {
      setP1Label('CPU');
      setP2Label(factoryName);
    } else {
      setP1Label(factoryName);
      setP2Label('CPU');
    }
    gameState.roundTarget = getSelectedRounds() === 3 ? 2 : 3;
    startMatch();
  });

  onClick(document, 'btn-cpu-back', () => showScreen('screen-menu'));

  wireToggleGroup(document, '.round-btn', 'round-btn--active', (btn) => {
    setSelectedRounds(Number(btn.dataset.rounds));
  });

  wireToggleGroup(document, '.layout-btn', 'layout-btn--active', (btn) => {
    setSelectedLayout(btn.dataset.layout);
  });

  onClick(document, 'btn-start-match', () => {
    gameState.roundTarget = getSelectedRounds() === 3 ? 2 : 3;
    startMatch();
  });

  onClick(document, 'btn-setup-back', () => showScreen('screen-menu'));
  onClick(document, 'btn-rematch', () => startMatch());
  onClick(document, 'btn-result-menu', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    showScreen('screen-menu');
  });
}

function wireToggleGroup(document, selector, activeClass, onSelect) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(selector).forEach(other => other.classList.remove(activeClass));
      btn.classList.add(activeClass);
      onSelect(btn);
    });
  });
}

function onClick(document, id, handler) {
  document.getElementById(id).addEventListener('click', handler);
}

export { wireSetupEvents };
