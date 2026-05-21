const WASD_MAP = { w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight' };

function normalizeKey(key) {
  return WASD_MAP[key.toLowerCase()] || key;
}

function initInput() {
  document.addEventListener('keydown', e => {
    const s   = state.screen;
    const key = normalizeKey(e.key);

    if (s === 'title') {
      if (e.key === 'Enter' || e.key === ' ') setScreen('mode-select');
      return;
    }

    if (s === 'mode-select') {
      if (key === 'ArrowUp')   { e.preventDefault(); moveModeSelectCursor(-1); }
      if (key === 'ArrowDown') { e.preventDefault(); moveModeSelectCursor(1);  }
      if (e.key === 'Enter')   handleModeConfirm();
      if (e.key === 'Escape')  setScreen('title');
      return;
    }

    if (s === 'team-select') {
      if (key === 'ArrowUp')    { e.preventDefault(); moveTeamSelectCursor('up');    }
      if (key === 'ArrowDown')  { e.preventDefault(); moveTeamSelectCursor('down');  }
      if (key === 'ArrowLeft')  { e.preventDefault(); moveTeamSelectCursor('left');  }
      if (key === 'ArrowRight') { e.preventDefault(); moveTeamSelectCursor('right'); }
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

    if (s === 'battle') {
      e.preventDefault();
      if ((e.key === ' ' || e.key === 'Enter') && advancePlayback()) return;
      handleBattleKey(key);
      return;
    }
  });
}
