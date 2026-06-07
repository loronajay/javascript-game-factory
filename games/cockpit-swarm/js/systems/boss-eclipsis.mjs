import { ECLIPSIS_TUNING, TUNING, LANES } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { sfxBossLaser, sfxBossCharge, sfxBossRoar, sfxBossHit, sfxExplosion, sfxShutdown } from "./audio.mjs";
import { finishDefeat, spawnBlast } from "./boss.mjs";

export function updateEclipsis(game, input, dt, t, damagePlayer, onDefeated) {
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

  updateEclipsisBeam(game, input, dt, damagePlayer);
  if (boss.phase >= 2) updateEclipsisReflect(boss, dt);
  if (boss.phase >= 3) updateEclipsisTether(game, input, dt, damagePlayer);
  if (boss.phase >= 4) updateEclipsisZone(game, input, dt, damagePlayer);
  updateEclipsisShots(game, dt);
}

export function tryDamageEclipsis(game) {
  const boss = game.boss;
  const px = game.player.x;

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

  if (boss.phase >= 3 && boss.tether.active) {
    if (Math.abs(px - boss.tether.worldX) <= ECLIPSIS_TUNING.tetherHitWindow) {
      boss.tether.active = false;
      boss.tether.state = "idle";
      boss.tether.timer = ECLIPSIS_TUNING.tetherCadenceMs[boss.phase - 1];
      scoreEclipsisHit(game);
      return true;
    }
  }

  if (boss.eyeExposed && Math.abs(px) <= ECLIPSIS_TUNING.eyeHitWindow) {
    boss.eyeFlash = 160;
    scoreEclipsisHit(game);
    return true;
  }

  if (boss.phase === 1 && boss.panelExposed && Math.abs(px) <= ECLIPSIS_TUNING.panelHitWindow) {
    boss.panelFlash = 160;
    scoreEclipsisHit(game);
    return true;
  }

  return false;
}

// ─── Beam sweep ───────────────────────────────────────────────────────────────

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

        // Beam sweeps 3 lanes (stops at center, lane 2). Phase 5 can extend into safe side.
        const partialOut = !beam.reversed && (beam.dir > 0 ? beam.laneIndex > 2 : beam.laneIndex < 2);
        const fullOut    = beam.laneIndex < 0 || beam.laneIndex > 4;
        const extend     = partialOut && boss.phase === 5 && Math.random() < 0.55;

        if ((fullOut || partialOut) && !extend) {
          beam.state = "cooldown";
          beam.timer = ECLIPSIS_TUNING.beamVulnMs;
          if (boss.phase >= 2) {
            boss.eyeExposed = true;
            boss.eyeExposedTimer = ECLIPSIS_TUNING.eyeVulnMs;
          } else {
            boss.panelExposed = true;
            boss.panelExposedTimer = ECLIPSIS_TUNING.panelVulnMs;
          }
        } else if (extend) {
          beam.reversed = true; // continues into the safe side — partialOut won't re-trigger
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
        const px = game.player.x;
        tether.worldX = LANES.reduce((b, lx) => Math.abs(lx - px) < Math.abs(b - px) ? lx : b, LANES[0]);
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
        zone.startLane = Math.floor(Math.random() * 3);
        zone.worldX = LANES[zone.startLane + 1];
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

// ─── Damage + phase transitions ───────────────────────────────────────────────

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
  boss.shellCrack = (phase - 1) / 4;
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
