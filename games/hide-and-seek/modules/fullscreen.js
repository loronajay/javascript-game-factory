// Fullscreen for the whole page. The game reads far better with the browser chrome gone — the
// vignette reaches the edges and the pointer lock has nowhere to escape to — so both the title and
// the pause screen carry a toggle. This owns every `[data-fullscreen]` button on the page: the label
// says what a click will do, and it follows `fullscreenchange` rather than its own last click,
// because Esc leaves fullscreen without going through any button.
export function createFullscreen({ document }) {
  const root = document.documentElement;
  const buttons = typeof document.querySelectorAll === 'function' ? Array.from(document.querySelectorAll('[data-fullscreen]')) : [];
  const supported = !!(root && typeof root.requestFullscreen === 'function' && typeof document.exitFullscreen === 'function' && typeof document.addEventListener === 'function' && document.fullscreenEnabled !== false);

  const isActive = () => !!document.fullscreenElement;
  function paint() {
    const label = isActive() ? 'Exit Fullscreen' : 'Fullscreen';
    for (const button of buttons) button.textContent = label;
  }
  async function toggle() {
    if (!supported) return false;
    try {
      if (isActive()) await document.exitFullscreen();
      else await root.requestFullscreen();
      return true;
    } catch (_error) {
      // A request outside a user gesture, or an embedding that forbids it. The label stays honest
      // because `fullscreenchange` never fired.
      return false;
    }
  }

  if (!supported) {
    for (const button of buttons) button.classList.add('hidden');
  } else {
    for (const button of buttons) button.addEventListener('click', (event) => { event.preventDefault?.(); toggle(); });
    document.addEventListener('fullscreenchange', paint);
    paint();
  }
  return { supported, toggle, isActive };
}
