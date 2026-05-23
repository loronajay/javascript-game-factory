registerMoveAnimations({

  // ── tide_slap ─────────────────────────────────────────────────────────────
  tide_slap: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tide-slap' },
      { at:0,   type:'preset',        id:'water_cast_aura' },
      { at:180, type:'sound',         id:'hit-light' },
      { at:180, type:'creature_anim', target:'actor',  class:'anim-cast-tide-slap-lunge', lunge:true },
      { at:300, type:'impact' },
      { at:300, type:'creature_anim', target:'target', class:'anim-hit-water-light' },
      { at:300, type:'preset',        id:'water_particle_light' },
      { at:300, type:'preset',        id:'water_hit_flash_light' },
    ],
  },

  // ── tide_slap_2 ───────────────────────────────────────────────────────────
  tide_slap_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tide-slap-2' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:9 },
      { at:220, type:'sound',         id:'hit-heavy' },
      { at:220, type:'creature_anim', target:'actor',  class:'anim-cast-tide-slap-2-lunge', lunge:true },
      { at:360, type:'impact' },
      { at:360, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:360, type:'preset',        id:'water_particle_heavy' },
      { at:360, type:'preset',        id:'water_hit_flash_heavy' },
      { at:360, type:'screen_shake',  intensity:3, duration:180 },
    ],
  },

  // ── tide_slap_3 ───────────────────────────────────────────────────────────
  tide_slap_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tide-slap-3' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:12, spread:40 },
      { at:280, type:'sound',         id:'hit-heavy' },
      { at:280, type:'creature_anim', target:'actor',  class:'anim-cast-tide-slap-3-lunge', lunge:true },
      { at:440, type:'impact' },
      { at:440, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:440, type:'preset',        id:'water_particle_heavy' },
      { at:440, type:'preset',        id:'water_hit_flash_heavy' },
      { at:440, type:'screen_shake',  intensity:5, duration:240, style:'stutter' },
    ],
  },

  // ── brine_shield ──────────────────────────────────────────────────────────
  // Self-buff (DEF + SPI). Dense brine particles coat actor.
  brine_shield: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-brine-shield' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:8, spread:40 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44bbee', count:12, spread:50, direction:'all', duration:560 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',    color:'#0088cc', opacity:0.22, duration:220 },
    ],
  },

  // ── barnacle_wall ─────────────────────────────────────────────────────────
  // Self-buff (DEF +2). Heavy shell forms around actor.
  barnacle_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-barnacle-wall' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#005599', count:14, spread:55, direction:'all', duration:620 },
      { at:420, type:'impact' },
      { at:420, type:'field_flash',    color:'#0088cc', opacity:0.30, duration:260 },
    ],
  },

  // ── tide_wall ─────────────────────────────────────────────────────────────
  // Self-buff (DEF +2, SPI +1). Towering water wall rises around actor.
  tide_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-tide-wall' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44bbee', count:18, spread:65, direction:'up', duration:680 },
      { at:460, type:'impact' },
      { at:460, type:'field_flash',    color:'#0088cc', opacity:0.38, duration:280 },
    ],
  },

  // ── water_jet ─────────────────────────────────────────────────────────────
  water_jet: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-water-jet' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:5 },
      { at:80,  type:'preset',        id:'water_projectile_light' },
      { at:480, type:'impact' },
      { at:480, type:'sound',         id:'hit-light' },
      { at:480, type:'creature_anim', target:'target', class:'anim-hit-water-light' },
      { at:480, type:'preset',        id:'water_particle_light' },
      { at:480, type:'preset',        id:'water_hit_flash_light' },
    ],
  },

  // ── whirlpool ─────────────────────────────────────────────────────────────
  // Debuff utility (SPD -1, ACC -1). Swirling water traps target.
  whirlpool: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-whirlpool' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:6 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#005599', size:20, arc:-15, duration:420 },
      { at:460, type:'impact' },
      { at:460, type:'sound',          id:'hit-light' },
      { at:460, type:'creature_anim',  target:'target', class:'anim-hit-whirlpool' },
      { at:460, type:'particle_burst', origin:'target', color:'#44bbee', count:10, spread:55, direction:'all', duration:500 },
      { at:460, type:'field_flash',    color:'#0088cc', opacity:0.20, duration:220 },
    ],
  },

  // ── surf_wave ─────────────────────────────────────────────────────────────
  // AoE water. Wave rolls across all enemies.
  surf_wave: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-surf-wave' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:8 },
      { at:280, type:'sound',          id:'hit-light' },
      { at:330, type:'impact' },
      { at:330, type:'preset',         id:'water_field_effect' },
      { at:370, type:'preset',         id:'water_particle_heavy', origin:'actor' },
    ],
  },

  // ── high_tide ─────────────────────────────────────────────────────────────
  high_tide: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-high-tide' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:10 },
      { at:360, type:'sound',          id:'hit-heavy' },
      { at:420, type:'impact' },
      { at:420, type:'preset',         id:'water_field_effect', opacity:0.70, duration:300 },
      { at:460, type:'preset',         id:'water_particle_heavy', origin:'actor' },
      { at:460, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

  // ── high_tide_2 ───────────────────────────────────────────────────────────
  high_tide_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-high-tide-2' },
      { at:0,   type:'preset',         id:'water_cast_aura', count:14, spread:50 },
      { at:440, type:'sound',          id:'hit-heavy' },
      { at:500, type:'impact' },
      { at:500, type:'preset',         id:'water_field_effect', opacity:0.85, duration:360 },
      { at:540, type:'preset',         id:'water_particle_heavy', origin:'actor' },
      { at:540, type:'particle_burst', origin:'actor', color:'#44bbee', count:20, spread:90, direction:'all', duration:560 },
      { at:540, type:'screen_shake',   intensity:6, duration:260 },
      { at:620, type:'field_flash',    color:'#005599', opacity:0.28, duration:220 },
    ],
  },

  // ── deep_surge ────────────────────────────────────────────────────────────
  // Efficient single. Heavy projectile, clean hit.
  deep_surge: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-deep-surge' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:8, spread:35 },
      { at:100, type:'preset',        id:'water_projectile_heavy' },
      { at:540, type:'impact' },
      { at:540, type:'sound',         id:'hit-heavy' },
      { at:540, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:540, type:'preset',        id:'water_particle_heavy' },
      { at:540, type:'preset',        id:'water_hit_flash_heavy' },
      { at:540, type:'screen_shake',  intensity:4, duration:200 },
    ],
  },

  // ── deep_surge_2 ──────────────────────────────────────────────────────────
  deep_surge_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-deep-surge-2' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:11, spread:40 },
      { at:120, type:'preset',        id:'water_projectile_heavy', size:26, duration:340 },
      { at:620, type:'impact' },
      { at:620, type:'sound',         id:'hit-heavy' },
      { at:620, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:620, type:'preset',        id:'water_particle_heavy' },
      { at:620, type:'preset',        id:'water_hit_flash_heavy' },
      { at:620, type:'screen_shake',  intensity:6, duration:260 },
    ],
  },

  // ── tidal_crash ───────────────────────────────────────────────────────────
  tidal_crash: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tidal-crash' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:10, spread:40 },
      { at:340, type:'sound',         id:'hit-heavy' },
      { at:340, type:'preset',        id:'water_beam' },
      { at:560, type:'impact' },
      { at:560, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:560, type:'preset',        id:'water_particle_heavy' },
      { at:560, type:'preset',        id:'water_hit_flash_heavy' },
      { at:560, type:'screen_shake',  intensity:5, duration:240 },
    ],
  },

  // ── ocean_crush ───────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge, oceanic eruption on landing.
  ocean_crush: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ocean-crush-charge' },
      { at:0,   type:'preset',        id:'water_cast_aura', count:16, spread:55 },
      { at:560, type:'sound',         id:'hit-heavy' },
      { at:560, type:'creature_anim', target:'actor',  class:'anim-cast-ocean-crush-lunge', lunge:true },
      { at:760, type:'impact' },
      { at:760, type:'sound',         id:'hit-heavy' },
      { at:760, type:'creature_anim', target:'target', class:'anim-hit-water-heavy' },
      { at:760, type:'preset',        id:'water_particle_heavy' },
      { at:760, type:'preset',        id:'water_hit_flash_heavy' },
      { at:760, type:'screen_shake',  intensity:11, duration:400, style:'stutter' },
      { at:840, type:'preset',        id:'water_field_effect', opacity:0.80, duration:360 },
      { at:940, type:'field_flash',   color:'#005599', opacity:0.38, duration:260 },
    ],
  },

});
