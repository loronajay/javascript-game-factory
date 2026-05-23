registerMoveAnimations({

  // ── gust_slash ────────────────────────────────────────────────────────────
  // Quick lunge slash. Wind aura charge then a fast dash to target.
  gust_slash: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-gust-slash' },
      { at:0,   type:'preset',        id:'wind_cast_aura' },
      { at:220, type:'sound',         id:'hit-light' },
      { at:220, type:'creature_anim', target:'actor',  class:'anim-cast-gust-slash-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim', target:'target', class:'anim-hit-wind-light' },
      { at:340, type:'preset',        id:'wind_particle_light' },
      { at:340, type:'preset',        id:'wind_hit_flash_light' },
    ],
  },

  // ── gust_slash_2 ──────────────────────────────────────────────────────────
  // Sharper version — heavier aura, more particles, a shake on land.
  gust_slash_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-gust-slash-2' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:9 },
      { at:250, type:'sound',         id:'hit-heavy' },
      { at:250, type:'creature_anim', target:'actor',  class:'anim-cast-gust-slash-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:380, type:'preset',        id:'wind_particle_heavy' },
      { at:380, type:'preset',        id:'wind_hit_flash_heavy' },
      { at:380, type:'screen_shake',  intensity:3, duration:180 },
    ],
  },

  // ── gust_slash_3 ──────────────────────────────────────────────────────────
  // Full-tempo lunge — long charge, heavy particles, stutter shake.
  gust_slash_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-gust-slash-3' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:12, spread:40 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'creature_anim', target:'actor',  class:'anim-cast-gust-slash-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:460, type:'preset',        id:'wind_particle_heavy' },
      { at:460, type:'preset',        id:'wind_hit_flash_heavy' },
      { at:460, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── tailwind ──────────────────────────────────────────────────────────────
  // Self-buff (Speed +2). Upward wind burst from actor, bright field flash.
  tailwind: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-tailwind' },
      { at:0,   type:'preset',         id:'wind_cast_aura', count:10, spread:45 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ddeeff', count:12, spread:50, direction:'up', duration:500 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',    color:'#ddeeff', opacity:0.22, duration:220 },
    ],
  },

  // ── wind_blade ────────────────────────────────────────────────────────────
  // Light wind projectile. Spinning blade flies across the field.
  wind_blade: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-wind-blade' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:5 },
      { at:100, type:'preset',        id:'wind_projectile_light' },
      { at:440, type:'impact' },
      { at:440, type:'sound',         id:'hit-light' },
      { at:440, type:'creature_anim', target:'target', class:'anim-hit-wind-light' },
      { at:440, type:'preset',        id:'wind_particle_light' },
      { at:440, type:'preset',        id:'wind_hit_flash_light' },
    ],
  },

  // ── feather_storm ─────────────────────────────────────────────────────────
  // AoE wind. Cast aura then a storm of feather-blades sweeps all enemies.
  feather_storm: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-feather-storm' },
      { at:0,   type:'preset',         id:'wind_cast_aura', count:8 },
      { at:280, type:'sound',          id:'hit-light' },
      { at:330, type:'impact' },
      { at:330, type:'preset',         id:'wind_field_effect' },
      { at:380, type:'preset',         id:'wind_particle_heavy', origin:'actor' },
      { at:380, type:'particle_burst', origin:'actor', color:'#ddeeff', count:14, spread:90, direction:'all', duration:500 },
    ],
  },

  // ── slipstream ────────────────────────────────────────────────────────────
  // Self-buff (Speed + Evasion). Actor enters a wind ring; larger burst.
  slipstream: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-slipstream' },
      { at:0,   type:'preset',         id:'wind_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cce8ff', count:16, spread:60, direction:'all', duration:600 },
      { at:440, type:'impact' },
      { at:440, type:'field_flash',    color:'#cce8ff', opacity:0.28, duration:260 },
    ],
  },

  // ── cyclone_shot ──────────────────────────────────────────────────────────
  // Heavy wind projectile — tight spinning cyclone flies to target.
  cyclone_shot: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-cyclone-shot' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:8, spread:35 },
      { at:120, type:'preset',        id:'wind_projectile_heavy' },
      { at:500, type:'impact' },
      { at:500, type:'sound',         id:'hit-heavy' },
      { at:500, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:500, type:'preset',        id:'wind_particle_heavy' },
      { at:500, type:'preset',        id:'wind_hit_flash_heavy' },
    ],
  },

  // ── wind_shear ────────────────────────────────────────────────────────────
  // Utility debuff (slow). A cutting projectile that shreds speed.
  wind_shear: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-wind-shear' },
      { at:0,   type:'preset',         id:'wind_cast_aura', color:'#bbddff', count:5 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#99ccee', size:14, shape:'oval', arc:-18, duration:340 },
      { at:400, type:'impact' },
      { at:400, type:'sound',          id:'hit-light' },
      { at:400, type:'creature_anim',  target:'target', class:'anim-hit-wind-shear' },
      { at:400, type:'particle_burst', origin:'target', color:'#99ccee', count:8, spread:50, direction:'all', duration:420 },
      { at:400, type:'field_flash',    color:'#99ccee', opacity:0.16, duration:180 },
    ],
  },

  // ── tempest_burst ─────────────────────────────────────────────────────────
  // Compressed wind detonation. Beam + particle burst + shake.
  tempest_burst: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tempest-burst' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:10, spread:40 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'preset',        id:'wind_beam' },
      { at:500, type:'impact' },
      { at:500, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:500, type:'preset',        id:'wind_particle_heavy' },
      { at:500, type:'preset',        id:'wind_hit_flash_heavy' },
      { at:500, type:'screen_shake',  intensity:5, duration:240 },
    ],
  },

  // ── blade_gale ────────────────────────────────────────────────────────────
  // Two-hit rapid blades. Impact on hit 1; creature_shake on hit 2.
  blade_gale: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-blade-gale' },
      { at:0,   type:'preset',         id:'wind_cast_aura', count:6 },
      // Hit 1
      { at:80,  type:'preset',         id:'wind_projectile_light', size:11, duration:260 },
      { at:300, type:'impact' },
      { at:300, type:'sound',          id:'hit-light' },
      { at:300, type:'creature_anim',  target:'target', class:'anim-hit-wind-light' },
      { at:300, type:'preset',         id:'wind_particle_light' },
      // Hit 2
      { at:420, type:'sound',          id:'charge-light' },
      { at:460, type:'preset',         id:'wind_projectile_light', size:12, duration:260 },
      { at:680, type:'sound',          id:'hit-light' },
      { at:680, type:'creature_shake', target:'target', intensity:4, duration:180 },
      { at:680, type:'preset',         id:'wind_particle_light' },
      { at:680, type:'preset',         id:'wind_hit_flash_light' },
    ],
  },

  // ── cyclone_shot_2 ────────────────────────────────────────────────────────
  // Reinforced cyclone — longer charge, bigger projectile, shake on landing.
  cyclone_shot_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-cyclone-shot-2' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:11, spread:40 },
      { at:160, type:'preset',        id:'wind_projectile_heavy', size:22, duration:280 },
      { at:580, type:'impact' },
      { at:580, type:'sound',         id:'hit-heavy' },
      { at:580, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:580, type:'preset',        id:'wind_particle_heavy' },
      { at:580, type:'preset',        id:'wind_hit_flash_heavy' },
      { at:580, type:'screen_shake',  intensity:6, duration:260 },
    ],
  },

  // ── blade_gale_2 ──────────────────────────────────────────────────────────
  // Three-hit blade volley. Impact on hit 1; shakes on hits 2 and 3.
  blade_gale_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-blade-gale-2' },
      { at:0,   type:'preset',         id:'wind_cast_aura', count:8 },
      // Hit 1
      { at:80,  type:'preset',         id:'wind_projectile_light', size:11, duration:240 },
      { at:280, type:'impact' },
      { at:280, type:'sound',          id:'hit-light' },
      { at:280, type:'creature_anim',  target:'target', class:'anim-hit-wind-light' },
      { at:280, type:'preset',         id:'wind_particle_light' },
      // Hit 2
      { at:380, type:'sound',          id:'charge-light' },
      { at:420, type:'preset',         id:'wind_projectile_light', size:12, duration:240 },
      { at:620, type:'sound',          id:'hit-light' },
      { at:620, type:'creature_shake', target:'target', intensity:4, duration:160 },
      { at:620, type:'preset',         id:'wind_particle_light' },
      // Hit 3
      { at:720, type:'sound',          id:'charge-light' },
      { at:760, type:'preset',         id:'wind_projectile_heavy', size:15, duration:240 },
      { at:960, type:'sound',          id:'hit-heavy' },
      { at:960, type:'creature_shake', target:'target', intensity:6, duration:200 },
      { at:960, type:'preset',         id:'wind_particle_heavy' },
      { at:960, type:'preset',         id:'wind_hit_flash_heavy' },
    ],
  },

  // ── tempest_burst_2 ───────────────────────────────────────────────────────
  // Heavy beam version — long charge, wide beam, stutter shake.
  tempest_burst_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tempest-burst-2' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:14, spread:50 },
      { at:420, type:'sound',         id:'hit-heavy' },
      { at:420, type:'preset',        id:'wind_beam', width:5, duration:420 },
      { at:660, type:'impact' },
      { at:660, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:660, type:'preset',        id:'wind_particle_heavy' },
      { at:660, type:'preset',        id:'wind_hit_flash_heavy' },
      { at:660, type:'screen_shake',  intensity:8, duration:320, style:'stutter' },
      { at:740, type:'field_flash',   color:'#aaccee', opacity:0.30, duration:220 },
    ],
  },

  // ── storm_finale ──────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge, eye-of-storm eruption, stutter shake,
  // two aftershock field pulses.
  storm_finale: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-storm-finale-charge' },
      { at:0,   type:'preset',        id:'wind_cast_aura', count:16, spread:55 },
      { at:580, type:'sound',         id:'hit-heavy' },
      { at:580, type:'creature_anim', target:'actor',  class:'anim-cast-storm-finale-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',         id:'hit-heavy' },
      { at:780, type:'creature_anim', target:'target', class:'anim-hit-wind-heavy' },
      { at:780, type:'preset',        id:'wind_particle_heavy' },
      { at:780, type:'preset',        id:'wind_hit_flash_heavy' },
      { at:780, type:'screen_shake',  intensity:11, duration:400, style:'stutter' },
      { at:860, type:'preset',        id:'wind_field_effect', opacity:0.65, duration:340 },
      { at:960, type:'field_flash',   color:'#aaccee', opacity:0.38, duration:240 },
    ],
  },

});
