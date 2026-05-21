function initInput() {
  document.addEventListener('keydown', e => {
    const s = state.screen;

    if (s === 'title') {
      if (e.key === 'Enter' || e.key === ' ') setScreen('mode-select');
      return;
    }

    if (s === 'mode-select') {
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveModeSelectCursor(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveModeSelectCursor(1);  }
      if (e.key === 'Enter')     handleModeConfirm();
      if (e.key === 'Escape')    setScreen('title');
      return;
    }

    if (s === 'team-select') {
      if (e.key === 'ArrowUp')    { e.preventDefault(); moveTeamSelectCursor('up');    }
      if (e.key === 'ArrowDown')  { e.preventDefault(); moveTeamSelectCursor('down');  }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); moveTeamSelectCursor('left');  }
      if (e.key === 'ArrowRight') { e.preventDefault(); moveTeamSelectCursor('right'); }
      if (e.key === 'Enter') {
        const focused = RENTAL_ROSTER[state.teamSelectFocusIndex];
        if (focused) toggleTeamCreature(focused.id);
      }
      if (e.key === 'Escape') {
        if (state.teamSelectPhase === 'opponent') {
          state.teamSelectPhase = 'player';
          state.opponentTeam = [];
          state.teamSelectFocusIndex = 0;
          renderTeamSelect();
        } else {
          setScreen('mode-select');
        }
      }
      if (e.key === ' ') {
        const currentTeam = state.teamSelectPhase === 'player' ? state.playerTeam : state.opponentTeam;
        if (currentTeam.length === 3) confirmTeamSelectPhase();
      }
      return;
    }
  });
}
