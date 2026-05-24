// ── Animation Engine ──────────────────────────────────────────────────────
// Timeline runner for move animations. Executes a timestamped event list
// and resolves when all events (including their animation durations) finish.
//
// Depends on: animation-components.js (must load first)
//
// Public API:
//   getCreatureCenter(side, slot) → { x, y }  — field-relative px coords
//   runAnimTimeline(timeline, context)          — runs a move's timeline array
//
// Timeline event types:
//   creature_anim  — CSS class animation on actor or target creature element
//   projectile     — spawns a projectile that travels from → to
//   beam           — stretching beam line from → to
//   particle_burst — N particles radiating from an origin point
//   field_flash    — brief color overlay over the whole field
//   screen_shake   — jitters the battle field
//   creature_shake — jitters a single creature element
//   sound          — fires a sound effect (with optional repeat)
//   preset         — references a named preset from ANIM_PRESETS
//   impact         — signals when damage resolves and float text shows
// ─────────────────────────────────────────────────────────────────────────

// ── Public coordinate helper ─────────────────────────────────────────────

// Returns the center of a creature element in overlay-relative px coords.
// Useful for the animation editor and for manual event targeting.
function getCreatureCenter(side, slot) {
  const overlay = getAnimOverlay();
  const el = document.querySelector(`[data-creature="${side}-${slot}"]`);
  if (!el || !overlay) return { x: 0, y: 0 };
  return getElementCenter(el, overlay);
}

// ── Internal helpers ─────────────────────────────────────────────────────

function _resolveEl(target, actorSide, actorSlot, targetSide, targetSlot) {
  if (target === 'actor') {
    return document.querySelector(`[data-creature="${actorSide}-${actorSlot}"]`);
  }
  if (target === 'target' && targetSide && targetSlot) {
    return document.querySelector(`[data-creature="${targetSide}-${targetSlot}"]`);
  }
  return null;
}

function _getTargetCoords(result, action) {
  return {
    side: result.targetSide || action?.targetSide || null,
    slot: result.targetSlot || action?.targetSlot || null,
  };
}

// ── Event executor ───────────────────────────────────────────────────────

function _executeTimelineEvent(event, context) {
  const { actorSide, actorSlot, result, action } = context;
  const { side: targetSide, slot: targetSlot } = _getTargetCoords(result, action);

  const actorEl  = document.querySelector(`[data-creature="${actorSide}-${actorSlot}"]`);
  const targetEl = targetSide && targetSlot
    ? document.querySelector(`[data-creature="${targetSide}-${targetSlot}"]`)
    : null;

  switch (event.type) {

    case 'creature_anim': {
      const el = _resolveEl(event.target, actorSide, actorSlot, targetSide, targetSlot);
      if (!el) return Promise.resolve();
      let cssVars = event.cssVars;
      if (event.lunge && targetSide && targetSlot) {
        const targetEl = document.querySelector(`[data-creature="${targetSide}-${targetSlot}"]`);
        if (targetEl) cssVars = { ...cssVars, ...getLungeVars(el, targetEl) };
      }
      return animateEl(el, event.class, cssVars);
    }

    case 'projectile': {
      const fromEl = _resolveEl(event.from, actorSide, actorSlot, targetSide, targetSlot);
      const toEl   = _resolveEl(event.to,   actorSide, actorSlot, targetSide, targetSlot);
      return animProjectile(fromEl, toEl, event);
    }

    case 'beam': {
      const fromEl = _resolveEl(event.from, actorSide, actorSlot, targetSide, targetSlot);
      const toEl   = _resolveEl(event.to,   actorSide, actorSlot, targetSide, targetSlot);
      return animBeam(fromEl, toEl, event);
    }

    case 'particle_burst': {
      const originEl = _resolveEl(event.origin, actorSide, actorSlot, targetSide, targetSlot);
      return animParticleBurst(originEl, event);
    }

    case 'field_flash':    return animFieldFlash(event);
    case 'screen_shake':   return animScreenShake(event);

    case 'creature_shake': {
      const el = _resolveEl(event.target, actorSide, actorSlot, targetSide, targetSlot);
      return animCreatureShake(el, event);
    }

    case 'sound': {
      const repeat   = event.repeat   ?? 1;
      const interval = event.interval ?? 0;
      for (let i = 0; i < repeat; i++) {
        setTimeout(() => playSfx(event.id), i * interval);
      }
      return Promise.resolve();
    }

    case 'preset': {
      const preset = typeof ANIM_PRESETS !== 'undefined' ? ANIM_PRESETS[event.id] : null;
      if (!preset) {
        console.warn(`[anim-engine] unknown preset: "${event.id}"`);
        return Promise.resolve();
      }
      // Merge preset definition with any per-event overrides, then execute
      return _executeTimelineEvent({ ...preset, ...event, type: preset.type }, context);
    }

    case 'status_ring': {
      const el = _resolveEl(event.target, actorSide, actorSlot, targetSide, targetSlot);
      if (!el) return Promise.resolve();
      const ctrl = animStatusRing(el, { color: event.color ?? '#ffffff' });
      const dur = event.duration ?? 600;
      setTimeout(() => ctrl.clear(), dur);
      return Promise.resolve();
    }

    // 'impact' is handled by the caller (runAnimTimeline) before this function runs
    default:
      return Promise.resolve();
  }
}

// ── runAnimTimeline ──────────────────────────────────────────────────────
// Runs a move's timeline array and returns a Promise that resolves with
// the final result once all events and their animations are complete.
//
// context:
//   actorSide   'player' | 'opponent'
//   actorSlot   slot name string
//   result      battle result object from battle-engine
//   action      action object from battle-round
//   options     { onImpact } — same options shape as playMoveAnimation
//
// The 'impact' event in the timeline is the single source of truth for
// when onImpact() is called and float texts are shown. If no 'impact'
// event exists, both fire after all events complete (safe fallback).

function runAnimTimeline(timeline, context) {
  return new Promise(resolve => {
    let finalResult  = context.result;
    let impactDone   = false;
    let floatDone    = false;

    function fireImpact() {
      if (impactDone) return;
      impactDone = true;
      finalResult = context.options?.onImpact ? context.options.onImpact() : finalResult;
    }

    function fireFloatTexts() {
      if (floatDone) return;
      floatDone = true;
      showResultFloatTexts(finalResult, context.action);
    }

    const allPromises = timeline.map(event =>
      delayMs(event.at).then(() => {
        if (event.type === 'impact') {
          fireImpact();
          fireFloatTexts();
          return;
        }
        return _executeTimelineEvent(event, context);
      })
    );

    Promise.all(allPromises).then(() => {
      // Fallback: fire impact/floats if no 'impact' event was in the timeline
      fireImpact();
      fireFloatTexts();
      resolve(finalResult);
    });
  });
}
