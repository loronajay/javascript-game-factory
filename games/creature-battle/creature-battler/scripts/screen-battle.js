const SLOT_LAYOUT = {
  player: {
    top:    { xPct: 26, yPct: 38, scale: 0.58 },
    middle: { xPct: 31, yPct: 52, scale: 0.74 },
    bottom: { xPct: 25, yPct: 68, scale: 0.62 },
  },
  enemy: {
    top:    { xPct: 74, yPct: 38, scale: 0.58 },
    middle: { xPct: 69, yPct: 52, scale: 0.74 },
    bottom: { xPct: 75, yPct: 68, scale: 0.62 },
  },
};
const SLOT_ORDER = ['top', 'middle', 'bottom'];
const SPRITE_BASE = 80;

function renderBattle() {
  const { player, opponent } = state.battleState;
  const el = document.getElementById('screen-battle');

  const hudRows = [
    renderHudSide(player, 'player'),
    renderHudSide(opponent, 'enemy'),
  ];

  const fieldCreatures = [
    ...player.map((c, i) => renderBattleCreature(c, 'player', SLOT_ORDER[i])),
    ...opponent.map((c, i) => renderBattleCreature(c, 'enemy', SLOT_ORDER[i])),
  ].join('');

  el.innerHTML = `
    <div class="battle-bg"></div>
    <div class="battle-hud">
      <div class="hud-side player">${hudRows[0]}</div>
      <div class="hud-divider"></div>
      <div class="hud-side enemy">${hudRows[1]}</div>
    </div>
    <div class="battle-field">${fieldCreatures}</div>
    <div class="battle-commands">
      <div class="battle-commands-prompt">Choose Command</div>
      <div class="battle-commands-row">
        ${COMMANDS.map((cmd, i) => `
          <div class="command-btn ${i === 0 ? 'focused' : ''} ${!cmd.enabled ? 'disabled' : ''}"
               data-id="${cmd.id}">
            <span class="command-icon">${cmd.icon}</span>
            <span class="command-label">${cmd.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderHudSide(creatures, side) {
  return creatures.map(c => `
    <div class="hud-creature">
      <img class="hud-portrait" src="${c.sprite}" alt="${c.displayName}">
      <div class="hud-info">
        <div class="hud-name">${c.displayName}</div>
        <div class="hud-bar-row">
          <span class="hud-bar-label hp">HP</span>
          <div class="hud-bar-track">
            <div class="hud-bar-fill hp" style="width:${(c.hp.current / c.hp.max * 100).toFixed(1)}%"></div>
          </div>
          <span class="hud-bar-nums">${c.hp.current}/${c.hp.max}</span>
        </div>
        <div class="hud-bar-row">
          <span class="hud-bar-label mp">MP</span>
          <div class="hud-bar-track">
            <div class="hud-bar-fill mp" style="width:${(c.mp.current / c.mp.max * 100).toFixed(1)}%"></div>
          </div>
          <span class="hud-bar-nums">${c.mp.current}/${c.mp.max}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderBattleCreature(creature, side, slot) {
  const layout = SLOT_LAYOUT[side][slot];
  const size = Math.round(SPRITE_BASE * layout.scale * (1 / 0.58));
  const flip = side === 'enemy' ? 'scaleX(-1)' : '';
  const shadowW = Math.round(size * 0.72);
  const shadowH = Math.round(size * 0.14);
  return `
    <div class="battle-creature ${side}"
         style="left:${layout.xPct}%;top:${layout.yPct}%;z-index:${slot === 'middle' ? 30 : slot === 'top' ? 20 : 40}">
      <img src="${creature.sprite}" alt="${creature.displayName}"
           style="width:${size}px;height:${size}px;transform:${flip}">
      <div class="battle-shadow" style="width:${shadowW}px;height:${shadowH}px"></div>
    </div>
  `;
}

registerRenderer('battle', renderBattle);
