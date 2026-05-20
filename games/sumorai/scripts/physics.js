import {
  GRAVITY, MOVESPEED, FRICTION, JUMP_FORCE,
  PLAYER_W, PLAYER_H,
  FLOOR_Y, FLOOR_LEFT, FLOOR_RIGHT,
  BLAST_LEFT, BLAST_RIGHT, BLAST_BOTTOM, BLAST_TOP,
} from './stage.js';

const ATTACK_DURATION      = 24;   // 6 frames × 4 ticks/frame
const DASH_CHARGE_MIN      = 1;    // any press triggers a dash; hold longer for more distance
export const DASH_CHARGE_MAX = 180; // full-charge cap (~3 s); exported for renderer flash
const DASH_BURST_SPEED_MIN = 6;    // tap release: ~72 px (6 × 12 ticks)
const DASH_BURST_SPEED_MAX = 32;   // full charge: ~384 px (32 × 12 ticks)
const DASH_BURST_TICKS     = 12;   // 3 dash frames × 4 ticks
const DASH_RECOVERY_TICKS  = 28;   // end-lag after burst — longer than a basic attack (24 ticks)
const PROJ_COOLDOWN        = 90;   // ticks between projectile fires (~1.5 s)

// Returns 'dead' if player exits a blast zone this tick, else null.
function applyPhysics(player, inputs, platforms) {
  if (player.dead) return null;

  // ── Tick timers ────────────────────────────────────────────────────────────
  if (player.attackTimer > 0) {
    player.attackTimer--;
    if (player.attackTimer === 0) {
      player.hitLanded = false;
      player.throwing  = false;
    }
  }
  if (player.dashBurstTimer > 0) {
    player.dashBurstTimer--;
    if (player.dashBurstTimer === 0) {
      player.dashBursting      = false;
      player.hitLanded         = false;
      player.speedX            = 0;
      player.dashRecovering    = true;
      player.dashRecoveryTimer = DASH_RECOVERY_TICKS;
    }
  }
  if (player.dashRecoveryTimer > 0) {
    player.dashRecoveryTimer--;
    if (player.dashRecoveryTimer === 0) player.dashRecovering = false;
  }
  if (player.projectileCooldown > 0) player.projectileCooldown--;

  // ── Stamina regen ──────────────────────────────────────────────────────────
  if (player.stamina < 10 && player.attackTimer === 0 && !player.dashBursting) {
    player.staminaRegenTimer++;
    if (player.staminaRegenTimer >= 90) {
      player.staminaRegenTimer = 0;
      player.stamina = Math.min(10, player.stamina + 1);
    }
  } else {
    player.staminaRegenTimer = 0;
  }

  // ── Input handling ─────────────────────────────────────────────────────────
  player.wantsProjectile = false;

  if (!player.inputsLocked && !player.dashBursting && !player.dashRecovering) {
    // Block (hold down, only when not attacking)
    player.blocking = inputs.down && player.attackTimer === 0;

    // Normal attack
    if (inputs.attackJustPressed && !player.blocking && player.attackTimer === 0 && player.stamina >= 2) {
      player.attackTimer = ATTACK_DURATION;
      player.animFrame   = 0;
      player.animTimer   = 0;
      player.hitLanded   = false;
      player.stamina    -= 2;
    }

    // Dash: hold to charge, release to burst
    if (inputs.dash && !player.blocking && player.attackTimer === 0 && player.stamina >= 4) {
      player.dashCharge++;
    } else if (!inputs.dash && player.prevDash && player.dashCharge >= DASH_CHARGE_MIN) {
      if (player.stamina >= 4) {
        const chargeRatio  = Math.min((player.dashCharge - DASH_CHARGE_MIN) / (DASH_CHARGE_MAX - DASH_CHARGE_MIN), 1);
        const burstSpeed   = DASH_BURST_SPEED_MIN + (DASH_BURST_SPEED_MAX - DASH_BURST_SPEED_MIN) * chargeRatio;
        player.stamina        -= 4;
        player.dashBursting    = true;
        player.dashBurstTimer  = DASH_BURST_TICKS;
        player.dashBurstSpeed  = burstSpeed;
        player.dashCharge      = 0;
        player.hitLanded       = false;
        player.speedX          = player.facing * burstSpeed;
        player.animState       = 'dash';
        player.animFrame       = 0;
        player.animTimer       = 0;
      } else {
        player.dashCharge = 0;
      }
    } else if (!inputs.dash) {
      player.dashCharge = 0;
    }

    // Projectile (just-pressed via prev-frame tracking)
    if (inputs.projectile && !player.prevProjectile &&
        player.stamina >= 2 && player.attackTimer === 0 && player.projectileCooldown === 0) {
      player.wantsProjectile     = true;
      player.stamina            -= 2;
      player.projectileCooldown  = PROJ_COOLDOWN;
      // Use the throw animation (3 frames × 5 ticks); mark hitLanded so melee hitbox never fires.
      player.throwing    = true;
      player.attackTimer = 15;
      player.animFrame   = 0;
      player.animTimer   = 0;
      player.hitLanded   = true;
    }

    // Horizontal movement
    if (inputs.left)  player.speedX -= MOVESPEED;
    if (inputs.right) player.speedX += MOVESPEED;

    // Jump
    if (inputs.up && player.grounded) {
      player.speedY      = JUMP_FORCE;
      player.grounded    = false;
      player.onPlatform  = false;
      player.platformRef = null;
    }
  } else if (player.inputsLocked) {
    player.blocking   = false;
    player.dashCharge = 0;
  }
  // During dash burst: no movement input, burst speedX carries the player.

  player.prevDash       = inputs.dash;
  player.prevProjectile = inputs.projectile;

  // ── Moving-platform carry ──────────────────────────────────────────────────
  if (player.grounded && player.onPlatform && player.platformRef?.vx) {
    player.x += player.platformRef.vx;
  }

  // ── Physics integration ────────────────────────────────────────────────────
  if (player.dashBursting) {
    // Maintain constant burst speed for the full duration — friction would kill distance
    player.speedX = player.facing * player.dashBurstSpeed;
  } else {
    player.speedX *= FRICTION;
    if (Math.abs(player.speedX) < 0.05) player.speedX = 0;
  }

  player.speedY += GRAVITY;

  player.x += player.speedX;
  player.y += player.speedY;

  // ── Floor / platform collision ─────────────────────────────────────────────
  const feet     = player.y + PLAYER_H / 2;
  const prevFeet = feet - player.speedY;
  const left     = player.x - PLAYER_W / 2;
  const right    = player.x + PLAYER_W / 2;

  if (feet >= FLOOR_Y && left < FLOOR_RIGHT && right > FLOOR_LEFT && player.speedY >= 0) {
    player.y          = FLOOR_Y - PLAYER_H / 2;
    player.speedY     = 0;
    player.grounded    = true;
    player.onPlatform  = false;
    player.platformRef = null;
  } else {
    // Platforms — one-way: only land when falling and feet cross surface from above
    let landed = false;
    for (const plat of platforms) {
      const overPlat    = right > plat.cx - plat.hw && left < plat.cx + plat.hw;
      const crossedPlat = player.speedY > 0 && prevFeet <= plat.y && feet >= plat.y;
      if (overPlat && crossedPlat) {
        player.y          = plat.y - PLAYER_H / 2;
        player.speedY     = 0;
        player.grounded    = true;
        player.onPlatform  = true;
        player.platformRef = plat;
        landed = true;
        break;
      }
    }
    if (!landed && player.grounded && player.speedY > 0) {
      player.grounded    = false;
      player.onPlatform  = false;
      player.platformRef = null;
    }
  }

  // ── Blast zones ────────────────────────────────────────────────────────────
  if (player.x < BLAST_LEFT || player.x > BLAST_RIGHT ||
      player.y > BLAST_BOTTOM || player.y < BLAST_TOP) {
    return 'dead';
  }

  return null;
}

export { applyPhysics };
