import { BOSS_TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { phaseUsesArms, phaseUsesLaser } from "../entities/boss.mjs";
import { spawnExplosion } from "../entities/particles.mjs";
import { sfxBossLaser, sfxBossCharge, sfxBossRoar, sfxBossHit, sfxExplosion, sfxShutdown } from "./audio.mjs";
import { getBossLayout, getHandProjection, finishDefeat, spawnBlast } from "./boss.mjs";

export function updateDreadmaw(game, input, dt, t, damagePlayer, onDefeated) {
  const boss = game.boss;

  boss.bob = Math.sin(t * 0.0014) * 4;
  boss.hitFlashBody = Math.max(0, boss.hitFlashBody - dt);
  for (const a of boss.arms) a.flash = Math.max(0, a.flash - dt);
  boss.mouth.flash = Math.max(0, boss.mouth.flash - dt);

  if (boss.sub === "intro") {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.sub = "fighting";
      boss.armTimer = BOSS_TUNING.phase1.cadenceMs;
      sfxBossRoar();
    }
    return;
  }

  if (boss.sub === "transition") {
    boss.timer -= dt;
    if (boss.timer <= 0) enterPhase(game, boss.phase + 1);
    return;
  }

  if (boss.sub === "defeat") {
    boss.timer -= dt;
    if (Math.random() < 0.14) spawnBlast(game);
    if (boss.timer <= 0) finishDefeat(game, input, onDefeated);
    return;
  }

  if (phaseUsesArms(boss.phase)) updateArms(game, input, dt, damagePlayer);
  if (phaseUsesLaser(boss.phase)) updateMouth(game, input, dt, damagePlayer);
}

export function tryDamageDreadmaw(game) {
  const boss = game.boss;
  const px = game.player.x;

  if (phaseUsesArms(boss.phase)) {
    let best = null;
    let bestD = Infinity;
    for (const a of boss.arms) {
      if (!a.exposed) continue;
      const d = Math.abs(a.laneX - px);
      if (d <= BOSS_TUNING.phase1.weakSpotHitWindow && d < bestD) {
        best = a;
        bestD = d;
      }
    }
    if (best) {
      best.flash = 160;
      const hp = getHandProjection(best, px);
      spawnExplosion(game, hp.x, hp.y, 0.6, "powerup");
      damageBoss(game);
      return true;
    }
  }

  if (phaseUsesLaser(boss.phase)) {
    const m = boss.mouth;
    if (m.exposed && Math.abs(0 - px) <= BOSS_TUNING.phase2.mouthHitWindow) {
      m.flash = 160;
      const layout = getBossLayout(game);
      spawnExplosion(game, layout.mouthX, layout.mouthY, 0.7, "powerup");
      damageBoss(game);
      return true;
    }
  }

  return false;
}

// ─── Arms (phase 1 & 3) ───────────────────────────────────────────────────────

function updateArms(game, input, dt, damagePlayer) {
  const boss = game.boss;

  boss.armTimer -= dt;
  if (boss.armTimer <= 0) {
    const idle = boss.arms.filter(a => a.state === "idle");
    if (idle.length > 0) {
      triggerTelegraph(game, idle[0]);
      if (idle.length > 1 && Math.random() < bothArmsChance(game)) {
        triggerTelegraph(game, idle[1]);
      }
      boss.armTimer = armCadence(boss.phase);
    } else {
      boss.armTimer = 220;
    }
  }

  for (const a of boss.arms) updateArm(game, input, a, dt, damagePlayer);
}

function triggerTelegraph(game, arm) {
  arm.state = "telegraph";
  arm.timer = 0;
  arm.exposed = false;
  arm.resolved = false;
  arm.laneX = clamp(game.player.x, -180, 180);
  sfxBossCharge();
}

function updateArm(game, input, arm, dt, damagePlayer) {
  const cfg = BOSS_TUNING.phase1;

  if (arm.state === "telegraph") {
    arm.timer += dt;
    if (arm.timer >= cfg.telegraphMs) {
      arm.state = "lunge";
      arm.timer = 0;
      arm.resolved = false;
    }
    return;
  }

  if (arm.state === "lunge") {
    arm.timer += dt;
    const p = clamp(arm.timer / cfg.lungeMs, 0, 1);
    arm.z = lerp(BOSS_TUNING.armIdleZ, BOSS_TUNING.armImpactZ, p);
    arm.exposed = arm.z <= BOSS_TUNING.armExposeStartZ && arm.z >= BOSS_TUNING.armExposeEndZ;

    if (p >= 1) {
      arm.exposed = false;
      if (!arm.resolved) {
        arm.resolved = true;
        if (Math.abs(arm.laneX - game.player.x) <= cfg.handHitWindow) {
          damagePlayer(game, input);
        }
      }
      arm.state = "retract";
      arm.timer = 0;
    }
    return;
  }

  if (arm.state === "retract") {
    arm.timer += dt;
    const p = clamp(arm.timer / cfg.retractMs, 0, 1);
    arm.z = lerp(BOSS_TUNING.armImpactZ, BOSS_TUNING.armIdleZ, p);
    arm.exposed = false;
    if (p >= 1) {
      arm.state = "idle";
      arm.z = BOSS_TUNING.armIdleZ;
      arm.timer = 0;
    }
  }
}

function bothArmsChance(game) {
  const boss = game.boss;
  if (boss.phase === 1) {
    const prog = 1 - boss.hp[0] / BOSS_TUNING.phase1.hits;
    return lerp(BOSS_TUNING.phase1.bothArmsChanceStart, BOSS_TUNING.phase1.bothArmsChanceEnd, prog);
  }
  return 0.35;
}

function armCadence(phase) {
  return phase === 3 ? BOSS_TUNING.phase3.armCadenceMs : BOSS_TUNING.phase1.cadenceMs;
}

// ─── Mouth laser (phase 2 & 3) ────────────────────────────────────────────────

function updateMouth(game, input, dt, damagePlayer) {
  const boss = game.boss;
  const m = boss.mouth;
  const cfg = BOSS_TUNING.phase2;

  switch (m.state) {
    case "closed":
      boss.laserTimer -= dt;
      if (boss.laserTimer <= 0) {
        m.state = "charging";
        m.timer = 0;
        m.targetX = game.player.x;
        sfxBossCharge();
      }
      break;

    case "charging":
      m.timer += dt;
      m.targetX = game.player.x;
      if (m.timer >= cfg.chargeMs) {
        m.state = "locked";
        m.timer = 0;
        m.lockedX = m.targetX;
      }
      break;

    case "locked":
      m.timer += dt;
      if (m.timer >= cfg.lockMs) {
        m.state = "firing";
        m.timer = 0;
        m.resolved = false;
        game.shake = Math.max(game.shake, 9);
        sfxBossLaser();
        if (Math.abs(m.lockedX - game.player.x) <= cfg.beamLaneWidth) {
          damagePlayer(game, input);
        }
        m.resolved = true;
      }
      break;

    case "firing":
      m.timer += dt;
      if (m.timer >= cfg.fireMs) {
        m.state = "vulnerable";
        m.timer = 0;
        m.exposed = true;
      }
      break;

    case "vulnerable":
      m.timer += dt;
      m.exposed = true;
      if (m.timer >= cfg.mouthVulnerableMs) {
        m.state = "closed";
        m.exposed = false;
        boss.laserTimer = laserCooldown(boss.phase);
      }
      break;
  }
}

function laserCooldown(phase) {
  return phase === 3 ? BOSS_TUNING.phase3.laserCooldownMs : BOSS_TUNING.phase2.cooldownMs;
}

// ─── Damage + phase transitions ───────────────────────────────────────────────

function damageBoss(game) {
  const boss = game.boss;
  const i = boss.phase - 1;

  boss.hp[i] = Math.max(0, boss.hp[i] - 1);
  boss.hitFlashBody = 140;
  game.combo++;
  game.shotsHit++;
  game.score += 250 + game.combo * 20;

  sfxBossHit();

  if (boss.hp[i] <= 0) {
    if (boss.phase < 3) startTransition(game);
    else startDefeat(game);
  }
}

function startTransition(game) {
  const boss = game.boss;
  boss.sub = "transition";
  boss.timer = BOSS_TUNING.transitionMs;
  resetSystems(boss);
  game.shake = Math.max(game.shake, 12);
  sfxBossRoar();
}

function enterPhase(game, phase) {
  const boss = game.boss;
  boss.phase = phase;
  boss.sub = "fighting";
  boss.eyeHeat = (phase - 1) / 2;
  resetSystems(boss);
  boss.armTimer = armCadence(phase);
  boss.laserTimer = 800;
}

function resetSystems(boss) {
  for (const a of boss.arms) {
    a.state = "idle";
    a.timer = 0;
    a.z = BOSS_TUNING.armIdleZ;
    a.exposed = false;
    a.resolved = false;
  }
  boss.mouth.state = "closed";
  boss.mouth.timer = 0;
  boss.mouth.exposed = false;
  boss.mouth.resolved = false;
}

function startDefeat(game) {
  const boss = game.boss;
  boss.sub = "defeat";
  boss.timer = BOSS_TUNING.defeatMs;
  resetSystems(boss);
  game.shake = Math.max(game.shake, 16);
  sfxExplosion();
  sfxShutdown();
  for (let i = 0; i < 5; i++) spawnBlast(game);
}
