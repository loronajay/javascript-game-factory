// The HUD owns presentation only. Systems can add a new panel by extending the
// model below, rather than appending another line to a global debug readout.
export class Hud {
  constructor(root, debugLines, map, camera, units, input, debug = {}) {
    this.root = root;
    this.debugLines = debugLines;
    this.debugRoot = debugLines?.closest?.('#debug-hud') ?? null;
    this.map = map;
    this.camera = camera;
    this.units = units;
    this.input = input;
    this.commands = debug.commands ?? null;
    this.ai = debug.ai ?? null;
    this.entities = debug.entities ?? null;
    this.getTick = debug.getTick ?? (() => 0);
    this.fps = 0;
    this.accum = 0;
    this.frames = 0;
    this.mount();
  }

  mount() {
    this.root.innerHTML = `
      <header class="hud-topbar hud-surface">
        <div class="hud-brand"><span class="hud-brand-mark">◆</span><span>RTS Exploration</span><small>Prototype</small></div>
        <div class="hud-status" aria-live="polite"><span id="hud-fps">-- FPS</span><span class="hud-status-dot"></span><span id="hud-command-state">Standing by</span></div>
      </header>
      <section class="hud-selection hud-surface" aria-label="Selection">
        <div class="hud-section-kicker">Selection</div>
        <div id="hud-selection-title" class="hud-selection-title">No selection</div>
        <div id="hud-selection-detail" class="hud-selection-detail">Select a unit or drag a squad.</div>
        <div class="hud-health"><div class="hud-health-track"><div id="hud-selection-health-fill" class="hud-health-fill"></div></div><span id="hud-selection-health">--</span></div>
      </section>
      <section class="hud-resource-strip hud-surface" aria-label="Player resources">
        <div><span class="hud-resource-icon">⬡</span><span class="hud-resource-label">Weak steel</span><strong id="hud-weak-steel">0</strong></div>
        <div><span class="hud-resource-icon">◉</span><span class="hud-resource-label">Field units</span><strong id="hud-field-units">0</strong></div>
      </section>
      <nav class="hud-command-bar hud-surface" aria-label="Command hotkeys">
        <div id="hud-command-attack" class="hud-command"><kbd>Q</kbd><span><b>Attack move</b><small>Arm command</small></span></div>
        <div id="hud-command-stop" class="hud-command"><kbd>X</kbd><span><b>Stop</b><small>Clear orders</small></span></div>
        <div class="hud-command"><kbd>Space</kbd><span><b>Center</b><small>Selected squad</small></span></div>
        <div class="hud-command hud-command-muted"><kbd>F3</kbd><span><b>Diagnostics</b><small>Toggle overlay</small></span></div>
      </nav>`;
    this.refs = {
      fps: this.root.querySelector('#hud-fps'),
      commandState: this.root.querySelector('#hud-command-state'),
      selectionTitle: this.root.querySelector('#hud-selection-title'),
      selectionDetail: this.root.querySelector('#hud-selection-detail'),
      selectionHealthFill: this.root.querySelector('#hud-selection-health-fill'),
      selectionHealth: this.root.querySelector('#hud-selection-health'),
      weakSteel: this.root.querySelector('#hud-weak-steel'),
      fieldUnits: this.root.querySelector('#hud-field-units'),
      attack: this.root.querySelector('#hud-command-attack'),
      stop: this.root.querySelector('#hud-command-stop'),
    };
  }

  update(dt) {
    this.accum += dt;
    this.frames += 1;
    if (this.accum >= 0.4) {
      this.fps = Math.round(this.frames / this.accum);
      this.accum = 0;
      this.frames = 0;
    }

    const model = buildHudModel({
      units: this.units,
      input: this.input,
      fps: this.fps,
      tick: this.getTick(),
      entities: this.entities,
    });
    this.render(model);
    this.renderDebug();
  }

  render(model) {
    const { selection, resources, commands, status } = model;
    this.refs.fps.textContent = `${status.fps} FPS`;
    this.refs.commandState.textContent = status.commandState;
    this.refs.selectionTitle.textContent = selection.title;
    this.refs.selectionDetail.textContent = selection.detail;
    this.refs.selectionHealth.textContent = selection.empty ? '—' : `${selection.health.current}/${selection.health.max}`;
    this.refs.selectionHealthFill.style.width = `${selection.health.percent}%`;
    this.refs.weakSteel.textContent = resources.weakSteel;
    this.refs.fieldUnits.textContent = resources.fieldUnits;
    this.refs.attack.classList.toggle('is-active', commands.attackMove.active);
    this.refs.attack.classList.toggle('is-disabled', !commands.attackMove.available);
    this.refs.stop.classList.toggle('is-disabled', !commands.stop.available);
  }

  renderDebug() {
    if (!this.debugLines) return;
    const visible = Boolean(this.input.showDebugHud);
    if (this.debugRoot) this.debugRoot.hidden = !visible;
    if (!visible) return;

    const tile = this.map.worldToTile(this.input.pointer.worldX, this.input.pointer.worldY);
    const selected = this.units.selectedUnits();
    const moving = this.units.units.filter((unit) => ['moving', 'attack-moving', 'pursuing-target'].includes(unit.state)).length;
    this.debugLines.innerHTML = [
      row('Map', `${this.map.width}x${this.map.height} @ ${this.map.tileSize}px`),
      row('Camera', `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`),
      row('Cursor tile', `${tile.x}, ${tile.y}`),
      row('Selected', summarizeSelection(selected, this.units)),
      row('Moving', `${moving}/${this.units.units.length}`),
      row('Unit states', summarizeStates(this.units.stateCounts())),
      row('Selected states', this.units.selectedDebugSummary()),
      row('Breakable walls', this.map.destructibleCount()),
      row('Nexus', nexusSummary(this.entities)),
      row('Sim tick', this.getTick()),
      row('Command history', this.commands?.history?.length ?? 0),
      row('AI mode', this.ai?.enabled ? 'on' : 'off'),
      row('Fog debug', this.input.showFogDebug ? 'on' : 'off'),
      row('Path debug', this.input.showPathDebug ? 'on' : 'off'),
      row('Movement debug', this.input.showMovementDebug ? 'on' : 'off'),
    ].join('');
  }
}

export function buildHudModel({ units, input, fps = 0, tick = 0, entities = null }) {
  const selected = units.selectedUnits();
  const health = selected.reduce((total, unit) => ({
    current: total.current + Math.max(0, unit.hp ?? 0),
    max: total.max + Math.max(0, unit.maxHp ?? 0),
  }), { current: 0, max: 0 });
  const selection = selected.length === 0
    ? { empty: true, title: 'No selection', detail: 'Select a unit or drag a squad.', health: { current: 0, max: 0, percent: 0 } }
    : {
        empty: false,
        title: selectionTitle(selected, units),
        detail: selectionDetail(selected, units),
        health: { ...health, current: Math.ceil(health.current), max: Math.ceil(health.max), percent: Math.round((health.current / health.max) * 100) },
      };
  const stockpile = units.resourceStockpile?.(1) ?? {};
  const fieldUnits = units.units.filter((unit) => unit.team === 1 && unit.hp > 0).length;

  return {
    selection,
    resources: { weakSteel: stockpile.weakSteel ?? 0, fieldUnits },
    commands: {
      attackMove: { available: selected.some((unit) => units.getDef(unit.type).combat?.canAttack ?? true), active: input.pendingCommandMode === 'attackMove' },
      stop: { available: selected.length > 0 },
    },
    status: { fps, tick, commandState: humanizeCommandState(input.commandState) },
    nexus: entities?.getById?.('nexus_team_1') ?? null,
  };
}

function selectionTitle(selected, units) {
  if (selected.length === 1) return units.getDef(selected[0].type).name;
  const types = new Set(selected.map((unit) => unit.type));
  if (types.size === 1) {
    const name = units.getDef(selected[0].type).name;
    return `${selected.length} ${name}${selected.length === 1 ? '' : 's'}`;
  }
  return `${selected.length} units`;
}

function selectionDetail(selected, units) {
  const states = new Map();
  for (const unit of selected) states.set(unit.state, (states.get(unit.state) ?? 0) + 1);
  const state = [...states.entries()].sort((a, b) => b[1] - a[1])[0][0].replaceAll('-', ' ');
  if (selected.length === 1) return `${units.getDef(selected[0].type).role ?? 'unit'} · ${state}`;
  return `${states.get(state) === selected.length ? state : 'mixed orders'} · ${selected.length} selected`;
}

function humanizeCommandState(commandState = 'idle') {
  return commandState.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function summarizeSelection(selected, units) {
  if (selected.length === 0) return '0';
  const counts = new Map();
  for (const unit of selected) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => {
    const def = units.getDef(type);
    return `${count} ${def.name}${count === 1 ? '' : 's'}`;
  }).join(', ');
}

function summarizeStates(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([state, count]) => `${state}:${count}`).join(' ') || 'none';
}

function row(label, value) {
  return `<div class="debug-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function nexusSummary(entities) {
  const nexuses = entities?.entities?.filter((entity) => entity.kind === 'nexus') ?? [];
  if (nexuses.length === 0) return 'not spawned';
  return nexuses.map((entity) => `T${entity.team} ${Math.ceil(entity.hp)}/${entity.maxHp}`).join(' · ');
}
