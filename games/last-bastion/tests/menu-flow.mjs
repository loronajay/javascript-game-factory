import { MAIN_MENU_MODES, getMenuMode } from '../src/ui/menu.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(MAIN_MENU_MODES.length >= 3, 'The main menu should make room for future modes');
assert(getMenuMode('campaign')?.available, 'Campaign must be playable from the main menu');
assert(!getMenuMode('endless')?.available, 'Unscoped modes must remain unavailable');
assert(getMenuMode('missing') === null, 'Unknown menu modes should not resolve');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Menu flow checks passed.');
