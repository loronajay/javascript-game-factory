import { BLAST_LEFT, BLAST_RIGHT } from './stage.js';

const PROJ_SPEED = 9;
const PROJ_HW    = 12;   // hitbox half-width
const PROJ_HH    = 10;   // hitbox half-height

export const PROJ_SHIELD_KNOCKBACK = 2;

export function createProjectile(owner, x, y, facing) {
  return { owner, x, y, facing, active: true };
}

export function tickProjectile(proj) {
  proj.x += proj.facing * PROJ_SPEED;
  if (proj.x < BLAST_LEFT || proj.x > BLAST_RIGHT) proj.active = false;
}

function _projBox(proj) {
  return { left: proj.x - PROJ_HW, right: proj.x + PROJ_HW, top: proj.y - PROJ_HH, bottom: proj.y + PROJ_HH };
}

function _bodyBox(p) {
  return { left: p.x - 16, right: p.x + 16, top: p.y - 20, bottom: p.y + 20 };
}

function _overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Returns 'kill' | 'block' | null
export function checkProjectileVsPlayer(proj, target) {
  if (!proj?.active || proj.owner === target.side) return null;
  if (target.dead || target.dying) return null;
  return _overlaps(_projBox(proj), _bodyBox(target)) ? (target.blocking ? 'block' : 'kill') : null;
}

// Returns true if both projectiles overlap (they cancel each other)
export function checkProjectileClash(p1Proj, p2Proj) {
  if (!p1Proj?.active || !p2Proj?.active) return false;
  return _overlaps(_projBox(p1Proj), _projBox(p2Proj));
}

// Returns true if a melee/dash hitbox box overlaps an active projectile (sword deflect)
export function checkHitboxVsProjectile(box, proj) {
  if (!proj?.active) return false;
  return _overlaps(box, _projBox(proj));
}
