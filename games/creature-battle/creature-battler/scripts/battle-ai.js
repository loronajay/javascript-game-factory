function selectAiCommands() {
  return SLOT_NAMES
    .map(slot => {
      const c = state.battleState.opponent[slot];
      return (c && !c.isKnockedOut) ? buildAiAction(c, slot) : null;
    })
    .filter(Boolean);
}

// ── Element-aware scoring ────────────────────────────────────────────────────

function _scoreMoveVsTarget(move, target) {
  const mod = getElementModifier(move.element, target);
  return mod === 'absorb' ? move.basePower * -1.5 : move.basePower * mod;
}

function _scoreMoveVsSide(move, side) {
  const alive = SLOT_NAMES
    .map(s => state.battleState[side][s])
    .filter(c => c && !c.isKnockedOut);
  if (!alive.length) return -Infinity;
  return alive.reduce((sum, t) => sum + _scoreMoveVsTarget(move, t), 0);
}

function _pickBestDamageAction(creature, targetSide) {
  const bs = state.battleState;
  const dmgMoves = creature.moves.filter(m =>
    (m.damageClass === 'physical' || m.damageClass === 'magic') &&
    m.mpCost <= creature.mp.current
  );

  let bestScore = -Infinity;
  let bestMove = null;
  let bestTargetSlot = null;

  for (const move of dmgMoves) {
    if (move.targeting === 'all_enemies') {
      const score = _scoreMoveVsSide(move, targetSide);
      if (score > bestScore) { bestScore = score; bestMove = move; bestTargetSlot = null; }
    } else if (move.targeting === 'single' || !move.targeting) {
      for (const tSlot of SLOT_NAMES) {
        const target = bs[targetSide][tSlot];
        if (!target || target.isKnockedOut) continue;
        const score = _scoreMoveVsTarget(move, target);
        if (score > bestScore) { bestScore = score; bestMove = move; bestTargetSlot = tSlot; }
      }
    }
  }

  return { bestMove, bestTargetSlot, bestScore };
}

function _pickBestMoveVsTarget(creature, target) {
  const dmgMoves = creature.moves.filter(m =>
    (m.damageClass === 'physical' || m.damageClass === 'magic') &&
    m.mpCost <= creature.mp.current
  );
  if (!dmgMoves.length) return getMoveData('basic_attack');
  return dmgMoves.reduce((best, m) =>
    _scoreMoveVsTarget(m, target) > _scoreMoveVsTarget(best, target) ? m : best
  );
}

// ── Status-aware helpers ─────────────────────────────────────────────────────

// Estimated value of each status on the same rough scale as basePower * elementMod.
// Used to decide whether a status move is worth more than attacking this turn.
const _STATUS_VALUES = { stun: 42, silence: 34, poison: 36, burn: 30, blind: 24, slow: 18 };

// Score a single-target status utility move accounting for accuracy and status value.
function _scoreStatusMove(move) {
  const id = move.applyStatus?.id;
  return Math.round((_STATUS_VALUES[id] || 14) * (move.accuracy / 100));
}

// Pick the best target for a hostile single-target status utility move.
// Returns null if every alive target already has that status.
function _pickStatusTarget(statusId, targetSide) {
  const bs = state.battleState;
  const candidates = SLOT_NAMES
    .map(s => ({ slot: s, c: bs[targetSide][s] }))
    .filter(({ c }) => c && !c.isKnockedOut && !hasStatus(c, statusId));

  if (!candidates.length) return null;

  switch (statusId) {
    case 'poison':
    case 'burn':
      // DoT is most impactful against low-HP targets
      candidates.sort((a, b) => a.c.hp.current / a.c.hp.max - b.c.hp.current / b.c.hp.max);
      return candidates[0].slot;
    case 'stun':
      // Neutralise the biggest offensive threat
      candidates.sort((a, b) => {
        const aOff = Math.max(a.c.stats?.strength || 0, a.c.stats?.intelligence || 0);
        const bOff = Math.max(b.c.stats?.strength || 0, b.c.stats?.intelligence || 0);
        return bOff - aOff;
      });
      return candidates[0].slot;
    case 'blind':
      // Prefer physical attackers (blind only affects physical/basic hits)
      candidates.sort((a, b) => (b.c.stats?.strength || 0) - (a.c.stats?.strength || 0));
      return candidates[0].slot;
    case 'slow':
      // Hamstring the fastest target
      candidates.sort((a, b) => (b.c.stats?.speed || 0) - (a.c.stats?.speed || 0));
      return candidates[0].slot;
    case 'silence':
      // Prefer targets that have arts to use (meaningful to silence)
      candidates.sort((a, b) => {
        const aHasArts = (a.c.moves || []).some(m => m.category === 'art' || m.category === 'utility') ? 1 : 0;
        const bHasArts = (b.c.moves || []).some(m => m.category === 'art' || m.category === 'utility') ? 1 : 0;
        return bHasArts - aHasArts;
      });
      return candidates[0].slot;
    default:
      return candidates[0].slot;
  }
}

// Evaluate all affordable single-target hostile status utility moves and return
// the best one if its value beats the bestDmgScore, otherwise null.
function _pickStatusAction(creature, targetSide, bestDmgScore) {
  const statusMoves = creature.moves.filter(m =>
    m.damageClass === 'utility' &&
    m.applyStatus &&
    m.targeting === 'single' &&
    m.mpCost <= creature.mp.current
  );

  let bestScore = bestDmgScore; // only beats damage if it's strictly better
  let bestMove  = null;
  let bestSlot  = null;

  for (const move of statusMoves) {
    const score = _scoreStatusMove(move);
    if (score <= bestScore) continue;
    const tSlot = _pickStatusTarget(move.applyStatus.id, targetSide);
    if (!tSlot) continue; // all targets already have this status
    bestScore = score;
    bestMove  = move;
    bestSlot  = tSlot;
  }

  return bestMove ? { move: bestMove, slot: bestSlot } : null;
}

// Evaluate all_enemies hostile status utility moves (e.g. Dust Cloud).
// Only worthwhile if it would hit at least 2 un-statused targets.
function _pickAoeStatusAction(creature, targetSide, bestDmgScore) {
  const bs = state.battleState;
  const aoeMoves = creature.moves.filter(m =>
    m.damageClass === 'utility' &&
    m.applyStatus &&
    m.targeting === 'all_enemies' &&
    m.mpCost <= creature.mp.current
  );

  for (const move of aoeMoves) {
    const statusId = move.applyStatus.id;
    const freshTargets = SLOT_NAMES.filter(s => {
      const c = bs[targetSide][s];
      return c && !c.isKnockedOut && !hasStatus(c, statusId);
    });
    if (freshTargets.length < 2) continue; // not worth spreading a status only one creature lacks
    const score = Math.round(_STATUS_VALUES[statusId] || 14) * freshTargets.length * (move.accuracy / 100);
    if (score > bestDmgScore) return move;
  }

  return null;
}

// ── Passive check helper ─────────────────────────────────────────────────────

function _hasPassive(creature, id) {
  return (creature.equippedPassives || []).some(p => p.id === id);
}

// ── Chunk 3 — Skills helpers ─────────────────────────────────────────────────

// Estimated effective power for offensive skills (elementally neutral).
// ~36 beats typical neutral attacks (~25) but loses to a strong super-effective hit (25×1.5=37.5)
// so the AI still prefers element-aware damage when it has a real advantage.
const _SKILL_OFFENSIVE_SINGLE   = 36;
const _SKILL_OFFENSIVE_AOE      = 24; // per target; ×alive-count competes with AoE damage
const _SKILL_FINISHER_BASE      = 30;
const _SKILL_FINISHER_KILL_BONUS = 50; // added when any target is < 30% HP

function _getOffensiveSkillScore(skill, creature, targetSide) {
  const bs = state.battleState;
  if (skill.targeting === 'all_enemies') {
    const alive = SLOT_NAMES.filter(s => { const c = bs[targetSide][s]; return c && !c.isKnockedOut; }).length;
    return _SKILL_OFFENSIVE_AOE * Math.max(1, alive);
  }
  if (skill.category === 'finisher') {
    const anyLow = SLOT_NAMES.some(s => {
      const c = bs[targetSide][s];
      return c && !c.isKnockedOut && c.hp.current / c.hp.max < 0.30;
    });
    return anyLow ? _SKILL_FINISHER_BASE + _SKILL_FINISHER_KILL_BONUS : _SKILL_FINISHER_BASE;
  }
  // HP-scaling skills (final_strike family) score higher when the user is low on HP
  if (skill.family === 'final_strike') {
    const missing = 1 - creature.hp.current / creature.hp.max;
    return Math.round(_SKILL_OFFENSIVE_SINGLE * (1 + missing));
  }
  return _SKILL_OFFENSIVE_SINGLE;
}

function _pickFinisherTarget(targetSide) {
  const bs = state.battleState;
  const low = SLOT_NAMES
    .map(s => ({ slot: s, c: bs[targetSide][s] }))
    .filter(({ c }) => c && !c.isKnockedOut && c.hp.current / c.hp.max < 0.30);
  if (low.length) {
    low.sort((a, b) => a.c.hp.current / a.c.hp.max - b.c.hp.current / b.c.hp.max);
    return low[0].slot;
  }
  return pickAiTarget(targetSide);
}

// Target the highest-threat enemy for Challenge, skipping defiant creatures (risky payback).
function _pickChallengeTarget(targetSide) {
  const bs = state.battleState;
  const candidates = SLOT_NAMES
    .map(s => ({ slot: s, c: bs[targetSide][s] }))
    .filter(({ c }) => c && !c.isKnockedOut && !_hasPassive(c, 'defiant'));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aOff = Math.max(a.c.stats?.strength || 0, a.c.stats?.intelligence || 0);
    const bOff = Math.max(b.c.stats?.strength || 0, b.c.stats?.intelligence || 0);
    return bOff - aOff;
  });
  return candidates[0].slot;
}

// Evaluate offensive skills against dmgScore; return action or null.
function _pickBestSkillAction(creature, actorSlot, targetSide, dmgScore) {
  const bs = state.battleState;
  if (!creature.classSkills?.length) return null;

  const usable = creature.classSkills.filter(s =>
    canUseSkill(s, creature, { bs, actorSide: 'opponent' })
  );
  if (!usable.length) return null;

  const mkAction = (skill, tSide, tSlot) => ({
    actorSide: 'opponent', actorSlot,
    commandType: 'skill', moveId: skill.id,
    targetSide: tSide, targetSlot: tSlot,
    speed: getEffectiveSpeed(creature),
  });

  // Challenge: lock down the highest threat (value ≈ disruption; fires only when not already dominated by damage)
  const challengeSkill = usable.find(s => s.id === 'challenge');
  if (challengeSkill && dmgScore < 30) {
    const tSlot = _pickChallengeTarget(targetSide);
    if (tSlot) return mkAction(challengeSkill, targetSide, tSlot);
  }

  let bestScore = dmgScore;
  let bestAction = null;

  for (const skill of usable) {
    if (skill.category !== 'offensive') continue;

    // Don't use courage_strike when HP is below 55% — losing 50% HP would be catastrophic
    if (skill.family === 'courage_strike' && creature.hp.current / creature.hp.max < 0.55) continue;

    let score = _getOffensiveSkillScore(skill, creature, targetSide);

    // Castlebreaker family: boost score when the best target has high DEF stages
    if (skill.family === 'castlebreaker') {
      const highDEF = SLOT_NAMES
        .map(s => ({ slot: s, c: bs[targetSide][s] }))
        .filter(({ c }) => c && !c.isKnockedOut)
        .sort((a, b) => getStatStage(b.c, 'defense') - getStatStage(a.c, 'defense'))[0];
      if (highDEF) {
        const defStage = Math.max(0, getStatStage(highDEF.c, 'defense'));
        score += defStage * 8;
        if (score > bestScore) {
          bestScore = score;
          bestAction = mkAction(skill, targetSide, highDEF.slot);
          continue;
        }
      }
    }

    if (score <= bestScore) continue;
    const tSlot = skill.category === 'finisher'
      ? _pickFinisherTarget(targetSide)
      : (skill.targeting === 'all_enemies' ? null : pickAiTarget(targetSide));
    bestScore = score;
    bestAction = mkAction(skill, targetSide, tSlot);
  }

  return bestAction;
}

// Evaluate setup/self-buff skills — use proactively early game or when healthy.
function _pickSetupSkillAction(creature, actorSlot) {
  const bs = state.battleState;
  if (!creature.classSkills?.length) return null;

  const usable = creature.classSkills.filter(s =>
    s.category === 'setup' &&
    (s.targeting === 'self' || s.targeting === 'all_allies') &&
    canUseSkill(s, creature, { bs, actorSide: 'opponent' })
  );
  if (!usable.length) return null;

  const isEarlyGame = bs.round <= 2;
  if (!isEarlyGame && creature.hp.current / creature.hp.max < 0.60) return null;

  for (const skill of usable) {
    // Don't re-buff if the route's primary offensive stat is already at +3 or higher
    const primaryStat = { strength: 'strength', defense: 'defense', intelligence: 'intelligence', spirit: 'spirit', speed: 'speed' }[skill.classRoute];
    if (primaryStat && getStatStage(creature, primaryStat) >= 3) continue;
    const tSlot = skill.targeting === 'all_allies' ? null : actorSlot;
    return { actorSide: 'opponent', actorSlot, commandType: 'skill', moveId: skill.id, targetSide: 'opponent', targetSlot: tSlot, speed: getEffectiveSpeed(creature) };
  }
  return null;
}

// Evaluate defensive reactive skills — use when HP is low or outnumbered.
function _pickDefensiveSkillAction(creature, actorSlot) {
  const bs = state.battleState;
  if (!creature.classSkills?.length) return null;

  const usable = creature.classSkills.filter(s =>
    s.category === 'defensive' &&
    s.targeting === 'self' &&
    canUseSkill(s, creature, { bs, actorSide: 'opponent' })
  );
  if (!usable.length) return null;

  const hpRatio     = creature.hp.current / creature.hp.max;
  const aliveEnemies = SLOT_NAMES.filter(s => { const c = bs.player[s];    return c && !c.isKnockedOut; }).length;
  const aliveAllies  = SLOT_NAMES.filter(s => { const c = bs.opponent[s];  return c && !c.isKnockedOut; }).length;
  const outnumbered  = aliveEnemies > aliveAllies;

  if (hpRatio >= 0.40 && !outnumbered) return null;

  const skill = usable[0];
  return { actorSide: 'opponent', actorSlot, commandType: 'skill', moveId: skill.id, targetSide: 'opponent', targetSlot: actorSlot, speed: getEffectiveSpeed(creature) };
}

// Recovery skills (Recover I/II/III etc.) — supplement move-based self-heal.
function _pickRecoverySkillAction(creature, actorSlot, hpThreshold) {
  const bs = state.battleState;
  if (!creature.classSkills?.length) return null;
  if (creature.hp.current / creature.hp.max >= hpThreshold) return null;

  const skill = creature.classSkills.find(s =>
    s.category === 'recovery' &&
    s.targeting === 'self' &&
    canUseSkill(s, creature, { bs, actorSide: 'opponent' })
  );
  if (!skill) return null;

  return { actorSide: 'opponent', actorSlot, commandType: 'skill', moveId: skill.id, targetSide: 'opponent', targetSlot: actorSlot, speed: getEffectiveSpeed(creature) };
}

// ── Main AI decision ─────────────────────────────────────────────────────────

function buildAiAction(creature, slot) {
  const bs = state.battleState;
  const silenced = hasStatus(creature, 'silence');

  // ── Chunk 4: Passive-adjusted behaviour ─────────────────────────────────────
  const hasSurvivalPassive = _hasPassive(creature, 'indestructible') || _hasPassive(creature, 'resilient') || _hasPassive(creature, 'resilient_2');
  const hasDefiantPassive  = _hasPassive(creature, 'defiant');
  // Survival passives lower the panic-heal threshold (the creature can take more punishment)
  const healThreshold = hasSurvivalPassive ? 0.35 : 0.50;

  // Challenge taunt: forced to target the challenger if still alive
  if (creature.isChallengedBy) {
    const { side: cSide, slot: cSlot } = creature.isChallengedBy;
    const challenger = bs[cSide]?.[cSlot];
    if (challenger && !challenger.isKnockedOut) {
      const move = _pickBestMoveVsTarget(creature, challenger);
      return { actorSide: 'opponent', actorSlot: slot, commandType: move.category === 'art' ? 'art' : 'attack', moveId: move.id, targetSide: cSide, targetSlot: cSlot, speed: getEffectiveSpeed(creature) };
    }
    creature.isChallengedBy = null;
  }

  if (!silenced) {
    // [Chunk 3] Recovery skills supplement move-based self-heal
    const recoverAction = _pickRecoverySkillAction(creature, slot, healThreshold);
    if (recoverAction) return recoverAction;

    // Self-heal move: skip if silenced; Defiant passive keeps AI aggressive unless critically low
    const shouldSelfHeal = hasDefiantPassive
      ? creature.hp.current / creature.hp.max < 0.30
      : creature.hp.current / creature.hp.max < healThreshold;
    const selfHealMove = creature.moves.find(m => m.damageClass === 'heal' && m.targeting === 'self' && m.mpCost <= creature.mp.current);
    if (selfHealMove && shouldSelfHeal) {
      return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: selfHealMove.id, targetSide: 'opponent', targetSlot: slot, speed: getEffectiveSpeed(creature) };
    }

    // [Chunk 3] Setup self-buff skills — proactive early game or when healthy
    const setupAction = _pickSetupSkillAction(creature, slot);
    if (setupAction) return setupAction;

    // Ally-heal: use on the most-hurt teammate below 50% HP
    const allyHealMove = creature.moves.find(m => m.damageClass === 'heal' && m.targeting === 'single_ally' && m.mpCost <= creature.mp.current);
    if (allyHealMove) {
      const hurtAlly = SLOT_NAMES
        .map(s => bs.opponent[s])
        .filter(c => c && !c.isKnockedOut && c.hp.current / c.hp.max < 0.5)
        .sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0];
      if (hurtAlly) {
        return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: allyHealMove.id, targetSide: 'opponent', targetSlot: hurtAlly.slot, speed: getEffectiveSpeed(creature) };
      }
    }
  }

  // [Chunk 3] Defensive reactive skills — not gated by silence (physical stances don't use arts)
  const defensiveAction = _pickDefensiveSkillAction(creature, slot);
  if (defensiveAction) return defensiveAction;

  // Element-aware best damage move (establishes baseline score for status/skill comparison)
  const { bestMove: dmgMove, bestTargetSlot: dmgSlot, bestScore: dmgScore } = _pickBestDamageAction(creature, 'player');

  // Status utility moves (only if not silenced — utility is an art-category action)
  if (!silenced) {
    // AoE status first (e.g. Dust Cloud) — high value when it hits multiple fresh targets
    const aoeStat = _pickAoeStatusAction(creature, 'player', dmgScore);
    if (aoeStat) {
      return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: aoeStat.id, targetSide: 'player', targetSlot: null, speed: getEffectiveSpeed(creature) };
    }

    // Single-target status if it beats the best damage option
    const singleStat = _pickStatusAction(creature, 'player', dmgScore);
    if (singleStat) {
      return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: singleStat.move.id, targetSide: 'player', targetSlot: singleStat.slot, speed: getEffectiveSpeed(creature) };
    }
  }

  // [Chunk 3] Offensive skills competing with best damage move score
  const offSkillAction = _pickBestSkillAction(creature, slot, 'player', dmgScore);
  if (offSkillAction) return offSkillAction;

  // Fall through to best damage move
  const move = dmgMove || getMoveData('basic_attack');
  const targetSlot = dmgMove
    ? (dmgSlot ?? null)
    : pickAiTarget('player');
  return {
    actorSide: 'opponent',
    actorSlot: slot,
    commandType: move.category === 'art' ? 'art' : 'attack',
    moveId: move.id,
    targetSide: 'player',
    targetSlot,
    speed: getEffectiveSpeed(creature),
  };
}

function pickAiTarget(side) {
  return SLOT_NAMES
    .filter(s => { const c = state.battleState[side][s]; return c && !c.isKnockedOut; })
    .sort((a, b) => state.battleState[side][a].hp.current - state.battleState[side][b].hp.current)[0] || 'top';
}
