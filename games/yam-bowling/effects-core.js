(function exposeEffectsCore(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const api = factory();
  if (isCommonJs) module.exports = api;
  root.YamEffects = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEffectsCore() {
  "use strict";

  // Equippable visual effects: ball trails and strike bursts.
  //
  // This module is presentation and nothing else. It knows lane coordinates
  // (x across, z down the lane) because that is what the renderer projects, and
  // it deliberately knows nothing about physics, shots, scoring or the deck
  // simulation -- it is only ever handed a position that has already been
  // decided. Keeping it that way is what makes the milestone's "effects never
  // alter trajectory, collision, timing or server shot inputs" rule checkable
  // instead of aspirational: there is no import through which it could.
  //
  // It is also deterministic. Randomness comes from a seeded generator carried
  // on the state, never from `Math.random`, so a scatter can be asserted
  // exactly in a test and a particle budget can be regression-tested.

  const MAX_TRAIL_PARTICLES = 48;
  const MAX_BURST_PARTICLES = 36;

  const TRAIL_EMIT_PER_SECOND = 60;
  const TRAIL_LIFE = 0.45;
  const BURST_LIFE = 0.7;
  const FLASH_LIFE = 0.5;

  // Reduced motion keeps the equipped cosmetic legible -- a player who earned a
  // trail should still see they are wearing it -- while dropping the density
  // and the outward motion that cause the discomfort.
  const REDUCED_EMIT_SCALE = 0.25;
  const REDUCED_BURST_COUNT = 6;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // A small deterministic generator. Seeded per state so two states with the
  // same seed and the same inputs produce byte-identical particles.
  function nextRandom(state) {
    state.seed = (state.seed * 1664525 + 1013904223) % 4294967296;
    return state.seed / 4294967296;
  }

  function round(value) {
    // Normalizing -0 to 0 keeps particles comparable in tests and keeps a
    // still (reduced-motion) particle from carrying a signed zero velocity.
    const rounded = Math.round(value * 10000) / 10000;
    return rounded === 0 ? 0 : rounded;
  }

  // An item's palette is the only render config the catalog carries, which is
  // why a new effect is a catalog row rather than a code change here. The
  // explicit "none" trail resolves to null: no style, no emission.
  function styleForItem(item) {
    if (!item) return null;
    const palette = Array.isArray(item.assets?.palette) ? item.assets.palette : null;
    if (!palette || !palette.length) return null;
    return Object.freeze({ id: item.id, palette: Object.freeze([...palette]) });
  }

  function createEffectsState(seed = 1) {
    return {
      trail: [],
      burst: [],
      flash: 0,
      lastBurstKey: "",
      emitAccumulator: 0,
      seed: Math.abs(Math.floor(seed)) % 4294967296 || 1,
    };
  }

  function makeParticle({ x, z, vx, vz, life, size, color }) {
    return {
      x: round(x),
      z: round(z),
      vx: round(vx),
      vz: round(vz),
      age: 0,
      life: round(life),
      size: round(size),
      color,
    };
  }

  function pickColor(state, style) {
    return style.palette[Math.floor(nextRandom(state) * style.palette.length) % style.palette.length];
  }

  // Dropping the OLDEST particle keeps the budget without making the effect
  // stutter: the tail end is the faintest part of it.
  function pushBounded(list, particle, max) {
    list.push(particle);
    while (list.length > max) list.shift();
  }

  function emitTrail(state, { x, z, dt, style, reducedMotion = false }) {
    if (!style || !Number.isFinite(dt) || dt <= 0) return 0;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;

    const rate = TRAIL_EMIT_PER_SECOND * (reducedMotion ? REDUCED_EMIT_SCALE : 1);
    state.emitAccumulator += rate * dt;

    // Bounded per call as well as in total, so a pathological dt cannot spend
    // the whole budget inside one tick.
    const requested = Math.min(Math.floor(state.emitAccumulator), MAX_TRAIL_PARTICLES);
    state.emitAccumulator -= requested;

    for (let i = 0; i < requested; i += 1) {
      const jitter = reducedMotion ? 0 : (nextRandom(state) - 0.5) * 0.012;
      const drift = reducedMotion ? 0 : (nextRandom(state) - 0.5) * 0.05;
      pushBounded(state.trail, makeParticle({
        x: x + jitter,
        z,
        vx: drift,
        vz: 0,
        life: TRAIL_LIFE * (reducedMotion ? 0.7 : 1),
        size: reducedMotion ? 0.5 : 0.6 + nextRandom(state) * 0.5,
        color: pickColor(state, style),
      }), MAX_TRAIL_PARTICLES);
    }
    return requested;
  }

  // `key` identifies the roll that earned the burst. An online snapshot can be
  // replayed and a match can be resumed, both of which hand us the same roll
  // again; keying the trigger is what makes the effect fire exactly once. A
  // roll we cannot identify never fires, because firing twice reads worse than
  // not firing at all.
  function triggerBurst(state, { x, z, key, style, reducedMotion = false }) {
    if (!style || typeof key !== "string" || !key) return false;
    if (key === state.lastBurstKey) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

    state.lastBurstKey = key;
    const count = reducedMotion ? REDUCED_BURST_COUNT : 24;

    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const speed = reducedMotion ? 0 : 0.28 + nextRandom(state) * 0.5;
      pushBounded(state.burst, makeParticle({
        x,
        z,
        vx: Math.cos(angle) * speed * 0.6,
        vz: Math.sin(angle) * speed * 0.18,
        life: BURST_LIFE * (reducedMotion ? 0.8 : 1),
        size: reducedMotion ? 0.7 : 0.8 + nextRandom(state) * 0.7,
        color: pickColor(state, style),
      }), MAX_BURST_PARTICLES);
    }

    // The reduced-motion replacement: a soft ring flash instead of the spray.
    state.flash = reducedMotion ? FLASH_LIFE : 0;
    return true;
  }

  function advanceList(list, dt) {
    let write = 0;
    for (let read = 0; read < list.length; read += 1) {
      const particle = list[read];
      particle.age += dt;
      if (particle.age >= particle.life) continue;
      particle.x = round(particle.x + particle.vx * dt);
      particle.z = round(particle.z + particle.vz * dt);
      list[write] = particle;
      write += 1;
    }
    list.length = write;
  }

  function advance(state, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return state;
    advanceList(state.trail, dt);
    advanceList(state.burst, dt);
    state.flash = Math.max(0, state.flash - dt);
    return state;
  }

  // Opacity is a render concern, but the fade curve belongs with the lifetime
  // that produces it, so both sides agree on when a particle is gone.
  function particleAlpha(particle) {
    return clamp(1 - particle.age / particle.life, 0, 1);
  }

  function resetEffects(state) {
    state.trail.length = 0;
    state.burst.length = 0;
    state.flash = 0;
    state.emitAccumulator = 0;
    // `lastBurstKey` deliberately survives a scene reset: a resumed online
    // match rebuilds the scene and must not re-fire a burst it already showed.
    return state;
  }

  return {
    BURST_LIFE,
    FLASH_LIFE,
    MAX_BURST_PARTICLES,
    MAX_TRAIL_PARTICLES,
    TRAIL_LIFE,
    advance,
    createEffectsState,
    emitTrail,
    particleAlpha,
    resetEffects,
    styleForItem,
    triggerBurst,
  };
});
