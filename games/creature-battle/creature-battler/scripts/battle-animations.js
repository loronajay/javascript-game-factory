const MOVE_ANIM_REGISTRY = {};

function registerMoveAnimations(map) {
  Object.assign(MOVE_ANIM_REGISTRY, map);
}

function animateEl(el, className, cssVars) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove(className);
      if (cssVars) {
        for (const key of Object.keys(cssVars)) el.style.removeProperty(key);
      }
      resolve();
    };
    if (cssVars) {
      for (const [key, val] of Object.entries(cssVars)) el.style.setProperty(key, val);
    }
    el.classList.add(className);
    el.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 1200);
  });
}

function delayMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getLungeVars(actorEl, targetEl) {
  const ar = actorEl.getBoundingClientRect();
  const tr = targetEl.getBoundingClientRect();
  return {
    '--anim-dx': `${Math.round((tr.left + tr.width  / 2) - (ar.left + ar.width  / 2))}px`,
    '--anim-dy': `${Math.round((tr.top  + tr.height / 2) - (ar.top  + ar.height / 2))}px`,
  };
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

function playMoveAnimation(result, action, onDone) {
  if (!action || result.type === 'skipped') { onDone(); return; }

  const entry   = MOVE_ANIM_REGISTRY[action.moveId];
  const actorEl = document.querySelector(`[data-creature="${action.actorSide}-${action.actorSlot}"]`);

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

      if (result.type === 'damage' || result.type === 'crit') {
        const targetEl = document.querySelector(`[data-creature="${result.targetSide}-${result.targetSlot}"]`);
        if (targetEl) {
          promises.push(
            delayMs(hitDelay).then(() => {
              if (entry.hitSound) playSfx(entry.hitSound);
              return animateEl(targetEl, entry.hit);
            })
          );
        }
      }

      if (result.type === 'multi') {
        result.hits.forEach((hit, i) => {
          if (!hit.missed) {
            const targetEl = document.querySelector(`[data-creature="${result.targetSide}-${hit.slot}"]`);
            if (targetEl) {
              promises.push(
                delayMs(hitDelay + i * 100).then(() => {
                  if (entry.hitSound) playSfx(entry.hitSound);
                  return animateEl(targetEl, entry.hit);
                })
              );
            }
          }
        });
      }
    }

    if (!promises.length) { onDone(); return; }
    Promise.all(promises).then(onDone);
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
