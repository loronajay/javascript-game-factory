registerMoveAnimations({

  // ── ice_pebble ─────────────────────────────────────────────────────────────
  // Snappy crystal snap. Brief glint before the shot, small cold ring on hit.
  // Dot particles — shard impacts read as crystal, not gentle snow.
  ice_pebble: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaddff', count:2, interval:80, direction:'up', duration:100 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-ice-pebble' },
      { at:0,   type:'preset',          id:'ice_cast_aura' },
      { at:100, type:'preset',          id:'ice_projectile_light', duration:240 },
      { at:270, type:'impact' },
      { at:270, type:'sound',           id:'hit-light' },
      { at:270, type:'creature_anim',   target:'target', class:'anim-hit-ice-light' },
      { at:270, type:'preset',          id:'ice_particle_light' },
      { at:270, type:'preset',          id:'ice_hit_flash_light' },
      { at:270, type:'shockwave',       origin:'target', size:24, color:'#88ccff', opacity:0.50, thickness:2 },
    ],
  },

  // ── ice_pebble_2 ───────────────────────────────────────────────────────────
  // Larger shard. Actor gets a cool blue cast tint; medium ring on impact.
  ice_pebble_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88aaff', count:3, interval:72, direction:'up', duration:130 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#55aaff', blend:'screen', opacity:0.20, duration:230 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-ice-pebble-2' },
      { at:0,   type:'preset',          id:'ice_cast_aura' },
      { at:120, type:'preset',          id:'ice_projectile_heavy', size:16, duration:280 },
      { at:360, type:'impact' },
      { at:360, type:'sound',           id:'hit-light' },
      { at:360, type:'creature_anim',   target:'target', class:'anim-hit-ice-heavy' },
      { at:360, type:'preset',          id:'ice_particle_heavy' },
      { at:360, type:'preset',          id:'ice_hit_flash_light' },
      { at:360, type:'screen_shake',    intensity:3, duration:200 },
      { at:360, type:'shockwave',       origin:'target', size:40, color:'#55aaff', opacity:0.58, thickness:3 },
    ],
  },

  // ── ice_pebble_3 ───────────────────────────────────────────────────────────
  // Razor lance. Dense crystal stream, hit_stop, large shard ring + freeze tint.
  ice_pebble_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaff', count:4, interval:62, direction:'up', duration:150, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2299dd', blend:'screen', opacity:0.30, duration:280 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-ice-pebble-3' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:9 },
      { at:140, type:'preset',          id:'ice_projectile_heavy' },
      { at:430, type:'impact' },
      { at:430, type:'sound',           id:'hit-heavy' },
      { at:430, type:'creature_anim',   target:'target', class:'anim-hit-ice-heavy' },
      { at:430, type:'preset',          id:'ice_particle_heavy' },
      { at:430, type:'preset',          id:'ice_hit_flash_heavy' },
      { at:430, type:'screen_shake',    intensity:6, duration:280, style:'stutter' },
      { at:430, type:'hit_stop',        duration:50 },
      { at:480, type:'shockwave',       origin:'target', size:55, color:'#44aaff', opacity:0.65, thickness:3 },
      { at:480, type:'creature_tint',   target:'target', color:'#0044aa', blend:'multiply', opacity:0.20, duration:320 },
    ],
  },

  // ── cold_feet ──────────────────────────────────────────────────────────────
  // Slow utility. ❄ forms at actor's feet before the shot; after impact
  // ❄ spreads DOWN across the target — the freeze visibly lingers.
  cold_feet: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88ccff', count:3, interval:85, direction:'down', size:11, duration:360, content:'❄' },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cold-feet' },
      { at:0,   type:'preset',          id:'ice_cast_aura', direction:'down', spread:30 },
      { at:100, type:'preset',          id:'ice_projectile_light', duration:260 },
      { at:310, type:'impact' },
      { at:310, type:'sound',           id:'hit-light' },
      { at:310, type:'creature_anim',   target:'target', class:'anim-hit-freeze-status' },
      { at:310, type:'particle_burst',  origin:'target', color:'#88ccff', count:8, spread:40, direction:'down', duration:440, content:'❄', size:11 },
      { at:310, type:'preset',          id:'ice_hit_flash_light' },
      { at:310, type:'particle_stream', origin:'target', color:'#55aaff', count:2, interval:90, direction:'down', size:11, duration:500, content:'❄' },
      { at:310, type:'creature_tint',   target:'target', color:'#0044aa', blend:'multiply', opacity:0.22, duration:450 },
      { at:310, type:'status_ring',     target:'target', color:'#55ccff', duration:700 },
    ],
  },

  // ── glacier_wall ───────────────────────────────────────────────────────────
  // DEF + SPI self-buff. ❄ drip DOWN as ice plates crystallize over the body;
  // dual status rings signal both stat raises.
  glacier_wall: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaddff', count:3, interval:88, direction:'down', size:11, duration:480, content:'❄' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#55aaff', blend:'screen', opacity:0.22, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-glacier-wall' },
      { at:0,   type:'preset',          id:'ice_cast_aura', direction:'all', spread:40 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',     color:'#aaddff', opacity:0.14, duration:200 },
      { at:340, type:'particle_burst',  origin:'actor',  color:'#aaddff', count:6, spread:35, direction:'all', duration:420, content:'❄', size:11 },
      { at:340, type:'status_ring',     target:'actor',  color:'#4499ff', duration:700 },
      { at:420, type:'status_ring',     target:'actor',  color:'#88eeff', duration:620 },
    ],
  },

  // ── snow_blind ─────────────────────────────────────────────────────────────
  // Blind utility. ❄ flurry settles on target — white-out tint + status ring
  // confirm the blind has landed.
  snow_blind: {
    timeline: [
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-snow-blind' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:4, spread:25 },
      { at:100, type:'preset',          id:'ice_projectile_light', color:'#eef8ff', duration:300 },
      { at:340, type:'impact' },
      { at:340, type:'sound',           id:'hit-light' },
      { at:340, type:'creature_anim',   target:'target', class:'anim-hit-snow-blind' },
      { at:340, type:'particle_burst',  origin:'target', color:'#ccebff', count:10, spread:55, direction:'all', duration:500, content:'❄', size:11 },
      { at:340, type:'preset',          id:'ice_hit_flash_light' },
      { at:340, type:'particle_stream', origin:'target', color:'#eef8ff', count:4, interval:80, direction:'all', spread:55, duration:540, content:'❄', size:10 },
      { at:340, type:'creature_tint',   target:'target', color:'#ccf0ff', blend:'multiply', opacity:0.25, duration:480 },
      { at:340, type:'status_ring',     target:'target', color:'#aaddff', duration:700 },
    ],
  },

  // ── whiteout ───────────────────────────────────────────────────────────────
  // Stronger blind via beam. Dense ❄ storm + deeper white-out tint.
  whiteout: {
    timeline: [
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-whiteout' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:7, spread:30 },
      { at:100, type:'preset',          id:'ice_beam', color:'#cceeff', width:4, duration:340 },
      { at:260, type:'impact' },
      { at:260, type:'sound',           id:'hit-light' },
      { at:260, type:'creature_anim',   target:'target', class:'anim-hit-snow-blind' },
      { at:260, type:'particle_burst',  origin:'target', color:'#ddf4ff', count:14, spread:65, direction:'all', duration:540, content:'❄', size:12 },
      { at:260, type:'field_flash',     color:'#bbddff', opacity:0.20, duration:220 },
      { at:260, type:'particle_stream', origin:'target', color:'#ddf8ff', count:5, interval:70, direction:'all', spread:60, glow:true, duration:580, content:'❄', size:11 },
      { at:260, type:'creature_tint',   target:'target', color:'#c8f0ff', blend:'multiply', opacity:0.32, duration:520 },
      { at:260, type:'status_ring',     target:'target', color:'#cceeff', duration:700 },
    ],
  },

  // ── frost_nip ──────────────────────────────────────────────────────────────
  // Icy lunge. Charge swirls with sharp crystals; hit_stop + kinetic ring +
  // deep-freeze tint on target. Crystal dots on charge — this reads as a
  // hard physical strike, not a snow shower.
  frost_nip: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88ccff', count:3, interval:72, direction:'up', spread:28, duration:440, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#44aaff', blend:'screen', opacity:0.25, duration:440 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-frost-charge' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:8, spread:32 },
      { at:440, type:'sound',           id:'beam-light' },
      { at:440, type:'creature_anim',   target:'actor',  class:'anim-cast-frost-nip', lunge:true },
      { at:660, type:'impact' },
      { at:660, type:'sound',           id:'hit-heavy' },
      { at:660, type:'creature_anim',   target:'target', class:'anim-hit-ice-heavy' },
      { at:660, type:'preset',          id:'ice_particle_heavy' },
      { at:660, type:'preset',          id:'ice_hit_flash_heavy' },
      { at:660, type:'screen_shake',    intensity:5, duration:240, style:'stutter' },
      { at:660, type:'hit_stop',        duration:55 },
      { at:715, type:'shockwave',       origin:'target', size:62, color:'#44aaff', opacity:0.70, thickness:4 },
      { at:715, type:'creature_tint',   target:'target', color:'#0044aa', blend:'multiply', opacity:0.25, duration:380 },
    ],
  },

  // ── ice_lock ───────────────────────────────────────────────────────────────
  // Stun utility. ❄ crystallize outward from the target and linger; deep
  // dark-blue tint + stun ring make the freeze unmistakable.
  ice_lock: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-ice-lock' },
      { at:0,   type:'preset',          id:'ice_cast_aura', direction:'all', spread:38 },
      { at:120, type:'preset',          id:'ice_beam', color:'#55bbff', width:3, duration:340 },
      { at:280, type:'impact' },
      { at:280, type:'sound',           id:'hit-light' },
      { at:280, type:'creature_anim',   target:'target', class:'anim-hit-freeze-status' },
      { at:280, type:'particle_burst',  origin:'target', color:'#44aaff', count:12, spread:50, direction:'all', duration:520, content:'❄', size:12 },
      { at:280, type:'field_flash',     color:'#002244', opacity:0.24, duration:240 },
      { at:280, type:'particle_stream', origin:'target', color:'#55aaff', count:4, interval:80, direction:'all', spread:48, duration:520, content:'❄', size:11 },
      { at:280, type:'creature_tint',   target:'target', color:'#003388', blend:'multiply', opacity:0.28, duration:500 },
      { at:280, type:'status_ring',     target:'target', color:'#55bbff', duration:700 },
    ],
  },

  // ── frozen_pulse ───────────────────────────────────────────────────────────
  // Damage + slow. Heavy ice pulse; shockwave ring and slow status on target.
  // Dot particles — projectile hit, not a snowfall.
  frozen_pulse: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#55aaff', count:3, interval:75, direction:'up', duration:140 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2299dd', blend:'screen', opacity:0.25, duration:260 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-frozen-pulse' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:6, spread:28 },
      { at:120, type:'preset',          id:'ice_projectile_heavy', size:18, duration:320 },
      { at:390, type:'impact' },
      { at:390, type:'sound',           id:'hit-heavy' },
      { at:390, type:'creature_anim',   target:'target', class:'anim-hit-ice-heavy' },
      { at:390, type:'preset',          id:'ice_particle_heavy' },
      { at:390, type:'preset',          id:'ice_hit_flash_heavy' },
      { at:390, type:'screen_shake',    intensity:4, duration:220 },
      { at:390, type:'shockwave',       origin:'target', size:48, color:'#44aaff', opacity:0.62, thickness:3 },
      { at:390, type:'status_ring',     target:'target', color:'#55ccff', duration:700 },
    ],
  },

  // ── shatter_chill ──────────────────────────────────────────────────────────
  // AoE ice detonation. Crystal pressure builds during charge; shockwave
  // radiates outward at the shatter point. Dot particles — a detonation, not a
  // snowfall; the shockwave IS the visual identity here.
  shatter_chill: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88ccff', count:3, interval:85, direction:'up', duration:320 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#55aaff', blend:'screen', opacity:0.22, duration:360 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-shatter-chill' },
      { at:0,   type:'preset',          id:'ice_cast_aura' },
      { at:300, type:'sound',           id:'beam-light' },
      { at:360, type:'impact' },
      { at:360, type:'sound',           id:'hit-heavy' },
      { at:360, type:'preset',          id:'ice_field_effect' },
      { at:360, type:'screen_shake',    intensity:4, duration:250 },
      { at:360, type:'shockwave',       origin:'actor', size:75, color:'#55aaff', opacity:0.58, thickness:4 },
      { at:410, type:'preset',          id:'ice_particle_heavy', origin:'actor' },
    ],
  },

  // ── shatter_chill_2 ────────────────────────────────────────────────────────
  // Larger detonation. Heavier crystal storm, hit_stop, bigger ring.
  shatter_chill_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaff', count:4, interval:75, direction:'up', duration:410, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2288cc', blend:'screen', opacity:0.30, duration:450 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-shatter-chill-2' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:9 },
      { at:340, type:'sound',           id:'beam-light' },
      { at:450, type:'impact' },
      { at:450, type:'sound',           id:'hit-heavy' },
      { at:450, type:'preset',          id:'ice_field_effect', opacity:0.72, duration:360 },
      { at:450, type:'screen_shake',    intensity:6, duration:300, style:'stutter' },
      { at:450, type:'hit_stop',        duration:55 },
      { at:505, type:'shockwave',       origin:'actor', size:95, color:'#2288cc', opacity:0.62, thickness:5 },
      { at:555, type:'preset',          id:'ice_particle_heavy', origin:'actor' },
    ],
  },

  // ── shatter_chill_3 ────────────────────────────────────────────────────────
  // Field-wide devastation. Dense crystal storm, hit_stop, double shockwave
  // cascade, ❄ linger in the aftermath — the cold keeps spreading.
  shatter_chill_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#2299dd', count:5, interval:68, direction:'up', spread:35, duration:480, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#003388', blend:'screen', opacity:0.35, duration:520 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-shatter-chill-3' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:11, spread:40 },
      { at:380, type:'sound',           id:'beam-light', repeat:2, interval:100 },
      { at:520, type:'impact' },
      { at:520, type:'sound',           id:'hit-heavy' },
      { at:520, type:'preset',          id:'ice_field_effect', opacity:0.84, duration:420 },
      { at:520, type:'screen_shake',    intensity:8, duration:380, style:'stutter' },
      { at:520, type:'hit_stop',        duration:70 },
      { at:590, type:'shockwave',       origin:'actor', size:118, color:'#1188cc', opacity:0.70, thickness:5 },
      { at:590, type:'particle_stream', origin:'actor',  color:'#aaddff', count:3, interval:88, direction:'all', duration:360, content:'❄', size:11 },
      { at:610, type:'preset',          id:'ice_particle_heavy', origin:'actor' },
      { at:640, type:'field_flash',     color:'#003366', opacity:0.30, duration:220 },
      { at:710, type:'shockwave',       origin:'actor', size:60, color:'#aaddff', opacity:0.45, thickness:3 },
    ],
  },

  // ── blizzard ───────────────────────────────────────────────────────────────
  // Wide AoE sweep. A wave_sweep reads as a blizzard washing over all enemies.
  // ❄ fill both the charge and the aftermath — this is the snowstorm move.
  blizzard: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaddff', count:4, interval:78, direction:'up', spread:40, duration:380, glow:true, content:'❄', size:11 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2288cc', blend:'screen', opacity:0.28, duration:400 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-blizzard' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:9, spread:40 },
      { at:320, type:'sound',           id:'beam-light' },
      { at:400, type:'impact' },
      { at:400, type:'sound',           id:'hit-heavy' },
      { at:400, type:'preset',          id:'ice_field_effect', opacity:0.68, duration:340 },
      { at:400, type:'screen_shake',    intensity:5, duration:280 },
      { at:400, type:'wave_sweep',      color:'#99ddff', duration:400 },
      { at:400, type:'shockwave',       origin:'actor', size:88, color:'#4499cc', opacity:0.55, thickness:3 },
      { at:400, type:'particle_stream', origin:'actor',  color:'#cceeff', count:3, interval:85, direction:'all', spread:50, duration:360, content:'❄', size:11 },
      { at:450, type:'preset',          id:'ice_particle_heavy', origin:'actor' },
    ],
  },

  // ── absolute_zero ──────────────────────────────────────────────────────────
  // Ultimate lunge. Entire 520ms charge alive with ❄ snowflakes building to
  // critical mass; hit_stop 85ms; double shockwave cascade + deep-freeze tint.
  absolute_zero: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaff', count:5, interval:60, direction:'up', spread:38, duration:520, glow:true, content:'❄', size:12 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#0055aa', blend:'screen', opacity:0.40, duration:580 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-absolute-zero-charge' },
      { at:0,   type:'preset',          id:'ice_cast_aura', count:12, spread:48, direction:'all' },
      { at:520, type:'sound',           id:'beam-light' },
      { at:520, type:'creature_anim',   target:'actor',  class:'anim-cast-absolute-zero', lunge:true },
      { at:760, type:'impact' },
      { at:760, type:'sound',           id:'hit-heavy' },
      { at:760, type:'creature_anim',   target:'target', class:'anim-hit-ice-heavy' },
      { at:760, type:'preset',          id:'ice_particle_heavy' },
      { at:760, type:'preset',          id:'ice_hit_flash_heavy' },
      { at:760, type:'screen_shake',    intensity:8, duration:320, style:'stutter' },
      { at:760, type:'hit_stop',        duration:85 },
      { at:845, type:'shockwave',       origin:'target', size:140, color:'#0066cc', opacity:0.78, thickness:6 },
      { at:845, type:'particle_stream', origin:'actor',  color:'#aaddff', count:3, interval:88, direction:'all', spread:50, duration:400, content:'❄', size:12 },
      { at:845, type:'creature_tint',   target:'target', color:'#001144', blend:'multiply', opacity:0.32, duration:480 },
      { at:860, type:'field_flash',     color:'#002255', opacity:0.32, duration:240 },
      { at:1005, type:'shockwave',      origin:'target', size:70, color:'#88ccff', opacity:0.48, thickness:3 },
    ],
  },

});
