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
  playSound = () => {},
}) {
  onClick(document, 'btn-local', () => {
    playSound('ching');
    setBotConfig({ ...getBotConfig(), enabled: false });
    setP1Label(factoryName);
    setP2Label('Player 2');
    showScreen('screen-setup');
  });

  onClick(document, 'btn-cpu', () => { playSound('ching'); showScreen('screen-cpu-setup'); });
  onClick(document, 'btn-online', () => { playSound('ching'); enterOnlineFlow(); });
  onClick(document, 'btn-ranked', () => { playSound('ching'); showRankedProfile(); });

  wireToggleGroup(document, '.side-btn', 'side-btn--active', (btn) => {
    playSound('ching');
    setBotConfig({
      ...getBotConfig(),
      side: btn.dataset.side === 'p1' ? 'p2' : 'p1',
    });
  });

  wireToggleGroup(document, '.diff-btn', 'diff-btn--active', (btn) => {
    playSound('ching');
    setBotConfig({ ...getBotConfig(), difficulty: btn.dataset.difficulty });
  });

  wireToggleGroup(document, '.cpu-round-btn', 'cpu-round-btn--active', (btn) => {
    playSound('ching');
    setSelectedRounds(Number(btn.dataset.rounds));
  });

  wireToggleGroup(document, '.cpu-layout-btn', 'cpu-layout-btn--active', (btn) => {
    playSound('ching');
    setSelectedLayout(btn.dataset.layout);
  });

  onClick(document, 'btn-start-cpu', () => {
    playSound('ching');
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

  onClick(document, 'btn-cpu-back', () => { playSound('swing'); showScreen('screen-menu'); });

  wireToggleGroup(document, '.round-btn', 'round-btn--active', (btn) => {
    playSound('ching');
    setSelectedRounds(Number(btn.dataset.rounds));
  });

  wireToggleGroup(document, '.layout-btn', 'layout-btn--active', (btn) => {
    playSound('ching');
    setSelectedLayout(btn.dataset.layout);
  });

  onClick(document, 'btn-start-match', () => {
    playSound('ching');
    gameState.roundTarget = getSelectedRounds() === 3 ? 2 : 3;
    startMatch();
  });

  onClick(document, 'btn-setup-back', () => { playSound('swing'); showScreen('screen-menu'); });
  onClick(document, 'btn-rematch', () => { playSound('ching'); startMatch(); });
  onClick(document, 'btn-result-menu', () => {
    playSound('swing');
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
