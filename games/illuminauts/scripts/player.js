import { STAMINA_MAX, STAMINA_RECOVER_PER_SECOND } from './config.js';
import { getDoorAt, isWall } from './map.js';
import { WORLD_3D } from './map-3d.js';
import { applyLookInput, getFirstPersonIntent } from './input-3d.js';
import { wantsSprint } from './input.js';
import { collectPickups, tryOpenDoor } from './player-interactions.js';
import { applyHazardDamage } from './player-damage.js';

const WALK_SPEED = 3.35 / WORLD_3D.tileSize;
const RUN_SPEED = 5.15 / WORLD_3D.tileSize;
const SPRINT_DRAIN = 28;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function intersects(px, py, x, y) {
  const dx = px - clamp(px, x, x + 1), dy = py - clamp(py, y, y + 1);
  return dx * dx + dy * dy < WORLD_3D.playerRadius ** 2;
}

function canOccupy(state, px, py) {
  const doors = [];
  for (let y = Math.floor(py) - 1; y <= Math.floor(py) + 1; y++) {
    for (let x = Math.floor(px) - 1; x <= Math.floor(px) + 1; x++) {
      if (!intersects(px, py, x, y)) continue;
      if (isWall(state.map, x, y)) return false;
      const door = getDoorAt(state.map, x, y);
      if (door && !door.open) doors.push(door);
    }
  }
  // Do not spend chips if the same proposed move hits a wall.
  if (doors.length > state.player.chips) { state.message = 'Laser Door requires an Access Chip.'; return false; }
  return doors.every(door => tryOpenDoor(state, door));
}

// Fixed-step camera-relative movement. Tile units preserve the gameplay/network boundary.
export function updatePlayer(state, now, dtMs) {
  const { player, input } = state;
  if (player.won) return;
  const dt = clamp(dtMs / 1000, 0, 0.1);
  applyLookInput(player, input, dt);
  const intent = getFirstPersonIntent(input, player.yaw);
  const sprinting = wantsSprint(input) && player.stamina > 0;
  const speed = sprinting ? RUN_SPEED : WALK_SPEED;
  const dx = intent.dx * speed * dt, dy = intent.dy * speed * dt;
  const oldX = player.px, oldY = player.py;
  // Substeps prevent tunneling through walls or skipping pickup cells.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.08));
  if (applyHazardDamage(state, now)) return;
  collectPickups(state, now);
  for (let i = 0; i < steps && !player.won; i++) {
    if (dx && canOccupy(state, player.px + dx / steps, player.py)) player.px += dx / steps;
    if (dy && canOccupy(state, player.px, player.py + dy / steps)) player.py += dy / steps;
    player.tx = Math.floor(player.px); player.ty = Math.floor(player.py);
    if (applyHazardDamage(state, now)) return;
    collectPickups(state, now);
  }
  const moved = Math.hypot(player.px - oldX, player.py - oldY) > 1e-7;
  player.isSprinting = moved && sprinting;
  player.stamina = clamp(player.stamina + (player.isSprinting ? -SPRINT_DRAIN : STAMINA_RECOVER_PER_SECOND) * dt, 0, STAMINA_MAX);
  if (moved) {
    player.dir = Math.abs(intent.dx) > Math.abs(intent.dy) ? (intent.dx > 0 ? 'right' : 'left') : (intent.dy > 0 ? 'down' : 'up');
    player.walkFrame = Math.floor(now / 160) % 3;
  } else player.walkFrame = 0;
}
