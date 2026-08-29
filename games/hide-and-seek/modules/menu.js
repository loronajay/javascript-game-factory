// The demo's front end: title, how-to, extras, and the mid-round pause, all driven by the pure state
// machine in `menu-logic.js`. Only two things live here — turning a screen name into visible DOM, and
// the buttons that dispatch actions into the machine.
//
// `PLAYING` is the game's single "the simulation is running" answer: the loop pauses whenever the
// player is not locked in, which is what stops meters like sanity from ticking behind a menu.
export function createMenu({ logic, document, window, onPlay, onScreen }) {
  const overlay = document.getElementById('overlay');
  const screenEls = new Map([
    [logic.SCREENS.TITLE, document.getElementById('menuTitle')],
    [logic.SCREENS.HOW_TO, document.getElementById('menuHowTo')],
    [logic.SCREENS.EXTRAS, document.getElementById('menuExtras')],
    [logic.SCREENS.ONLINE, document.getElementById('menuOnline')],
    [logic.SCREENS.PAUSE, document.getElementById('menuPause')],
  ]);
  let state = logic.createMenuState();

  function render() {
    overlay.classList.toggle('hidden', !logic.isOverlayVisible(state.screen));
    for (const [screen, element] of screenEls) if (element) element.classList.toggle('hidden', screen !== state.screen);
  }

  function dispatch(action) {
    const next = logic.nextMenuState(state, action);
    // Quitting rebuilds the session rather than pretending the hotel reset: the demon, the open doors
    // and the key ring are all still standing, and a reload is the honest way back to a clean round.
    if (next.effect === 'quit') { window.location.reload(); return; }
    const wasPlaying = logic.isPlaying(state.screen);
    state = next;
    render();
    if (onScreen) onScreen(state.screen);
    if (!wasPlaying && logic.isPlaying(state.screen)) onPlay();
  }

  overlay.addEventListener('click', (event) => {
    const button = event.target.closest ? event.target.closest('[data-menu]') : null;
    if (!button) return;
    event.preventDefault();
    dispatch(button.dataset.menu);
  });
  window.addEventListener('hotel:caught', () => dispatch(logic.ACTIONS.CAUGHT));

  render();
  return { dispatch, actions: logic.ACTIONS, getScreen: () => state.screen, isPlaying: () => logic.isPlaying(state.screen) };
}
