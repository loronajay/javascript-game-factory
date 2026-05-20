import { P1_SPAWN_X, P2_SPAWN_X, SPAWN_FEET_Y, PLAYER_W, PLAYER_H } from './stage.js';

// Ticks per animation frame for each state
const ANIM_SPEED = {
  idle:     8,
  run:      3,
  attack:   4,
  throw:    5,
  dash:     4,
  hurt:     6,
  gridlock: 6,
  death:    6,
};

const ANIM_FRAMES = {
  idle:     ['idle'],
  run:      ['run1','run2','run3','run4','run5','run6','run7','run8'],
  attack:   ['attack','attack2','attack3','attack4','attack5','attack6'],
  throw:    ['throw1','throw2','throw3'],
  dash:     ['dash1','dash2','dash3'],
  hurt:     ['hurt'],
  gridlock: ['gridlock'],
  death:    ['death1','death2','death3','death4','death5','death6'],
};

function createPlayer(side) {
  const spawnX = side === 'p1' ? P1_SPAWN_X : P2_SPAWN_X;
  return {
    side,
    x: spawnX,
    y: SPAWN_FEET_Y - PLAYER_H / 2,  // store center y
    speedX: 0,
    speedY: 0,
    facing: side === 'p1' ? 1 : -1,  // 1 = right, -1 = left
    grounded: true,
    onPlatform: false,
    platformRef: null,
    animState: 'idle',
    animFrame: 0,
    animTimer: 0,
    stamina: 10,
    staminaRegenTimer: 0,
    attackTimer: 0,
    blocking: false,
    dead: false,
    dying: false,           // killed on-stage; still drawn, death anim playing
    inputsLocked: false,    // no input accepted (set on kill)
    inGridlock: false,      // in mash minigame
    hitLanded: false,       // prevents double-hit in same swing / dash
    throwing: false,        // true while throw animation is playing
    dashCharge: 0,          // ticks dash key held while charging
    dashBursting: false,    // true during burst phase
    dashBurstTimer: 0,      // ticks remaining in burst
    dashBurstSpeed: 0,      // locked burst speed (maintained each tick, overrides friction)
    dashRecovering: false,  // frozen on last dash frame after burst ends
    dashRecoveryTimer: 0,   // ticks remaining in recovery
    wantsProjectile: false, // physics sets true when projectile input fires
    projectileCooldown: 0,
    prevDash: false,        // dash-held state last tick (for release detection)
    prevProjectile: false,
    wins: 0,
  };
}

function resetPlayer(player) {
  const spawnX = player.side === 'p1' ? P1_SPAWN_X : P2_SPAWN_X;
  player.x                = spawnX;
  player.y                = SPAWN_FEET_Y - PLAYER_H / 2;
  player.speedX           = 0;
  player.speedY           = 0;
  player.facing           = player.side === 'p1' ? 1 : -1;
  player.grounded         = true;
  player.onPlatform       = false;
  player.platformRef      = null;
  player.animState        = 'idle';
  player.animFrame        = 0;
  player.animTimer        = 0;
  player.stamina          = 10;
  player.staminaRegenTimer = 0;
  player.attackTimer      = 0;
  player.blocking         = false;
  player.dead             = false;
  player.dying            = false;
  player.inputsLocked     = false;
  player.inGridlock       = false;
  player.hitLanded        = false;
  player.throwing         = false;
  player.dashCharge       = 0;
  player.dashBursting     = false;
  player.dashBurstTimer   = 0;
  player.dashBurstSpeed   = 0;
  player.dashRecovering   = false;
  player.dashRecoveryTimer = 0;
  player.wantsProjectile  = false;
  player.projectileCooldown = 0;
  player.prevDash         = false;
  player.prevProjectile   = false;
}

function resolveAnimState(player) {
  if (player.dead || player.dying) return 'death';
  if (player.inGridlock)           return 'gridlock';
  if (player.dashBursting || player.dashRecovering) return 'dash';
  if (player.attackTimer > 0)      return player.throwing ? 'throw' : 'attack';
  if (!player.grounded)            return 'idle';   // no jump sprite; idle in air
  if (Math.abs(player.speedX) > 0.2) return 'run';
  return 'idle';
}

function stepAnimation(player) {
  const nextState = resolveAnimState(player);

  if (nextState !== player.animState) {
    player.animState = nextState;
    player.animFrame = 0;
    player.animTimer = 0;
  }

  const speed  = ANIM_SPEED[player.animState] ?? 6;
  const frames = ANIM_FRAMES[player.animState] ?? ['idle'];

  // Hold last frame during dash recovery (and death)
  if (player.dashRecovering) {
    player.animFrame = frames.length - 1;
    return;
  }

  player.animTimer++;
  if (player.animTimer >= speed) {
    player.animTimer = 0;
    // Death animation holds on the last frame
    if (player.animState === 'death') {
      player.animFrame = Math.min(player.animFrame + 1, frames.length - 1);
    } else {
      player.animFrame = (player.animFrame + 1) % frames.length;
    }
  }
}

function currentFrame(player) {
  const frames = ANIM_FRAMES[player.animState] ?? ['idle'];
  return frames[Math.min(player.animFrame, frames.length - 1)];
}

function spriteName(_player) {
  return 'Player_1';
}

export { createPlayer, resetPlayer, stepAnimation, currentFrame, spriteName, ANIM_FRAMES };
