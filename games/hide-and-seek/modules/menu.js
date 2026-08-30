// The demo's front end: title, how-to, extras, and the mid-round pause, all driven by the pure state
// machine in `menu-logic.js`. Only two things live here — turning a screen name into visible DOM, and
// the buttons that dispatch actions into the machine.
//
// `PLAYING` is the game's single "the simulation is running" answer: the loop pauses whenever the
// player is not locked in, which is what stops meters like heat from ticking behind a menu.
import { createMapPicker } from './map-picker.js';

export function createMenu({ logic, document, window, onPlay, onStartSingle, onScreen, onQuit, maps = null, mapSession = null, canPause = () => true }) {
  const overlay = document.getElementById('overlay');
  const screenEls = new Map([
    [logic.SCREENS.TITLE, document.getElementById('menuTitle')],
    [logic.SCREENS.SOLO_SETUP, document.getElementById('menuSoloSetup')],
    [logic.SCREENS.ONLINE_SETUP, document.getElementById('menuOnlineSetup')],
    [logic.SCREENS.HOW_TO, document.getElementById('menuHowTo')],
    [logic.SCREENS.EXTRAS, document.getElementById('menuExtras')],
    [logic.SCREENS.ONLINE, document.getElementById('menuOnline')],
    [logic.SCREENS.PAUSE, document.getElementById('menuPause')],
  ]);
  let state = logic.createMenuState();
  let onlineResult = false;
  let onlineMatch = false;
  const hiderInput = document.getElementById('soloHiderCount');
  const hideInput = document.getElementById('soloHideSeconds');
  const roleInput = document.getElementById('soloRole');
  const hiderReadout = document.getElementById('soloHiderReadout');
  const hideReadout = document.getElementById('soloHideReadout');
  const roleReadout = document.getElementById('soloRoleReadout');
  const roleSummary = document.getElementById('soloRoleSummary');
  const soloLead = document.getElementById('soloLead');
  const soloStart = document.getElementById('soloStart');
  const hiderLabel = document.getElementById('soloHiderLabel');
  const hiderHelp = document.getElementById('soloHiderHelp');
  const hideHelp = document.getElementById('soloHideHelp');
  const threatSummary = document.getElementById('soloThreatSummary');
  const lobbyMapName = document.getElementById('lobbyMapName');
  const lobbyDemonCount = document.getElementById('lobbyDemonCount');
  const soloPicker = createMapPicker({ prefix: 'solo', maps, mapSession, document, window, onChange: applyMapChange });
  createMapPicker({ prefix: 'online', maps, mapSession, document, window, onChange: (mapId) => {
    mapSession?.select(mapId, { mode: 'online', mapId });
  } });

  function renderMapCopy(mapId) {
    if (!maps) return;
    const map = maps.getMap(maps.normalizeMapId(mapId));
    const demonCount = maps.demonCountFor(map.id);
    if (threatSummary) threatSummary.textContent = `${demonCount} DEMON${demonCount === 1 ? '' : 'S'}`;
    // The location is selected before matchmaking, then fixed for the life of the lobby.
    if (lobbyMapName) lobbyMapName.textContent = map.name.toUpperCase();
    if (lobbyDemonCount) lobbyDemonCount.textContent = String(demonCount);
  }

  // Changing location is an entry, not a transition — the page re-enters into the new building and
  // the setup the player had filled in travels with it. See `modules/map-session.js`.
  function applyMapChange(mapId) {
    if (!mapSession || !maps || !maps.isPlayable(mapId)) return;
    const config = matchConfig();
    renderMapCopy(config.mapId);
    mapSession.select(config.mapId, config);
  }

  function matchConfig() {
    return logic.normalizeMatchConfig({ mapId: soloPicker.selected(), hiderCount: hiderInput?.value, hideSeconds: hideInput?.value, role: roleInput?.value });
  }

  function renderMatchConfig() {
    const config = matchConfig();
    if (hiderReadout) hiderReadout.textContent = `${config.hiderCount} guest${config.hiderCount === 1 ? '' : 's'}`;
    if (hideReadout) hideReadout.textContent = `${config.hideSeconds} seconds`;
    if (roleReadout) roleReadout.textContent = config.role.toUpperCase();
    if (roleSummary) roleSummary.textContent = config.role.toUpperCase();
    // The copy names the building the player is actually standing in. It used to say "the hotel" and
    // "both demons" flat out, which stops being true the moment there is a second location with a
    // third demon in it.
    const place = maps ? maps.getMap(maps.normalizeMapId(config.mapId)) : null;
    const placeName = place ? place.name : 'the hotel';
    const demonCount = maps ? maps.demonCountFor(config.mapId) : 2;
    if (soloLead) soloLead.textContent = config.role === 'hider'
      ? `Hide anywhere in ${placeName}, outlast the AI seeker, and stay clear of all ${demonCount} demons.`
      : `Choose how crowded ${placeName} feels and how long the guests get to disappear.`;
    if (soloStart) soloStart.firstChild.textContent = config.role === 'hider' ? 'BEGIN HIDING ' : 'BEGIN THE HUNT ';
    if (hiderLabel) hiderLabel.textContent = config.role === 'hider' ? 'Hiders in Match' : 'Guests to Find';
    if (hiderHelp) hiderHelp.textContent = config.role === 'hider' ? 'Includes you and any AI hider teammates.' : 'More guests make every floor more active.';
    if (hideHelp) hideHelp.textContent = config.role === 'hider' ? 'Use every second before the AI seeker is released.' : 'You remain locked in the elevator.';
    renderMapCopy(config.mapId);
  }

  function emit(name, detail) {
    window.dispatchEvent(new window.CustomEvent(name, { detail }));
  }

  function render() {
    overlay.classList.toggle('hidden', !logic.isOverlayVisible(state.screen));
    for (const [screen, element] of screenEls) if (element) element.classList.toggle('hidden', screen !== state.screen);
    // Focus the panel, never a control on it.
    //
    // This used to focus the screen's first button, which on every setup and lobby screen is the
    // back arrow in the header - so Space or Enter, pressed anywhere while reading the options, was
    // a click on "back to main menu". That is the random kick to the title players hit while setting
    // a match up. (The first *control* is no safer: on the solo screen it is a location radio, and an
    // arrow key on a radio group changes map, which re-enters the page.) Focusing the panel keeps
    // the screen reachable by Tab without arming anything.
    const active = screenEls.get(state.screen);
    if (active && typeof active.focus === 'function') {
      active.tabIndex = -1;
      active.focus({ preventScroll: true });
    }
  }

  function dispatch(action) {
    const previousScreen = state.screen;
    const next = logic.nextMenuState(state, action, { allowPause: canPause() });
    // Quitting rebuilds the session rather than pretending the hotel reset: the demon, the open doors
    // and the key ring are all still standing, and a reload is the honest way back to a clean round.
    if (next.effect === 'quit') { onQuit?.(); window.location.reload(); return; }
    const wasPlaying = logic.isPlaying(state.screen);
    state = next;
    if (!wasPlaying && logic.isPlaying(state.screen)) onlineMatch = previousScreen === logic.SCREENS.ONLINE || onlineMatch;
    render();
    emit('hotel:menu-action', { action });
    emit('hotel:menu-screen', { screen: state.screen, previousScreen });
    if (onScreen) onScreen(state.screen, previousScreen);
    if (!wasPlaying && logic.isPlaying(state.screen)) {
      if (previousScreen === logic.SCREENS.SOLO_SETUP && onStartSingle) onStartSingle(matchConfig());
      onPlay();
    }
    return state.screen !== previousScreen;
  }

  overlay.addEventListener('click', (event) => {
    const button = event.target.closest ? event.target.closest('[data-menu]') : null;
    if (!button) return;
    event.preventDefault();
    dispatch(button.dataset.menu);
  });
  for (const input of [hiderInput, hideInput, roleInput]) input?.addEventListener('input', renderMatchConfig);
  // The end-of-round overlay sits above the menu at its own z-index, so a pause menu behind it is
  // unreachable. Single player must always have a way out: Esc (and an explicit button) on that
  // screen quits to the title rather than doing nothing.
  const caughtOverlay = document.getElementById('caughtOverlay');
  const caughtQuit = document.getElementById('caughtQuitBtn');
  caughtQuit?.addEventListener('click', () => dispatch(logic.ACTIONS.QUIT));
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    onQuit?.();
    if (onlineResult && mapSession) mapSession.reopenOnlineSetup();
    else window.location.reload();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (caughtOverlay && caughtOverlay.classList.contains('visible')) { dispatch(logic.ACTIONS.QUIT); return; }
    if ([logic.SCREENS.SOLO_SETUP, logic.SCREENS.ONLINE_SETUP, logic.SCREENS.ONLINE, logic.SCREENS.HOW_TO, logic.SCREENS.EXTRAS].includes(state.screen)) dispatch(logic.ACTIONS.BACK);
  });
  window.addEventListener('hotel:caught', (event) => {
    // An elimination is not an ending. A hider taken while other guests are still hiding keeps
    // playing as a spectator, and the menu has to stay on PLAYING for that: CAUGHT hides the overlay
    // (the end-of-round screen is drawn over it) and swallows PAUSE, so a player eliminated mid-round
    // was left with a live game and no way to open a menu at all � Esc did nothing.
    if (event.detail?.roundOver === false) return;
    // Only the server-owned round may end online play. Local catch notifications are not results.
    if (onlineMatch && !event.detail?.online) return;
    onlineResult = !!event.detail?.online;
    dispatch(logic.ACTIONS.CAUGHT);
  });

  renderMatchConfig();
  render();
  // A player who just changed location was in the middle of setting a match up. Put them back where
  // they were rather than on the title screen they never asked to see.
  const pending = mapSession?.takePendingSetup?.();
  if (pending) {
    if (hiderInput && pending.hiderCount != null) hiderInput.value = String(pending.hiderCount);
    if (hideInput && pending.hideSeconds != null) hideInput.value = String(pending.hideSeconds);
    if (roleInput && pending.role != null) roleInput.value = pending.role;
    renderMatchConfig();
    dispatch(pending.mode === 'online' ? logic.ACTIONS.ONLINE : logic.ACTIONS.SINGLE_PLAYER);
  }
  return { dispatch, actions: logic.ACTIONS, getMatchConfig: matchConfig, getScreen: () => state.screen, isPlaying: () => logic.isPlaying(state.screen) };
}
