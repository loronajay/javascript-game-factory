export class Hud {
  constructor(root, map, camera, units, input) {
    this.root = root;
    this.map = map;
    this.camera = camera;
    this.units = units;
    this.input = input;
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
    const moving = this.units.units.filter((unit) => unit.state === 'moving').length;
    const selectedSummary = summarizeSelection(selected, this.units);
    this.root.innerHTML = [
      row('FPS', this.fps),
      row('Map', `${this.map.width}x${this.map.height} @ ${this.map.tileSize}px`),
      row('Theme', 'Alien hive combat test'),
      row('Camera', `${Math.round(this.camera.x)}, ${Math.round(this.camera.y)}`),
      row('Cursor tile', `${tile.x}, ${tile.y}`),
      row('Selected', selectedSummary),
      row('Moving', `${moving}/${this.units.units.length}`),
      row('Breakable walls', this.map.destructibleCount()),
      row('Native creatures', this.units.units.filter((unit) => unit.team === 0).length),
      row('Resource markers', this.map.resourceNodes.length),
      row('Command', this.input.commandState),
      row('Fog debug', this.input.showFogDebug ? 'on' : 'off'),
      row('Path debug', this.input.showPathDebug ? 'on' : 'off'),
    ].join('');
  }
}

function summarizeSelection(selected, units) {
  if (selected.length === 0) return '0';
  const counts = new Map();
  for (const unit of selected) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
  const parts = [...counts.entries()].map(([type, count]) => {
    const def = units.getDef({ type });
    return `${count} ${def.name}${count === 1 ? '' : 's'}`;
  });
  return parts.join(', ');
}

function row(label, value) {
  return `<div class="hud-row"><span>${label}</span><strong>${value}</strong></div>`;
}
