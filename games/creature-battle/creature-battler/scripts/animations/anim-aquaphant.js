registerMoveAnimations({

  // ── bubble_shot ────────────────────────────────────────────────────────────
  // Snappy pressurized bubble → light water splash.
  bubble_shot: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-bubble-shot' },
      { at:0,   type:'preset',        id:'water_cast_aura' },
      { at:80,  type:'preset',        id:'water_projectile_light', duration:200 },
      { at:270, type:'impact' },
      { at:270, type:'sound',         id:'hit-light' },
      { at:270, type:'creature_anim', target:'target', class:'anim-hit-water-light' },
      { at:270, type:'preset',        id:'water_particle_light' },
      { at:270, type:'preset',        id:'water_hit_flash_light' },
    ],
  },

  // ── bubble_shot_2 ──────────────────────────────────────────────────────────
  // Heavier bubble, medium particles, light shake.
  bubble_shot_2: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-bubble-shot-2' },
      { at:0,   type:'preset',        id:'water_cast_aura' },
      { at:120, type:'preset',        id:'water_projectile_heavy', size:16, duration:280 },
      { at:360, type:'impact' },
      { at:360, type:'sound',         id:'hit-light' },
      { at:360, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:360, type:'preset',        id:'water_particle_heavy' },
      { at:360, type:'preset',        id:'water_hit_flash_light' },
      { at:360, type:'screen_shake',  intensity:3, duration:200 },
    ],
  },

  // ── bubble_shot_3 ──────────────────────────────────────────────────────────
  // Maximum pressure: full heavy projectile, stutter shake.
  bubble_shot_3: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-bubble-shot-3' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:9 },
      { at:140, type:'preset',        id:'water_projectile_heavy' },
      { at:430, type:'impact' },
      { at:430, type:'sound',         id:'hit-heavy' },
      { at:430, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:430, type:'preset',        id:'water_particle_heavy' },
      { at:430, type:'preset',        id:'water_hit_flash_heavy' },
      { at:430, type:'screen_shake',  intensity:6, duration:280, style:'stutter' },
    ],
  },

  // ── soak_hide ──────────────────────────────────────────────────────────────
  // Self-buff (defense). Low defensive posture, water-shell shimmer.
  soak_hide: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor', class:'anim-cast-soak-hide' },
      { at:0,   type:'preset',        id:'water_cast_aura', direction:'all', spread:35 },
      { at:320, type:'impact' },
      { at:320, type:'field_flash',   color:'#0088cc', opacity:0.12, duration:180 },
    ],
  },

  // ── healing_wave ───────────────────────────────────────────────────────────
  // Self-heal. Rocking wave on actor, teal glow and upward particles.
  healing_wave: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-healing-wave' },
      { at:0,   type:'preset',         id:'water_cast_aura', color:'#44ddcc', direction:'all', spread:38 },
      { at:260, type:'impact' },
      { at:260, type:'sound',          id:'beam-light' },
      { at:260, type:'creature_anim',  target:'target', class:'anim-hit-water-heal' },
      { at:260, type:'particle_burst', origin:'actor', color:'#66ffee', count:8, spread:40, direction:'up', duration:500 },
      { at:260, type:'field_flash',    color:'#00ccbb', opacity:0.20, duration:220 },
    ],
  },

  // ── tidal_bump ─────────────────────────────────────────────────────────────
  // Two-pulse charge → weighty water lunge. lunge:true injects dx/dy at runtime.
  tidal_bump: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tidal-charge' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:8, spread:32 },
      { at:460, type:'sound',         id:'beam-light' },
      { at:460, type:'creature_anim', target:'actor',  class:'anim-cast-tidal-bump', lunge:true },
      { at:685, type:'impact' },
      { at:685, type:'sound',         id:'hit-heavy' },
      { at:685, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:685, type:'preset',        id:'water_particle_heavy' },
      { at:685, type:'preset',        id:'water_hit_flash_heavy' },
      { at:685, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── hydro_skin ─────────────────────────────────────────────────────────────
  // Self-buff (defense + spirit). Heavier crouch than soak_hide, dual-stat glow.
  hydro_skin: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-hydro-skin' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:8, direction:'all', spread:40 },
      { at:340, type:'impact' },
      { at:340, type:'particle_burst', origin:'actor', color:'#44bbee', count:5, spread:25, direction:'up', duration:420 },
      { at:340, type:'field_flash',    color:'#0066cc', opacity:0.18, duration:220 },
    ],
  },

  // ── undertow ───────────────────────────────────────────────────────────────
  // Utility (slow). Deep dip on actor; target dragged downward.
  undertow: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-undertow' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#2255aa', count:5, spread:28, direction:'down', duration:480 },
      { at:280, type:'impact' },
      { at:280, type:'sound',          id:'hit-light' },
      { at:280, type:'creature_anim',  target:'target', class:'anim-hit-undertow' },
      { at:280, type:'particle_burst', origin:'target', color:'#1133aa', count:8, spread:45, direction:'down', duration:500 },
      { at:280, type:'field_flash',    color:'#001144', opacity:0.22, duration:240 },
    ],
  },

  // ── whirlpool ──────────────────────────────────────────────────────────────
  // Utility (debuff). Swaying cast → water beam → dizzying wobble on target.
  whirlpool: {
    timeline: [
      { at:0,   type:'sound',          id:'beam-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-whirlpool' },
      { at:0,   type:'preset',         id:'water_cast_aura', direction:'all', spread:38 },
      { at:100, type:'preset',         id:'water_beam', color:'#44aaee', width:3, duration:320 },
      { at:260, type:'impact' },
      { at:260, type:'sound',          id:'hit-light' },
      { at:260, type:'creature_anim',  target:'target', class:'anim-hit-whirlpool' },
      { at:260, type:'particle_burst', origin:'target', color:'#44bbff', count:8, spread:50, direction:'all', duration:460 },
      { at:260, type:'preset',         id:'water_hit_flash_light' },
    ],
  },

  // ── surge_crash ────────────────────────────────────────────────────────────
  // AoE water. Broad swell, field effect covers all enemies.
  surge_crash: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-surge-crash' },
      { at:0,   type:'preset',       id:'water_cast_aura' },
      { at:320, type:'sound',        id:'beam-light' },
      { at:380, type:'impact' },
      { at:380, type:'sound',        id:'hit-heavy' },
      { at:380, type:'preset',       id:'water_field_effect' },
      { at:380, type:'screen_shake', intensity:4, duration:250 },
      { at:430, type:'preset',       id:'water_particle_heavy', origin:'actor' },
    ],
  },

  // ── surge_crash_2 ──────────────────────────────────────────────────────────
  surge_crash_2: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-surge-crash-2' },
      { at:0,   type:'preset',       id:'water_cast_aura', count:9 },
      { at:360, type:'sound',        id:'beam-light' },
      { at:460, type:'impact' },
      { at:460, type:'sound',        id:'hit-heavy' },
      { at:460, type:'preset',       id:'water_field_effect', opacity:0.70, duration:360 },
      { at:460, type:'screen_shake', intensity:6, duration:300, style:'stutter' },
      { at:510, type:'preset',       id:'water_particle_heavy', origin:'actor' },
    ],
  },

  // ── surge_crash_3 ──────────────────────────────────────────────────────────
  // Maximum wave. Second field flash for the crash aftershock.
  surge_crash_3: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-surge-crash-3' },
      { at:0,   type:'preset',       id:'water_cast_aura', count:11, spread:40 },
      { at:400, type:'sound',        id:'beam-light', repeat:2, interval:100 },
      { at:540, type:'impact' },
      { at:540, type:'sound',        id:'hit-heavy' },
      { at:540, type:'preset',       id:'water_field_effect', opacity:0.82, duration:400 },
      { at:540, type:'screen_shake', intensity:8, duration:380, style:'stutter' },
      { at:590, type:'preset',       id:'water_particle_heavy', origin:'actor' },
      { at:660, type:'field_flash',  color:'#003388', opacity:0.30, duration:220 },
    ],
  },

  // ── torrent ────────────────────────────────────────────────────────────────
  // Deep-water charge → sustained lunge beam. Aquaphant's big single-target move.
  torrent: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-torrent-charge' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:9, spread:35 },
      { at:480, type:'sound',         id:'beam-light' },
      { at:480, type:'creature_anim', target:'actor',  class:'anim-cast-torrent', lunge:true },
      { at:720, type:'impact' },
      { at:720, type:'sound',         id:'hit-heavy' },
      { at:720, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:720, type:'preset',        id:'water_particle_heavy' },
      { at:720, type:'preset',        id:'water_hit_flash_heavy' },
      { at:720, type:'screen_shake',  intensity:8, duration:300, style:'stutter' },
    ],
  },

});
