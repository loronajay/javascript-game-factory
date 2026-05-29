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
//   status_ring    — timed glow ring on actor/target (auto-clears after duration)
//   wave_sweep     — expanding wave that travels from actor toward target side
//   particle_stream — sustained particle emitter for duration ms (non-blocking)
//   shockwave      — expanding impact ring at actor or target position
//   creature_tint  — temporary elemental color overlay on a creature sprite
//   hit_stop       — freeze-frame pause on heavy impacts
//   spinning_ring  — elliptical spinning ring at origin (vortex / whirlpool)
//   wall_slam      — row of rising slabs at origin (ice wall / earth spikes)
//   float_text     — show custom float text on actor or target (text, kind, index)
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

// Returns all alive creature elements on a given side. Used to fan out
// target-referencing effects for AoE moves (targetSide set, targetSlot null).
// Excludes creatures already marked .ko so previous-round corpses don't receive effects.
function _resolveAoeTargetEls(targetSide) {
  return Array.from(document.querySelectorAll(`[data-creature^="${targetSide}-"]`))
    .filter(el => !el.classList.contains('ko'));
}

// True when an event field references 'target' and the move is AoE
// (targetSide known but targetSlot null — the fan-out condition).
function _isAoeTarget(field, targetSide, targetSlot) {
  return field === 'target' && !!targetSide && !targetSlot;
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
      // AoE fan-out: fire hit animation on every alive target simultaneously.
      // Lunge is skipped for AoE — there is no single destination to dash toward.
      if (_isAoeTarget(event.target, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animateEl(el, event.class, event.cssVars)));
      }
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
      // AoE fan-out: a separate projectile flies to each alive target.
      if (_isAoeTarget(event.to, targetSide, targetSlot)) {
        const fromEl = _resolveEl(event.from, actorSide, actorSlot, targetSide, targetSlot);
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animProjectile(fromEl, el, event)));
      }
      const fromEl = _resolveEl(event.from, actorSide, actorSlot, targetSide, targetSlot);
      const toEl   = _resolveEl(event.to,   actorSide, actorSlot, targetSide, targetSlot);
      return animProjectile(fromEl, toEl, event);
    }

    case 'beam': {
      // AoE fan-out: a beam extends to each alive target simultaneously.
      if (_isAoeTarget(event.to, targetSide, targetSlot)) {
        const fromEl = _resolveEl(event.from, actorSide, actorSlot, targetSide, targetSlot);
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animBeam(fromEl, el, event)));
      }
      const fromEl = _resolveEl(event.from, actorSide, actorSlot, targetSide, targetSlot);
      const toEl   = _resolveEl(event.to,   actorSide, actorSlot, targetSide, targetSlot);
      return animBeam(fromEl, toEl, event);
    }

    case 'particle_burst': {
      if (_isAoeTarget(event.origin, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animParticleBurst(el, event)));
      }
      const originEl = _resolveEl(event.origin, actorSide, actorSlot, targetSide, targetSlot);
      return animParticleBurst(originEl, event);
    }

    case 'field_flash':    return animFieldFlash(event);
    case 'screen_shake':   return animScreenShake(event);

    case 'creature_shake': {
      if (_isAoeTarget(event.target, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animCreatureShake(el, event)));
      }
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

    case 'wave_sweep': {
      const fromEl = _resolveEl('actor', actorSide, actorSlot, targetSide, targetSlot);
      const dir = actorSide === 'player' ? 1 : -1;
      return animWaveSweep(fromEl, { ...event, direction: dir });
    }

    case 'particle_stream': {
      // AoE fan-out: non-blocking stream fires at each alive target.
      if (_isAoeTarget(event.origin, targetSide, targetSlot)) {
        _resolveAoeTargetEls(targetSide).forEach(el => animParticleStream(el, event));
        return Promise.resolve();
      }
      const originEl = _resolveEl(event.origin, actorSide, actorSlot, targetSide, targetSlot);
      animParticleStream(originEl, event);
      return Promise.resolve();
    }

    case 'shockwave': {
      if (_isAoeTarget(event.origin, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animShockwave(el, event)));
      }
      const originEl = _resolveEl(event.origin, actorSide, actorSlot, targetSide, targetSlot);
      return animShockwave(originEl, event);
    }

    case 'creature_tint': {
      if (_isAoeTarget(event.target, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animCreatureTint(el, event)));
      }
      const el = _resolveEl(event.target, actorSide, actorSlot, targetSide, targetSlot);
      return animCreatureTint(el, event);
    }

    case 'spinning_ring': {
      if (_isAoeTarget(event.origin, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animSpinningRing(el, event)));
      }
      const originEl   = _resolveEl(event.origin,   actorSide, actorSlot, targetSide, targetSlot);
      const travelToEl = event.travelTo
        ? _resolveEl(event.travelTo, actorSide, actorSlot, targetSide, targetSlot)
        : null;
      return animSpinningRing(originEl, { ...event, travelToEl });
    }

    case 'wall_slam': {
      if (_isAoeTarget(event.origin, targetSide, targetSlot)) {
        return Promise.all(_resolveAoeTargetEls(targetSide).map(el => animWallSlam(el, event)));
      }
      const originEl = _resolveEl(event.origin, actorSide, actorSlot, targetSide, targetSlot);
      return animWallSlam(originEl, event);
    }

    case 'hit_stop':
      return animHitStop(event);

    case 'float_text': {
      const el = _resolveEl(event.target, actorSide, actorSlot, targetSide, targetSlot);
      if (!el) return Promise.resolve();
      const creature  = el.dataset.creature;
      const dashIdx   = creature.indexOf('-');
      const side      = creature.slice(0, dashIdx);
      const slot      = creature.slice(dashIdx + 1);
      showBattleFloatText(side, slot, event.text, event.kind ?? 'status', event.index ?? 0);
      return Promise.resolve();
    }

    case 'status_ring': {
      const wireRing = el => {
        if (!el) return;
        const ctrl = animStatusRing(el, { color: event.color ?? '#ffffff' });
        setTimeout(() => ctrl.clear(), event.duration ?? 600);
      };
      if (_isAoeTarget(event.target, targetSide, targetSlot)) {
        _resolveAoeTargetEls(targetSide).forEach(wireRing);
        return Promise.resolve();
      }
      wireRing(_resolveEl(event.target, actorSide, actorSlot, targetSide, targetSlot));
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
