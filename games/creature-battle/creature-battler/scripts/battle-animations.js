// animateEl and delayMs live in animation-components.js (loaded before this file).
// They are globals; nothing here needs to redeclare them.

const MOVE_ANIM_REGISTRY = {};

function registerMoveAnimations(map) {
  Object.assign(MOVE_ANIM_REGISTRY, map);
}

function getResultFloatSpecs(result, action) {
  function targetSpec(side, slot, text, kind) {
    if (!side || !slot) return null;
    return { side, slot, text, kind };
  }

  if (result.type === 'miss') {
    return [targetSpec(result.targetSide || action?.targetSide, result.targetSlot || action?.targetSlot, 'MISS!', 'miss')].filter(Boolean);
  }

  if (result.type === 'damage' || result.type === 'crit') {
    return [
      targetSpec(result.targetSide, result.targetSlot, `${result.amount}`, result.type === 'crit' || result.isCrit ? 'crit' : 'damage'),
      result.statusText ? targetSpec(result.targetSide, result.targetSlot, result.statusText, 'status') : null,
    ].filter(Boolean);
  }

  if (result.type === 'heal') {
    return [targetSpec(result.targetSide || action?.targetSide, result.targetSlot || action?.targetSlot, `+${result.amount}`, 'heal')].filter(Boolean);
  }

  if (result.type === 'defend' || result.type === 'utility') {
    return [targetSpec(result.targetSide || action?.actorSide, result.targetSlot || action?.actorSlot, result.statusText || (result.type === 'defend' ? 'GUARD' : 'BUFF'), 'status')].filter(Boolean);
  }

  if (result.type === 'multi') {
    return result.hits.map(hit => {
      if (hit.missed) return targetSpec(result.targetSide, hit.slot, 'MISS!', 'miss');
      if (result.damageClass === 'heal') return targetSpec(result.targetSide, hit.slot, `+${hit.amount}`, 'heal');
      return targetSpec(result.targetSide, hit.slot, `${hit.amount}`, hit.isCrit ? 'crit' : 'damage');
    }).filter(Boolean);
  }

  return [];
}

function showBattleFloatText(side, slot, text, kind, index = 0) {
  const targetEl = document.querySelector(`[data-creature="${side}-${slot}"]`);
  if (!targetEl) return;
  const popup = document.createElement('div');
  popup.className = `battle-float-text ${kind}`;
  popup.textContent = text;
  popup.style.setProperty('--float-index', index);
  targetEl.appendChild(popup);
  popup.addEventListener('animationend', () => popup.remove(), { once: true });
  setTimeout(() => popup.remove(), 1200);
}

function showResultFloatTexts(result, action) {
  getResultFloatSpecs(result, action).forEach((spec, i) => {
    showBattleFloatText(spec.side, spec.slot, spec.text, spec.kind, i);
  });
}

function getMultiHitFloatSpec(result, hit) {
  if (hit.missed) return { side: result.targetSide, slot: hit.slot, text: 'MISS!', kind: 'miss' };
  if (result.damageClass === 'heal') return { side: result.targetSide, slot: hit.slot, text: `+${hit.amount}`, kind: 'heal' };
  return { side: result.targetSide, slot: hit.slot, text: `${hit.amount}`, kind: hit.isCrit ? 'crit' : 'damage' };
}


function getLungeTarget(result, action) {
  if (result.type === 'damage' || result.type === 'crit') {
    return { side: result.targetSide, slot: result.targetSlot };
  }
  if (result.type === 'miss' && action.targetSide && action.targetSlot) {
    return { side: action.targetSide, slot: action.targetSlot };
  }
  return null;
}

function playMoveAnimation(result, action, onDone, options) {
  if (!action || result.type === 'skipped') { onDone(); return; }

  const entry = MOVE_ANIM_REGISTRY[action.moveId];

  // ── New timeline format ────────────────────────────────────────────────
  // If the registry entry has a timeline array, hand off to the engine.
  // The legacy { cast, hit, hitDelay } path below handles all existing moves.
  if (entry?.timeline) {
    runAnimTimeline(entry.timeline, {
      actorSide: action.actorSide,
      actorSlot: action.actorSlot,
      result,
      action,
      options,
    }).then(finalResult => onDone(finalResult));
    return;
  }

  // ── Legacy format (CSS-class only) ────────────────────────────────────
  const actorEl = document.querySelector(`[data-creature="${action.actorSide}-${action.actorSlot}"]`);
  let finalResult = result;
  let impactResolved = false;
  let floatTextShown = false;

  function resolveImpact() {
    if (!impactResolved) {
      impactResolved = true;
      finalResult = options?.onImpact ? options.onImpact() : finalResult;
    }
    return finalResult;
  }

  function showFloatTextsOnce(impactResult) {
    if (floatTextShown) return;
    floatTextShown = true;
    showResultFloatTexts(impactResult, action);
  }

  // Compute lunge vars once up front so they're ready for both charge and cast phases
  let cssVars;
  if (entry?.lunge && actorEl) {
    const lungeTarget = getLungeTarget(result, action);
    if (lungeTarget) {
      const targetEl = document.querySelector(`[data-creature="${lungeTarget.side}-${lungeTarget.slot}"]`);
      if (targetEl) cssVars = getLungeVars(actorEl, targetEl);
    }
  }

  function runCastAndHit() {
    const promises = [];

    if (actorEl && entry?.cast) {
      if (entry.castSound) playSfx(entry.castSound);
      promises.push(animateEl(actorEl, entry.cast, cssVars));
    }

    if (entry?.hit) {
      const hitDelay = entry.hitDelay ?? 200;

      promises.push(
        delayMs(hitDelay).then(() => {
          const impactResult = resolveImpact();

          if (impactResult.type === 'damage' || impactResult.type === 'crit') {
            const targetEl = document.querySelector(`[data-creature="${impactResult.targetSide}-${impactResult.targetSlot}"]`);
            if (!targetEl) return null;
            showFloatTextsOnce(impactResult);
            if (entry.hitSound) playSfx(entry.hitSound);
            return animateEl(targetEl, entry.hit);
          }

          if (impactResult.type === 'miss') {
            showFloatTextsOnce(impactResult);
            return null;
          }

          if (impactResult.type === 'defend') {
            showFloatTextsOnce(impactResult);
            CreatureState.setDefend(impactResult.targetSide, impactResult.targetSlot);
            return null;
          }

          if (impactResult.type === 'heal' || impactResult.type === 'utility') {
            showFloatTextsOnce(impactResult);
            if (entry.hit && impactResult.targetSide && impactResult.targetSlot) {
              const tgtEl = document.querySelector(`[data-creature="${impactResult.targetSide}-${impactResult.targetSlot}"]`);
              if (tgtEl) { if (entry.hitSound) playSfx(entry.hitSound); return animateEl(tgtEl, entry.hit); }
            }
            return null;
          }

          if (impactResult.type === 'multi_hit') {
            floatTextShown = true;
            const tgtEl = document.querySelector(`[data-creature="${impactResult.targetSide}-${impactResult.targetSlot}"]`);
            return Promise.all(impactResult.hits.map((hit, i) =>
              delayMs(i * 140).then(() => {
                if (hit.missed) { showBattleFloatText(impactResult.targetSide, impactResult.targetSlot, 'MISS!', 'miss', i); return null; }
                showBattleFloatText(impactResult.targetSide, impactResult.targetSlot, `${hit.damage}`, hit.isCrit ? 'crit' : 'damage', i);
                if (!tgtEl) return null;
                if (entry.hitSound) playSfx(entry.hitSound);
                return animateEl(tgtEl, entry.hit);
              })
            ));
          }

          if (impactResult.type === 'multi') {
            floatTextShown = true;
            const hitPromises = impactResult.hits.map((hit, i) => {
              return delayMs(i * 100).then(() => {
                const spec = getMultiHitFloatSpec(impactResult, hit);
                showBattleFloatText(spec.side, spec.slot, spec.text, spec.kind);
                if (hit.missed) return null;
                const targetEl = document.querySelector(`[data-creature="${impactResult.targetSide}-${hit.slot}"]`);
                if (!targetEl) return null;
                if (entry.hitSound) playSfx(entry.hitSound);
                return animateEl(targetEl, entry.hit);
              });
            });
            return Promise.all(hitPromises);
          }

          return null;
        })
      );
    }

    if (!promises.length) {
      resolveImpact();
      showFloatTextsOnce(finalResult);
      onDone(finalResult);
      return;
    }
    Promise.all(promises).then(() => {
      resolveImpact();
      showFloatTextsOnce(finalResult);
      onDone(finalResult);
    });
  }

  // If the move has a charge phase, run it first then hand off to cast+hit
  if (entry?.chargeClass && actorEl) {
    const count    = entry.chargeSoundCount    ?? 1;
    const interval = entry.chargeSoundInterval ?? 150;
    const sound    = entry.chargeSound         ?? 'charge-light';
    for (let i = 0; i < count; i++) {
      setTimeout(() => playSfx(sound), i * interval);
    }
    animateEl(actorEl, entry.chargeClass).then(runCastAndHit);
  } else {
    runCastAndHit();
  }
}
