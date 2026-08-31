import { isWall, getDoorAt } from './map.js';

// Old authored hazards can outlive wall edits. Repair paths once, never during rendering.
export function createHazards(map, definition = {}) {
  const source = JSON.parse(JSON.stringify(definition));
  const diagnostics = [];
  const walkable = p => Number.isInteger(p.x) && Number.isInteger(p.y) && !isWall(map, p.x, p.y) && !getDoorAt(map, p.x, p.y);
  const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
  const aliens = (source.aliens || []).flatMap(alien => {
    const authored = alien.route || [];
    const valid = authored.length && authored.every((p, i) => walkable(p) && adjacent(p, authored[(i + 1) % authored.length]));
    if (valid) return [{ ...alien, index: 0, lastStepAt: 0 }];
    let best = [], run = [];
    for (const p of authored) {
      if (!walkable(p)) { run = []; continue; }
      if (run.length && !adjacent(run.at(-1), p)) run = [];
      run.push(p);
      if (run.length > best.length) best = run.slice();
    }
    diagnostics.push(`${alien.id}: repaired patrol route (${authored.length} authored points, ${best.length} usable contiguous points).`);
    if (!best.length) return [];
    const route = adjacent(best[0], best.at(-1)) ? best : [...best, ...best.slice(1, -1).reverse()];
    return [{ ...alien, route, index: 0, lastStepAt: 0 }];
  });
  const laserGates = (source.laserGates || []).map(gate => ({ ...gate, tiles: gate.tiles.filter(p => !isWall(map, p.x, p.y)) })).filter(gate => gate.tiles.length);
  const turrets = (source.turrets || []).map(turret => {
    const beamTiles = [];
    for (let i = 1; i <= turret.range; i++) {
      const x = turret.x + turret.dx * i, y = turret.y + turret.dy * i;
      if (isWall(map, x, y)) break;
      beamTiles.push({ x, y });
    }
    return { ...turret, beamTiles };
  });
  return { hazards: { aliens, laserGates, turrets }, diagnostics };
}
