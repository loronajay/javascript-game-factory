export class FogOfWar {
  constructor(map) {
    this.map = map;
    this.explored = new Uint8Array(map.width * map.height);
    this.visible = new Uint8Array(map.width * map.height);
    this.revision = 0;
  }

  index(x, y) {
    return y * this.map.width + x;
  }

  isExplored(x, y) {
    return this.map.inBounds(x, y) && this.explored[this.index(x, y)] === 1;
  }

  isVisible(x, y) {
    return this.map.inBounds(x, y) && this.visible[this.index(x, y)] === 1;
  }

  recompute(unitManagerOrUnits) {
    const unitList = Array.isArray(unitManagerOrUnits) ? unitManagerOrUnits : unitManagerOrUnits.units;
    this.visible.fill(0);
    for (const unit of unitList) {
      if (unit.team !== 1) continue;
      const center = this.map.worldToTile(unit.x, unit.y);
      const radius = typeof unitManagerOrUnits.getRevealRangeTiles === 'function' ? unitManagerOrUnits.getRevealRangeTiles(unit) : Math.ceil(288 / this.map.tileSize);
      const r2 = radius * radius;
      for (let y = center.y - radius; y <= center.y + radius; y++) {
        for (let x = center.x - radius; x <= center.x + radius; x++) {
          if (!this.map.inBounds(x, y)) continue;
          const dx = x - center.x;
          const dy = y - center.y;
          if (dx * dx + dy * dy > r2) continue;
          const idx = this.index(x, y);
          this.visible[idx] = 1;
          this.explored[idx] = 1;
        }
      }
    }
    this.revision++;
  }

  revealCircle(tileX, tileY, radius) {
    const r2 = radius * radius;
    for (let y = tileY - radius; y <= tileY + radius; y++) {
      for (let x = tileX - radius; x <= tileX + radius; x++) {
        if (!this.map.inBounds(x, y)) continue;
        const dx = x - tileX;
        const dy = y - tileY;
        if (dx * dx + dy * dy > r2) continue;
        const idx = this.index(x, y);
        this.visible[idx] = 1;
        this.explored[idx] = 1;
      }
    }
  }
}
