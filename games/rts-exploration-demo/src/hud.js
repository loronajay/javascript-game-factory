export class Hud {
  constructor(root, map, camera, units, input, debug = {}) {
    this.root = root;
    this.map = map;
    this.camera = camera;
    this.units = units;
    this.input = input;
    this.commands = debug.commands ?? null;
    this.ai = debug.ai ?? null;
    this.getTick = debug.getTick ?? (() => 0);
    this.fps = 0;
    this.accum = 0;
    this.frames = 0;
  }

  update(dt) {
    this.accum += dt;
    this.frames++;
    if (this.accum >= 0.4) {
      this.fps = Math.round(this.frames / this.accum);
      this.accum = 0;
      this.frames = 0;
    }
    const tile = this.map.worldToTile(this.input.pointer.worldX, this.input.pointer.worldY);
    const selected = this.units.selectedUnits();
    const moving = this.units.units.filter((unit) => unit.state === 'moving' || unit.state === 'attack-moving' || unit.state === 'pursuing-target').length;
    const selectedSummary = summarizeSelection(selected, this.units);
    const stateSummary = summarizeStates(this.units.stateCounts());
    this.root.innerHTML = [
      row('FPS', this.fps),
      row('Map', `${this.map.width}x${this.map.height} @ ${this.map.tileSize}px`),
      row('Theme', 'Alien hive combat test'),
      row('Camera', `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`),
      row('Cursor tile', `${tile.x}, ${tile.y}`),
      row('Selected', selectedSummary),
      row('Moving', `${moving}/${this.units.units.length}`),
      row('Unit states', stateSummary),
      row('Selected states', this.units.selectedDebugSummary()),
      row('Breakable walls', this.map.destructibleCount()),
      row('Team 1 units', this.units.units.filter((unit) => unit.team === 1).length),
      row('Team 2 AI units', this.units.units.filter((unit) => unit.team === 2).length),
      row('Native creatures', this.units.units.filter((unit) => unit.team === 0).length),
      row('Resource markers', this.map.resourceNodes.length),
      row('Command', this.input.commandState),
      row('Hotkeys', 'Q attack-move, X stop, F fog, P paths, O movement'),
      row('Sim tick', this.getTick()),
      row('Command history', this.commands?.history?.length ?? 0),
      row('AI mode', this.ai?.enabled ? 'on' : 'off'),
      row('Fog debug', this.input.showFogDebug ? 'on' : 'off'),
      row('Path debug', this.input.showPathDebug ? 'on' : 'off'),
      row('Movement debug', this.input.showMovementDebug ? 'on' : 'off'),
    ].join('');
  }
}

function summarizeSelection(selected, units) {
  if (selected.length === 0) return '0';
  const counts = new Map();
  for (const unit of selected) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
  const parts = [...counts.entries()].map(([type, count]) => {
    const def = units.getDef(type);
    return `${count} ${def.name}${count === 1 ? '' : 's'}`;
  });
  return parts.join(', ');
}

function summarizeStates(counts) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([state, count]) => `${state}:${count}`)
    .join(' ') || 'none';
}

function row(label, value) {
  return `<div class="hud-row"><span>${label}</span><strong>${value}</strong></div>`;
}
