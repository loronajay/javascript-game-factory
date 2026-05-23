registerMoveAnimations({

  // ── moss_strike ───────────────────────────────────────────────────────────
  moss_strike: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-moss-strike' },
      { at:0,   type:'preset',        id:'earth_cast_aura' },
      { at:240, type:'sound',         id:'hit-light' },
      { at:240, type:'creature_anim', target:'actor',  class:'anim-cast-moss-strike-lunge', lunge:true },
      { at:360, type:'impact' },
      { at:360, type:'creature_anim', target:'target', class:'anim-hit-earth-light' },
      { at:360, type:'preset',        id:'earth_particle_light' },
      { at:360, type:'preset',        id:'earth_hit_flash_light' },
    ],
  },

  // ── moss_strike_2 ─────────────────────────────────────────────────────────
  moss_strike_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-moss-strike-2' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:9 },
      { at:270, type:'sound',         id:'hit-heavy' },
      { at:270, type:'creature_anim', target:'actor',  class:'anim-cast-moss-strike-2-lunge', lunge:true },
      { at:420, type:'impact' },
      { at:420, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:420, type:'preset',        id:'earth_particle_heavy' },
      { at:420, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:420, type:'screen_shake',  intensity:5, duration:220 },
    ],
  },

  // ── moss_strike_3 ─────────────────────────────────────────────────────────
  moss_strike_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-moss-strike-3' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:12, spread:40 },
      { at:320, type:'sound',         id:'hit-heavy' },
      { at:320, type:'creature_anim', target:'actor',  class:'anim-cast-moss-strike-3-lunge', lunge:true },
      { at:500, type:'impact' },
      { at:500, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:500, type:'preset',        id:'earth_particle_heavy' },
      { at:500, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:500, type:'screen_shake',  intensity:7, duration:280, style:'stutter' },
    ],
  },

  // ── spore_drift ───────────────────────────────────────────────────────────
  // Permanent poison utility. Toxic spore cloud drifts to target.
  spore_drift: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-spore-drift' },
      { at:0,   type:'preset',         id:'earth_cast_aura', color:'#556633', count:5 },
      { at:80,  type:'particle_burst', origin:'actor', color:'#556633', count:12, spread:60, direction:'all', duration:700 },
      { at:420, type:'impact' },
      { at:420, type:'sound',          id:'hit-light' },
      { at:420, type:'creature_anim',  target:'target', class:'anim-hit-spore' },
      { at:420, type:'particle_burst', origin:'target', color:'#334422', count:10, spread:50, direction:'all', duration:600 },
      { at:420, type:'field_flash',    color:'#334422', opacity:0.20, duration:240 },
    ],
  },

  // ── root_grab ─────────────────────────────────────────────────────────────
  // Slow utility. Roots erupt from the ground beneath a foe.
  root_grab: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-root-grab' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:5 },
      { at:100, type:'particle_burst', origin:'target', color:'#556633', count:10, spread:40, direction:'up', duration:560 },
      { at:380, type:'impact' },
      { at:380, type:'sound',          id:'hit-light' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-root-grab' },
      { at:380, type:'field_flash',    color:'#334422', opacity:0.18, duration:200 },
    ],
  },

  // ── earth_slab ────────────────────────────────────────────────────────────
  // Heavy projectile — slab of earth drops on target.
  earth_slab: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-earth-slab' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:5 },
      { at:80,  type:'preset',        id:'earth_projectile_light', size:18, duration:360 },
      { at:520, type:'impact' },
      { at:520, type:'sound',         id:'hit-heavy' },
      { at:520, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:520, type:'preset',        id:'earth_particle_heavy' },
      { at:520, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:520, type:'screen_shake',  intensity:4, duration:200 },
    ],
  },

  // ── overgrowth ────────────────────────────────────────────────────────────
  // Self-buff (DEF +2). Dense earth-moss armor grows over actor.
  overgrowth: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-overgrowth' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#556633', count:16, spread:60, direction:'all', duration:660 },
      { at:440, type:'impact' },
      { at:440, type:'field_flash',    color:'#334422', opacity:0.25, duration:260 },
    ],
  },

  // ── mudslide ──────────────────────────────────────────────────────────────
  // AoE earth physical. Heavy mud wave engulfs all enemies.
  mudslide: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-mudslide' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:8 },
      { at:340, type:'sound',          id:'hit-heavy' },
      { at:400, type:'impact' },
      { at:400, type:'preset',         id:'earth_field_effect' },
      { at:440, type:'preset',         id:'earth_particle_heavy', origin:'actor' },
      { at:440, type:'particle_burst', origin:'actor', color:'#664422', count:16, spread:85, direction:'all', duration:560 },
      { at:440, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── vine_snare ────────────────────────────────────────────────────────────
  // Stun utility. Vines erupt and bind the target.
  vine_snare: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-vine-snare' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:5 },
      { at:80,  type:'particle_burst', origin:'target', color:'#445533', count:12, spread:45, direction:'up', duration:600 },
      { at:400, type:'impact' },
      { at:400, type:'sound',          id:'hit-heavy' },
      { at:400, type:'creature_anim',  target:'target', class:'anim-hit-vine-snare' },
      { at:400, type:'particle_burst', origin:'target', color:'#334422', count:14, spread:55, direction:'all', duration:540 },
      { at:400, type:'field_flash',    color:'#334422', opacity:0.28, duration:260 },
    ],
  },

  // ── spore_burst ───────────────────────────────────────────────────────────
  // AoE slow utility. Toxic spore explosion slows all enemies.
  spore_burst: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-spore-burst' },
      { at:0,   type:'preset',         id:'earth_cast_aura', color:'#556633', count:10 },
      { at:300, type:'impact' },
      { at:300, type:'particle_burst', origin:'actor', color:'#445533', count:20, spread:90, direction:'all', duration:700 },
      { at:300, type:'field_flash',    color:'#334422', opacity:0.24, duration:300 },
    ],
  },

  // ── moss_wall ─────────────────────────────────────────────────────────────
  // Self-buff (DEF + SPI). Layered moss-earth shell reinforces actor.
  moss_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-moss-wall' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#664433', count:18, spread:65, direction:'all', duration:680 },
      { at:460, type:'impact' },
      { at:460, type:'field_flash',    color:'#443322', opacity:0.28, duration:280 },
    ],
  },

  // ── stone_press ───────────────────────────────────────────────────────────
  // Single heavy drop attack.
  stone_press: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-stone-press' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:10, spread:35 },
      { at:120, type:'preset',         id:'earth_projectile_heavy', size:28, duration:440 },
      { at:700, type:'impact' },
      { at:700, type:'sound',          id:'hit-heavy' },
      { at:700, type:'creature_anim',  target:'target', class:'anim-hit-earth-heavy' },
      { at:700, type:'preset',         id:'earth_particle_heavy' },
      { at:700, type:'preset',         id:'earth_hit_flash_heavy' },
      { at:700, type:'screen_shake',   intensity:7, duration:300, style:'stutter' },
    ],
  },

  // ── stone_press_2 ─────────────────────────────────────────────────────────
  stone_press_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-stone-press-2' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:14, spread:45 },
      { at:140, type:'preset',         id:'earth_projectile_heavy', size:34, duration:500 },
      { at:800, type:'impact' },
      { at:800, type:'sound',          id:'hit-heavy' },
      { at:800, type:'creature_anim',  target:'target', class:'anim-hit-earth-heavy' },
      { at:800, type:'preset',         id:'earth_particle_heavy' },
      { at:800, type:'preset',         id:'earth_hit_flash_heavy' },
      { at:800, type:'screen_shake',   intensity:9, duration:340, style:'stutter' },
      { at:880, type:'field_flash',    color:'#664422', opacity:0.32, duration:240 },
    ],
  },

  // ── mudslide_2 ────────────────────────────────────────────────────────────
  mudslide_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-mudslide-2' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:14, spread:50 },
      { at:440, type:'sound',          id:'hit-heavy' },
      { at:500, type:'impact' },
      { at:500, type:'preset',         id:'earth_field_effect', opacity:0.80, duration:360 },
      { at:540, type:'preset',         id:'earth_particle_heavy', origin:'actor' },
      { at:540, type:'particle_burst', origin:'actor', color:'#664422', count:22, spread:90, direction:'all', duration:600 },
      { at:540, type:'screen_shake',   intensity:8, duration:320, style:'stutter' },
      { at:640, type:'field_flash',    color:'#443311', opacity:0.35, duration:240 },
    ],
  },

  // ── petrify ───────────────────────────────────────────────────────────────
  // Stun utility. Stone encases the target completely.
  petrify: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-petrify' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:10, spread:40 },
      { at:100, type:'preset',         id:'earth_projectile_heavy', size:30, duration:460 },
      { at:700, type:'impact' },
      { at:700, type:'sound',          id:'hit-heavy' },
      { at:700, type:'creature_anim',  target:'target', class:'anim-hit-petrify' },
      { at:700, type:'particle_burst', origin:'target', color:'#886644', count:14, spread:55, direction:'all', duration:560 },
      { at:700, type:'preset',         id:'earth_hit_flash_heavy' },
      { at:700, type:'screen_shake',   intensity:5, duration:220 },
    ],
  },

  // ── ancient_crush ─────────────────────────────────────────────────────────
  // Ultimate lunge. Slow, heavy, absolutely crushing.
  ancient_crush: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:220 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ancient-crush-charge' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:16, spread:55 },
      { at:620, type:'sound',         id:'hit-heavy' },
      { at:620, type:'creature_anim', target:'actor',  class:'anim-cast-ancient-crush-lunge', lunge:true },
      { at:840, type:'impact' },
      { at:840, type:'sound',         id:'hit-heavy' },
      { at:840, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:840, type:'preset',        id:'earth_particle_heavy' },
      { at:840, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:840, type:'screen_shake',  intensity:13, duration:460, style:'stutter' },
      { at:920, type:'preset',        id:'earth_field_effect', opacity:0.85, duration:400 },
      { at:1020,type:'field_flash',   color:'#664422', opacity:0.42, duration:280 },
    ],
  },

});
