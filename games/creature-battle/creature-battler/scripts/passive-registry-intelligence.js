// passive-registry-intelligence.js — Intelligence route passive hooks.
// Requires passive-registry-core.js (registerPassiveHook).

// ── Intelligence Tier 1 passives ──────────────────────────────────────────────

registerPassiveHook('sharp_mind', {
  onStatCheck({ stat }) { return stat === 'intelligence' ? 1.05 : 1.0; },
});

registerPassiveHook('spell_pressure', {
  onBeforeDamage({ move }) { return move.damageClass === 'magic' ? 1.05 : 1.0; },
});

// Arcane Well: max MP +5%. Treated as a 'mp' stat multiplier.
registerPassiveHook('arcane_well', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.05 : 1.0; },
});

registerPassiveHook('spellcaster', {
  onCritCheck({ move }) { return move.damageClass === 'magic' ? 0.03 : 0; },
});

// Mana Flow: restore 5% max MP at end of each round.
registerPassiveHook('mana_flow', {
  onRoundEnd({ creature }) {
    if (creature.isKnockedOut) return;
    const regen = Math.max(1, Math.round(creature.mp.max * 0.05));
    creature.mp.current = Math.min(creature.mp.max, creature.mp.current + regen);
  },
});

// ── Intelligence Tier 2 passives ──────────────────────────────────────────────

registerPassiveHook('sharp_mind_2', {
  onStatCheck({ stat }) { return stat === 'intelligence' ? 1.10 : 1.0; },
});

registerPassiveHook('berserker_mage', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass === 'magic' && attacker.hp.current / attacker.hp.max < 0.5) return 1.08;
    return 1.0;
  },
});

// Conduit: handled inline in _applyChannelRestore in battle-engine.js.
registerPassiveHook('conduit', {});

// Lingering Power: retain half the INT bonus for one extra round after Focus expires.
// Requires stat-modifier expiry hooks to implement cleanly — deferred, registered as stub.
registerPassiveHook('lingering_power', {});

// Overchannel: handled inline in reckless_cast skill handlers.
registerPassiveHook('overchannel', {});

// ── Intelligence Tier 3 passives ──────────────────────────────────────────────

registerPassiveHook('spell_pressure_2', {
  onBeforeDamage({ move }) { return move.damageClass === 'magic' ? 1.10 : 1.0; },
});

registerPassiveHook('arcane_well_2', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.10 : 1.0; },
});

// Collateral Spell: AoE magic damage +10%.
registerPassiveHook('collateral_spell', {
  onAoeDamage({ move }) { return move.damageClass === 'magic' ? 1.10 : 1.0; },
});

// Concentration: magic damage +12% if the creature was not hit last turn.
registerPassiveHook('concentration', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass === 'magic' && !attacker.wasHitLastRound) return 1.12;
    return 1.0;
  },
});

// Incantation Guard: incoming damage -20% during Grand Incantation wind-up.
registerPassiveHook('incantation_guard', {
  onIncomingDamage({ defender }) {
    return defender.chargingGrandIncantation ? 0.80 : 1.0;
  },
});

// ── Intelligence Tier 4 passives ──────────────────────────────────────────────

registerPassiveHook('sharp_mind_3', {
  onStatCheck({ stat }) { return stat === 'intelligence' ? 1.15 : 1.0; },
});

// Spell Echo: 20% chance for second magic hit at 40% power — handled in executeRegisteredSkill.
registerPassiveHook('spell_echo', {});

// Surge Mastery: handled inline in mana_surge skill handlers.
registerPassiveHook('surge_mastery', {});

// Mana Weaver: handled inline in mana_burst skill handler.
registerPassiveHook('mana_weaver', {});

// Indomitable Mind: once per battle, survive a lethal hit at 1 HP.
registerPassiveHook('indomitable_mind', {
  onWouldBeKO({ defender }) {
    if (defender.indomitableMindUsed) return false;
    defender.indomitableMindUsed = true;
    defender.hp.current = 1;
    return true;
  },
});

// ── Intelligence Tier 5 passives ──────────────────────────────────────────────

registerPassiveHook('spell_pressure_3', {
  onBeforeDamage({ move }) { return move.damageClass === 'magic' ? 1.15 : 1.0; },
});

registerPassiveHook('arcane_well_3', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.15 : 1.0; },
});

// Fatal Spell: magic crits deal 50% additional damage.
registerPassiveHook('fatal_spell', {
  onCritMultiplier({ move }) { return move.damageClass === 'magic' ? 1.50 : 1.0; },
});

// Arcane Dominance: all allies deal +8% magic damage — handled via getArcaneDominanceBonus.
registerPassiveHook('arcane_dominance', {});

// Spellstorm: 25% chance to double damage on targets below 30% HP — handled in executeRegisteredSkill.
registerPassiveHook('spellstorm', {});
