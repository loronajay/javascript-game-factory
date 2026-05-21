const SCREENS = ['title', 'mode-select', 'team-select', 'battle'];

const state = {
  screen: 'title',
  modeSelectIndex: 0,
  teamSelectPhase: 'player',   // 'player' | 'opponent'
  playerTeam: [],              // array of creatureIds (max 3)
  opponentTeam: [],
  teamSelectFocusIndex: 0,
  battleState: null,           // set when battle begins
};

const SCREEN_RENDERERS = {};

function registerRenderer(id, fn) {
  SCREEN_RENDERERS[id] = fn;
}

function setScreen(id) {
  state.screen = id;
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.toggle('active', el.id === `screen-${id}`);
  }
  if (SCREEN_RENDERERS[id]) SCREEN_RENDERERS[id]();
}

function startTeamSelect() {
  state.teamSelectPhase = 'player';
  state.playerTeam = [];
  state.opponentTeam = [];
  state.teamSelectFocusIndex = 0;
  setScreen('team-select');
}

function confirmTeamSelectPhase() {
  const current = state.teamSelectPhase === 'player' ? state.playerTeam : state.opponentTeam;
  if (current.length < 3) return;

  if (state.teamSelectPhase === 'player') {
    state.teamSelectPhase = 'opponent';
    state.opponentTeam = [];
    state.teamSelectFocusIndex = 0;
    renderTeamSelect();
  } else {
    startBattle();
  }
}

function startBattle() {
  const playerCreatures  = state.playerTeam.map(id => buildRentalCreature(RENTAL_ROSTER.find(c => c.id === id)));
  const opponentCreatures = state.opponentTeam.map(id => buildRentalCreature(RENTAL_ROSTER.find(c => c.id === id)));
  state.battleState = { player: playerCreatures, opponent: opponentCreatures };
  setScreen('battle');
}
