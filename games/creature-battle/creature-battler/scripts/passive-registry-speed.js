// passive-registry-speed.js — Speed route passive hooks.
// Requires passive-registry-core.js (registerPassiveHook).

// ── Speed route passives ──────────────────────────────────────────────────────

// Helper: returns current evasion stage count for a creature.
function getEvasionStageCount(creature) {
  return typeof getStatStage === 'function' ? getStatStage(creature, 'evasion') : 0;
}

// T1 — Scout

// Swift Body: +4% physical damage output per positive evasion stage.
registerPassiveHook('swift_body', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const stages = Math.max(0, getEvasionStageCount(attacker));
    return 1.0 + stages * 0.04;
  },
});

// Fleet Footed: raise self SPD +1 at battle start (via onBattleStart).
registerPassiveHook('fleet_footed', {
  onBattleStart({ creature }) {
    if (typeof applyStatModifier === 'function')
      applyStatModifier(creature, 'speed', 1, { duration: 999 });
  },
});

// First Strike: +15% damage when this creature acts before the target this round.
registerPassiveHook('first_strike', {
  onBeforeDamage({ attacker, target, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const actorSpd = typeof getEffectiveStat === 'function' ? getEffectiveStat(attacker, 'speed') : (attacker.stats?.speed ?? 0);
    const targetSpd = typeof getEffectiveStat === 'function' ? getEffectiveStat(target, 'speed') : (target.stats?.speed ?? 0);
    return actorSpd > targetSpd ? 1.15 : 1.0;
  },
});

// Hair Trigger: +10% crit chance on physical moves.
registerPassiveHook('hair_trigger', {
  onCritCheck({ attacker, move }) {
    return move.damageClass === 'physical' ? 0.10 : 0;
  },
});

// Light Frame: take -10% physical damage.
registerPassiveHook('light_frame', {
  onIncomingDamage({ defender, move }) {
    return move.damageClass === 'physical' ? 0.90 : 1.0;
  },
});

// T2 — Strider

// Swift Body II: +6% physical damage per positive evasion stage.
registerPassiveHook('swift_body_2', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const stages = Math.max(0, getEvasionStageCount(attacker));
    return 1.0 + stages * 0.06;
  },
});

// Momentum: +15% physical damage if this creature evaded an attack this round.
registerPassiveHook('momentum', {
  onBeforeDamage({ attacker, move }) {
    return (move.damageClass === 'physical' && attacker.hasEvadedThisRound) ? 1.15 : 1.0;
  },
});

// Predator: +20% physical damage against slowed targets.
registerPassiveHook('predator', {
  onBeforeDamage({ attacker, target, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const hasSlowed = (target.statusEffects || []).some(s => s.id === 'slow');
    return hasSlowed ? 1.20 : 1.0;
  },
});

// Quick Reflexes: 15% chance to avoid a status effect.
registerPassiveHook('quick_reflexes', {
  onStatusWouldApply({ defender, statusId }) {
    return typeof _battleRng === 'function' && _battleRng() < 0.15;
  },
});

// Relentless Pace: +5% physical damage per consecutive round acting before opponent (tracked via speedStreak).
registerPassiveHook('relentless_pace', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const streak = attacker.speedStreak ?? 0;
    return 1.0 + Math.min(streak, 5) * 0.05;
  },
});

// T3 — Acrobat

// Swift Body III: +8% physical damage per positive evasion stage.
registerPassiveHook('swift_body_3', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const stages = Math.max(0, getEvasionStageCount(attacker));
    return 1.0 + stages * 0.08;
  },
});

// Dodge Counter: on evading a physical hit, queue dodge_counter_strike.
registerPassiveHook('dodge_counter', {
  onEvadePhysicalHit({ evader, attacker, bs }) {
    if (attacker && !attacker.isKnockedOut) {
      evader.pendingAutoAction = {
        skillId: 'dodge_counter_strike',
        targetSide: evader._side === 'player' ? 'opponent' : 'player',
        targetSlot: attacker._slot,
      };
    }
  },
});

// Flow State: +20% physical damage if streak ≥ 3 consecutive rounds acting first.
registerPassiveHook('flow_state', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return (attacker.speedStreak ?? 0) >= 3 ? 1.20 : 1.0;
  },
});

// Glass Jaw: actor takes +20% physical damage (risk/reward — taken alongside high-damage passives).
registerPassiveHook('glass_jaw', {
  onIncomingDamage({ defender, move }) {
    return move.damageClass === 'physical' ? 1.20 : 1.0;
  },
});

// Speedster: SPD stat is treated as 10% higher for turn order purposes (simulated via flat bonus).
registerPassiveHook('speedster', {
  onStatCheck({ creature, stat }) {
    return stat === 'speed' ? 1.10 : 1.0;
  },
});

// T4 — Phantom

// Phantom Strike: physical skills ignore 25% of target's Defense.
registerPassiveHook('phantom_strike', {
  onBeforeDamage({ attacker, move }) {
    // Defense reduction is handled in _calcSpdSkillDamage via opts — this hook signals eligibility.
    // Actual reduction applied in battle-engine.js when this passive is detected.
    return 1.0;
  },
});

// Evasion Master: evasion stages capped at +6 instead of +5.
registerPassiveHook('evasion_master', {});

// Windrunner: +25% physical damage if this creature evaded an attack this round.
registerPassiveHook('windrunner', {
  onBeforeDamage({ attacker, move }) {
    return (move.damageClass === 'physical' && attacker.hasEvadedThisRound) ? 1.25 : 1.0;
  },
});

// Terror Pace: on landing a critical hit, lower target SPD 1 stage.
registerPassiveHook('terror_pace', {
  onCritLand({ attacker, target }) {
    if (!target.isKnockedOut && typeof applyStatModifier === 'function')
      applyStatModifier(target, 'speed', -1, { duration: 3 });
  },
});

// Blur: 15% chance to evade any physical hit; bypassed by phasebreaker.
registerPassiveHook('blur', {});

// T5 — Timebreaker

// Terminal Velocity: +5% physical damage for each positive SPD stage (stacks multiplicatively per stage).
registerPassiveHook('terminal_velocity', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    const stages = Math.max(0, typeof getStatStage === 'function' ? getStatStage(attacker, 'speed') : 0);
    return Math.pow(1.05, stages);
  },
});

// No Second Chances: physical moves deal +30% damage to targets below 35% HP.
registerPassiveHook('no_second_chances', {
  onBeforeDamage({ attacker, target, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return (target.hp.current / target.hp.max < 0.35) ? 1.30 : 1.0;
  },
});

// Phasebreaker: physical attacks bypass target's evasion — handled in battle-engine.js hit calc.
registerPassiveHook('phasebreaker', {});

// Time Thief: on KO'ing a target, raise self evasion 1 stage.
registerPassiveHook('time_thief', {
  onKO({ attacker, target }) {
    if (attacker && typeof applyStatModifier === 'function')
      applyStatModifier(attacker, 'evasion', 1, { duration: 4 });
  },
});

// Ghost Step: once per battle, survive a KO at 1 HP + raise evasion 2 stages — handled via skill handler.
registerPassiveHook('ghost_step', {
  onWouldBeKO({ defender }) {
    if (defender.ghostStepActive && !defender.ghostStepUsed) {
      defender.ghostStepUsed = true;
      defender.ghostStepActive = false;
      defender.hp.current = 1;
      if (typeof applyStatModifier === 'function')
        applyStatModifier(defender, 'evasion', 2, { duration: 999 });
      return true;
    }
    return false;
  },
});
