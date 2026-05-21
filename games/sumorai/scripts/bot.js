import { BLAST_LEFT, BLAST_RIGHT } from './stage.js';

// World-unit thresholds
const MELEE_RANGE = 90;   // attack when closer than this
const DASH_RANGE  = 220;  // start dash charge when within this
const EDGE_DANGER = 120;  // retreat when this close to a blast zone edge

// Per-difficulty config
const CONFIG = {
  hard:   { mashInterval: 3,  reactionDelay: 1,  errorRate: 0.00 },
  medium: { mashInterval: 5,  reactionDelay: 8,  errorRate: 0.10 },
  easy:   { mashInterval: 9,  reactionDelay: 18, errorRate: 0.25 },
};

// DASH_BURST constants (mirrors physics.js — kept local to avoid circular import)
const BURST_MIN_SPEED = 6;
const BURST_MAX_SPEED = 32;
const BURST_TICKS     = 12;
const CHARGE_MIN      = 1;
const CHARGE_MAX      = 180;

export function createBotState() {
  return {
    mashTick:        0,
    reactionTick:    0,
    prevAttack:      false,
    dashCharging:    false,
    dashHoldTarget:  0,
    dashTicks:       0,
  };
}

export function tickBot(botState, gameState, botSide, difficulty) {
  const cfg      = CONFIG[difficulty] ?? CONFIG.hard;
  const bot      = gameState[botSide];
  const oppSide  = botSide === 'p1' ? 'p2' : 'p1';
  const opponent = gameState[oppSide];

  const inputs = {
    left: false, right: false, up: false, down: false,
    attack: false, dash: false, projectile: false,
    attackJustPressed: false,
  };

  // ── Gridlock mash ─────────────────────────────────────────────────────────
  if (bot.inGridlock) {
    botState.mashTick++;
    const press = (botState.mashTick % cfg.mashInterval) === 0;
    inputs.attack             = press;
    inputs.attackJustPressed  = press && !botState.prevAttack;
    botState.prevAttack       = inputs.attack;
    return inputs;
  }
  botState.mashTick = 0;

  // ── Committed dash charge: hold for calculated ticks then release ──────────
  if (botState.dashCharging) {
    botState.dashTicks++;
    inputs.dash = botState.dashTicks < botState.dashHoldTarget;
    if (!inputs.dash) {
      botState.dashCharging = false;
      botState.dashTicks    = 0;
    }
    botState.prevAttack = false;
    return inputs;
  }

  // ── Reaction delay (Easy / Medium) ────────────────────────────────────────
  if (cfg.reactionDelay > 1) {
    botState.reactionTick++;
    if (botState.reactionTick < cfg.reactionDelay) {
      botState.prevAttack = false;
      return inputs;
    }
    botState.reactionTick = 0;
  }

  // ── Error injection (Easy / Medium) ───────────────────────────────────────
  if (cfg.errorRate > 0 && Math.random() < cfg.errorRate) {
    botState.prevAttack = false;
    return inputs;
  }

  // ── Decision tree (evaluated fresh each decision tick) ────────────────────
  const dx    = opponent.x - bot.x;
  const dist  = Math.abs(dx);
  const dir   = dx >= 0 ? 1 : -1;   // direction TO opponent

  const myProjKey  = botSide === 'p1' ? 'p1Projectile' : 'p2Projectile';
  const oppProjKey = botSide === 'p1' ? 'p2Projectile' : 'p1Projectile';
  const myProj     = gameState[myProjKey];
  const oppProj    = gameState[oppProjKey];

  const oppAttacking = opponent.attackTimer > 0 || opponent.dashBursting;
  const atLeftEdge   = bot.x < BLAST_LEFT  + EDGE_DANGER;
  const atRightEdge  = bot.x > BLAST_RIGHT - EDGE_DANGER;

  // 1. Block: opponent is attacking and within reach
  if (oppAttacking && dist < MELEE_RANGE + 30 && bot.stamina > 0 && bot.grounded) {
    inputs.down         = true;
    botState.prevAttack = false;
    return inputs;
  }

  // 2. Retreat from blast zone edge
  if (atLeftEdge || atRightEdge) {
    if (atLeftEdge) inputs.right = true;
    else            inputs.left  = true;
    if (bot.grounded) inputs.up  = true;
    botState.prevAttack = false;
    return inputs;
  }

  // 3. Jump over an incoming projectile
  if (oppProj?.active && bot.grounded) {
    const projDx  = bot.x - oppProj.x;
    const closing = oppProj.facing === (projDx > 0 ? 1 : -1);
    if (closing && Math.abs(projDx) < 160) {
      inputs.up           = true;
      botState.prevAttack = false;
      return inputs;
    }
  }

  // 4. Melee attack at close range
  if (dist <= MELEE_RANGE && bot.stamina >= 2 && bot.attackTimer === 0 && !opponent.blocking) {
    if (dir === 1) inputs.right = true;
    else           inputs.left  = true;
    inputs.attack            = true;
    inputs.attackJustPressed = !botState.prevAttack;
    botState.prevAttack      = true;
    return inputs;
  }

  // 5. Dash charge at medium range (calculate hold ticks to cover the distance)
  if (dist > MELEE_RANGE && dist <= DASH_RANGE && bot.stamina >= 4) {
    const targetSpeed   = Math.min(dist * 1.2 / BURST_TICKS, BURST_MAX_SPEED);
    const chargeRatio   = Math.max(0, (targetSpeed - BURST_MIN_SPEED) / (BURST_MAX_SPEED - BURST_MIN_SPEED));
    const neededCharge  = Math.round(chargeRatio * (CHARGE_MAX - CHARGE_MIN) + CHARGE_MIN);
    botState.dashCharging   = true;
    botState.dashHoldTarget = Math.max(4, Math.min(neededCharge, 55));
    botState.dashTicks      = 0;
    inputs.dash             = true;
    botState.prevAttack     = false;
    return inputs;
  }

  // 6. Projectile at long range
  if (dist > DASH_RANGE && bot.stamina >= 2 && !myProj?.active) {
    inputs.projectile   = true;
    botState.prevAttack = false;
    return inputs;
  }

  // 7. Approach
  if (dir === 1) inputs.right = true;
  else           inputs.left  = true;
  botState.prevAttack = false;
  return inputs;
}
