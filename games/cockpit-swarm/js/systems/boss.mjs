import { STATE, BOSS_TUNING, ARBITER_TUNING, ECLIPSIS_TUNING, TUNING, LANES } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project } from "./projection.mjs";
import { spawnExplosion } from "../entities/particles.mjs";
import {
  makeBoss, phaseUsesArms, phaseUsesLaser,
  phaseUsesVolley, phaseUsesCannons, phaseUsesArbiterLaser
} from "../entities/boss.mjs";
import {
  sfxBossLaser, sfxBossCharge, sfxBossRoar, sfxBossHit,
  sfxExplosion, sfxShutdown, sfxEnemyDeath
} from "./audio.mjs";

// Vertical world anchors used for projecting the hands and mouth.
const ARM_WORLD_Y = 55;

// ─── Encounter lifecycle ──────────────────────────────────────────────────────

export function startBossEncounter(game, number = 1) {
  game.boss = makeBoss(number);
  game.state = STATE.BOSS;

  // Clear any leftover wave state — the boss owns the field now.
  game.enemies = [];
  game.enemyBullets = [];
  game.wave.pendingShots = [];
  game.powerups.activePickups = [];
  // Intentional easter egg: active power-up effects (timers + splash charges) are NOT
  // cleared here — they freeze for the boss fight. resetPowerups fires on defeat.

  game.messageTimer = 0;
  game.shake = 0;
  game.player.hurtFlash = 0;
  game.player.muzzleFlash = 0;
  game.player.tetherTimer = 0;
  game.player.tetherTargetX = 0;

  sfxBossCharge();
}

// ─── Main boss update ─────────────────────────────────────────────────────────

export function updateBoss(game, input, dt, t, damagePlayer, onDefeated) {
  const boss = game.boss;
  if (!boss) return;

  if (boss.number === 3) {
    updateEclipsis(game, input, dt, t, damagePlayer, onDefeated);
    return;
  }

  if (boss.number === 2) {
    updateArbiter(game, input, dt, t, damagePlayer, onDefeated);
    return;
  }

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

  // fighting
  if (phaseUsesArms(boss.phase)) updateArms(game, input, dt, damagePlayer);
  if (phaseUsesLaser(boss.phase)) updateMouth(game, input, dt, damagePlayer);
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
      boss.armTimer = 220; // everyone busy — re-check shortly
    }
  }

  for (const a of boss.arms) updateArm(game, input, a, dt, damagePlayer);
}

function triggerTelegraph(game, arm) {
  arm.state = "telegraph";
  arm.timer = 0;
  arm.exposed = false;
  arm.resolved = false;
  // Commit to the player's current lane — readable, and the player decides
  // whether to stay (and shoot the weak spot) or flee.
  arm.laneX = clamp(game.player.x, -180, 180);
  sfxBossCharge();
}

function updateArm(game, input, arm, dt, damagePlayer) {
  const cfg = BOSS_TUNING.phase1; // arm timings are shared across phase 1 & 3

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
  return 0.35; // phase 3
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
      m.targetX = game.player.x; // tracks the player
      if (m.timer >= cfg.chargeMs) {
        m.state = "locked";
        m.timer = 0;
        m.lockedX = m.targetX; // aim freezes here
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
        // Resolve the beam once at fire-start; the lock window was the dodge cue.
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

// ─── Player damage in (called from updatePlayerFire) ──────────────────────────

export function tryDamageBossInShotLane(game) {
  const boss = game.boss;
  if (!boss || boss.sub !== "fighting") return false;

  if (boss.number === 3) return tryDamageEclipsis(game);
  if (boss.number === 2) return tryDamageArbiter(game);

  const px = game.player.x;

  // Hand weak spots (phase 1 & 3)
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

  // Mouth (phase 2 & 3) — only reachable while centered
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

// ─── Phase transitions ────────────────────────────────────────────────────────

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

function finishDefeat(game, input, onDefeated) {
  const bossNumber = game.boss.number;
  game.boss = null;
  game.menu.selectedButton = 0;
  game.messageTimer = 0;
  game.shake = 0;
  game.player.hurtFlash = 0;
  game.player.muzzleFlash = 0;
  game.player.tetherTimer = 0;
  game.player.tetherTargetX = 0;
  sfxEnemyDeath();
  if (input) input.clearMenuPresses();

  if (onDefeated) {
    onDefeated(bossNumber);
  } else {
    game.state = STATE.CLEAR;
  }
}

function spawnBlast(game) {
  const n = game.boss?.number;
  const layout = n === 3 ? getEclipsisLayout(game) : n === 2 ? getArbiterLayout(game) : getBossLayout(game);
  const ox = (Math.random() * 2 - 1) * layout.halfW;
  const oy = (Math.random() * 2 - 1) * layout.halfH;
  spawnExplosion(game, layout.cx + ox, layout.cy + oy, 1.0 + Math.random() * 0.7, "enemyKill");
}

// ─── Shared geometry (single source for update + render) ──────────────────────

export function getBossLayout(game) {
  const px = game.player.x;
  const bob = game.boss ? game.boss.bob : 0;
  const p = project(0, BOSS_TUNING.bodyY, BOSS_TUNING.bodyZ, px);

  const cx = p.x;
  const cy = p.y + bob;
  const halfW = 300;
  const halfH = 132;

  return {
    cx,
    cy,
    halfW,
    halfH,
    mouthX: cx,
    mouthY: cy + halfH * 0.46,
    mouthW: halfW * 0.5,
    shoulderL: { x: cx - halfW * 0.84, y: cy + halfH * 0.28 },
    shoulderR: { x: cx + halfW * 0.84, y: cy + halfH * 0.28 }
  };
}

export function getHandProjection(arm, playerX) {
  return project(arm.laneX, ARM_WORLD_Y, arm.z, playerX);
}

export function getArbiterLayout(game) {
  const px = game.player.x;
  const bob = game.boss ? game.boss.bob : 0;
  const p = project(0, ARBITER_TUNING.bodyY, ARBITER_TUNING.bodyZ, px);
  const cx = p.x;
  const cy = p.y + bob;
  const hw = 360;
  const hh = 128;
  return {
    cx, cy,
    halfW: hw,
    halfH: hh,
    coreX: cx,
    coreY: cy + hh * 0.08,
    cannonL: { x: cx - hw * 1.08, y: cy + hh * 0.42 },
    cannonR: { x: cx + hw * 1.08, y: cy + hh * 0.42 }
  };
}

// ─── Boss 03: ECLIPSIS layout ─────────────────────────────────────────────────

export function getEclipsisLayout(game) {
  const px = game.player.x;
  const bob = game.boss ? game.boss.bob : 0;
  const crack = game.boss ? game.boss.shellCrack : 0;
  const sizeScale = 1 + crack * 0.2;
  const p = project(0, ECLIPSIS_TUNING.bodyY, ECLIPSIS_TUNING.bodyZ, px);
  const cx = p.x;
  const cy = p.y + bob;
  const hw = 340 * sizeScale;
  const hh = 155 * sizeScale;
  return {
    cx, cy,
    halfW: hw,
    halfH: hh,
    eyeX: cx + px * -0.04,   // tracks player slightly
    eyeY: cy - hh * 0.1
  };
}

// ─── Boss 03: ECLIPSIS update ─────────────────────────────────────────────────

function updateEclipsis(game, input, dt, t, damagePlayer, onDefeated) {
  const boss = game.boss;

  boss.bob = Math.sin(t * 0.001) * 6;
  boss.hitFlashBody  = Math.max(0, boss.hitFlashBody  - dt);
  boss.eyeFlash      = Math.max(0, boss.eyeFlash      - dt);
  boss.panelFlash    = Math.max(0, boss.panelFlash    - dt);

  if (boss.eyeExposedTimer > 0) {
    boss.eyeExposedTimer -= dt;
    if (boss.eyeExposedTimer <= 0) { boss.eyeExposed = false; boss.eyeExposedTimer = 0; }
  }
  if (boss.panelExposedTimer > 0) {
    boss.panelExposedTimer -= dt;
    if (boss.panelExposedTimer <= 0) { boss.panelExposed = false; boss.panelExposedTimer = 0; }
  }

  if (boss.sub === "intro") {
    boss.timer -= dt;
    if (boss.timer <= 0) { boss.sub = "fighting"; resetEclipsisSystems(boss); sfxBossRoar(); }
    return;
  }

  if (boss.sub === "transition") {
    boss.timer -= dt;
    if (boss.timer <= 0) enterEclipsisPhase(game, boss.phase + 1);
    return;
  }

  if (boss.sub === "defeat") {
    boss.timer -= dt;
    if (Math.random() < 0.14) spawnBlast(game);
    if (boss.timer <= 0) finishDefeat(game, input, onDefeated);
    return;
  }

  // fighting
  updateEclipsisBeam(game, input, dt, damagePlayer);
  if (boss.phase >= 2) updateEclipsisReflect(boss, dt);
  if (boss.phase >= 3) updateEclipsisTether(game, input, dt, damagePlayer);
  if (boss.phase >= 4) updateEclipsisZone(game, input, dt, damagePlayer);
  updateEclipsisShots(game, dt);
}

function updateEclipsisBeam(game, input, dt, damagePlayer) {
  const boss = game.boss;
  const beam = boss.beam;
  const p = boss.phase - 1;

  switch (beam.state) {
    case "idle":
      beam.timer -= dt;
      if (beam.timer <= 0) {
        beam.state = "charging";
        beam.timer = ECLIPSIS_TUNING.beamChargeMs;
        beam.dir = Math.random() < 0.5 ? 1 : -1;
        beam.reversed = false;
        sfxBossCharge();
      }
      break;

    case "charging":
      beam.timer -= dt;
      if (beam.timer <= 0) {
        beam.state = "sweeping";
        beam.laneIndex = beam.dir > 0 ? 0 : 4;
        beam.laneProgress = 0;
        beam.damagedThisLane = false;
        sfxBossLaser();
      }
      break;

    case "sweeping": {
      const px = game.player.x;
      if (!beam.damagedThisLane &&
          Math.abs(px - LANES[beam.laneIndex]) <= ECLIPSIS_TUNING.beamHalfWidth) {
        damagePlayer(game, input);
        beam.damagedThisLane = true;
      }
      beam.laneProgress += dt;
      if (beam.laneProgress >= ECLIPSIS_TUNING.beamSweepMsPerLane) {
        beam.laneProgress = 0;
        beam.laneIndex += beam.dir;
        beam.damagedThisLane = false;
        const out = beam.laneIndex < 0 || beam.laneIndex > 4;
        if (out) {
          if (boss.phase === 5 && !beam.reversed && Math.random() < 0.55) {
            beam.reversed = true;
            beam.laneIndex = clamp(beam.laneIndex, 0, 4);
            beam.dir = -beam.dir;
          } else {
            beam.state = "cooldown";
            beam.timer = ECLIPSIS_TUNING.beamVulnMs;
            if (boss.phase >= 2) {
              boss.eyeExposed = true;
              boss.eyeExposedTimer = ECLIPSIS_TUNING.eyeVulnMs;
            } else {
              boss.panelExposed = true;
              boss.panelExposedTimer = ECLIPSIS_TUNING.panelVulnMs;
            }
          }
        }
      }
      break;
    }

    case "cooldown":
      beam.timer -= dt;
      if (beam.timer <= 0) {
        beam.state = "idle";
        beam.timer = ECLIPSIS_TUNING.beamCadenceMs[p];
      }
      break;
  }
}

function updateEclipsisReflect(boss, dt) {
  const reflect = boss.reflect;
  const p = boss.phase - 1;

  switch (reflect.state) {
    case "idle":
      reflect.timer -= dt;
      if (reflect.timer <= 0) {
        reflect.state = "immune";
        reflect.timer = ECLIPSIS_TUNING.reflectImmuneMs;
        sfxBossCharge();
      }
      break;

    case "immune":
      reflect.timer -= dt;
      if (reflect.timer <= 0) {
        reflect.state = "vulnerable";
        reflect.timer = ECLIPSIS_TUNING.reflectVulnMs;
        boss.eyeExposed = true;
        boss.eyeExposedTimer = ECLIPSIS_TUNING.eyeVulnMs;
      }
      break;

    case "vulnerable":
      reflect.timer -= dt;
      if (reflect.timer <= 0) {
        reflect.state = "idle";
        reflect.timer = ECLIPSIS_TUNING.reflectCadenceMs[p];
      }
      break;
  }
}

function updateEclipsisTether(game, input, dt, damagePlayer) {
  const boss = game.boss;
  const tether = boss.tether;
  const p = boss.phase - 1;

  switch (tether.state) {
    case "idle":
      tether.timer -= dt;
      if (tether.timer <= 0) {
        tether.state = "telegraphing";
        tether.timer = ECLIPSIS_TUNING.tetherTelegraphMs;
        // Projectile aims at player's nearest lane
        const px = game.player.x;
        tether.worldX = LANES.reduce((b, lx) => Math.abs(lx - px) < Math.abs(b - px) ? lx : b, LANES[0]);
        // Drag target: lane farthest from player
        let bestLane = 0, bestDist = -1;
        for (let i = 0; i < LANES.length; i++) {
          const d = Math.abs(LANES[i] - px);
          if (d > bestDist) { bestDist = d; bestLane = i; }
        }
        tether.targetLaneIndex = bestLane;
        sfxBossCharge();
      }
      break;

    case "telegraphing":
      tether.timer -= dt;
      if (tether.timer <= 0) {
        tether.state = "traveling";
        tether.active = true;
        tether.z = ECLIPSIS_TUNING.bodyZ + 0.1;
      }
      break;

    case "traveling":
      if (tether.active) {
        tether.z -= ECLIPSIS_TUNING.tetherSpeedZ * dt;
        if (tether.z <= ECLIPSIS_TUNING.tetherDetonateZ) {
          tether.active = false;
          tether.state = "idle";
          tether.timer = ECLIPSIS_TUNING.tetherCadenceMs[p];
          // Apply drag regardless; damage only if player is in the aimed lane
          game.player.tetherTimer = ECLIPSIS_TUNING.tetherDurationMs;
          game.player.tetherTargetX = LANES[tether.targetLaneIndex];
          if (Math.abs(game.player.x - tether.worldX) <= ECLIPSIS_TUNING.tetherHitWindow) {
            damagePlayer(game, input);
          }
        }
      }
      break;
  }
}

function updateEclipsisZone(game, input, dt, damagePlayer) {
  const boss = game.boss;
  const zone = boss.zone;
  const p = boss.phase - 1;

  switch (zone.state) {
    case "idle":
      zone.timer -= dt;
      if (zone.timer <= 0) {
        zone.state = "charging";
        zone.timer = ECLIPSIS_TUNING.zoneChargeTelegraphMs;
        zone.startLane = Math.floor(Math.random() * 3);   // 0,1,2 → covers lanes [sl, sl+1, sl+2]
        zone.worldX = LANES[zone.startLane + 1];          // center of the 3-lane block
        sfxBossCharge();
      }
      break;

    case "charging":
      zone.timer -= dt;
      if (zone.timer <= 0) {
        zone.state = "traveling";
        zone.active = true;
        zone.z = ECLIPSIS_TUNING.bodyZ + 0.1;
      }
      break;

    case "traveling":
      if (zone.active) {
        zone.z -= ECLIPSIS_TUNING.zoneSpeedZ * dt;
        if (zone.z <= ECLIPSIS_TUNING.zoneDetonateZ) {
          zone.active = false;
          zone.state = "aftermath";
          zone.timer = ECLIPSIS_TUNING.zoneAftermathMs;
          const px = game.player.x;
          const hit = [zone.startLane, zone.startLane + 1, zone.startLane + 2]
            .some(li => Math.abs(px - LANES[li]) <= ECLIPSIS_TUNING.zoneLaneHalfWidth);
          if (hit) damagePlayer(game, input);
          game.shake = Math.max(game.shake, 10);
          sfxExplosion();
          boss.eyeExposed = true;
          boss.eyeExposedTimer = ECLIPSIS_TUNING.eyeVulnMs;
        }
      }
      break;

    case "aftermath":
      zone.timer -= dt;
      if (zone.timer <= 0) {
        zone.state = "idle";
        zone.timer = ECLIPSIS_TUNING.zoneCadenceMs[p];
      }
      break;
  }
}

function updateEclipsisShots(game, dt) {
  const boss = game.boss;
  const shot = boss.shot;
  const p = boss.phase - 1;

  shot.timer -= dt;
  if (shot.timer > 0) return;
  shot.timer = ECLIPSIS_TUNING.shotCadenceMs[p];

  const px = game.player.x;
  const laneX = LANES.reduce((b, lx) => Math.abs(lx - px) < Math.abs(b - px) ? lx : b, LANES[0]);
  const startZ = ECLIPSIS_TUNING.bodyZ;
  game.enemyBullets.push({
    x: laneX,
    laneIndex: LANES.indexOf(laneX),
    sourceRowIndex: -1,
    behaviorId: "eclipsis_shot",
    startY: ECLIPSIS_TUNING.bodyY,
    z: startZ,
    startZ,
    speedZ: TUNING.enemyBulletSpeedZ * 1.1,
    wobble: Math.random() * Math.PI * 2,
    alive: true,
    age: 0,
    resolved: false,
    isHoming: false,
    targetX: laneX,
    isBloom: false,
    bloomed: false,
    sourceLaneIndex: LANES.indexOf(laneX),
    isFragment: false
  });
}

function tryDamageEclipsis(game) {
  const boss = game.boss;
  const px = game.player.x;

  // Reflective immune window: absorb the shot and fire back
  if (boss.reflect.state === "immune") {
    const laneX = LANES.reduce((b, lx) => Math.abs(lx - px) < Math.abs(b - px) ? lx : b, LANES[0]);
    const startZ = ECLIPSIS_TUNING.bodyZ;
    game.enemyBullets.push({
      x: laneX,
      laneIndex: LANES.indexOf(laneX),
      sourceRowIndex: -1,
      behaviorId: "eclipsis_reflect",
      startY: ECLIPSIS_TUNING.bodyY,
      z: startZ,
      startZ,
      speedZ: TUNING.enemyBulletSpeedZ * 0.85,
      wobble: Math.random() * Math.PI * 2,
      alive: true,
      age: 0,
      resolved: false,
      isHoming: false,
      targetX: laneX,
      isBloom: false,
      bloomed: false,
      sourceLaneIndex: LANES.indexOf(laneX),
      isFragment: false
    });
    boss.hitFlashBody = 80;
    return true;
  }

  // Tether projectile (phase 3+) — shoot it down
  if (boss.phase >= 3 && boss.tether.active) {
    if (Math.abs(px - boss.tether.worldX) <= ECLIPSIS_TUNING.tetherHitWindow) {
      boss.tether.active = false;
      boss.tether.state = "idle";
      boss.tether.timer = ECLIPSIS_TUNING.tetherCadenceMs[boss.phase - 1];
      scoreEclipsisHit(game);
      return true;
    }
  }

  // Eye (phases 2+)
  if (boss.eyeExposed && Math.abs(px) <= ECLIPSIS_TUNING.eyeHitWindow) {
    boss.eyeFlash = 160;
    scoreEclipsisHit(game);
    return true;
  }

  // Crystal panels (phase 1 only)
  if (boss.phase === 1 && boss.panelExposed && Math.abs(px) <= ECLIPSIS_TUNING.panelHitWindow) {
    boss.panelFlash = 160;
    scoreEclipsisHit(game);
    return true;
  }

  return false;
}

function scoreEclipsisHit(game) {
  const boss = game.boss;
  boss.hitFlashBody = 140;
  game.combo++;
  game.shotsHit++;
  game.score += 250 + game.combo * 20;
  sfxBossHit();

  const i = boss.phase - 1;
  boss.hp[i] = Math.max(0, boss.hp[i] - 1);
  if (boss.hp[i] <= 0) {
    if (boss.phase < 5) startEclipsisTransition(game);
    else startEclipsisDefeat(game);
  }
}

function startEclipsisTransition(game) {
  const boss = game.boss;
  boss.sub = "transition";
  boss.timer = ECLIPSIS_TUNING.transitionMs;
  boss.eyeExposed = false;
  boss.panelExposed = false;
  boss.tether.active = false;
  boss.zone.active = false;
  game.shake = Math.max(game.shake, 12);
  sfxBossRoar();
}

function enterEclipsisPhase(game, phase) {
  const boss = game.boss;
  boss.phase = phase;
  boss.sub = "fighting";
  boss.shellCrack = (phase - 1) / 4;   // 0 at phase 1, 1 at phase 5
  boss.eyeHeat = (phase - 1) / 4;
  resetEclipsisSystems(boss);
}

function startEclipsisDefeat(game) {
  const boss = game.boss;
  boss.sub = "defeat";
  boss.timer = ECLIPSIS_TUNING.defeatMs;
  boss.eyeExposed = false;
  boss.panelExposed = false;
  boss.tether.active = false;
  boss.zone.active = false;
  game.shake = Math.max(game.shake, 16);
  sfxExplosion();
  sfxShutdown();
  for (let i = 0; i < 5; i++) spawnBlast(game);
}

function resetEclipsisSystems(boss) {
  const p = boss.phase - 1;
  boss.eyeExposed = false;
  boss.eyeExposedTimer = 0;
  boss.panelExposed = false;
  boss.panelExposedTimer = 0;

  boss.beam.state = "idle";
  boss.beam.timer = ECLIPSIS_TUNING.beamCadenceMs[p] * 0.5;

  boss.reflect.state = "idle";
  boss.reflect.timer = p >= 1 ? ECLIPSIS_TUNING.reflectCadenceMs[p] * 0.7 : 99999;

  boss.tether.state = "idle";
  boss.tether.active = false;
  boss.tether.timer = p >= 2 ? ECLIPSIS_TUNING.tetherCadenceMs[p] * 0.8 : 99999;

  boss.zone.state = "idle";
  boss.zone.active = false;
  boss.zone.timer = p >= 3 ? ECLIPSIS_TUNING.zoneCadenceMs[p] * 0.7 : 99999;

  boss.shot.timer = ECLIPSIS_TUNING.shotCadenceMs[p];
}

// ─── Boss 02: Arbiter update ──────────────────────────────────────────────────

function updateArbiter(game, input, dt, t, damagePlayer, onDefeated) {
  const boss = game.boss;

  boss.bob = Math.sin(t * 0.0014) * 4;
  boss.hitFlashBody = Math.max(0, boss.hitFlashBody - dt);
  for (const c of boss.cannons) c.flash = Math.max(0, c.flash - dt);
  boss.arbiterLaser.flash = Math.max(0, boss.arbiterLaser.flash - dt);

  if (boss.sub === "intro") {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.sub = "fighting";
      resetArbiterSystems(boss);
      sfxBossRoar();
    }
    return;
  }

  if (boss.sub === "transition") {
    boss.timer -= dt;
    if (boss.timer <= 0) enterArbiterPhase(game, boss.phase + 1);
    return;
  }

  if (boss.sub === "defeat") {
    boss.timer -= dt;
    if (Math.random() < 0.14) spawnBlast(game);
    if (boss.timer <= 0) finishDefeat(game, input, onDefeated);
    return;
  }

  // fighting
  if (phaseUsesVolley(boss))       updateVolley(game, input, dt, damagePlayer);
  if (phaseUsesArbiterLaser(boss)) updateArbiterLaserP3(game, input, dt, damagePlayer);
}

function updateVolley(game, input, dt, damagePlayer) {
  const boss = game.boss;
  const v = boss.volley;
  const cfg = boss.phase === 3 ? ARBITER_TUNING.phase3
    : boss.phase === 2 ? ARBITER_TUNING.phase2
    : ARBITER_TUNING.phase1;

  v.timer -= dt;

  switch (v.state) {
    case "reset":
      if (v.timer <= 0) {
        v.safeIndices = pickSafeLanes(cfg.safeLanes, v.lastSafeIndex);
        if (cfg.safeLanes === 1) v.lastSafeIndex = v.safeIndices[0];
        v.hitResolved = false;
        v.state = "charging";
        v.timer = cfg.chargeMs;
      }
      break;

    case "charging":
      if (v.timer <= 0) {
        v.state = "firing";
        v.timer = cfg.fireMs;
      }
      break;

    case "firing":
      if (!v.hitResolved) {
        v.hitResolved = true;
        const safe = v.safeIndices.some(i => Math.abs(game.player.x - LANES[i]) <= cfg.safeHitWindow);
        if (!safe) damagePlayer(game, input);
      }
      if (v.timer <= 0) {
        v.state = "open";
        v.timer = cfg.openMs;
      }
      break;

    case "open":
      if (v.timer <= 0) {
        v.safeIndices = [];
        v.state = "reset";
        v.timer = cfg.resetMs;
      }
      break;
  }
}

function updateArbiterLaserP3(game, input, dt, damagePlayer) {
  const m = game.boss.arbiterLaser;
  const cfg = ARBITER_TUNING.phase3;

  m.timer -= dt;

  switch (m.state) {
    case "closed":
      if (m.timer <= 0) {
        m.state = "charging";
        m.timer = cfg.laserChargeMs;
        m.targetX = game.player.x;
        sfxBossCharge();
      }
      break;

    case "charging":
      m.targetX = game.player.x;
      if (m.timer <= 0) {
        m.state = "locked";
        m.timer = cfg.laserLockMs;
        m.lockedX = m.targetX;
      }
      break;

    case "locked":
      if (m.timer <= 0) {
        if (Math.abs(m.lockedX - game.player.x) <= cfg.laserBeamWidth) {
          damagePlayer(game, input);
        }
        m.state = "firing";
        m.timer = cfg.laserFireMs;
        m.resolved = true;
        game.shake = Math.max(game.shake, 9);
        sfxBossLaser();
      }
      break;

    case "firing":
      if (m.timer <= 0) {
        m.state = "vulnerable";
        m.timer = cfg.laserVulnerableMs;
        m.exposed = true;
      }
      break;

    case "vulnerable":
      m.exposed = true;
      if (m.timer <= 0) {
        m.state = "closed";
        m.exposed = false;
        m.timer = cfg.laserCooldownMs;
      }
      break;
  }
}

function tryDamageArbiter(game) {
  const boss = game.boss;
  const px = game.player.x;

  // Core hit during volley open window (Phase 1, 2, and 3)
  if (phaseUsesVolley(boss) && boss.volley.state === "open") {
    const cfg = boss.phase === 3 ? ARBITER_TUNING.phase3
      : boss.phase === 2 ? ARBITER_TUNING.phase2
      : ARBITER_TUNING.phase1;
    if (Math.abs(px) <= cfg.coreHitWindow) {
      scoreArbiterHit(game);
      return true;
    }
    // Phase 1 wing cores at lane ±90 — additional targets so the player doesn't
    // need to be at dead center to deal damage during the open window.
    if (boss.phase === 1) {
      if (Math.abs(px - LANES[1]) <= cfg.wingHitWindow || Math.abs(px - LANES[3]) <= cfg.wingHitWindow) {
        scoreArbiterHit(game);
        return true;
      }
    }
  }

  // Laser emitter vulnerable window (Phase 3)
  if (phaseUsesArbiterLaser(boss) && boss.arbiterLaser.exposed) {
    if (Math.abs(px) <= ARBITER_TUNING.phase3.coreHitWindow) {
      boss.arbiterLaser.flash = 160;
      scoreArbiterHit(game);
      return true;
    }
  }

  return false;
}

function scoreArbiterHit(game) {
  const boss = game.boss;
  boss.hitFlashBody = 140;
  game.combo++;
  game.shotsHit++;
  game.score += 250 + game.combo * 20;
  sfxBossHit();

  const i = boss.phase - 1;
  boss.hp[i] = Math.max(0, boss.hp[i] - 1);
  if (boss.hp[i] <= 0) {
    if (boss.phase < 3) startArbiterTransition(game);
    else startArbiterDefeat(game);
  }
}

function startArbiterTransition(game) {
  const boss = game.boss;
  boss.sub = "transition";
  boss.timer = ARBITER_TUNING.transitionMs;
  game.shake = Math.max(game.shake, 12);
  sfxBossRoar();
}

function enterArbiterPhase(game, phase) {
  const boss = game.boss;
  boss.phase = phase;
  boss.sub = "fighting";
  boss.eyeHeat = (phase - 1) / 2;

  if (phase === 2) {
    // Phase 2 uses the volley system — cannon barrage covers danger lanes, one safe lane.
    boss.volley.state = "reset";
    boss.volley.timer = 400;
    boss.volley.safeIndices = [];
    boss.volley.hitResolved = false;
    for (const c of boss.cannons) { c.state = "idle"; c.exposed = false; }
  }

  if (phase === 3) {
    // Restart volley at Phase 3 cadence; deactivate cannons; arm the laser.
    boss.volley.state = "reset";
    boss.volley.timer = 400;
    boss.volley.safeIndices = [];
    boss.volley.hitResolved = false;
    for (const c of boss.cannons) { c.state = "idle"; c.timer = 99999; c.exposed = false; }
    boss.arbiterLaser.state = "closed";
    boss.arbiterLaser.timer = ARBITER_TUNING.phase3.laserCooldownMs;
    boss.arbiterLaser.exposed = false;
  }
}

function startArbiterDefeat(game) {
  const boss = game.boss;
  boss.sub = "defeat";
  boss.timer = ARBITER_TUNING.defeatMs;
  game.shake = Math.max(game.shake, 16);
  sfxExplosion();
  sfxShutdown();
  for (let i = 0; i < 5; i++) spawnBlast(game);
}

function resetArbiterSystems(boss) {
  boss.volley.state = "reset";
  boss.volley.timer = 600;
  boss.volley.safeIndices = [];
  boss.volley.hitResolved = false;
  for (const c of boss.cannons) { c.state = "idle"; c.timer = 99999; c.exposed = false; }
  boss.arbiterLaser.state = "closed";
  boss.arbiterLaser.timer = 99999;
  boss.arbiterLaser.exposed = false;
}

function pickSafeLanes(count, lastSafe) {
  const indices = [0, 1, 2, 3, 4];
  for (let i = 4; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const result = [];
  for (const idx of indices) {
    if (count === 1 && idx === lastSafe) continue;
    result.push(idx);
    if (result.length === count) break;
  }
  // Fallback if we couldn't avoid repeating (e.g. count=1 and all are lastSafe)
  if (result.length < count) {
    for (const idx of indices) {
      if (!result.includes(idx)) { result.push(idx); if (result.length === count) break; }
    }
  }
  return result;
}
