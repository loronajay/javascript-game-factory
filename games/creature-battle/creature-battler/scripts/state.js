const SCREENS = ['title', 'mode-select', 'battle-config', 'team-select', 'battle', 'online-lobby', 'blind-pick'];
const DEFAULT_LEVEL_INDEX = 3; // index of level 30 in LEVEL_TIERS

const state = {
  screen: 'title',
  modeSelectIndex: 0,
  battleConfigLevelIndex: DEFAULT_LEVEL_INDEX,
  battleConfigArenaIndex: 0,        // 0 = Random, 1..ARENAS.length = specific arena
  battleConfigFocusSection: 'level', // 'level' | 'arena'
  battleConfig: { level: 30 },
  teamSelectPhase: 'player',   // 'player' | 'opponent'
  playerTeam: [],              // array of creatureIds (max 3)
  opponentTeam: [],
  teamSelectFocusIndex: 0,
  battleState: null,           // set when battle begins
  isOnlineMatch: false,

  // Online 1v1
  onlineLobbyPhase: 'settings', // 'settings' | 'main' | 'searching' | 'friend_opts' | 'create' | 'join'
  onlineSettings: { pickStyle: 'blind', levelCapIndex: 0, resolvedLevelCap: null, arenaIndex: 0, resolvedArenaId: null },
  onlineClient: null,
  onlineRoomCode: '',
  onlineCodeInput: '',
  remotePlayerInfo: null,      // { displayName, playerId }

  blindPickFocusIndex: 0,

  // Blind pick phase
  blindPick: {
    myTeam: [],
    myLocked: false,
    opponentLocked: false,
    remoteTeam: null,          // coordinator stores opponent's locked team here
    settingsReceived: false,   // non-coordinator waits for match_settings
  },
};

const SCREEN_RENDERERS = {};

function registerRenderer(id, fn) {
  SCREEN_RENDERERS[id] = fn;
}

function setScreen(id) {
  state.screen = id;
  if (typeof startBattleMusic === 'function' && typeof stopBattleMusic === 'function') {
    if (id === 'battle') startBattleMusic();
    else stopBattleMusic();
  }
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.toggle('active', el.id === `screen-${id}`);
  }
  if (SCREEN_RENDERERS[id]) SCREEN_RENDERERS[id]();
}

function startBattleConfig() {
  state.battleConfigLevelIndex   = LEVEL_TIERS.findIndex(t => t.level === state.battleConfig.level);
  if (state.battleConfigLevelIndex === -1) state.battleConfigLevelIndex = DEFAULT_LEVEL_INDEX;
  state.battleConfigFocusSection = 'level';
  setScreen('battle-config');
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
  function buildSide(teamIds) {
    return SLOT_NAMES.reduce((acc, slot, i) => {
      const creature = RENTAL_ROSTER.find(c => c.id === teamIds[i]);
      acc[slot] = buildRentalCreature(creature, slot);
      return acc;
    }, {});
  }
  const arena = resolveArena(state.battleConfigArenaIndex);
  state.battleState = {
    player: buildSide(state.playerTeam),
    opponent: buildSide(state.opponentTeam),
    round: 1,
    arenaFile: arena.file,
  };
  setScreen('battle');
}
