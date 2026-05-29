registerMoveAnimations({

  // ── tide_slap ─────────────────────────────────────────────────────────────
  tide_slap: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-tide-slap' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:360 },
      { at:0,   type:'preset',         id:'water_cast_aura' },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:5, spread:28, direction:'all', duration:240, content:'🌊' },
      { at:180, type:'sound',          id:'hit-light' },
      { at:180, type:'creature_anim',  target:'actor',  class:'anim-cast-tide-slap-lunge', lunge:true },
      { at:300, type:'impact' },
      { at:300, type:'creature_anim',  target:'target', class:'anim-hit-water-light' },
      { at:300, type:'creature_tint',  target:'target', color:'#005599', blend:'multiply', duration:460 },
      { at:300, type:'preset',         id:'water_particle_light' },
      { at:300, type:'preset',         id:'water_hit_flash_light' },
    ],
  },

  // ── tide_slap_2 ───────────────────────────────────────────────────────────
  tide_slap_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-tide-slap-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:400 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:9 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:6, spread:32, direction:'all', duration:300, content:'🌊' },
      { at:220, type:'sound',          id:'hit-heavy' },
      { at:220, type:'creature_anim',  target:'actor',  class:'anim-cast-tide-slap-2-lunge', lunge:true },
      { at:360, type:'impact' },
      { at:360, type:'creature_anim',  target:'target', class:'anim-hit-water-heavy' },
      { at:360, type:'creature_tint',  target:'target', color:'#005599', blend:'multiply', duration:500 },
      { at:360, type:'preset',         id:'water_particle_heavy' },
      { at:360, type:'preset',         id:'water_hit_flash_heavy' },
      { at:360, type:'shockwave',      origin:'target', size:82, color:'#0088cc', opacity:0.60, thickness:3, duration:380 },
      { at:360, type:'screen_shake',   intensity:3, duration:180 },
    ],
  },

  // ── tide_slap_3 ───────────────────────────────────────────────────────────
  tide_slap_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-tide-slap-3' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:480 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:12, spread:40 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:8, spread:38, direction:'all', duration:360, content:'🌊' },
      { at:280, type:'sound',          id:'hit-heavy' },
      { at:280, type:'creature_anim',  target:'actor',  class:'anim-cast-tide-slap-3-lunge', lunge:true },
      { at:440, type:'impact' },
      { at:440, type:'hit_stop',       duration:50 },
      { at:440, type:'creature_anim',  target:'target', class:'anim-hit-water-heavy' },
      { at:440, type:'creature_tint',  target:'target', color:'#005599', blend:'multiply', duration:520 },
      { at:440, type:'preset',         id:'water_particle_heavy' },
      { at:440, type:'preset',         id:'water_hit_flash_heavy' },
      { at:440, type:'shockwave',      origin:'target', size:105, color:'#0088cc', opacity:0.70, thickness:4, duration:400 },
      { at:440, type:'screen_shake',   intensity:5, duration:240, style:'stutter' },
    ],
  },

  // ── brine_shield ──────────────────────────────────────────────────────────
  // Self-buff (DEF + SPI). Dense brine particles coat actor.
  brine_shield: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-brine-shield' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:520 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:8, spread:40 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#44bbee', count:12, spread:50, direction:'all', duration:560 },
      { at:340, type:'impact' },
      { at:340, type:'status_ring',    target:'actor',  color:'#44bbee', duration:700 },
      { at:420, type:'status_ring',    target:'actor',  color:'#0099cc', duration:600 },
      { at:340, type:'field_flash',    color:'#0088cc', opacity:0.22, duration:220 },
    ],
  },

  // ── barnacle_wall ─────────────────────────────────────────────────────────
  // Self-buff (DEF +2). Heavy shell forms around actor.
  barnacle_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-barnacle-wall' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:580 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#005599', count:14, spread:55, direction:'all', duration:620 },
      { at:420, type:'impact' },
      { at:420, type:'status_ring',    target:'actor',  color:'#005599', duration:750 },
      { at:420, type:'field_flash',    color:'#0088cc', opacity:0.30, duration:260 },
    ],
  },

  // ── tide_wall ─────────────────────────────────────────────────────────────
  // Self-buff (DEF +2, SPI +1). Towering water wall rises around actor.
  tide_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-tide-wall' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:640 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#44bbee', count:18, spread:65, direction:'up', duration:680 },
      { at:460, type:'impact' },
      { at:460, type:'status_ring',    target:'actor',  color:'#44bbee', duration:800 },
      { at:540, type:'status_ring',    target:'actor',  color:'#005599', duration:700 },
      { at:460, type:'field_flash',    color:'#0088cc', opacity:0.38, duration:280 },
    ],
  },

  // ── water_jet ─────────────────────────────────────────────────────────────
  water_jet: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-water-jet' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:440 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:5 },
      { at:80,  type:'preset',         id:'water_projectile_light' },
      { at:480, type:'impact' },
      { at:480, type:'sound',          id:'hit-light' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-water-light' },
      { at:480, type:'creature_tint',  target:'target', color:'#005599', blend:'multiply', duration:480 },
      { at:480, type:'preset',         id:'water_particle_light' },
      { at:480, type:'preset',         id:'water_hit_flash_light' },
    ],
  },

  // ── whirlpool ─────────────────────────────────────────────────────────────
  // Debuff utility (SPD -1, ACC -1). Vortex forms on the target — three
  // spinning elliptical rings materialize from the inside out, then lock in.
  whirlpool: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-whirlpool' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaee', count:3, interval:90, direction:'all', spread:28, duration:280 },
      { at:120, type:'spinning_ring',   origin:'target', radius:16, squish:0.30, color:'#44aaee', thickness:2, spinMs:520,  duration:1080, glow:true },
      { at:200, type:'spinning_ring',   origin:'target', radius:30, squish:0.30, color:'#2277cc', thickness:2, spinMs:760,  duration:900 },
      { at:270, type:'spinning_ring',   origin:'target', radius:46, squish:0.30, color:'#0055aa', thickness:3, spinMs:1020, duration:720 },
      { at:240, type:'creature_tint',   target:'target', color:'#001155', blend:'multiply', opacity:0.18, duration:560 },
      { at:380, type:'impact' },
      { at:380, type:'sound',           id:'hit-light' },
      { at:380, type:'creature_anim',   target:'target', class:'anim-hit-whirlpool' },
      { at:380, type:'particle_burst',  origin:'target', color:'#44bbff', count:10, spread:46, direction:'all', duration:440 },
      { at:380, type:'field_flash',     color:'#002255', opacity:0.20, duration:200 },
      { at:380, type:'creature_tint',   target:'target', color:'#001144', blend:'multiply', opacity:0.28, duration:500 },
      { at:380, type:'creature_shake',  target:'target', intensity:3, duration:340 },
      { at:460, type:'shockwave',       origin:'target', size:38, color:'#2266bb', opacity:0.52, thickness:2 },
      { at:480, type:'status_ring',     target:'target', color:'#1155bb', duration:700 },
    ],
  },

  // ── surf_wave ─────────────────────────────────────────────────────────────
  // AoE water. Wave rolls across all enemies.
  surf_wave: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-surf-wave' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:480 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:8 },
      { at:280, type:'sound',          id:'hit-light' },
      { at:330, type:'impact' },
      { at:330, type:'shockwave',      origin:'actor',  size:90, color:'#0088cc', opacity:0.60, thickness:3, duration:400 },
      { at:330, type:'preset',         id:'water_field_effect' },
      { at:370, type:'preset',         id:'water_particle_heavy', origin:'actor' },
    ],
  },

  // ── high_tide ─────────────────────────────────────────────────────────────
  high_tide: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-high-tide' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:580 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:10 },
      { at:360, type:'sound',          id:'hit-heavy' },
      { at:420, type:'impact' },
      { at:420, type:'shockwave',      origin:'actor',  size:105, color:'#0088cc', opacity:0.68, thickness:3, duration:420 },
      { at:420, type:'preset',         id:'water_field_effect', opacity:0.70, duration:300 },
      { at:460, type:'preset',         id:'water_particle_heavy', origin:'actor' },
      { at:460, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

  // ── high_tide_2 ───────────────────────────────────────────────────────────
  high_tide_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-high-tide-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:680 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:14, spread:50 },
      { at:440, type:'sound',          id:'hit-heavy' },
      { at:500, type:'impact' },
      { at:500, type:'hit_stop',       duration:50 },
      { at:500, type:'shockwave',      origin:'actor',  size:125, color:'#0088cc', opacity:0.75, thickness:4, duration:440 },
      { at:500, type:'preset',         id:'water_field_effect', opacity:0.85, duration:360 },
      { at:540, type:'preset',         id:'water_particle_heavy', origin:'actor' },
      { at:540, type:'particle_burst', origin:'actor',  color:'#44bbee', count:20, spread:90, direction:'all', duration:560 },
      { at:540, type:'screen_shake',   intensity:6, duration:260 },
      { at:620, type:'field_flash',    color:'#005599', opacity:0.28, duration:220 },
    ],
  },

  // ── deep_surge ────────────────────────────────────────────────────────────
  // Efficient single. Heavy projectile, clean hit.
  deep_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-deep-surge' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:520 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:8, spread:35 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:6, spread:30, direction:'all', duration:380, content:'🌊' },
      { at:100, type:'preset',         id:'water_projectile_heavy' },
      { at:540, type:'impact' },
      { at:540, type:'sound',          id:'hit-heavy' },
      { at:540, type:'creature_anim',  target:'target', class:'anim-hit-water-heavy' },
      { at:540, type:'creature_tint',  target:'target', color:'#005599', blend:'multiply', duration:520 },
      { at:540, type:'preset',         id:'water_particle_heavy' },
      { at:540, type:'preset',         id:'water_hit_flash_heavy' },
      { at:540, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

  // ── deep_surge_2 ──────────────────────────────────────────────────────────
  deep_surge_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-deep-surge-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:600 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:11, spread:40 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:8, spread:35, direction:'all', duration:460, content:'🌊' },
      { at:120, type:'preset',         id:'water_projectile_heavy', size:26, duration:340 },
      { at:620, type:'impact' },
      { at:620, type:'hit_stop',       duration:55 },
      { at:620, type:'sound',          id:'hit-heavy' },
      { at:620, type:'creature_anim',  target:'target', class:'anim-hit-water-heavy' },
      { at:620, type:'creature_tint',  target:'target', color:'#005599', blend:'multiply', duration:540 },
      { at:620, type:'preset',         id:'water_particle_heavy' },
      { at:620, type:'preset',         id:'water_hit_flash_heavy' },
      { at:620, type:'shockwave',      origin:'target', size:112, color:'#0088cc', opacity:0.72, thickness:4, duration:420 },
      { at:620, type:'screen_shake',   intensity:6, duration:260 },
    ],
  },

  // ── tidal_crash ───────────────────────────────────────────────────────────
  tidal_crash: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-tidal-crash' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:660 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:10, spread:40 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:8, spread:36, direction:'all', duration:480, content:'🌊' },
      { at:340, type:'sound',          id:'hit-heavy' },
      { at:340, type:'preset',         id:'water_beam' },
      { at:560, type:'impact' },
      { at:560, type:'hit_stop',       duration:60 },
      { at:560, type:'creature_anim',  target:'target', class:'anim-hit-water-heavy' },
      { at:560, type:'creature_tint',  target:'target', color:'#004477', blend:'multiply', duration:560 },
      { at:560, type:'preset',         id:'water_particle_heavy' },
      { at:560, type:'preset',         id:'water_hit_flash_heavy' },
      { at:560, type:'shockwave',      origin:'target', size:118, color:'#0088cc', opacity:0.75, thickness:4, duration:440 },
      { at:560, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── ocean_crush ───────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge, oceanic eruption on landing.
  ocean_crush: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-ocean-crush-charge' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#44bbee', blend:'screen',   duration:760 },
      { at:0,   type:'preset',         id:'water_cast_aura', count:16, spread:55 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#44bbee', count:11, spread:48, direction:'all', duration:560, content:'🌊' },
      { at:560, type:'sound',          id:'hit-heavy' },
      { at:560, type:'creature_anim',  target:'actor',  class:'anim-cast-ocean-crush-lunge', lunge:true },
      { at:760, type:'impact' },
      { at:760, type:'hit_stop',       duration:90 },
      { at:760, type:'sound',          id:'hit-heavy' },
      { at:760, type:'creature_anim',  target:'target', class:'anim-hit-water-heavy' },
      { at:760, type:'creature_tint',  target:'target', color:'#004477', blend:'multiply', duration:720 },
      { at:760, type:'preset',         id:'water_particle_heavy' },
      { at:760, type:'preset',         id:'water_hit_flash_heavy' },
      { at:760, type:'shockwave',      origin:'target', size:148, color:'#0088cc', opacity:0.85, thickness:5, duration:480 },
      { at:800, type:'shockwave',      origin:'target', size:78,  color:'#44bbee', opacity:0.60, thickness:3, duration:400 },
      { at:760, type:'screen_shake',   intensity:11, duration:400, style:'stutter' },
      { at:840, type:'preset',         id:'water_field_effect', opacity:0.80, duration:360 },
      { at:940, type:'particle_burst', origin:'target', color:'#44bbee', count:20, spread:75, direction:'all', duration:520 },
      { at:940, type:'field_flash',    color:'#005599', opacity:0.38, duration:260 },
    ],
  },

});
