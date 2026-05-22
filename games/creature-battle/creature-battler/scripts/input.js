const WASD_MAP = { w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight' };

function normalizeKey(key) {
  return WASD_MAP[key.toLowerCase()] || key;
}

function initInput() {
  document.addEventListener('keydown', e => {
    const s   = state.screen;
    const key = normalizeKey(e.key);

    if (s === 'title') {
      if (e.key === 'Enter' || e.key === ' ') { playClick(); setScreen('mode-select'); }
      return;
    }

    if (s === 'mode-select') {
      if (isElementGuideOpen()) {
        if (e.key === 'Escape' || e.key === 'i' || e.key === 'I') { playClick(); hideElementGuide(); }
        return;
      }
      if (key === 'ArrowUp')   { e.preventDefault(); playClick(); moveModeSelectCursor(-1); }
      if (key === 'ArrowDown') { e.preventDefault(); playClick(); moveModeSelectCursor(1);  }
      if (e.key === ' ')       { e.preventDefault(); playClick(); handleModeConfirm(); }
      if (e.key === 'i' || e.key === 'I') { playClick(); showElementGuide('screen-mode-select'); }
      if (e.key === 'Escape')  { playClick(); setScreen('title'); }
      return;
    }

    if (s === 'battle-config') {
      if (key === 'ArrowLeft')  { e.preventDefault(); playClick(); moveBattleConfigCursor(-1); }
      if (key === 'ArrowRight') { e.preventDefault(); playClick(); moveBattleConfigCursor(1);  }
      if (e.key === ' ')        { e.preventDefault(); playClick(); confirmBattleConfig(); }
      if (e.key === 'Escape')   { playClick(); setScreen('mode-select'); }
      return;
    }

    if (s === 'team-select') {
      if (isStatsPopupOpen()) {
        if (e.key === 'Escape' || e.key === 'r' || e.key === 'R') { playClick(); hideCreatureStats(); }
        return;
      }
      if (isElementGuideOpen()) {
        if (e.key === 'Escape' || e.key === 'i' || e.key === 'I') { playClick(); hideElementGuide(); }
        return;
      }
      if (key === 'ArrowUp')    { e.preventDefault(); playClick(); moveTeamSelectCursor('up');    }
      if (key === 'ArrowDown')  { e.preventDefault(); playClick(); moveTeamSelectCursor('down');  }
      if (key === 'ArrowLeft')  { e.preventDefault(); playClick(); moveTeamSelectCursor('left');  }
      if (key === 'ArrowRight') { e.preventDefault(); playClick(); moveTeamSelectCursor('right'); }
      if (e.key === ' ') {
        e.preventDefault();
        const focused = RENTAL_ROSTER[state.teamSelectFocusIndex];
        if (focused) { playClick(); toggleTeamCreature(focused.id); }
      }
      if (e.key === 'Enter') {
        const currentTeam = state.teamSelectPhase === 'player' ? state.playerTeam : state.opponentTeam;
        if (currentTeam.length === 3) { playClick(); confirmTeamSelectPhase(); }
      }
      if (e.key === 'r' || e.key === 'R') { playClick(); showCreatureStats(); }
      if (e.key === 'i' || e.key === 'I') { playClick(); showElementGuide('screen-team-select'); }
      if (e.key === 'Escape') {
        playClick();
        if (state.teamSelectPhase === 'opponent') {
          state.teamSelectPhase = 'player';
          state.opponentTeam = [];
          state.teamSelectFocusIndex = 0;
          renderTeamSelect();
        } else {
          setScreen('battle-config');
        }
      }
      return;
    }

    if (s === 'online-lobby') {
      if (e.target.tagName === 'INPUT') return; // let the code input field capture keys
      if (e.key === 'Escape') handleOnlineLobbyEsc();
      return;
    }

    if (s === 'blind-pick') {
      if (isStatsPopupOpen()) {
        if (e.key === 'Escape' || e.key === 'r' || e.key === 'R') { playClick(); hideCreatureStats(); }
        return;
      }
      if (isElementGuideOpen()) {
        if (e.key === 'Escape' || e.key === 'i' || e.key === 'I') { playClick(); hideElementGuide(); }
        return;
      }
      if (key === 'ArrowLeft')  { e.preventDefault(); moveBlindPickCursor('left');  }
      if (key === 'ArrowRight') { e.preventDefault(); moveBlindPickCursor('right'); }
      if (key === 'ArrowUp')    { e.preventDefault(); moveBlindPickCursor('up');    }
      if (key === 'ArrowDown')  { e.preventDefault(); moveBlindPickCursor('down');  }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const bp = state.blindPick;
        if (bp.myLocked) return;
        if (bp.myTeam.length === 3) {
          playClick(); _lockInMyTeam();
        } else if (e.key === ' ') {
          const focused = RENTAL_ROSTER[state.blindPickFocusIndex];
          if (focused) { playClick(); _toggleBlindPickCreature(focused.id); }
        }
      }
      if (e.key === 'r' || e.key === 'R') { playClick(); showBlindPickStats(); }
      if (e.key === 'i' || e.key === 'I') { playClick(); showElementGuide('screen-blind-pick'); }
      // No Escape back-out — match is live.
      return;
    }

    if (s === 'battle') {
      e.preventDefault();
      if ((e.key === ' ' || e.key === 'Enter') && advancePlayback()) { playClick(); return; }
      handleBattleKey(key);
      return;
    }
  });
}
