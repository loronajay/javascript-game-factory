registerRenderer('battle', renderBattle);

const SLOT_LAYOUT = {
  player: {
    top:    { xPct: 26, yPct: 38, scale: 0.58, zIndex: 20 },
    middle: { xPct: 31, yPct: 52, scale: 0.74, zIndex: 30 },
    bottom: { xPct: 25, yPct: 68, scale: 0.62, zIndex: 40 },
  },
  opponent: {
    top:    { xPct: 74, yPct: 38, scale: 0.58, zIndex: 20 },
    middle: { xPct: 69, yPct: 52, scale: 0.74, zIndex: 30 },
    bottom: { xPct: 75, yPct: 68, scale: 0.62, zIndex: 40 },
  },
};
const SPRITE_BASE = 80;
const SPRITE_SCALE_NORM = 0.58;

function renderBattle() {
  if (!state.battleState) return;
  const { player, opponent } = state.battleState;
  const el = document.getElementById('screen-battle');

  el.innerHTML = `
    <div class="battle-bg"></div>
    <div class="battle-hud" id="battle-hud">
      <div class="hud-side player">${renderHudSide(player, 'player')}</div>
      <div class="hud-divider"></div>
      <div class="hud-side opponent">${renderHudSide(opponent, 'opponent')}</div>
    </div>
    <div class="battle-field" id="battle-field">
      ${SLOT_NAMES.map(s => renderFieldCreature(player[s],   'player',   s)).join('')}
      ${SLOT_NAMES.map(s => renderFieldCreature(opponent[s], 'opponent', s)).join('')}
    </div>
    <div class="battle-commands" id="battle-commands"></div>
  `;

  inputState.logMessage = 'Preparing for battle...';
  renderBattleCommandPanel();
  setTimeout(startRound, 600);
}

// ── HUD ──────────────────────────────────────────────────────────────────────

function renderHudSide(side, sideName) {
  return SLOT_NAMES.map(slot => {
    const c = side[slot];
    if (!c) return '';
    return `
      <div class="hud-creature ${c.isKnockedOut ? 'ko' : ''}" data-hud="${sideName}-${slot}">
        <img class="hud-portrait" src="${c.sprite}" alt="${c.displayName}">
        <div class="hud-info">
          <div class="hud-name">${c.displayName}</div>
          <div class="hud-bar-row">
            <span class="hud-bar-label hp">HP</span>
            <div class="hud-bar-track"><div class="hud-bar-fill hp" id="hp-bar-${sideName}-${slot}" style="width:${pct(c.hp)}%"></div></div>
            <span class="hud-bar-nums" id="hp-nums-${sideName}-${slot}">${c.hp.current}/${c.hp.max}</span>
          </div>
          <div class="hud-bar-row">
            <span class="hud-bar-label mp">MP</span>
            <div class="hud-bar-track"><div class="hud-bar-fill mp" id="mp-bar-${sideName}-${slot}" style="width:${pct(c.mp)}%"></div></div>
            <span class="hud-bar-nums" id="mp-nums-${sideName}-${slot}">${c.mp.current}/${c.mp.max}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function pct(resource) {
  return (resource.current / resource.max * 100).toFixed(1);
}

// Live-update HUD bars without re-rendering
function renderBattleHud() {
  const bs = state.battleState;
  for (const side of ['player', 'opponent']) {
    for (const slot of SLOT_NAMES) {
      const c = bs[side][slot];
      if (!c) continue;
      const hpBar  = document.getElementById(`hp-bar-${side}-${slot}`);
      const hpNums = document.getElementById(`hp-nums-${side}-${slot}`);
      const mpBar  = document.getElementById(`mp-bar-${side}-${slot}`);
      const mpNums = document.getElementById(`mp-nums-${side}-${slot}`);
      const card   = document.querySelector(`[data-hud="${side}-${slot}"]`);
      if (hpBar)  hpBar.style.width  = `${pct(c.hp)}%`;
      if (hpNums) hpNums.textContent = `${c.hp.current}/${c.hp.max}`;
      if (mpBar)  mpBar.style.width  = `${pct(c.mp)}%`;
      if (mpNums) mpNums.textContent = `${c.mp.current}/${c.mp.max}`;
      if (card)   card.classList.toggle('ko', c.isKnockedOut);
    }
  }
}

// ── Field creatures ───────────────────────────────────────────────────────────

function renderFieldCreature(creature, side, slot) {
  if (!creature) return '';
  const layout   = SLOT_LAYOUT[side][slot];
  const size     = Math.round(SPRITE_BASE * layout.scale * (1 / SPRITE_SCALE_NORM));
  const flip     = side === 'opponent' ? 'scaleX(-1)' : '';
  const shadowW  = Math.round(size * 0.72);
  const shadowH  = Math.round(size * 0.14);
  return `
    <div class="battle-creature ${side} ${creature.isKnockedOut ? 'ko' : ''}"
         data-creature="${side}-${slot}"
         style="left:${layout.xPct}%;top:${layout.yPct}%;z-index:${layout.zIndex}">
      <img src="${creature.sprite}" alt="${creature.displayName}"
           style="width:${size}px;height:${size}px;transform:${flip};display:block;image-rendering:pixelated;object-fit:contain">
      <div class="battle-shadow" style="width:${shadowW}px;height:${shadowH}px"></div>
    </div>`;
}

function updateFieldKoStates() {
  const bs = state.battleState;
  for (const side of ['player', 'opponent']) {
    for (const slot of SLOT_NAMES) {
      const c = bs[side][slot];
      if (!c) continue;
      document.querySelector(`[data-creature="${side}-${slot}"]`)?.classList.toggle('ko', c.isKnockedOut);
    }
  }
}

// ── Battle log (written into the command panel during playback) ───────────────

function updateBattleLog(msg) {
  inputState.logMessage = msg;
  if (!inputState.active) renderBattleCommandPanel();
}

// ── End overlay ───────────────────────────────────────────────────────────────

function renderBattleEndOverlay(winner) {
  const screen  = document.getElementById('screen-battle');
  const overlay = document.createElement('div');
  overlay.className = 'battle-end-overlay';
  const title = winner === 'player' ? 'Victory!' : winner === 'draw' ? 'Draw' : 'Defeat';
  const sub   = winner === 'player' ? 'All opponents knocked out!'
              : winner === 'draw'   ? 'Both teams were knocked out.'
              :                       'Your team was knocked out.';
  overlay.innerHTML = `
    <div class="battle-end-card">
      <div class="battle-end-title">${title}</div>
      <div class="battle-end-sub">${sub}</div>
      <button class="btn primary" id="end-back-btn">Back to Title</button>
    </div>`;
  screen.appendChild(overlay);
  document.getElementById('end-back-btn')?.addEventListener('click', () => { playClick(); setScreen('title'); });
}
