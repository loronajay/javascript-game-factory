registerMoveAnimations({

  // ── ember_bite ────────────────────────────────────────────────────────────
  ember_bite: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ember-bite' },
      { at:0,   type:'preset',        id:'fire_cast_aura' },
      { at:220, type:'sound',         id:'hit-light' },
      { at:220, type:'creature_anim', target:'actor',  class:'anim-cast-ember-bite-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-light' },
      { at:340, type:'preset',        id:'fire_particle_light' },
      { at:340, type:'preset',        id:'fire_hit_flash_light' },
    ],
  },

  // ── ember_bite_2 ──────────────────────────────────────────────────────────
  ember_bite_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ember-bite-2' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:9 },
      { at:250, type:'sound',         id:'hit-heavy' },
      { at:250, type:'creature_anim', target:'actor',  class:'anim-cast-ember-bite-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-heavy' },
      { at:380, type:'preset',        id:'fire_particle_heavy' },
      { at:380, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:380, type:'screen_shake',  intensity:4, duration:200 },
    ],
  },

  // ── ember_bite_3 ──────────────────────────────────────────────────────────
  ember_bite_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:210 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ember-bite-3' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:12, spread:40 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'creature_anim', target:'actor',  class:'anim-cast-ember-bite-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-heavy' },
      { at:460, type:'preset',        id:'fire_particle_heavy' },
      { at:460, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:460, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── flame_charge ──────────────────────────────────────────────────────────
  flame_charge: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-flame-charge' },
      { at:0,   type:'preset',        id:'fire_cast_aura' },
      { at:180, type:'sound',         id:'hit-light' },
      { at:180, type:'creature_anim', target:'actor',  class:'anim-cast-flame-charge-lunge', lunge:true },
      { at:300, type:'impact' },
      { at:300, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-light' },
      { at:300, type:'preset',        id:'fire_particle_light' },
      { at:300, type:'preset',        id:'fire_hit_flash_light' },
    ],
  },

  // ── flame_charge_2 ────────────────────────────────────────────────────────
  flame_charge_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-flame-charge-2' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:10, spread:38 },
      { at:360, type:'sound',         id:'hit-heavy' },
      { at:360, type:'creature_anim', target:'actor',  class:'anim-cast-flame-charge-2-lunge', lunge:true },
      { at:540, type:'impact' },
      { at:540, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-heavy' },
      { at:540, type:'preset',        id:'fire_particle_heavy' },
      { at:540, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:540, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── fire_fang ─────────────────────────────────────────────────────────────
  // Lunge + burn. Same pattern as ember_bite but with burn on impact.
  fire_fang: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-fire-fang' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:6 },
      { at:220, type:'sound',         id:'hit-light' },
      { at:220, type:'creature_anim', target:'actor',  class:'anim-cast-fire-fang-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-light' },
      { at:340, type:'preset',        id:'fire_particle_light' },
      { at:340, type:'preset',        id:'fire_hit_flash_light' },
    ],
  },

  // ── cinder_toss ───────────────────────────────────────────────────────────
  // Projectile + burn. Burning debris arcs to target.
  cinder_toss: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-cinder-toss' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:5 },
      { at:80,  type:'preset',         id:'fire_projectile_light', size:16, duration:320 },
      { at:480, type:'impact' },
      { at:480, type:'sound',          id:'hit-light' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-fire-physical-light' },
      { at:480, type:'preset',         id:'fire_particle_light' },
      { at:480, type:'preset',         id:'fire_hit_flash_light' },
    ],
  },

  // ── blaze_stance ──────────────────────────────────────────────────────────
  // Self-buff (STR +2). Roaring fire aura erupts from actor.
  blaze_stance: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-blaze-stance' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff9900', count:18, spread:65, direction:'up', duration:640, glow:true },
      { at:440, type:'impact' },
      { at:440, type:'field_flash',    color:'#ff6600', opacity:0.30, duration:240 },
    ],
  },

  // ── magma_crash ───────────────────────────────────────────────────────────
  // Heavy physical lunge. Long charge, magma eruption on land.
  magma_crash: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-magma-crash' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:10, spread:35 },
      { at:400, type:'sound',         id:'hit-heavy' },
      { at:400, type:'creature_anim', target:'actor',  class:'anim-cast-magma-crash-lunge', lunge:true },
      { at:580, type:'impact' },
      { at:580, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-heavy' },
      { at:580, type:'preset',        id:'fire_particle_heavy' },
      { at:580, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:580, type:'screen_shake',  intensity:7, duration:300, style:'stutter' },
    ],
  },

  // ── magma_crash_2 ─────────────────────────────────────────────────────────
  magma_crash_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-magma-crash-2' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:14, spread:45 },
      { at:500, type:'sound',         id:'hit-heavy' },
      { at:500, type:'creature_anim', target:'actor',  class:'anim-cast-magma-crash-2-lunge', lunge:true },
      { at:700, type:'impact' },
      { at:700, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-heavy' },
      { at:700, type:'preset',        id:'fire_particle_heavy' },
      { at:700, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:700, type:'screen_shake',  intensity:9, duration:340, style:'stutter' },
      { at:780, type:'field_flash',   color:'#cc2200', opacity:0.35, duration:240 },
    ],
  },

  // ── heat_rush ─────────────────────────────────────────────────────────────
  // AoE physical fire. Actor blazes across, scorching all enemies.
  heat_rush: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-heat-rush' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:8 },
      { at:280, type:'sound',          id:'hit-heavy' },
      { at:340, type:'impact' },
      { at:340, type:'preset',         id:'fire_field_effect' },
      { at:380, type:'preset',         id:'fire_particle_heavy', origin:'actor' },
      { at:380, type:'screen_shake',   intensity:4, duration:220 },
    ],
  },

  // ── heat_rush_2 ───────────────────────────────────────────────────────────
  heat_rush_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-heat-rush-2' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:12, spread:45 },
      { at:380, type:'sound',          id:'hit-heavy' },
      { at:440, type:'impact' },
      { at:440, type:'preset',         id:'fire_field_effect', opacity:0.75, duration:320 },
      { at:480, type:'preset',         id:'fire_particle_heavy', origin:'actor' },
      { at:480, type:'particle_burst', origin:'actor', color:'#ff9900', count:18, spread:90, direction:'all', duration:540, glow:true },
      { at:480, type:'screen_shake',   intensity:6, duration:260 },
      { at:560, type:'field_flash',    color:'#cc2200', opacity:0.30, duration:200 },
    ],
  },

  // ── fire_volley ───────────────────────────────────────────────────────────
  // Two-hit. Impact on hit 1; creature_shake on hit 2.
  fire_volley: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:6 },
      // Hit 1
      { at:80,  type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley-lunge-1', lunge:true },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-light' },
      { at:200, type:'creature_anim',  target:'target', class:'anim-hit-fire-physical-light' },
      { at:200, type:'preset',         id:'fire_particle_light' },
      // Hit 2
      { at:380, type:'sound',          id:'charge-light' },
      { at:400, type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley-lunge-2', lunge:true },
      { at:520, type:'sound',          id:'hit-heavy' },
      { at:520, type:'creature_shake', target:'target', intensity:5, duration:180 },
      { at:520, type:'preset',         id:'fire_particle_heavy' },
      { at:520, type:'preset',         id:'fire_hit_flash_heavy' },
    ],
  },

  // ── fire_volley_2 ─────────────────────────────────────────────────────────
  // Three-hit. Impact on hit 1; shakes on hits 2 and 3.
  fire_volley_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley-2' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:8 },
      // Hit 1
      { at:60,  type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley-2-lunge-1', lunge:true },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-light' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-fire-physical-light' },
      { at:180, type:'preset',         id:'fire_particle_light' },
      // Hit 2
      { at:320, type:'sound',          id:'charge-light' },
      { at:340, type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley-2-lunge-2', lunge:true },
      { at:460, type:'sound',          id:'hit-light' },
      { at:460, type:'creature_shake', target:'target', intensity:4, duration:160 },
      { at:460, type:'preset',         id:'fire_particle_light' },
      // Hit 3
      { at:600, type:'sound',          id:'charge-light' },
      { at:620, type:'creature_anim',  target:'actor',  class:'anim-cast-fire-volley-2-lunge-3', lunge:true },
      { at:760, type:'sound',          id:'hit-heavy' },
      { at:760, type:'creature_shake', target:'target', intensity:6, duration:200 },
      { at:760, type:'preset',         id:'fire_particle_heavy' },
      { at:760, type:'preset',         id:'fire_hit_flash_heavy' },
    ],
  },

  // ── inferno_crash ─────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge, cataclysmic fire eruption.
  inferno_crash: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-inferno-charge' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:16, spread:55 },
      { at:580, type:'sound',         id:'hit-heavy' },
      { at:580, type:'creature_anim', target:'actor',  class:'anim-cast-inferno-crash-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',         id:'hit-heavy' },
      { at:780, type:'creature_anim', target:'target', class:'anim-hit-fire-physical-heavy' },
      { at:780, type:'preset',        id:'fire_particle_heavy' },
      { at:780, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:780, type:'screen_shake',  intensity:12, duration:420, style:'stutter' },
      { at:860, type:'preset',        id:'fire_field_effect', opacity:0.80, duration:360 },
      { at:960, type:'field_flash',   color:'#cc2200', opacity:0.40, duration:260 },
    ],
  },

});
