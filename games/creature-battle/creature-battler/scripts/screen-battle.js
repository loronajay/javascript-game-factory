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
    <div class="battle-bg" id="battle-bg"></div>
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

  const arenaFile = state.battleState?.arenaFile;
  if (arenaFile) {
    document.getElementById('battle-bg').style.backgroundImage = `url('${arenaFile}')`;
  }

  el.addEventListener('click', e => {
    if (!pendingAdvance) return;
    if (e.target.closest('#battle-commands button, #battle-commands .art-btn, #battle-commands .cmd-back')) return;
    playClick();
    advancePlayback();
  });

  CreatureState.initBattle();
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
          <div class="hud-status-row" id="status-row-${sideName}-${slot}">${renderStatusBadges(c)}</div>
        </div>
      </div>`;
  }).join('');
}

function renderStatusBadges(creature) {
  const labels = typeof getCreatureStatusLabels === 'function' ? getCreatureStatusLabels(creature) : [];
  return labels.map(({ label, kind }) => `<span class="hud-status-badge ${kind}">${label}</span>`).join('');
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
      const statusRow = document.getElementById(`status-row-${side}-${slot}`);
      const card   = document.querySelector(`[data-hud="${side}-${slot}"]`);
      if (hpBar)  hpBar.style.width  = `${pct(c.hp)}%`;
      if (hpNums) hpNums.textContent = `${c.hp.current}/${c.hp.max}`;
      if (mpBar)  mpBar.style.width  = `${pct(c.mp)}%`;
      if (mpNums) mpNums.textContent = `${c.mp.current}/${c.mp.max}`;
      if (statusRow) statusRow.innerHTML = renderStatusBadges(c);
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
      <div class="creature-breathe-wrapper">
        <img src="${creature.sprite}" alt="${creature.displayName}"
             style="width:${size}px;height:${size}px;transform:${flip};display:block;image-rendering:pixelated;object-fit:contain">
      </div>
      <div class="battle-shadow" style="width:${shadowW}px;height:${shadowH}px"></div>
    </div>`;
}

function updateFieldKoStates() {
  const bs = state.battleState;
  for (const side of ['player', 'opponent']) {
    for (const slot of SLOT_NAMES) {
      const c = bs[side][slot];
      if (!c) continue;
      const el = document.querySelector(`[data-creature="${side}-${slot}"]`);
      if (!el) continue;
      const wasKo = el.classList.contains('ko');
      el.classList.toggle('ko', c.isKnockedOut);
      if (c.isKnockedOut && !wasKo) CreatureState.setKO(side, slot);
    }
  }
}

// ── Battle log (written into the command panel during playback) ───────────────

function updateBattleLog(msg) {
  inputState.logMessage = msg;
  if (!inputState.active) renderBattleCommandPanel();
}

// ── End overlay ───────────────────────────────────────────────────────────────

function _renderEndPortraits(side) {
  const bs = state.battleState;
  return SLOT_NAMES.map(slot => {
    const c = bs[side][slot];
    if (!c) return '';
    return `<div class="bes-portrait ${c.isKnockedOut ? 'ko' : ''}">
      <img src="${c.sprite}" alt="${c.displayName}">
      ${c.isKnockedOut ? '<div class="bes-portrait-ko">✕</div>' : ''}
    </div>`;
  }).join('');
}

function renderBattleEndOverlay(winner, reason) {
  if (typeof window.__publishBattleResult === 'function') {
    window.__publishBattleResult(winner);
  }

  const screen  = document.getElementById('screen-battle');
  const overlay = document.createElement('div');
  overlay.className = 'battle-end-overlay';

  let title, sub;
  if (reason === 'disconnect') {
    title = 'Opponent Disconnected';
    sub   = 'Your opponent left the match. You win by forfeit.';
  } else {
    title = winner === 'player' ? 'Victory!' : winner === 'draw' ? 'Draw' : 'Defeat';
    sub   = winner === 'player' ? 'All opponents knocked out!'
          : winner === 'draw'   ? 'Both teams were knocked out.'
          :                       'Your team was knocked out.';
  }

  const bs     = state.battleState;
  const pStats = bs?.battleStats?.player   ?? { damageDealt: 0, healingDone: 0, kos: 0, highestHit: 0 };
  const oStats = bs?.battleStats?.opponent ?? { damageDealt: 0, healingDone: 0, kos: 0, highestHit: 0 };
  const round  = bs?.round ?? 1;
  const fmt    = n => n.toLocaleString();

  const statsBlock = reason === 'disconnect' ? '' : `
    <div class="bes-teams">
      <div class="bes-team">
        <div class="bes-team-label">YOUR TEAM</div>
        <div class="bes-portraits">${_renderEndPortraits('player')}</div>
      </div>
      <div class="bes-rounds">
        <div class="bes-rounds-num">${round}</div>
        <div class="bes-rounds-label">ROUND${round !== 1 ? 'S' : ''}</div>
      </div>
      <div class="bes-team">
        <div class="bes-team-label">THEIR TEAM</div>
        <div class="bes-portraits">${_renderEndPortraits('opponent')}</div>
      </div>
    </div>
    <div class="bes-stats-table">
      <div class="bes-stat-row">
        <div class="bes-val player">${fmt(pStats.damageDealt)}</div>
        <div class="bes-stat-label">DAMAGE</div>
        <div class="bes-val opp">${fmt(oStats.damageDealt)}</div>
      </div>
      <div class="bes-stat-row">
        <div class="bes-val player">${fmt(pStats.highestHit)}</div>
        <div class="bes-stat-label">BEST HIT</div>
        <div class="bes-val opp">${fmt(oStats.highestHit)}</div>
      </div>
      <div class="bes-stat-row">
        <div class="bes-val player">${fmt(pStats.healingDone)}</div>
        <div class="bes-stat-label">HEALING</div>
        <div class="bes-val opp">${fmt(oStats.healingDone)}</div>
      </div>
      <div class="bes-stat-row">
        <div class="bes-val player">${pStats.kos}</div>
        <div class="bes-stat-label">KOs</div>
        <div class="bes-val opp">${oStats.kos}</div>
      </div>
    </div>`;

  overlay.innerHTML = `
    <div class="battle-end-card ${reason !== 'disconnect' ? 'rich' : ''}">
      <div class="battle-end-title ${winner}">${title}</div>
      <div class="battle-end-sub">${sub}</div>
      ${statsBlock}
      <button class="btn primary" id="end-back-btn">Back to Title</button>
    </div>`;
  screen.appendChild(overlay);
  document.getElementById('end-back-btn')?.addEventListener('click', () => { playClick(); setBattleRng(null); state.isOnlineMatch = false; setScreen('title'); });
}
