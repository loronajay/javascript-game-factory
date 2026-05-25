// passive-registry-defense.js — Defense route passive hooks.
// Requires passive-registry-core.js (registerPassiveHook).

// ── Defense Tier 1 passives ───────────────────────────────────────────────────

registerPassiveHook('thick_skinned', {
  onStatCheck({ stat }) {
    return stat === 'defense' ? 1.05 : 1.0;
  },
});

// Restores 3% max HP at end of each round.
registerPassiveHook('resilient', {
  onRoundEnd({ creature }) {
    const regen = Math.max(1, Math.round(creature.hp.max * 0.03));
    creature.hp.current = Math.min(creature.hp.max, creature.hp.current + regen);
  },
});

// Attacker takes 8% of damage dealt back as physical.
registerPassiveHook('thornmail', {
  onTakePhysicalHit({ damage, attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    const reflect = Math.max(1, Math.round(damage * 0.08));
    attacker.hp.current = Math.max(0, attacker.hp.current - reflect);
  },
});

// If a single hit exceeds 25% max HP, reduce it by 12%.
// Stub — threshold check requires damage amount at call time; full impl deferred to engine inline check.
registerPassiveHook('sturdy', {});

// Counter Stance Counter deals +30% damage.
registerPassiveHook('counter_force', {
  onBeforeDamage({ move }) {
    return move.id === 'counter_stance_counter' ? 1.30 : 1.0;
  },
});

// ── Defense Tier 2 passives ───────────────────────────────────────────────────

registerPassiveHook('thick_skinned_2', {
  onStatCheck({ stat }) {
    return stat === 'defense' ? 1.10 : 1.0;
  },
});

// When user takes a physical hit, attacker's Strength is lowered by 1 stage for 1 turn.
registerPassiveHook('pressure_point', {
  onTakePhysicalHit({ attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    applyStatModifier(attacker, 'strength', -1, { duration: 1 });
  },
});

// Max HP +5% (checked via HP stat hook).
registerPassiveHook('heavy_frame', {
  onStatCheck({ stat }) {
    return stat === 'hp' ? 1.05 : 1.0;
  },
});

// Body Check deals +25% damage.
registerPassiveHook('iron_body', {
  onBeforeDamage({ move }) {
    return move.id === 'body_check' ? 1.25 : 1.0;
  },
});

// Incoming damage reduced 10% while user has any positive Defense stages.
registerPassiveHook('fortified', {
  onIncomingDamage({ defender }) {
    const stage = (defender.statModifiers || []).filter(m => m.stat === 'defense' && m.direction > 0).length;
    return stage > 0 ? 0.90 : 1.0;
  },
});

// ── Defense Tier 3 passives ───────────────────────────────────────────────────

registerPassiveHook('thick_skinned_3', {
  onStatCheck({ stat }) {
    return stat === 'defense' ? 1.15 : 1.0;
  },
});

// Endurance is handled inside recover/recover_2/recover_3 skill handlers.
registerPassiveHook('endurance', {});

// Restores 6% max HP at end of each round.
registerPassiveHook('resilient_2', {
  onRoundEnd({ creature }) {
    const regen = Math.max(1, Math.round(creature.hp.max * 0.06));
    creature.hp.current = Math.min(creature.hp.max, creature.hp.current + regen);
  },
});

// Attacker takes 14% of damage dealt back.
registerPassiveHook('thornmail_2', {
  onTakePhysicalHit({ damage, attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    const reflect = Math.max(1, Math.round(damage * 0.14));
    attacker.hp.current = Math.max(0, attacker.hp.current - reflect);
  },
});

// Defender's Aura: all allies take 8% less physical damage. Checked via getDefendersAuraBonus().
registerPassiveHook('defenders_aura', {});

// ── Defense Tier 4 passives ───────────────────────────────────────────────────

// Max HP +10%.
registerPassiveHook('heavy_frame_2', {
  onStatCheck({ stat }) {
    return stat === 'hp' ? 1.10 : 1.0;
  },
});

// Each physical hit received grants a stacking -5% incoming DR, max 3 stacks.
registerPassiveHook('toughness', {
  onTakePhysicalHit({ defender }) {
    if ((defender.toughnessStacks || 0) < 3) {
      defender.toughnessStacks = (defender.toughnessStacks || 0) + 1;
    }
  },
  onIncomingDamage({ defender, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return 1.0 - 0.05 * (defender.toughnessStacks || 0);
  },
});

// Attacker takes 20% of damage dealt back.
registerPassiveHook('thornmail_3', {
  onTakePhysicalHit({ damage, attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    const reflect = Math.max(1, Math.round(damage * 0.20));
    attacker.hp.current = Math.max(0, attacker.hp.current - reflect);
  },
});

// Sacrifice Drive is handled inside the absorb skill handler.
registerPassiveHook('sacrifice_drive', {});

// Once per battle, block a status application.
registerPassiveHook('unassailable', {
  onStatusWouldApply({ target }) {
    if (target.unassailableUsed) return false;
    target.unassailableUsed = true;
    return true;
  },
});

// ── Defense Tier 5 passives ───────────────────────────────────────────────────

// Defense +5% and HP +5%.
registerPassiveHook('juggernaut', {
  onStatCheck({ stat }) {
    if (stat === 'defense') return 1.05;
    if (stat === 'hp')      return 1.05;
    return 1.0;
  },
});

// If a hit drops user to ≤25% max HP, incoming damage −20% for 2 turns.
// onTakePhysicalHit fires after damage is already applied, so defender.hp.current is post-hit.
registerPassiveHook('indestructible', {
  onTakePhysicalHit({ defender }) {
    if ((defender.indestructibleTurns || 0) > 0) return;
    if (defender.hp.current > 0 && defender.hp.current <= defender.hp.max * 0.25) {
      defender.indestructibleTurns = 2;
    }
  },
  onIncomingDamage({ defender, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return (defender.indestructibleTurns || 0) > 0 ? 0.80 : 1.0;
  },
  onRoundEnd({ creature }) {
    if (creature.indestructibleTurns > 0) creature.indestructibleTurns--;
  },
});

// Titan's Wall is handled inside the counter_surge skill handler.
registerPassiveHook('titans_wall', {});

// While Total Defense or Aegis Shield is active, super-effective modifier capped to 1.0.
// Physical damage is already 0 when those flags are active, so the elemMod cap is functionally
// covered. Full elemMod intercept requires a hook into calcDamage — deferred.
registerPassiveHook('siege_breaker', {});

// Guardian's Presence: once per battle, an ally survives a lethal hit at 1 HP.
// Checked at KO resolution — handled inline in battle-engine.js checkPassiveSurviveKO extension.
registerPassiveHook('guardians_presence', {});
