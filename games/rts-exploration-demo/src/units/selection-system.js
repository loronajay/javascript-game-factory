import { distanceSq } from '../utils.js';

// Manages unit selection state and hit-testing.
// Does not issue commands — only reads/writes the selected set.
export class SelectionSystem {
  constructor(ctx) {
    this.ctx = ctx; // { getUnits, selectedIds }
  }

  clearSelection() {
    this.ctx.selectedIds.clear();
    for (const unit of this.ctx.getUnits()) unit.selected = false;
  }

  selectSingle(id, additive = false) {
    const unit = this.ctx.getById(id);
    if (!unit || unit.team !== 1) return;
    if (!additive) this.clearSelection();
    if (this.ctx.selectedIds.has(id) && additive) {
      this.ctx.selectedIds.delete(id);
      unit.selected = false;
      return;
    }
    this.ctx.selectedIds.add(id);
    unit.selected = true;
  }

  selectInWorldRect(rect, additive = false) {
    if (!additive) this.clearSelection();
    for (const unit of this.ctx.getUnits()) {
      if (unit.team !== 1) continue;
      if (unit.x >= rect.x && unit.y >= rect.y && unit.x <= rect.x + rect.w && unit.y <= rect.y + rect.h) {
        this.ctx.selectedIds.add(unit.id);
        unit.selected = true;
      }
    }
  }

  hitTestUnit(worldX, worldY, { selectableOnly = false, attackableOnly = false } = {}) {
    let best = null;
    let bestD2 = Infinity;
    for (const unit of this.ctx.getUnits()) {
      if (selectableOnly && unit.team !== 1) continue;
      if (attackableOnly && unit.team === 1) continue;
      const d2 = distanceSq(worldX, worldY, unit.x, unit.y);
      const r = unit.selectionRadius;
      if (d2 <= r * r && d2 < bestD2) {
        best = unit;
        bestD2 = d2;
      }
    }
    return best;
  }

  selectedUnitIds() {
    return [...this.ctx.selectedIds];
  }

  selectedUnits() {
    return this.ctx.getUnits().filter((unit) => this.ctx.selectedIds.has(unit.id));
  }

  selectedCenter() {
    const selected = this.selectedUnits();
    if (selected.length === 0) return null;
    const sum = selected.reduce((acc, u) => { acc.x += u.x; acc.y += u.y; return acc; }, { x: 0, y: 0 });
    return { x: sum.x / selected.length, y: sum.y / selected.length };
  }

  selectedDebugSummary() {
    const selected = this.selectedUnits();
    if (selected.length === 0) return 'none';
    const counts = new Map();
    for (const unit of selected) counts.set(unit.state, (counts.get(unit.state) ?? 0) + 1);
    return [...counts.entries()].map(([state, count]) => `${state}:${count}`).join(' ');
  }
}
