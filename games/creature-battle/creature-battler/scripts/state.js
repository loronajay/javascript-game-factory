const SCREENS = ['title', 'mode-select', 'battle-config', 'team-select', 'class-customization', 'battle', 'online-lobby', 'blind-pick'];
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

  classCustom: {
    teamPhase: 'player',     // 'player' | 'opponent'
    view: 'overview',        // 'overview' | 'browse' | 'deep'
    creatureIndex: 0,        // focused creature slot in overview (0–2)
    browseRouteIndex: 0,     // focused route index in ROUTE_STUBS during browse
    deepPassiveIndex: 0,     // focused passive index in deep view passive list
    selectedRouteId: null,   // route the player entered deep view for
    locked: [false, false, false],
    playerConfigs: [
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
    ],
    opponentConfigs: [
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
    ],
  },

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

const _MENU_SCREENS = new Set(['mode-select', 'battle-config', 'team-select', 'class-customization', 'online-lobby', 'blind-pick']);

function setScreen(id) {
  state.screen = id;
  if (typeof startBattleMusic === 'function' && typeof stopBattleMusic === 'function') {
    if (id === 'battle') startBattleMusic();
    else stopBattleMusic();
  }
  if (typeof startMenuMusic === 'function' && typeof stopMenuMusic === 'function') {
    if (_MENU_SCREENS.has(id)) startMenuMusic();
    else stopMenuMusic();
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
    startClassCustomization('player');
  }
}

function startClassCustomization(teamPhase) {
  const cc = state.classCustom;
  cc.teamPhase = teamPhase;
  cc.view = 'overview';
  cc.creatureIndex = 0;
  cc.browseRouteIndex = 0;
  cc.deepPassiveIndex = 0;
  cc.selectedRouteId = null;
  cc.locked = [false, false, false];
  if (teamPhase === 'player') {
    cc.playerConfigs = [
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
    ];
  } else {
    cc.opponentConfigs = [
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
      { routeId: null, equippedPassives: [] },
    ];
  }
  setScreen('class-customization');
}

function startBattle() {
  function _applyClassConfig(built, config) {
    if (!config || !config.routeId) return;
    const pool = resolveClassPool(config.routeId, built.level);
    built.classRoute = config.routeId;
    built.classSkills = pool.skills;
    built.equippedPassives = config.equippedPassives
      .map(id => getClassPassive(id))
      .filter(Boolean);
  }
  function buildSide(teamIds, configs) {
    return SLOT_NAMES.reduce((acc, slot, i) => {
      const creature = RENTAL_ROSTER.find(c => c.id === teamIds[i]);
      const built = buildRentalCreature(creature, slot);
      _applyClassConfig(built, configs[i]);
      acc[slot] = built;
      return acc;
    }, {});
  }
  const arena = resolveArena(state.battleConfigArenaIndex);
  state.battleState = {
    player:   buildSide(state.playerTeam,   state.classCustom.playerConfigs),
    opponent: buildSide(state.opponentTeam, state.classCustom.opponentConfigs),
    round: 1,
    arenaFile: arena.file,
    battleStats: { player: makeBattleStats(), opponent: makeBattleStats() },
  };
  // Tag each creature with its side and slot (used by evasion/counter logic).
  ['player', 'opponent'].forEach(side => {
    SLOT_NAMES.forEach(slot => {
      const c = state.battleState[side][slot];
      if (c) { c._side = side; c._slot = slot; }
    });
  });
  // Fire onBattleStart passive hooks (e.g. Still Mind raises SPI at start, Fleet Footed raises SPD).
  ['player', 'opponent'].forEach(side => {
    SLOT_NAMES.forEach(slot => {
      const c = state.battleState[side][slot];
      if (!c) return;
      (c.equippedPassives || []).forEach(passive => {
        const reg = typeof PASSIVE_REGISTRY !== 'undefined' ? PASSIVE_REGISTRY[passive.id] : null;
        if (reg?.onBattleStart) reg.onBattleStart({ creature: c });
      });
    });
  });
  setScreen('battle');
}
