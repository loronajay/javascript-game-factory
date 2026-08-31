import { isWall } from './map.js';

// Topology proof, not a timing/balance proof. Opening a door only grows the reachable region.
// Search door subsets; within each region, all reachable chips can be collected once for free.
export function validateTraversal(map, start, mode = 'sprint') {
  const id = (x, y) => y * map.width + x;
  const doorAt = new Map(map.doors.map((d, i) => [id(d.x, d.y), i]));
  const pending = [0n], seen = new Set(pending);
  for (let head = 0; head < pending.length; head++) {
    const opened = pending[head], reached = new Set([id(start.x, start.y)]);
    const cells = [start], borderDoors = new Set();
    for (let cursor = 0; cursor < cells.length; cursor++) {
      const p = cells[cursor];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = p.x + dx, y = p.y + dy, key = id(x, y);
        if (isWall(map, x, y) || reached.has(key)) continue;
        const door = doorAt.get(key);
        if (door != null && !(opened & (1n << BigInt(door)))) { borderDoors.add(door); continue; }
        reached.add(key); cells.push({ x, y });
      }
    }
    const goal = map.goals.some(p => reached.has(id(p.x, p.y)));
    const cores = map.pickups.filter(p => p.type === 'dataCore');
    if (goal && (mode !== 'sweep' || cores.every(p => reached.has(id(p.x, p.y))))) return { solvable: true, statesChecked: head + 1 };
    const collected = map.pickups.filter(p => p.type === 'chip' && reached.has(id(p.x, p.y))).length;
    const spent = opened.toString(2).split('1').length - 1;
    if (collected <= spent) continue;
    for (const door of borderDoors) {
      const next = opened | (1n << BigInt(door));
      if (!seen.has(next)) { seen.add(next); pending.push(next); }
    }
  }
  return { solvable: false, statesChecked: seen.size };
}
