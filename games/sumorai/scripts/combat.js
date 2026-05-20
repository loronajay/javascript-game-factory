import { PLAYER_W, PLAYER_H } from './stage.js';

// Attack hitbox matches P1_hitbox/costume1.svg scaled by PLAYER_SCALE (42.5×26.5 → 106×66)
const ATK_HW   = 53;
const ATK_HH   = 33;
const ATK_XOFF = 28;   // forward offset so box extends mostly in front

// Dash hitbox matches P1_hitbox/costume2.svg scaled by PLAYER_SCALE (48.5×21.5 → 121×54)
const DASH_HW   = 61;
const DASH_HH   = 27;
const DASH_XOFF = 10;

// Active swing frames (0-indexed into the 6-frame attack animation) — frames 2-3 only
const ACTIVE_MIN = 2;
const ACTIVE_MAX = 2;

export const SHIELD_KNOCKBACK   = 20;
export const GRIDLOCK_KNOCKBACK = 46;

function _box(cx, cy, hw, hh) {
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
}

function _bodyBox(p) {
  return _box(p.x, p.y, PLAYER_W / 2, PLAYER_H / 2);
}

function _overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function getAttackHitbox(p) {
  return _box(p.x + p.facing * ATK_XOFF, p.y - 5, ATK_HW, ATK_HH);
}

export function getDashHitbox(p) {
  return _box(p.x + p.facing * DASH_XOFF, p.y, DASH_HW, DASH_HH);
}

export function isAttackActive(p) {
  return p.animState === 'attack' &&
         p.animFrame >= ACTIVE_MIN &&
         p.animFrame <= ACTIVE_MAX;
}

// Dash hit only fires at the end of the burst (last 4 ticks = the arrival impact)
export function isDashAttackActive(p) {
  return p.dashBursting && p.dashBurstTimer <= 4;
}

// Resolve all melee hit interactions for one tick.
// Mutates player state directly (hitLanded, stamina, speedX).
// Returns null (no contact), or { p1Killed, p2Killed, gridlock }.
export function resolveHits(p1, p2) {
  if (p1.dead || p1.dying || p2.dead || p2.dying) return null;

  const p1AtkLive  = isAttackActive(p1)       && !p1.hitLanded;
  const p2AtkLive  = isAttackActive(p2)       && !p2.hitLanded;
  const p1DashLive = isDashAttackActive(p1)   && !p1.hitLanded;
  const p2DashLive = isDashAttackActive(p2)   && !p2.hitLanded;

  if (!p1AtkLive && !p2AtkLive && !p1DashLive && !p2DashLive) return null;

  const p1Body = _bodyBox(p1);
  const p2Body = _bodyBox(p2);

  const p1HitBox = p1AtkLive ? getAttackHitbox(p1) : p1DashLive ? getDashHitbox(p1) : null;
  const p2HitBox = p2AtkLive ? getAttackHitbox(p2) : p2DashLive ? getDashHitbox(p2) : null;

  const p1Hits = p1HitBox && _overlaps(p1HitBox, p2Body);
  const p2Hits = p2HitBox && _overlaps(p2HitBox, p1Body);

  if (!p1Hits && !p2Hits) return null;

  // Gridlock: both connect simultaneously, neither blocking
  if (p1Hits && p2Hits && !p1.blocking && !p2.blocking) {
    p1.hitLanded = true;
    p2.hitLanded = true;
    return { p1Killed: false, p2Killed: false, gridlock: true };
  }

  let p1Killed = false;
  let p2Killed = false;

  if (p1Hits) {
    p1.hitLanded = true;
    if (p2.blocking) {
      p2.speedX = p1.facing * SHIELD_KNOCKBACK;
      p2.stamina = Math.max(0, p2.stamina - 3);
    } else {
      p2Killed = true;
    }
  }

  if (p2Hits) {
    p2.hitLanded = true;
    if (p1.blocking) {
      p1.speedX = p2.facing * SHIELD_KNOCKBACK;
      p1.stamina = Math.max(0, p1.stamina - 3);
    } else {
      p1Killed = true;
    }
  }

  return { p1Killed, p2Killed, gridlock: false };
}
