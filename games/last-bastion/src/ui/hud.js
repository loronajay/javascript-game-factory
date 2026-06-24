import {
  PLAYER_ROSTER,
  UNIT_TYPES,
  matchupText,
  unitDps,
  unitIconSvg,
} from '../data/units.js';
import { MAIN_MENU_MODES } from './menu.js';

const ORDER_LABELS = {
  hold: 'Holding position',
  move: 'Moving',
  guard: 'Guarding ally',
  attack: 'Attacking target',
  retreat: 'Retreating',
};

export function getWaveLabel(currentWave, totalWaves) {
  if (totalWaves <= 0) return '0 / 0';
  const activeWave = Math.max(1, Math.min(currentWave, totalWaves));
  return `${activeWave} / ${totalWaves}`;
}

function counterLine(unit) {
  const { strong, weak } = matchupText(unit);
  return `Counters ${strong} · Vulnerable to ${weak}`;
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.app = document.querySelector('#app');
    this.baseHp = document.querySelector('#baseHp');
    this.gold = document.querySelector('#gold');
    this.wave = document.querySelector('#wave');
    this.nextWave = document.querySelector('#nextWave');
    this.tray = document.querySelector('#unitTray');
    this.intelBtn = document.querySelector('#intelBtn');
    this.pauseBtn = document.querySelector('#pauseBtn');
    this.speedBtn = document.querySelector('#speedBtn');
    this.interactionBanner = document.querySelector('#interactionBanner');
    this.interactionTitle = document.querySelector('#interactionTitle');
    this.interactionHint = document.querySelector('#interactionHint');
    this.interactionCancel = document.querySelector('#interactionCancel');
    this.commandPanel = document.querySelector('#commandPanel');
    this.commandIcon = document.querySelector('#commandIcon');
    this.commandName = document.querySelector('#commandName');
    this.commandStatus = document.querySelector('#commandStatus');
    this.commandStats = document.querySelector('#commandStats');
    this.commandMatchup = document.querySelector('#commandMatchup');
    this.intelPanel = document.querySelector('#intelPanel');
    this.intelClose = document.querySelector('#intelClose');
    this.intelRoster = document.querySelector('#intelRoster');
    this.messagePanel = document.querySelector('#messagePanel');
    this.messageEyebrow = document.querySelector('#messageEyebrow');
    this.messageTitle = document.querySelector('#messageTitle');
    this.messageBody = document.querySelector('#messageBody');
    this.modeList = document.querySelector('#modeList');
    this.messageButton = document.querySelector('#messageButton');
    this.messageSecondary = document.querySelector('#messageSecondary');
    this.stageList = document.querySelector('#stageList');
    this.toastEl = document.querySelector('#toast');
    this.toastTimer = null;
    this.cards = new Map();

    document.addEventListener('click', (event) => {
      const button = event.target.closest('button:not(:disabled)');
      if (button) this.game.playSound('button-click');
    });

    this.buildTray();
    this.buildIntel();
    this.intelBtn.addEventListener('click', () => this.showIntel());
    this.intelClose.addEventListener('click', () => this.hideIntel());
    this.pauseBtn.addEventListener('click', () => game.togglePause());
    this.speedBtn.addEventListener('click', () => game.toggleSpeed());
    this.interactionCancel.addEventListener('click', () => game.cancelInteraction());
    this.commandPanel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-command]');
      if (!button) return;
      const command = button.dataset.command;
      if (command === 'move') game.beginMoveCommand();
      else if (command === 'attack') game.beginAttackCommand();
      else if (command === 'hold') game.issueHoldCommand();
      else if (command === 'guard') game.beginGuardCommand();
      else if (command === 'retreat') game.issueRetreatCommand();
      else if (command === 'info') this.showIntel(game.getSelectedUnit()?.type);
      else if (command === 'cancel') game.cancelInteraction();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (game.intelOpen) this.hideIntel();
        else game.cancelInteraction();
      }
      if (event.key === ' ' && game.interaction.mode === 'idle' && !game.intelOpen) {
        event.preventDefault();
        game.togglePause();
      }
    });
  }

  buildTray() {
    this.tray.innerHTML = '';
    for (const id of PLAYER_ROSTER) {
      const unit = UNIT_TYPES[id];
      const wrapper = document.createElement('div');
      wrapper.className = 'unit-card-wrap';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'unit-card';
      button.dataset.unit = id;
      button.innerHTML = `
        <span class="unit-icon">${unitIconSvg(id)}</span>
        <span class="unit-copy">
          <span class="unit-name">${unit.name}</span>
          <span class="unit-role">${unit.role}</span>
          <span class="unit-cost">${unit.cost} gold</span>
        </span>`;
      button.addEventListener('click', () => this.game.beginPlacement(id));

      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'unit-card-info';
      info.textContent = 'i';
      info.setAttribute('aria-label', `${unit.name} information`);
      info.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showIntel(id);
      });

      wrapper.append(button, info);
      this.tray.appendChild(wrapper);
      this.cards.set(id, button);
    }
  }

  buildIntel(focusId = null) {
    this.intelRoster.innerHTML = '';
    const order = focusId
      ? [focusId, ...PLAYER_ROSTER.filter((id) => id !== focusId)]
      : PLAYER_ROSTER;

    for (const id of order) {
      const unit = UNIT_TYPES[id];
      const { strong, weak } = matchupText(unit);
      const card = document.createElement('article');
      card.className = 'intel-unit';
      card.dataset.intelUnit = id;
      card.innerHTML = `
        <div class="intel-unit-head">
          <span class="intel-unit-icon">${unitIconSvg(id)}</span>
          <div>
            <h3>${unit.name}</h3>
            <div class="intel-role">${unit.role}</div>
          </div>
          <span class="intel-price">${unit.cost} gold</span>
        </div>
        <p class="intel-summary">${unit.summary}</p>
        <div class="intel-stats">
          <div class="intel-stat"><span>HP</span><strong>${unit.maxHp}</strong></div>
          <div class="intel-stat"><span>DMG</span><strong>${unit.damage}</strong></div>
          <div class="intel-stat"><span>DPS</span><strong>${unitDps(unit).toFixed(1)}</strong></div>
          <div class="intel-stat"><span>ARMOR</span><strong>${unit.armor}</strong></div>
          <div class="intel-stat"><span>RANGE</span><strong>${unit.rangeLabel}</strong></div>
        </div>
        <div class="intel-matchups">
          <div class="intel-matchup strong"><strong>Strong:</strong> ${strong}<br>Deals 215% damage</div>
          <div class="intel-matchup weak"><strong>Weak:</strong> ${weak}<br>Deals 48% damage</div>
        </div>
        <div class="intel-tactics">${unit.tactics}</div>`;
      this.intelRoster.appendChild(card);
    }
  }

  showIntel(focusId = null) {
    this.buildIntel(focusId);
    this.game.intelOpen = true;
    this.intelPanel.classList.remove('hidden');
    this.intelCardToTop(focusId);
  }

  intelCardToTop(focusId) {
    if (!focusId) return;
    const card = this.intelRoster.querySelector(`[data-intel-unit="${focusId}"]`);
    card?.scrollIntoView({ block: 'start' });
  }

  hideIntel() {
    this.game.intelOpen = false;
    this.intelPanel.classList.add('hidden');
  }

  update() {
    const game = this.game;
    this.baseHp.textContent = Math.ceil(game.baseHp);
    this.gold.textContent = Math.floor(game.gold);
    this.wave.textContent = getWaveLabel(game.currentWave, game.mission.waves.length);
    this.pauseBtn.textContent = game.manualPaused ? '▶' : '||';
    this.pauseBtn.disabled = game.interaction.mode !== 'idle' || game.intelOpen;
    this.speedBtn.textContent = `${game.speed}x`;

    const upcoming = game.mission.waves.find((wave, index) => index >= game.currentWave && wave.at > game.elapsed);
    this.nextWave.textContent = upcoming ? `${Math.max(0, upcoming.at - game.elapsed).toFixed(1)}s · ${upcoming.label}` : 'Final contact';

    for (const [id, card] of this.cards) {
      const data = UNIT_TYPES[id];
      const selected = game.interaction.mode === 'placing' && game.interaction.placementType === id;
      card.classList.toggle('selected', selected);
      card.classList.toggle('unaffordable', game.gold < data.cost);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    this.updateInteraction();
  }

  updateInteraction() {
    const game = this.game;
    const mode = game.interaction.mode;
    const active = mode !== 'idle';
    this.app.classList.toggle('interaction-active', active);
    this.commandPanel.classList.toggle('hidden', mode !== 'command');
    this.interactionBanner.classList.toggle('hidden', !active || mode === 'command');

    if (mode === 'placing') {
      const unit = UNIT_TYPES[game.interaction.placementType];
      this.interactionTitle.textContent = `TACTICAL PAUSE · DEPLOY ${unit.name.toUpperCase()}`;
      this.interactionHint.textContent = unit.placement === 'route'
        ? 'Tap a route scar inside the highlighted defensive territory. One use; arms shortly after deployment.'
        : `Tap open ground. ${counterLine(unit)}.`;
    } else if (mode === 'move') {
      this.interactionTitle.textContent = 'TACTICAL PAUSE · MOVE ORDER';
      this.interactionHint.textContent = 'Tap a walkable destination. The unit will route around blocked terrain.';
    } else if (mode === 'guard') {
      this.interactionTitle.textContent = 'TACTICAL PAUSE · GUARD ORDER';
      this.interactionHint.textContent = 'Tap another friendly unit. The guard follows it and attacks nearby threats.';
    } else if (mode === 'attack') {
      const selected = game.getSelectedUnit();
      const unit = selected ? UNIT_TYPES[selected.type] : null;
      this.interactionTitle.textContent = 'TACTICAL PAUSE · ATTACK ORDER';
      this.interactionHint.textContent = unit
        ? `Tap an enemy to pursue and attack. ${counterLine(unit)}.`
        : 'Tap an enemy to pursue and attack.';
    }

    const selected = game.getSelectedUnit();
    if (selected) {
      const data = UNIT_TYPES[selected.type];
      this.commandIcon.innerHTML = unitIconSvg(selected.type);
      this.commandName.textContent = `${data.name} · ${data.role}`;
      this.commandStatus.textContent = `${Math.ceil(selected.hp)} / ${selected.maxHp} HP · ${ORDER_LABELS[selected.order] ?? selected.order}`;
      this.commandStats.textContent = `Damage ${data.damage} · ${unitDps(data).toFixed(1)} DPS · Armor ${data.armor} · ${data.rangeLabel} range`;
      this.commandMatchup.textContent = counterLine(data);
    }
  }

  showBriefing(mission, onStart) {
    this.setOverlayView('briefing');
    this.modeList.classList.add('hidden');
    this.stageList.classList.add('hidden');
    this.messageEyebrow.textContent = mission.id.replace('-', ' ').toUpperCase();
    this.messageTitle.textContent = mission.title;
    this.messageBody.textContent = `${mission.mapId.replaceAll('-', ' ')} · ${mission.waves.length} waves. ${mission.briefing}`;
    this.showMessageActions('Begin Defense', () => {
      this.messagePanel.classList.add('hidden');
      this.setOverlayView('battle');
      this.game.startMission();
      onStart();
    });
  }

  showMainMenu(onSelect) {
    this.setOverlayView('menu');
    this.messageEyebrow.textContent = 'TACTICAL DEFENSE PROTOCOL';
    this.messageTitle.textContent = 'Last Bastion';
    this.messageBody.textContent = 'The frontier has one more line. Command it.';
    this.stageList.classList.add('hidden');
    this.modeList.innerHTML = '';
    this.modeList.classList.remove('hidden');
    for (const mode of MAIN_MENU_MODES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mode-card${mode.available ? ' available' : ''}`;
      button.disabled = !mode.available;
      button.innerHTML = `
        <span class="mode-glyph" aria-hidden="true">${mode.id === 'campaign' ? '✦' : mode.id === 'endless' ? '∞' : '◇'}</span>
        <span class="mode-copy"><strong>${mode.title}</strong><small>${mode.subtitle}</small></span>
        <span class="mode-state">${mode.badge}</span>`;
      if (mode.available) button.addEventListener('click', () => onSelect(mode.id));
      this.modeList.appendChild(button);
    }
    this.messageButton.classList.add('hidden');
    this.messageSecondary.classList.add('hidden');
    this.messagePanel.classList.remove('hidden');
  }

  showCampaign(missions, unlockedMissionIds, onSelect, onBack) {
    this.setOverlayView('campaign');
    this.modeList.classList.add('hidden');
    this.messageEyebrow.textContent = 'CAMPAIGN OPERATIONS';
    this.messageTitle.textContent = 'Last Bastion';
    this.messageBody.textContent = 'Choose an operation. Secure a stage to unlock the next deployment.';
    this.stageList.innerHTML = '';
    this.stageList.classList.remove('hidden');
    for (const mission of missions) {
      const unlocked = unlockedMissionIds.includes(mission.id);
      const stage = document.createElement('button');
      stage.type = 'button';
      stage.className = 'stage-card';
      stage.disabled = !unlocked;
      stage.innerHTML = `
        <span class="stage-number">${String(mission.campaignOrder).padStart(2, '0')}</span>
        <span class="stage-copy"><strong>${mission.title}</strong><small>${mission.waves.length} waves · ${mission.mapId.replaceAll('-', ' ')}</small></span>
        <span class="stage-state">${unlocked ? 'Deploy' : 'Locked'}</span>`;
      stage.addEventListener('click', () => onSelect(mission.id));
      this.stageList.appendChild(stage);
    }
    this.messageButton.classList.add('hidden');
    this.messageSecondary.classList.remove('hidden');
    this.messageSecondary.textContent = 'Back';
    this.messageSecondary.onclick = () => onBack();
    this.messagePanel.classList.remove('hidden');
  }

  showResult(won, stats, { primaryLabel, onPrimary, onCampaign }) {
    this.setOverlayView(won ? 'victory' : 'defeat');
    this.modeList.classList.add('hidden');
    this.stageList.classList.add('hidden');
    this.messageEyebrow.textContent = won ? 'PLATEAU SECURED' : 'CORE LOST';
    this.messageTitle.textContent = won ? 'Defense Complete' : 'Mission Failed';
    this.messageBody.textContent = won
      ? `${stats.enemiesDefeated} hostiles destroyed. ${Math.ceil(this.game.baseHp)} core integrity remains.`
      : `${stats.enemiesDefeated} hostiles destroyed before the reactor was breached.`;
    this.showMessageActions(primaryLabel, onPrimary, 'Campaign Map', onCampaign);
  }

  showMessageActions(primaryLabel, onPrimary, secondaryLabel = null, onSecondary = null) {
    this.modeList.classList.add('hidden');
    this.messageButton.textContent = primaryLabel;
    this.messageButton.classList.remove('hidden');
    this.messageButton.onclick = () => {
      this.messagePanel.classList.add('hidden');
      onPrimary();
    };
    const showSecondary = Boolean(secondaryLabel && onSecondary);
    this.messageSecondary.classList.toggle('hidden', !showSecondary);
    if (showSecondary) {
      this.messageSecondary.textContent = secondaryLabel;
      this.messageSecondary.onclick = () => {
        this.messagePanel.classList.add('hidden');
        onSecondary();
      };
    }
    this.messagePanel.classList.remove('hidden');
  }

  setOverlayView(view) {
    this.app.dataset.screen = view;
    this.messagePanel.dataset.view = view;
  }

  toast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }
}
