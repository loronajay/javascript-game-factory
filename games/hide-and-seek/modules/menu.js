// The demo's front end: title, how-to, extras, and the mid-round pause, all driven by the pure state
// machine in `menu-logic.js`. Only two things live here — turning a screen name into visible DOM, and
// the buttons that dispatch actions into the machine.
//
// `PLAYING` is the game's single "the simulation is running" answer: the loop pauses whenever the
// player is not locked in, which is what stops meters like sanity from ticking behind a menu.
export function createMenu({ logic, document, window, onPlay, onStartSingle, onScreen }) {
  const overlay = document.getElementById('overlay');
  const screenEls = new Map([
    [logic.SCREENS.TITLE, document.getElementById('menuTitle')],
    [logic.SCREENS.SOLO_SETUP, document.getElementById('menuSoloSetup')],
    [logic.SCREENS.HOW_TO, document.getElementById('menuHowTo')],
    [logic.SCREENS.EXTRAS, document.getElementById('menuExtras')],
    [logic.SCREENS.ONLINE, document.getElementById('menuOnline')],
    [logic.SCREENS.PAUSE, document.getElementById('menuPause')],
  ]);
  let state = logic.createMenuState();
  const hiderInput = document.getElementById('soloHiderCount');
  const hideInput = document.getElementById('soloHideSeconds');
  const hiderReadout = document.getElementById('soloHiderReadout');
  const hideReadout = document.getElementById('soloHideReadout');

  function matchConfig() {
    return logic.normalizeMatchConfig({ hiderCount: hiderInput?.value, hideSeconds: hideInput?.value });
  }

  function renderMatchConfig() {
    const config = matchConfig();
    if (hiderReadout) hiderReadout.textContent = `${config.hiderCount} guest${config.hiderCount === 1 ? '' : 's'}`;
    if (hideReadout) hideReadout.textContent = `${config.hideSeconds} seconds`;
  }

  function emit(name, detail) {
    window.dispatchEvent(new window.CustomEvent(name, { detail }));
  }

  function render() {
    overlay.classList.toggle('hidden', !logic.isOverlayVisible(state.screen));
    for (const [screen, element] of screenEls) if (element) element.classList.toggle('hidden', screen !== state.screen);
    const active = screenEls.get(state.screen);
    const first = active?.querySelector?.('button:not([disabled]), input, select');
    if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
  }

  function dispatch(action) {
    const previousScreen = state.screen;
    const next = logic.nextMenuState(state, action);
    // Quitting rebuilds the session rather than pretending the hotel reset: the demon, the open doors
    // and the key ring are all still standing, and a reload is the honest way back to a clean round.
    if (next.effect === 'quit') { window.location.reload(); return; }
    const wasPlaying = logic.isPlaying(state.screen);
    state = next;
    render();
    emit('hotel:menu-action', { action });
    emit('hotel:menu-screen', { screen: state.screen, previousScreen });
    if (onScreen) onScreen(state.screen);
    if (!wasPlaying && logic.isPlaying(state.screen)) {
      if (previousScreen === logic.SCREENS.SOLO_SETUP && onStartSingle) onStartSingle(matchConfig());
      onPlay();
    }
  }

  overlay.addEventListener('click', (event) => {
    const button = event.target.closest ? event.target.closest('[data-menu]') : null;
    if (!button) return;
    event.preventDefault();
    dispatch(button.dataset.menu);
  });
  for (const input of [hiderInput, hideInput]) input?.addEventListener('input', renderMatchConfig);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && [logic.SCREENS.SOLO_SETUP, logic.SCREENS.ONLINE, logic.SCREENS.HOW_TO, logic.SCREENS.EXTRAS].includes(state.screen)) dispatch(logic.ACTIONS.BACK);
  });
  window.addEventListener('hotel:caught', () => dispatch(logic.ACTIONS.CAUGHT));

  renderMatchConfig();
  render();
  return { dispatch, actions: logic.ACTIONS, getMatchConfig: matchConfig, getScreen: () => state.screen, isPlaying: () => logic.isPlaying(state.screen) };
}
