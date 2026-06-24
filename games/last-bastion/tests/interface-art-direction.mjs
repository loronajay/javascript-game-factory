import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(css.includes('.message-panel[data-view="menu"] .message-card::after'), 'The main menu needs a dedicated illustrated command backdrop');
assert(css.includes('.message-panel[data-view="menu"] .message-card {') && css.includes('justify-self: center;'), 'The main menu command card should be centered on wide displays');
assert(css.includes('.mode-card.available::before'), 'The playable mode needs a clear, energized call-to-action treatment');
assert(css.includes('.message-panel[data-view="campaign"] .message-card::after'), 'Campaign needs its own illustrated operations-board treatment');
assert(css.includes('.message-panel[data-view="campaign"] .stage-card::before'), 'Campaign operations need a strong visual status marker');
assert(css.includes('.top-hud .stat::before'), 'Battle HUD metrics need icon-led visual hierarchy');
assert(css.includes('.command-grid button::before'), 'Command buttons need distinct visual affordances, not just text labels');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Interface art-direction checks passed.');
