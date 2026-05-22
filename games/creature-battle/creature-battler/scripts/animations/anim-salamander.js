registerMoveAnimations({

  // ── spark_flick ────────────────────────────────────────────────────────────
  // Snappy 2-beat: glow → light projectile → fire flash.
  spark_flick: {
    timeline: [
      { at:0,   type:'sound',         id:'fire' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-spark-flick' },
      { at:0,   type:'preset',        id:'fire_cast_aura' },
      { at:120, type:'preset',        id:'fire_projectile_light' },
      { at:280, type:'impact' },
      { at:280, type:'sound',         id:'hit-light' },
      { at:280, type:'creature_anim', target:'target', class:'anim-hit-fire-light' },
      { at:280, type:'preset',        id:'fire_particle_light' },
      { at:280, type:'preset',        id:'fire_hit_flash_light' },
    ],
  },

  // ── spark_flick_2 ──────────────────────────────────────────────────────────
  // Same shape, heavier projectile, medium-weight particles and shake.
  spark_flick_2: {
    timeline: [
      { at:0,   type:'sound',         id:'fire' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-spark-flick-2' },
      { at:0,   type:'preset',        id:'fire_cast_aura' },
      { at:140, type:'preset',        id:'fire_projectile_heavy', size:16, duration:300 },
      { at:390, type:'impact' },
      { at:390, type:'sound',         id:'hit-light' },
      { at:390, type:'creature_anim', target:'target', class:'anim-hit-fire-heavy' },
      { at:390, type:'preset',        id:'fire_particle_heavy' },
      { at:390, type:'preset',        id:'fire_hit_flash_light' },
      { at:390, type:'screen_shake',  intensity:3, duration:200 },
    ],
  },

  // ── spark_flick_3 ──────────────────────────────────────────────────────────
  // Full force: peak-glow cast, heavy projectile, stutter shake on impact.
  spark_flick_3: {
    timeline: [
      { at:0,   type:'sound',         id:'fire' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-spark-flick-3' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:10 },
      { at:150, type:'preset',        id:'fire_projectile_heavy' },
      { at:440, type:'impact' },
      { at:440, type:'sound',         id:'hit-heavy' },
      { at:440, type:'creature_anim', target:'target', class:'anim-hit-fire-heavy' },
      { at:440, type:'preset',        id:'fire_particle_heavy' },
      { at:440, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:440, type:'screen_shake',  intensity:6, duration:280, style:'stutter' },
    ],
  },

  // ── heat_haze ──────────────────────────────────────────────────────────────
  // Self-buff (evasion). Heat shimmer on actor, warm field wash.
  heat_haze: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor', class:'anim-cast-heat-haze' },
      { at:0,   type:'preset',        id:'fire_cast_aura', direction:'all', spread:40 },
      { at:300, type:'impact' },
      { at:300, type:'field_flash',   color:'#ff9900', opacity:0.12, duration:180 },
    ],
  },

  // ── ember_trail ────────────────────────────────────────────────────────────
  // Slow smoldering projectile. Burn particles rise from target after impact.
  ember_trail: {
    timeline: [
      { at:0,   type:'sound',          id:'fire' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-ember-trail' },
      { at:0,   type:'preset',         id:'fire_cast_aura', count:4, spread:20 },
      { at:100, type:'preset',         id:'fire_projectile_light', duration:380, arc:-10, color:'#ff6600' },
      { at:420, type:'impact' },
      { at:420, type:'sound',          id:'hit-light' },
      { at:420, type:'creature_anim',  target:'target', class:'anim-hit-ember-burn' },
      { at:420, type:'particle_burst', origin:'target', color:'#cc4400', count:7, spread:40, direction:'up', glow:true, duration:500 },
      { at:420, type:'field_flash',    color:'#cc4400', opacity:0.20, duration:200 },
    ],
  },

  // ── ash_veil ───────────────────────────────────────────────────────────────
  // Self-buff (spirit). Gray ash rises from actor, subtle field wash.
  ash_veil: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-ash-veil' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#999999', count:7, spread:35, direction:'up', duration:480 },
      { at:300, type:'impact' },
      { at:300, type:'field_flash',    color:'#cccccc', opacity:0.10, duration:180 },
    ],
  },

  // ── smoke_screen ───────────────────────────────────────────────────────────
  // Utility (blind). Dark oval projectile → smoky burst obscures target.
  smoke_screen: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-smoke-screen' },
      { at:0,   type:'preset',         id:'fire_cast_aura', color:'#555555', count:5 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#444444', size:18, shape:'oval', arc:-12, duration:380 },
      { at:430, type:'impact' },
      { at:430, type:'sound',          id:'hit-light' },
      { at:430, type:'creature_anim',  target:'target', class:'anim-hit-smoke-blind' },
      { at:430, type:'particle_burst', origin:'target', color:'#666666', count:10, spread:65, duration:560 },
      { at:430, type:'field_flash',    color:'#222222', opacity:0.22, duration:240 },
    ],
  },

  // ── flare_bite ─────────────────────────────────────────────────────────────
  // Three-flash charge → lunge bite. Engine computes dx/dy from lunge:true.
  flare_bite: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-flare-charge' },
      { at:0,   type:'preset',        id:'fire_cast_aura', count:9, spread:35 },
      { at:560, type:'sound',         id:'fire' },
      { at:560, type:'creature_anim', target:'actor',  class:'anim-cast-flare-bite', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',         id:'hit-heavy' },
      { at:780, type:'creature_anim', target:'target', class:'anim-hit-fire-heavy' },
      { at:780, type:'preset',        id:'fire_particle_heavy' },
      { at:780, type:'preset',        id:'fire_hit_flash_heavy' },
      { at:780, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── cinder_burst ───────────────────────────────────────────────────────────
  // AoE fire. Field effect covers all enemies; embers radiate from actor.
  cinder_burst: {
    timeline: [
      { at:0,   type:'sound',        id:'fire' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-cinder-burst' },
      { at:0,   type:'preset',       id:'fire_cast_aura' },
      { at:300, type:'sound',        id:'fire' },
      { at:350, type:'impact' },
      { at:350, type:'sound',        id:'hit-heavy' },
      { at:350, type:'preset',       id:'fire_field_effect' },
      { at:350, type:'screen_shake', intensity:4, duration:250 },
      { at:400, type:'preset',       id:'fire_particle_heavy', origin:'actor' },
    ],
  },

  // ── cinder_burst_2 ─────────────────────────────────────────────────────────
  cinder_burst_2: {
    timeline: [
      { at:0,   type:'sound',        id:'fire' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-cinder-burst-2' },
      { at:0,   type:'preset',       id:'fire_cast_aura', count:9 },
      { at:350, type:'sound',        id:'fire' },
      { at:450, type:'impact' },
      { at:450, type:'sound',        id:'hit-heavy' },
      { at:450, type:'preset',       id:'fire_field_effect', opacity:0.75, duration:360 },
      { at:450, type:'screen_shake', intensity:6, duration:300, style:'stutter' },
      { at:500, type:'preset',       id:'fire_particle_heavy', origin:'actor' },
    ],
  },

  // ── cinder_burst_3 ─────────────────────────────────────────────────────────
  // Second field flash pulse for the afterburn.
  cinder_burst_3: {
    timeline: [
      { at:0,   type:'sound',        id:'fire' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-cinder-burst-3' },
      { at:0,   type:'preset',       id:'fire_cast_aura', count:11, spread:40 },
      { at:380, type:'sound',        id:'fire', repeat:2, interval:100 },
      { at:520, type:'impact' },
      { at:520, type:'sound',        id:'hit-heavy' },
      { at:520, type:'preset',       id:'fire_field_effect', opacity:0.85, duration:400 },
      { at:520, type:'screen_shake', intensity:8, duration:380, style:'stutter' },
      { at:570, type:'preset',       id:'fire_particle_heavy', origin:'actor' },
      { at:640, type:'field_flash',  color:'#cc2200', opacity:0.35, duration:200 },
    ],
  },

  // ── scorch ─────────────────────────────────────────────────────────────────
  // Two-hit move. First hit resolves impact and float texts; second hit is
  // visual-only (creature_shake avoids class conflict with anim-hit-fire-light).
  scorch: {
    timeline: [
      { at:0,   type:'sound',          id:'fire' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-scorch' },
      { at:0,   type:'preset',         id:'fire_cast_aura' },
      { at:80,  type:'preset',         id:'fire_projectile_light', color:'#ff4400' },
      { at:280, type:'impact' },
      { at:280, type:'sound',          id:'hit-light' },
      { at:280, type:'creature_anim',  target:'target', class:'anim-hit-fire-light' },
      { at:280, type:'preset',         id:'fire_particle_light' },
      { at:280, type:'preset',         id:'fire_hit_flash_light' },
      { at:400, type:'sound',          id:'fire' },
      { at:440, type:'preset',         id:'fire_projectile_light', color:'#ff5500' },
      { at:640, type:'sound',          id:'hit-light' },
      { at:640, type:'creature_shake', target:'target', intensity:4, duration:180 },
      { at:640, type:'preset',         id:'fire_particle_light' },
      { at:640, type:'preset',         id:'fire_hit_flash_light' },
    ],
  },

  // ── magma_surge ────────────────────────────────────────────────────────────
  // Ultimate AoE nuke. Long charge, stutter shake, two afterburn pulses.
  magma_surge: {
    timeline: [
      { at:0,   type:'sound',        id:'charge-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-magma-surge' },
      { at:0,   type:'preset',       id:'fire_cast_aura', count:12, spread:50, direction:'all' },
      { at:260, type:'sound',        id:'fire' },
      { at:350, type:'sound',        id:'fire', repeat:3, interval:90 },
      { at:540, type:'impact' },
      { at:540, type:'sound',        id:'hit-heavy' },
      { at:540, type:'preset',       id:'fire_field_effect', opacity:0.90, duration:480 },
      { at:540, type:'screen_shake', intensity:10, duration:500, style:'stutter' },
      { at:590, type:'preset',       id:'fire_particle_heavy', origin:'actor' },
      { at:660, type:'field_flash',  color:'#ff2200', opacity:0.40, duration:280 },
      { at:760, type:'field_flash',  color:'#881100', opacity:0.20, duration:200 },
    ],
  },

});
