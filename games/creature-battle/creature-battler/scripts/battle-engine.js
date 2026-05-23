const ENGINE = {
  LEVEL_MOD:       0.75,
  CRIT_CHANCE:     0.05,
  CRIT_MOD:        1.5,
  DEFEND_MOD:      0.5,
  STAT_STAGE_CAP:  5,
  STAT_STAGE_MULTIPLIERS: [1, 1.2, 1.35, 1.47, 1.57, 1.65],
  RANDOM_MIN:      -2,
  RANDOM_MAX:      4,
  MIN_DAMAGE:      1,
  MAX_DAMAGE:      9999,
  SPECIES_ACC_BASE: 70,
  SPECIES_EVA_BASE: 60,
};

const STATUS_DEFS = {
  poison:  { label: 'POISON'  },
  burn:    { label: 'BURN'    },
  stun:    { label: 'STUN'    },
  blind:   { label: 'BLIND'   },
  slow:    { label: 'SLOW'    },
  silence: { label: 'SILENCE' },
};

const STAT_LABELS = {
  strength: 'STR',
  defense: 'DEF',
  intelligence: 'INT',
  spirit: 'SPI',
  speed: 'SPD',
  accuracy: 'ACC',
  evasion: 'EVA',
};

// ── Seeded RNG (replaced per-match for online play; defaults to Math.random for training) ──
let _battleRng = Math.random.bind(Math);

function setBattleRng(seed) {
  if (seed == null) { _battleRng = Math.random.bind(Math); return; }
  let s = seed >>> 0;
  _battleRng = function() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function engineRandom(min, max) {
  return min + Math.floor(_battleRng() * (max - min + 1));
}

function getAllCreatures() {
  const bs = state.battleState;
  if (!bs) return [];
  return ['player', 'opponent'].flatMap(side =>
    SLOT_NAMES.map(slot => bs[side][slot]).filter(Boolean)
  );
}

function ensureStatusList(creature) {
  if (!creature.statusEffects) creature.statusEffects = [];
  return creature.statusEffects;
}

function ensureStatModifierList(creature) {
  if (!creature.statModifiers) creature.statModifiers = [];
  return creature.statModifiers;
}

function hasStatus(creature, id) {
  return ensureStatusList(creature).some(status => status.id === id);
}

function applyStatus(creature, id, options = {}) {
  const list = ensureStatusList(creature);
  const existing = list.find(status => status.id === id);
  const next = {
    id,
    appliedRound: state.battleState.round,
    remainingRounds: options.remainingRounds ?? 1,
    consumeOn: options.consumeOn || null,
    permanent: options.permanent || false,
  };
  if (existing) Object.assign(existing, next);
  else list.push(next);
  return STATUS_DEFS[id]?.label || 'STATUS';
}

function applyStatModifier(creature, stat, direction, options = {}) {
  const list = ensureStatModifierList(creature);
  const normalizedDirection = direction >= 0 ? 1 : -1;
  const oppositeIndex = list.findIndex(mod => mod.stat === stat && mod.direction === -normalizedDirection);
  if (oppositeIndex !== -1) {
    list.splice(oppositeIndex, 1);
  } else {
    const sameDirectionCount = list.filter(mod => mod.stat === stat && mod.direction === normalizedDirection).length;
    if (sameDirectionCount < ENGINE.STAT_STAGE_CAP) {
      list.push({
        stat,
        direction: normalizedDirection,
        appliedRound: state.battleState.round,
      });
    } else {
      const oldest = list.find(mod => mod.stat === stat && mod.direction === normalizedDirection);
      if (oldest) {
        oldest.appliedRound = state.battleState.round;
      }
    }
  }
  return `${STAT_LABELS[stat] || stat.toUpperCase()} ${normalizedDirection > 0 ? 'UP' : 'DOWN'}`;
}

function removeStatus(creature, id) {
  creature.statusEffects = ensureStatusList(creature).filter(status => status.id !== id);
}

function consumeStatus(creature, id) {
  removeStatus(creature, id);
}

function applyEndOfRoundStatuses() {
  const tickResults = [];
  getAllCreatures().forEach(creature => {
    if (creature.isKnockedOut) return;
    ['poison', 'burn'].forEach(statusId => {
      if (!hasStatus(creature, statusId) || creature.isKnockedOut) return;
      const dmg = Math.max(1, Math.round(creature.hp.max * 0.06));
      creature.hp.current = Math.max(0, creature.hp.current - dmg);
      const wasKO = !creature.isKnockedOut && creature.hp.current <= 0;
      if (wasKO) { creature.isKnockedOut = true; clearBattleModifiers(creature); }
      tickResults.push({ creatureName: creature.displayName, statusId, damage: dmg, wasKO });
    });
  });
  return tickResults;
}

function advanceStatusDurations() {
  const round = state.battleState.round;
  getAllCreatures().forEach(creature => {
    const hadBurn = hasStatus(creature, 'burn');
    creature.statusEffects = ensureStatusList(creature).filter(status => {
      if (status.permanent) return true;
      if (status.consumeOn && status.appliedRound <= round) return false;
      if (status.appliedRound >= round) return true;
      status.remainingRounds = (status.remainingRounds ?? 1) - 1;
      return status.remainingRounds > 0;
    });
    if (hadBurn && !hasStatus(creature, 'burn')) {
      applyStatModifier(creature, 'defense', 1);
    }
  });
}

function clearBattleModifiers(creature) {
  creature.statModifiers = [];
  creature.statusEffects = [];
}

function getStatStage(creature, stat) {
  return ensureStatModifierList(creature)
    .filter(mod => mod.stat === stat)
    .reduce((sum, mod) => sum + mod.direction, 0);
}

function getStageMultiplier(stage) {
  const capped = Math.max(-ENGINE.STAT_STAGE_CAP, Math.min(ENGINE.STAT_STAGE_CAP, stage));
  const mult = ENGINE.STAT_STAGE_MULTIPLIERS[Math.abs(capped)];
  return capped >= 0 ? mult : 1 / mult;
}

function getEffectiveStat(creature, stat) {
  const base   = creature.stats[stat] ?? 0;
  const staged = Math.max(1, Math.round(base * getStageMultiplier(getStatStage(creature, stat))));
  return Math.max(1, Math.round(staged * getPassiveStatMultiplier(creature, stat)));
}

function getEffectiveSpeed(creature) {
  let speed = getEffectiveStat(creature, 'speed');
  if (hasStatus(creature, 'slow')) speed = Math.max(1, Math.floor(speed * 0.5));
  return speed;
}

function getCreatureStatusLabels(creature) {
  const statusLabels = ensureStatusList(creature).map(status => ({
    label: STATUS_DEFS[status.id]?.label || status.id.toUpperCase(),
    kind: status.id,
  }));
  const statLabels = Object.keys(STAT_LABELS).map(stat => {
    const stage = getStatStage(creature, stat);
    if (!stage) return null;
    return { label: `${STAT_LABELS[stat]} ${stage > 0 ? '+' : ''}${stage}`, kind: stage > 0 ? 'buff' : 'debuff' };
  }).filter(Boolean);
  return [...statusLabels, ...statLabels];
}

function spendMoveCost(actor, move) {
  actor.mp.current = Math.max(0, actor.mp.current - move.mpCost);
}

const ELEMENT_OPPOSITES = {
  fire: 'ice',   ice:   'fire',
  water: 'gaia', gaia:  'water',
  wind:  'earth', earth: 'wind',
  light: 'dark', dark:  'light',
};

// Sub-interactions between non-opposing elements. Light and Dark are intentionally absent —
// they are neutral against all elements except their direct opposite.
const ELEMENT_SUB = {
  fire:  { gaia: 1.25, wind:  0.75 },
  ice:   { gaia: 1.25, water: 0.75 },
  water: { fire: 1.25, earth: 1.25 },
  gaia:  { earth: 0.75 },
  earth: { water: 0.75 },
  wind:  { ice: 0.75 },
};

// Returns a numeric modifier, or the string 'absorb' when the move element matches the target's element.
// Priority: absorb > full opposition > creature resistance override > sub-interaction > neutral.
function getElementModifier(moveElement, target) {
  if (!moveElement || moveElement === 'neutral' || moveElement === 'none') return 1.0;
  if (target.element === moveElement) return 'absorb';
  if (ELEMENT_OPPOSITES[target.element] === moveElement) return 1.5;
  return target.resistances?.[moveElement] ?? ELEMENT_SUB[moveElement]?.[target.element] ?? 1.0;
}

function calcHitChance(attacker, target, move) {
  const atkAcc = (ENGINE.SPECIES_ACC_BASE + getEffectiveSpeed(attacker) * 0.15 + getEffectiveStat(attacker, 'intelligence') * 0.10)
    * getStageMultiplier(getStatStage(attacker, 'accuracy'));
  const tgtEva = (ENGINE.SPECIES_EVA_BASE + getEffectiveSpeed(target) * 0.15 + getEffectiveStat(target, 'intelligence') * 0.10)
    * getStageMultiplier(getStatStage(target, 'evasion'));
  return Math.max(75, Math.min(100, move.accuracy + (atkAcc - tgtEva) * 0.25));
}

function resolveHit(attacker, target, move) {
  if (hasStatus(attacker, 'blind')) return false;
  return _battleRng() * 100 < calcHitChance(attacker, target, move);
}

function calcDamage(attacker, target, move) {
  const offStat  = move.damageClass === 'physical' ? getEffectiveStat(attacker, 'strength') : getEffectiveStat(attacker, 'intelligence');
  const defStat  = move.damageClass === 'physical' ? getEffectiveStat(target, 'defense')    : getEffectiveStat(target, 'spirit');
  const levelMod = attacker.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * move.offensiveScaling;
  const elemMod  = getElementModifier(move.element, target);

  if (elemMod === 'absorb') {
    const raw = move.basePower + move.movePowerModifier + pressure + levelMod + engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
    return { damage: 0, healAmount: Math.max(1, Math.round(raw * 0.5)), isCrit: false, elemMod: 'absorb' };
  }

  const critThreshold = ENGINE.CRIT_CHANCE + getPassiveCritBonus(attacker, move);
  const isCrit  = move.canCrit && _battleRng() < critThreshold;
  const critMod = isCrit ? ENGINE.CRIT_MOD : 1.0;
  const defMod  = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const randMod = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult = getPassiveDamageMultiplier(attacker, target, move);
  const raw = ((move.basePower + move.movePowerModifier + pressure + levelMod)
              * elemMod * defMod * critMod + randMod) * passiveMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    healAmount: 0,
    isCrit,
    elemMod,
  };
}

function calcHeal(caster, move) {
  const levelMod = caster.level * ENGINE.LEVEL_MOD;
  const pressure = caster.stats.spirit * move.offensiveScaling;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  return Math.max(1, Math.round(move.basePower + move.movePowerModifier + pressure + levelMod + randMod));
}

// Search upward from preferredSlot for next alive target on a side
function findValidTarget(side, preferredSlot) {
  const start = SLOT_NAMES.indexOf(preferredSlot);
  for (let i = 0; i < SLOT_NAMES.length; i++) {
    const slot = SLOT_NAMES[(start - i + SLOT_NAMES.length) % SLOT_NAMES.length];
    const c = state.battleState[side][slot];
    if (c && !c.isKnockedOut) return slot;
  }
  return null;
}

function sortActions(actions) {
  return [...actions].sort((a, b) => {
    const aActor = state.battleState[a.actorSide]?.[a.actorSlot];
    const bActor = state.battleState[b.actorSide]?.[b.actorSlot];
    const aSpeed = aActor ? getEffectiveSpeed(aActor) : a.speed;
    const bSpeed = bActor ? getEffectiveSpeed(bActor) : b.speed;
    if (bSpeed !== aSpeed) return bSpeed - aSpeed;
    // player side wins speed ties
    if (a.actorSide !== b.actorSide) return a.actorSide === 'player' ? -1 : 1;
    return SLOT_NAMES.indexOf(a.actorSlot) - SLOT_NAMES.indexOf(b.actorSlot);
  });
}

function checkBattleEnd() {
  const bs = state.battleState;
  const pAlive = SLOT_NAMES.some(s => bs.player[s] && !bs.player[s].isKnockedOut);
  const oAlive = SLOT_NAMES.some(s => bs.opponent[s] && !bs.opponent[s].isKnockedOut);
  if (!pAlive && !oAlive) return 'draw';
  if (!pAlive) return 'opponent';
  if (!oAlive) return 'player';
  return null;
}

function previewAction(action) {
  const bs    = state.battleState;
  const actor = bs[action.actorSide][action.actorSlot];

  if (!actor || actor.isKnockedOut) {
    return { type: 'skipped' };
  }

  if (action.commandType === 'defend') {
    return { type: 'defend', actorName: actor.displayName, targetSide: action.actorSide, targetSlot: action.actorSlot };
  }

  if (action.commandType === 'skill') {
    const skill = getClassSkill(action.moveId);
    if (!skill) return { type: 'skipped' };
    if (skill.targeting === 'self') {
      return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, targetSide: action.actorSide, targetSlot: action.actorSlot };
    }
    const tgtSlot = findValidTarget(action.targetSide, action.targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const tgt = bs[action.targetSide][tgtSlot];
    return { type: 'damage', actorName: actor.displayName, moveName: skill.name, targetName: tgt.displayName, targetSide: action.targetSide, targetSlot: tgtSlot };
  }

  const move = getMoveData(action.moveId);
  if (!move) return { type: 'skipped' };

  if (move.damageClass === 'utility') {
    if (move.targeting === 'all_allies') {
      return { type: 'utility', actorName: actor.displayName, moveName: move.name, targetName: 'all allies', targetSide: action.actorSide, targetSlot: null };
    }
    const targetSide = action.targetSide || action.actorSide;
    const targetSlot = action.targetSlot || action.actorSlot;
    const target = bs[targetSide][targetSlot];
    return { type: 'utility', actorName: actor.displayName, moveName: move.name, targetName: target?.displayName || actor.displayName, targetSide, targetSlot };
  }

  if (move.targeting === 'all_enemies' || move.targeting === 'all_allies') {
    const targetSide = move.targeting === 'all_allies' ? action.actorSide : (action.actorSide === 'player' ? 'opponent' : 'player');
    const hits = SLOT_NAMES
      .filter(slot => {
        const target = bs[targetSide][slot];
        return target && !target.isKnockedOut;
      })
      .map(slot => ({ slot, name: bs[targetSide][slot].displayName }));
    if (!hits.length) return { type: 'no_target', actorName: actor.displayName, moveName: move.name };
    return { type: 'multi', actorName: actor.displayName, moveName: move.name, damageClass: move.damageClass, targetSide, hits };
  }

  if (move.damageClass === 'heal') {
    const targetSide = action.targetSide || action.actorSide;
    const targetSlot = action.targetSlot || action.actorSlot;
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) {
      return { type: 'miss', actorName: actor.displayName, moveName: move.name, targetSide, targetSlot };
    }
    return { type: 'heal', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, targetSide, targetSlot };
  }

  const targetSide = action.targetSide;
  const targetSlot = findValidTarget(targetSide, action.targetSlot);
  if (!targetSlot) {
    return { type: 'no_target', actorName: actor.displayName, moveName: move.name };
  }

  const target = bs[targetSide][targetSlot];
  return {
    type: 'damage',
    actorName: actor.displayName,
    moveName: move.name,
    targetName: target.displayName,
    targetSide,
    targetSlot,
    retargeted: targetSlot !== action.targetSlot,
  };
}

function resolveAction(action) {
  const bs    = state.battleState;
  const actor = bs[action.actorSide][action.actorSlot];

  if (!actor || actor.isKnockedOut) {
    return { type: 'skipped' };
  }

  if (hasStatus(actor, 'stun')) {
    return { type: 'stunned', actorName: actor.displayName };
  }

  if (action.commandType === 'defend') {
    actor.isDefending = true;
    return { type: 'defend', actorName: actor.displayName, targetSide: action.actorSide, targetSlot: action.actorSlot };
  }

  if (action.commandType === 'skill') {
    const skill = getClassSkill(action.moveId);
    if (!skill) return { type: 'skipped' };
    if (hasStatus(actor, 'silence')) {
      return { type: 'silenced', actorName: actor.displayName, moveName: skill.name };
    }
    return executeRegisteredSkill(skill, actor, action.actorSide, action.actorSlot, action.targetSide, action.targetSlot, bs);
  }

  const move = getMoveData(action.moveId);
  if (!move) return { type: 'skipped' };

  if (hasStatus(actor, 'silence') && move.category !== 'basic' && action.commandType !== 'defend') {
    return { type: 'silenced', actorName: actor.displayName, moveName: move.name };
  }

  // Utility moves: deduct MP, no damage yet
  if (move.damageClass === 'utility') {
    if (move.targeting === 'all_allies') {
      const tgtSide = action.actorSide;
      const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
      if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: move.name };
      spendMoveCost(actor, move);
      let statusText = 'BUFF';
      slots.forEach(s => { statusText = applyUtilityMove(move.id, bs[tgtSide][s]) || statusText; });
      return { type: 'utility', actorName: actor.displayName, moveName: move.name, targetName: 'all allies', targetSide: tgtSide, targetSlot: null, statusText };
    }

    const targetSide = action.targetSide || action.actorSide;
    const targetSlot = action.targetSlot || action.actorSlot;
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) {
      return { type: 'miss', actorName: actor.displayName, moveName: move.name, targetSide, targetSlot };
    }

    spendMoveCost(actor, move);
    const isHostile = targetSide !== action.actorSide;
    if (isHostile) {
      const didHit = resolveHit(actor, target, move);
      if (!didHit) {
        return { type: 'miss', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, targetSide, targetSlot };
      }
    }

    const statusText = applyUtilityMove(move.id, target);
    return { type: 'utility', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, targetSide, targetSlot, statusText };
  }

  // Multi-target moves (all_enemies or all_allies)
  if (move.targeting === 'all_enemies' || move.targeting === 'all_allies') {
    const tgtSide = move.targeting === 'all_allies' ? action.actorSide : (action.actorSide === 'player' ? 'opponent' : 'player');
    const slots   = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: move.name };

    spendMoveCost(actor, move);
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      if (move.damageClass === 'heal') {
        const amt = calcHeal(actor, move);
        target.hp.current = Math.min(target.hp.max, target.hp.current + amt);
        return { slot, name: target.displayName, amount: amt, wasKO: false };
      }
      const didHit = resolveHit(actor, target, move);
      if (!didHit) return { slot, name: target.displayName, missed: true };
      const { damage, healAmount, isCrit, elemMod } = calcDamage(actor, target, move);
      if (elemMod === 'absorb') {
        target.hp.current = Math.min(target.hp.max, target.hp.current + healAmount);
        return { slot, name: target.displayName, amount: healAmount, elemMod: 'absorb', wasKO: false, isCrit: false };
      }
      target.hp.current = Math.max(0, target.hp.current - damage);
      const wasKO = !target.isKnockedOut && target.hp.current <= 0;
      if (wasKO) {
        target.isKnockedOut = true;
        clearBattleModifiers(target);
      } else {
        applySecondaryEffect(move.id, target);
      }
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit, elemMod };
    });
    if (move.healAllAllies) {
      const allySide  = action.actorSide;
      const allySlots = SLOT_NAMES.filter(s => { const c = bs[allySide][s]; return c && !c.isKnockedOut; });
      const healMove  = { basePower: move.allyHealBasePower, movePowerModifier: 0, offensiveScaling: move.allyHealScaling || 0.35 };
      const allyHeals = allySlots.map(s => {
        const ally = bs[allySide][s];
        const amt  = calcHeal(actor, healMove);
        ally.hp.current = Math.min(ally.hp.max, ally.hp.current + amt);
        return { slot: s, name: ally.displayName, amount: amt };
      });
      return { type: 'world_tree', actorName: actor.displayName, moveName: move.name, targetSide: tgtSide, damageHits: hits, allyHeals };
    }

    return { type: 'multi', actorName: actor.displayName, moveName: move.name, damageClass: move.damageClass, targetSide: tgtSide, hits };
  }

  // Single-target heal
  if (move.damageClass === 'heal') {
    const tgtSlot = action.targetSlot || action.actorSlot;
    const target  = bs[action.targetSide || action.actorSide][tgtSlot];
    if (!target || target.isKnockedOut) {
      return { type: 'miss', actorName: actor.displayName, moveName: move.name, targetSide: action.targetSide || action.actorSide, targetSlot: tgtSlot };
    }
    spendMoveCost(actor, move);
    const amt = calcHeal(actor, move);
    target.hp.current = Math.min(target.hp.max, target.hp.current + amt);
    return { type: 'heal', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, targetSide: action.targetSide || action.actorSide, targetSlot: tgtSlot, amount: amt };
  }

  // Single-target damage — retarget if needed
  const tgtSide = action.targetSide;
  const tgtSlot = findValidTarget(tgtSide, action.targetSlot);
  if (!tgtSlot) {
    return { type: 'no_target', actorName: actor.displayName, moveName: move.name };
  }

  const target  = bs[tgtSide][tgtSlot];
  const retargeted = tgtSlot !== action.targetSlot;

  spendMoveCost(actor, move);

  // Multi-hit moves (e.g. Scorch)
  if (move.hitCount > 1) {
    const hits = [];
    for (let h = 0; h < move.hitCount; h++) {
      if (target.isKnockedOut) break;
      const didHit = resolveHit(actor, target, move);
      if (!didHit) { hits.push({ missed: true }); continue; }
      const { damage, healAmount, isCrit, elemMod } = calcDamage(actor, target, move);
      if (elemMod === 'absorb') {
        target.hp.current = Math.min(target.hp.max, target.hp.current + healAmount);
        hits.push({ healAmount, elemMod: 'absorb', wasKO: false, isCrit: false });
        continue;
      }
      target.hp.current = Math.max(0, target.hp.current - damage);
      const wasKO = !target.isKnockedOut && target.hp.current <= 0;
      if (wasKO) { target.isKnockedOut = true; clearBattleModifiers(target); }
      hits.push({ damage, isCrit, elemMod, wasKO });
    }
    return { type: 'multi_hit', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, targetSide: tgtSide, targetSlot: tgtSlot, hits, retargeted };
  }

  const didHit = resolveHit(actor, target, move);
  if (!didHit) {
    return { type: 'miss', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, targetSide: tgtSide, targetSlot: tgtSlot };
  }

  const { damage, healAmount, isCrit, elemMod } = calcDamage(actor, target, move);

  if (elemMod === 'absorb') {
    target.hp.current = Math.min(target.hp.max, target.hp.current + healAmount);
    return {
      type: 'absorb',
      actorName: actor.displayName,
      moveName: move.name,
      targetName: target.displayName,
      targetSide: tgtSide,
      targetSlot: tgtSlot,
      amount: healAmount,
      retargeted,
    };
  }

  target.hp.current = Math.max(0, target.hp.current - damage);
  const wasKO = !target.isKnockedOut && target.hp.current <= 0;
  if (wasKO) {
    target.isKnockedOut = true;
    clearBattleModifiers(target);
  }
  const statusText = applySecondaryEffect(move.id, target);

  let lifestolen = null;
  if (move.lifeSteal && damage > 0) {
    lifestolen = Math.max(1, Math.round(damage * move.lifeSteal));
    actor.hp.current = Math.min(actor.hp.max, actor.hp.current + lifestolen);
  }

  return {
    type: isCrit ? 'crit' : 'damage',
    actorName: actor.displayName,
    moveName: move.name,
    targetName: target.displayName,
    targetSide: tgtSide,
    targetSlot: tgtSlot,
    amount: damage,
    elemMod,
    isCrit,
    wasKO,
    retargeted,
    statusText,
    lifestolen,
  };
}

function applyUtilityMove(moveId, target) {
  let text = null;
  switch (moveId) {
    case 'cold_feet':    text = applyStatModifier(target, 'speed', -1); break;
    case 'snow_blind':   text = applyStatModifier(target, 'accuracy', -1); break;
    case 'heat_haze':    text = applyStatModifier(target, 'evasion', 1); break;
    case 'ash_veil':     text = applyStatModifier(target, 'spirit', 1); break;
    case 'soak_hide':    text = applyStatModifier(target, 'defense', 1); break;
    case 'verdant_guard':
    case 'natures_ward': text = applyStatModifier(target, 'spirit', 1); break;
    case 'bloom_surge': {
      applyStatModifier(target, 'intelligence', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
    case 'hydro_skin':
    case 'glacier_wall': {
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
    case 'boulder_wall': {
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'defense', 1);
      break;
    }
    case 'earthen_shell': {
      applyStatModifier(target, 'defense', 1);
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
    case 'tailwind': {
      applyStatModifier(target, 'speed', 1);
      text = applyStatModifier(target, 'speed', 1);
      break;
    }
    case 'slipstream': {
      applyStatModifier(target, 'speed', 1);
      text = applyStatModifier(target, 'evasion', 1);
      break;
    }
    case 'dodge_step': {
      applyStatModifier(target, 'evasion', 1);
      text = applyStatModifier(target, 'evasion', 1);
      break;
    }
    case 'phase_shift': {
      applyStatModifier(target, 'evasion', 1);
      text = applyStatModifier(target, 'speed', 1);
      break;
    }
    case 'whirlpool': {
      applyStatModifier(target, 'speed', -1);
      text = applyStatModifier(target, 'accuracy', -1);
      break;
    }
    case 'cleanse': {
      const had = (target.statusEffects || []).length > 0;
      target.statusEffects = [];
      text = had ? 'CLEANSED' : 'BUFF';
      break;
    }
    case 'clarity': {
      applyStatModifier(target, 'speed', 1);
      text = applyStatModifier(target, 'accuracy', 1);
      break;
    }
    case 'holy_ward': {
      applyStatModifier(target, 'spirit', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
    case 'shadow_surge': {
      applyStatModifier(target, 'intelligence', 1);
      applyStatModifier(target, 'intelligence', 1);
      text = applyStatModifier(target, 'defense', -1);
      break;
    }
    case 'blaze_stance': {
      applyStatModifier(target, 'strength', 1);
      text = applyStatModifier(target, 'strength', 1);
      break;
    }
    case 'brine_shield': {
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
    case 'barnacle_wall': {
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'defense', 1);
      break;
    }
    case 'tide_wall': {
      applyStatModifier(target, 'defense', 1);
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
    case 'overgrowth': {
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'defense', 1);
      break;
    }
    case 'moss_wall': {
      applyStatModifier(target, 'defense', 1);
      text = applyStatModifier(target, 'spirit', 1);
      break;
    }
  }
  const move = getMoveData(moveId);
  if (move?.applyStatus && !target.isKnockedOut) {
    const { id, duration, permanent, chance = 100 } = move.applyStatus;
    if (!hasStatus(target, id) && _battleRng() * 100 < chance) {
      const label = applyStatus(target, id, { remainingRounds: duration, permanent });
      if (id === 'burn') applyStatModifier(target, 'defense', -1);
      text = text ? `${text}! ${label}` : label;
    }
  }
  return text || 'BUFF';
}

function applySecondaryEffect(moveId, target) {
  let text = null;
  switch (moveId) {
    case 'root_snare':
    case 'frozen_pulse':  text = applyStatModifier(target, 'speed', -1); break;
    case 'thorn_bind':    text = applyStatModifier(target, 'defense', -1); break;
    case 'absolute_zero': {
      applyStatModifier(target, 'speed', -1);
      text = applyStatModifier(target, 'accuracy', -1);
      break;
    }
  }
  const move = getMoveData(moveId);
  if (move?.applyStatus && !target.isKnockedOut) {
    const { id, duration, permanent, chance = 100 } = move.applyStatus;
    if (!hasStatus(target, id) && _battleRng() * 100 < chance) {
      const label = applyStatus(target, id, { remainingRounds: duration, permanent });
      if (id === 'burn') applyStatModifier(target, 'defense', -1);
      text = text ? `${text}! ${label}` : label;
    }
  }
  return text;
}
