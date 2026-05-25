// passive-registry-spirit.js — Spirit route passive hooks.
// Requires passive-registry-core.js (registerPassiveHook).

// ── Spirit route passive hooks ────────────────────────────────────────────────

// T1 — Tactician

// Spirit Ward I/II/III: Ward stats set by ward skill handlers; this hook is the descriptor.
registerPassiveHook('spirit_ward',   {});
registerPassiveHook('spirit_ward_2', {});
registerPassiveHook('spirit_ward_3', {});

// Arcane Resilience I/II/III: Spirit +5/10/15%.
registerPassiveHook('arcane_resilience', {
  onStatCheck({ stat }) { return stat === 'spirit' ? 1.05 : 1.0; },
});
registerPassiveHook('arcane_resilience_2', {
  onStatCheck({ stat }) { return stat === 'spirit' ? 1.10 : 1.0; },
});
registerPassiveHook('arcane_resilience_3', {
  onStatCheck({ stat }) { return stat === 'spirit' ? 1.15 : 1.0; },
});

// Mana Reservoir I/II/III: max MP +8/12/16%.
registerPassiveHook('mana_reservoir', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.08 : 1.0; },
});
registerPassiveHook('mana_reservoir_2', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.12 : 1.0; },
});
registerPassiveHook('mana_reservoir_3', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.16 : 1.0; },
});

// Art Affinity: Art cost -10% — handled in getArtCostMultiplier (empty hook).
registerPassiveHook('art_affinity', {});

// Still Mind: raises SPI +1 at battle start (applied during creature init via onBattleStart hook).
registerPassiveHook('still_mind', {
  onBattleStart({ creature }) {
    applyStatModifier(creature, 'spirit', 1, { duration: 999 });
  },
});

// T2 — Strategist

// Arcane Absorption: when struck by magic, restore 5% max MP.
registerPassiveHook('arcane_absorption', {
  onTakeMagicHit({ defender }) {
    const restore = Math.max(1, Math.floor(defender.mp.max * 0.05));
    defender.mp.current = Math.min(defender.mp.max, defender.mp.current + restore);
  },
});

// Mana Discipline: +5% Art damage per positive SPI stage.
registerPassiveHook('mana_discipline', {
  onBeforeDamage({ attacker, move }) {
    if (move.category !== 'art') return 1.0;
    const stage = getStatStage(attacker, 'spirit');
    return stage > 0 ? 1.0 + stage * 0.05 : 1.0;
  },
});

// Art Amplify: Arts deal +8% damage.
registerPassiveHook('art_amplify', {
  onBeforeDamage({ attacker, move }) {
    if (move.category === 'art') return 1.08;
    return 1.0;
  },
});

// Runic Skin: take -5% magic damage.
registerPassiveHook('runic_skin', {
  onIncomingDamage({ move }) {
    if (move.damageClass === 'magic') return 0.95;
    return 1.0;
  },
});

// T3 — Rulebender

// Trance Mastery: Ward MP restore rate +50% — handled inline in applyPassiveOnMagicHit (empty hook).
registerPassiveHook('trance_mastery', {});

// Spirit Flow: after using an Art, restore 10% of its MP cost.
registerPassiveHook('spirit_flow', {
  onAfterAction({ actor, move }) {
    if (move.category !== 'art') return;
    const mpCost = move.mpCost || 0;
    if (mpCost <= 0) return;
    const restore = Math.max(1, Math.round(mpCost * 0.10));
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + restore);
  },
});

// Replenishing Mind: restore 3% max MP at round end.
registerPassiveHook('replenishing_mind', {
  onRoundEnd({ creature }) {
    const restore = Math.max(1, Math.floor(creature.mp.max * 0.03));
    creature.mp.current = Math.min(creature.mp.max, creature.mp.current + restore);
  },
});

// T4 — Rulebreaker

// Art Celerity: Art cost -15% — handled in getArtCostMultiplier (empty hook).
registerPassiveHook('art_celerity', {});

// Spell Harvest: when an ally is hit by magic, restore 5% max MP to self.
registerPassiveHook('spell_harvest', {
  onAllyTakeMagicHit({ ally }) {
    const restore = Math.max(1, Math.floor(ally.mp.max * 0.05));
    ally.mp.current = Math.min(ally.mp.max, ally.mp.current + restore);
  },
});

// Indomitable Will: survive a KO at 1 HP and restore 20% max MP once per battle.
registerPassiveHook('indomitable_will', {
  onWouldBeKO({ defender }) {
    if (defender.indomitableWillUsed) return false;
    defender.indomitableWillUsed = true;
    defender.hp.current = 1;
    const restore = Math.floor(defender.mp.max * 0.20);
    defender.mp.current = Math.min(defender.mp.max, defender.mp.current + restore);
    return true;
  },
});

// Dominion Aura: allies take -5% magic damage — handled via getDominionAuraReduction (empty hook).
registerPassiveHook('dominion_aura', {});

// T5 — Mastermind

// Spirit Overload: Arts used during Transcendence deal +20% damage.
registerPassiveHook('spirit_overload', {
  onBeforeDamage({ attacker, move }) {
    return (move.category === 'art' && attacker.transcendenceActive) ? 1.20 : 1.0;
  },
});

// Art Mastery: Art cost -10% — handled in getArtCostMultiplier (empty hook).
registerPassiveHook('art_mastery', {});

// Nullify Presence: allies cannot be inflicted with status conditions while this creature is alive.
registerPassiveHook('nullify_presence', {
  onAllyStatusWouldApply({ ally, target, statusId }) {
    return true; // block all status applications on allies
  },
});
