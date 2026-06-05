import { ARBITER_TUNING, LANES } from "../core/constants.mjs";
import { phaseUsesVolley, phaseUsesArbiterLaser } from "../entities/boss.mjs";
import { sfxBossLaser, sfxBossCharge, sfxBossRoar, sfxBossHit, sfxExplosion, sfxShutdown } from "./audio.mjs";
import { finishDefeat, spawnBlast } from "./boss.mjs";

export function updateArbiter(game, input, dt, t, damagePlayer, onDefeated) {
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

  if (phaseUsesVolley(boss))       updateVolley(game, input, dt, damagePlayer);
  if (phaseUsesArbiterLaser(boss)) updateArbiterLaserP3(game, input, dt, damagePlayer);
}

export function tryDamageArbiter(game) {
  const boss = game.boss;
  const px = game.player.x;

  if (phaseUsesVolley(boss) && boss.volley.state === "open") {
    const cfg = boss.phase === 3 ? ARBITER_TUNING.phase3
      : boss.phase === 2 ? ARBITER_TUNING.phase2
      : ARBITER_TUNING.phase1;
    if (Math.abs(px) <= cfg.coreHitWindow) {
      scoreArbiterHit(game);
      return true;
    }
    if (boss.phase === 1) {
      if (Math.abs(px - LANES[1]) <= cfg.wingHitWindow || Math.abs(px - LANES[3]) <= cfg.wingHitWindow) {
        scoreArbiterHit(game);
        return true;
      }
    }
  }

  if (phaseUsesArbiterLaser(boss) && boss.arbiterLaser.exposed) {
    if (Math.abs(px) <= ARBITER_TUNING.phase3.coreHitWindow) {
      boss.arbiterLaser.flash = 160;
      scoreArbiterHit(game);
      return true;
    }
  }

  return false;
}

// ─── Volley system ────────────────────────────────────────────────────────────

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

// ─── Damage + phase transitions ───────────────────────────────────────────────

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
    boss.volley.state = "reset";
    boss.volley.timer = 400;
    boss.volley.safeIndices = [];
    boss.volley.hitResolved = false;
    for (const c of boss.cannons) { c.state = "idle"; c.exposed = false; }
  }

  if (phase === 3) {
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
  if (result.length < count) {
    for (const idx of indices) {
      if (!result.includes(idx)) { result.push(idx); if (result.length === count) break; }
    }
  }
  return result;
}
