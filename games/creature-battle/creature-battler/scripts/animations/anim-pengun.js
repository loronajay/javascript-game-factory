registerMoveAnimations({

  // ── ice_pebble ─────────────────────────────────────────────────────────────
  // Snappy ice shard → light chill flash.
  ice_pebble: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ice-pebble' },
      { at:0,   type:'preset',        id:'ice_cast_aura' },
      { at:100, type:'preset',        id:'ice_projectile_light', duration:240 },
      { at:270, type:'impact' },
      { at:270, type:'sound',         id:'hit-light' },
      { at:270, type:'creature_anim', target:'target', class:'anim-hit-ice-light' },
      { at:270, type:'preset',        id:'ice_particle_light' },
      { at:270, type:'preset',        id:'ice_hit_flash_light' },
    ],
  },

  // ── ice_pebble_2 ───────────────────────────────────────────────────────────
  // Larger shard, medium shake on impact.
  ice_pebble_2: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ice-pebble-2' },
      { at:0,   type:'preset',        id:'ice_cast_aura' },
      { at:120, type:'preset',        id:'ice_projectile_heavy', size:16, duration:280 },
      { at:360, type:'impact' },
      { at:360, type:'sound',         id:'hit-light' },
      { at:360, type:'creature_anim', target:'target', class:'anim-hit-ice-heavy' },
      { at:360, type:'preset',        id:'ice_particle_heavy' },
      { at:360, type:'preset',        id:'ice_hit_flash_light' },
      { at:360, type:'screen_shake',  intensity:3, duration:200 },
    ],
  },

  // ── ice_pebble_3 ───────────────────────────────────────────────────────────
  // Razor lance: full heavy projectile, stutter shake.
  ice_pebble_3: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-ice-pebble-3' },
      { at:0,   type:'preset',        id:'ice_cast_aura', count:9 },
      { at:140, type:'preset',        id:'ice_projectile_heavy' },
      { at:430, type:'impact' },
      { at:430, type:'sound',         id:'hit-heavy' },
      { at:430, type:'creature_anim', target:'target', class:'anim-hit-ice-heavy' },
      { at:430, type:'preset',        id:'ice_particle_heavy' },
      { at:430, type:'preset',        id:'ice_hit_flash_heavy' },
      { at:430, type:'screen_shake',  intensity:6, duration:280, style:'stutter' },
    ],
  },

  // ── cold_feet ──────────────────────────────────────────────────────────────
  // Utility (slow). Floor-freeze projectile; ice particles fall downward on target.
  cold_feet: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-cold-feet' },
      { at:0,   type:'preset',         id:'ice_cast_aura', direction:'down', spread:30 },
      { at:100, type:'preset',         id:'ice_projectile_light', duration:260 },
      { at:310, type:'impact' },
      { at:310, type:'sound',          id:'hit-light' },
      { at:310, type:'creature_anim',  target:'target', class:'anim-hit-freeze-status' },
      { at:310, type:'particle_burst', origin:'target', color:'#88ccff', count:6, spread:40, direction:'down', duration:420 },
      { at:310, type:'preset',         id:'ice_hit_flash_light' },
    ],
  },

  // ── glacier_wall ───────────────────────────────────────────────────────────
  // Self-buff (DEF + SPI). Dense crouch, icy aura washes out.
  glacier_wall: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor', class:'anim-cast-glacier-wall' },
      { at:0,   type:'preset',        id:'ice_cast_aura', direction:'all', spread:40 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',   color:'#aaddff', opacity:0.14, duration:200 },
    ],
  },

  // ── snow_blind ─────────────────────────────────────────────────────────────
  // Utility (blind). Pale snow shard → burst of snow particles on target.
  snow_blind: {
    timeline: [
      { at:0,   type:'sound',          id:'beam-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-snow-blind' },
      { at:0,   type:'preset',         id:'ice_cast_aura', count:4, spread:25 },
      { at:100, type:'preset',         id:'ice_projectile_light', color:'#eef8ff', duration:300 },
      { at:340, type:'impact' },
      { at:340, type:'sound',          id:'hit-light' },
      { at:340, type:'creature_anim',  target:'target', class:'anim-hit-snow-blind' },
      { at:340, type:'particle_burst', origin:'target', color:'#ccebff', count:9, spread:55, direction:'all', duration:480 },
      { at:340, type:'preset',         id:'ice_hit_flash_light' },
    ],
  },

  // ── whiteout ───────────────────────────────────────────────────────────────
  // Utility (blind, stronger). Beam delivery → whiteout burst, cold field wash.
  whiteout: {
    timeline: [
      { at:0,   type:'sound',          id:'beam-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-whiteout' },
      { at:0,   type:'preset',         id:'ice_cast_aura', count:7, spread:30 },
      { at:100, type:'preset',         id:'ice_beam', color:'#cceeff', width:4, duration:340 },
      { at:260, type:'impact' },
      { at:260, type:'sound',          id:'hit-light' },
      { at:260, type:'creature_anim',  target:'target', class:'anim-hit-snow-blind' },
      { at:260, type:'particle_burst', origin:'target', color:'#ddf4ff', count:12, spread:65, direction:'all', duration:520 },
      { at:260, type:'field_flash',    color:'#bbddff', opacity:0.20, duration:220 },
    ],
  },

  // ── frost_nip ──────────────────────────────────────────────────────────────
  // Two-pulse charge → icy lunge bite. lunge:true injects dx/dy at runtime.
  frost_nip: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-frost-charge' },
      { at:0,   type:'preset',        id:'ice_cast_aura', count:8, spread:32 },
      { at:440, type:'sound',         id:'beam-light' },
      { at:440, type:'creature_anim', target:'actor',  class:'anim-cast-frost-nip', lunge:true },
      { at:660, type:'impact' },
      { at:660, type:'sound',         id:'hit-heavy' },
      { at:660, type:'creature_anim', target:'target', class:'anim-hit-ice-heavy' },
      { at:660, type:'preset',        id:'ice_particle_heavy' },
      { at:660, type:'preset',        id:'ice_hit_flash_heavy' },
      { at:660, type:'screen_shake',  intensity:5, duration:240, style:'stutter' },
    ],
  },

  // ── ice_lock ───────────────────────────────────────────────────────────────
  // Utility (stun). Ice beam → freeze cage bursts around target.
  ice_lock: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-ice-lock' },
      { at:0,   type:'preset',         id:'ice_cast_aura', direction:'all', spread:38 },
      { at:120, type:'preset',         id:'ice_beam', color:'#55bbff', width:3, duration:340 },
      { at:280, type:'impact' },
      { at:280, type:'sound',          id:'hit-light' },
      { at:280, type:'creature_anim',  target:'target', class:'anim-hit-freeze-status' },
      { at:280, type:'particle_burst', origin:'target', color:'#44aaff', count:10, spread:48, direction:'all', duration:500 },
      { at:280, type:'field_flash',    color:'#002244', opacity:0.24, duration:240 },
    ],
  },

  // ── frozen_pulse ───────────────────────────────────────────────────────────
  // Damage + slow. Heavy ice pulse projectile, solid shake.
  frozen_pulse: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-frozen-pulse' },
      { at:0,   type:'preset',        id:'ice_cast_aura', count:6, spread:28 },
      { at:120, type:'preset',        id:'ice_projectile_heavy', size:18, duration:320 },
      { at:390, type:'impact' },
      { at:390, type:'sound',         id:'hit-heavy' },
      { at:390, type:'creature_anim', target:'target', class:'anim-hit-ice-heavy' },
      { at:390, type:'preset',        id:'ice_particle_heavy' },
      { at:390, type:'preset',        id:'ice_hit_flash_heavy' },
      { at:390, type:'screen_shake',  intensity:4, duration:220 },
    ],
  },

  // ── shatter_chill ──────────────────────────────────────────────────────────
  // AoE ice. Frozen detonation, field effect covers all enemies.
  shatter_chill: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-shatter-chill' },
      { at:0,   type:'preset',       id:'ice_cast_aura' },
      { at:300, type:'sound',        id:'beam-light' },
      { at:360, type:'impact' },
      { at:360, type:'sound',        id:'hit-heavy' },
      { at:360, type:'preset',       id:'ice_field_effect' },
      { at:360, type:'screen_shake', intensity:4, duration:250 },
      { at:410, type:'preset',       id:'ice_particle_heavy', origin:'actor' },
    ],
  },

  // ── shatter_chill_2 ────────────────────────────────────────────────────────
  shatter_chill_2: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-shatter-chill-2' },
      { at:0,   type:'preset',       id:'ice_cast_aura', count:9 },
      { at:340, type:'sound',        id:'beam-light' },
      { at:450, type:'impact' },
      { at:450, type:'sound',        id:'hit-heavy' },
      { at:450, type:'preset',       id:'ice_field_effect', opacity:0.72, duration:360 },
      { at:450, type:'screen_shake', intensity:6, duration:300, style:'stutter' },
      { at:500, type:'preset',       id:'ice_particle_heavy', origin:'actor' },
    ],
  },

  // ── shatter_chill_3 ────────────────────────────────────────────────────────
  // Field-wide devastation. Deep freeze aftershock pulse.
  shatter_chill_3: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-shatter-chill-3' },
      { at:0,   type:'preset',       id:'ice_cast_aura', count:11, spread:40 },
      { at:380, type:'sound',        id:'beam-light', repeat:2, interval:100 },
      { at:520, type:'impact' },
      { at:520, type:'sound',        id:'hit-heavy' },
      { at:520, type:'preset',       id:'ice_field_effect', opacity:0.84, duration:420 },
      { at:520, type:'screen_shake', intensity:8, duration:380, style:'stutter' },
      { at:570, type:'preset',       id:'ice_particle_heavy', origin:'actor' },
      { at:640, type:'field_flash',  color:'#003366', opacity:0.30, duration:220 },
    ],
  },

  // ── blizzard ───────────────────────────────────────────────────────────────
  // AoE sweep. Sustained cold wash across all enemies.
  blizzard: {
    timeline: [
      { at:0,   type:'sound',        id:'beam-light' },
      { at:0,   type:'creature_anim',target:'actor', class:'anim-cast-blizzard' },
      { at:0,   type:'preset',       id:'ice_cast_aura', count:9, spread:40 },
      { at:320, type:'sound',        id:'beam-light' },
      { at:400, type:'impact' },
      { at:400, type:'sound',        id:'hit-heavy' },
      { at:400, type:'preset',       id:'ice_field_effect', opacity:0.68, duration:340 },
      { at:400, type:'screen_shake', intensity:5, duration:280 },
      { at:450, type:'preset',       id:'ice_particle_heavy', origin:'actor' },
    ],
  },

  // ── absolute_zero ──────────────────────────────────────────────────────────
  // Ultimate. Three-pulse charge → massive lunge, stutter shake, deep-cold aftershock.
  absolute_zero: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-absolute-zero-charge' },
      { at:0,   type:'preset',        id:'ice_cast_aura', count:12, spread:48, direction:'all' },
      { at:520, type:'sound',         id:'beam-light' },
      { at:520, type:'creature_anim', target:'actor',  class:'anim-cast-absolute-zero', lunge:true },
      { at:760, type:'impact' },
      { at:760, type:'sound',         id:'hit-heavy' },
      { at:760, type:'creature_anim', target:'target', class:'anim-hit-ice-heavy' },
      { at:760, type:'preset',        id:'ice_particle_heavy' },
      { at:760, type:'preset',        id:'ice_hit_flash_heavy' },
      { at:760, type:'screen_shake',  intensity:8, duration:320, style:'stutter' },
      { at:820, type:'field_flash',   color:'#002255', opacity:0.32, duration:240 },
    ],
  },

});
