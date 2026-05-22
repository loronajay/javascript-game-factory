// Element chart + status effect reference overlay, usable from any screen.

const GUIDE_ELEMENTS = ['fire', 'water', 'ice', 'gaia', 'earth', 'wind', 'light', 'dark'];

const ELEMENT_LABELS = {
  fire: 'Fire', water: 'Water', ice: 'Ice', gaia: 'Gaia',
  earth: 'Earth', wind: 'Wind', light: 'Light', dark: 'Dark',
};

const STATUS_DEFS = [
  { id: 'burn',    name: 'Burn',    icon: '🔥', duration: '3 rounds', desc: 'Deals 6% max HP each round and lowers Defense by 1 stage.' },
  { id: 'poison',  name: 'Poison',  icon: '☠',  duration: 'Permanent', desc: 'Deals 6% max HP each round until cleansed.' },
  { id: 'stun',    name: 'Stun',    icon: '⚡',  duration: '1 round',  desc: 'The creature is unable to act for its turn.' },
  { id: 'blind',   name: 'Blind',   icon: '🌫',  duration: 'Timed',    desc: 'All of this creature\'s attacks miss.' },
  { id: 'slow',    name: 'Slow',    icon: '🐢',  duration: 'Timed',    desc: 'Speed is halved, lowering turn order.' },
  { id: 'silence', name: 'Silence', icon: '🔇',  duration: 'Timed',    desc: 'Cannot use Arts. Basic Attack and Defend still work.' },
];

function _multClass(val) {
  if (val >= 1.5)  return 'eg-weak-2';
  if (val >= 1.25) return 'eg-weak-1';
  if (val <= 0.5)  return 'eg-res-2';
  if (val <= 0.75) return 'eg-res-1';
  return 'eg-neutral';
}

function _multLabel(val) {
  if (val === 1) return '—';
  return val + '×';
}

function isElementGuideOpen() {
  return !!document.getElementById('element-guide-popup');
}

function hideElementGuide() {
  document.getElementById('element-guide-popup')?.remove();
}

function showElementGuide(screenId) {
  hideElementGuide();

  // Build element chart rows from the live roster
  const chartRows = RENTAL_ROSTER.map(c => {
    const cells = GUIDE_ELEMENTS.map(el => {
      const val = c.resistances[el] ?? 1;
      return `<td class="eg-cell ${_multClass(val)}">${_multLabel(val)}</td>`;
    }).join('');
    return `
      <tr>
        <td class="eg-creature-cell">
          <img class="eg-creature-sprite" src="${c.sprite}" alt="${c.name}">
          <span class="eg-creature-name">${c.name}</span>
          <span class="element-tag element-${c.element}">${c.element}</span>
        </td>
        ${cells}
      </tr>`;
  }).join('');

  const elementHeaders = GUIDE_ELEMENTS.map(el =>
    `<th><span class="eg-elem-header element-${el}">${ELEMENT_LABELS[el]}</span></th>`
  ).join('');

  const statusRows = STATUS_DEFS.map(s => `
    <div class="eg-status-row">
      <div class="eg-status-name">
        <span class="eg-status-icon">${s.icon}</span>
        <span>${s.name}</span>
        <span class="eg-status-duration">${s.duration}</span>
      </div>
      <div class="eg-status-desc">${s.desc}</div>
    </div>`).join('');

  const popup = document.createElement('div');
  popup.id = 'element-guide-popup';
  popup.className = 'element-guide-popup';
  popup.innerHTML = `
    <div class="guide-popup-card">
      <div class="guide-popup-header">
        <div class="guide-popup-title">Battle Reference</div>
      </div>
      <div class="guide-popup-body">
        <div class="stats-section-label">Element Chart — Incoming Damage</div>
        <div class="eg-chart-legend">
          <span class="eg-legend-dot eg-weak-2">1.5× Weak</span>
          <span class="eg-legend-dot eg-weak-1">1.25× Slight Weak</span>
          <span class="eg-legend-dot eg-neutral">1× Neutral</span>
          <span class="eg-legend-dot eg-res-1">0.75× Resists</span>
          <span class="eg-legend-dot eg-res-2">0.5× Blocks</span>
        </div>
        <table class="eg-chart">
          <thead>
            <tr>
              <th class="eg-chart-corner">Target ↓ &nbsp; Attacker →</th>
              ${elementHeaders}
            </tr>
          </thead>
          <tbody>
            ${chartRows}
          </tbody>
        </table>

        <div class="stats-section-label" style="margin-top:18px">Status Effects</div>
        <div class="eg-status-list">
          ${statusRows}
        </div>
      </div>
      <div class="guide-popup-footer">I · ESC — Close</div>
    </div>`;

  popup.addEventListener('click', e => {
    if (e.target === popup) { playClick(); hideElementGuide(); }
  });

  document.getElementById(screenId).appendChild(popup);
}
