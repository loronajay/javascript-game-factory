export const MAIN_MENU_MODES = Object.freeze([
  {
    id: 'campaign',
    title: 'Campaign',
    subtitle: 'Secure the frontier, one operation at a time.',
    available: true,
    badge: 'Play',
  },
  {
    id: 'endless',
    title: 'Endless',
    subtitle: 'Survive escalating waves for the high score.',
    available: false,
    badge: 'In development',
  },
  {
    id: 'skirmish',
    title: 'Skirmish',
    subtitle: 'Build a custom engagement against a chosen threat.',
    available: false,
    badge: 'In development',
  },
]);

export function getMenuMode(id) {
  return MAIN_MENU_MODES.find((mode) => mode.id === id) ?? null;
}
