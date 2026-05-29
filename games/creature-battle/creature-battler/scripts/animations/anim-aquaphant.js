registerMoveAnimations({

  // ── bubble_shot ────────────────────────────────────────────────────────────
  // Snappy pressurized bubble. Brief mist before the shot, small pressure ring
  // on impact — even the basic move reads as water. Dot particles: bubbles are
  // circular, symbols would feel off for a fired projectile.
  bubble_shot: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#66ccff', count:2, interval:80, direction:'up', duration:100 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-bubble-shot' },
      { at:0,   type:'preset',          id:'water_cast_aura' },
      { at:80,  type:'preset',          id:'water_projectile_light', duration:200 },
      { at:270, type:'impact' },
      { at:270, type:'sound',           id:'hit-light' },
      { at:270, type:'creature_anim',   target:'target', class:'anim-hit-water-light' },
      { at:270, type:'preset',          id:'water_particle_light' },
      { at:270, type:'preset',          id:'water_hit_flash_light' },
      { at:270, type:'shockwave',       origin:'target', size:26, color:'#44aaee', opacity:0.50, thickness:2 },
    ],
  },

  // ── bubble_shot_2 ──────────────────────────────────────────────────────────
  // Heavier bubble. Actor builds blue pressure during cast; medium ring on hit.
  bubble_shot_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaee', count:3, interval:75, direction:'up', duration:130 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2288dd', blend:'screen', opacity:0.22, duration:240 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-bubble-shot-2' },
      { at:0,   type:'preset',          id:'water_cast_aura' },
      { at:120, type:'preset',          id:'water_projectile_heavy', size:16, duration:280 },
      { at:360, type:'impact' },
      { at:360, type:'sound',           id:'hit-light' },
      { at:360, type:'creature_anim',   target:'target', class:'anim-hit-water-heavy' },
      { at:360, type:'preset',          id:'water_particle_heavy' },
      { at:360, type:'preset',          id:'water_hit_flash_light' },
      { at:360, type:'screen_shake',    intensity:3, duration:200 },
      { at:360, type:'shockwave',       origin:'target', size:42, color:'#2288dd', opacity:0.60, thickness:3 },
    ],
  },

  // ── bubble_shot_3 ──────────────────────────────────────────────────────────
  // Maximum pressure. Dense pre-shot mist, hit_stop, large impact ring + deep
  // water tint scorches the target.
  bubble_shot_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#2277dd', count:4, interval:65, direction:'up', duration:150, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#0066cc', blend:'screen', opacity:0.32, duration:300 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-bubble-shot-3' },
      { at:0,   type:'preset',          id:'water_cast_aura', count:9 },
      { at:140, type:'preset',          id:'water_projectile_heavy' },
      { at:430, type:'impact' },
      { at:430, type:'sound',           id:'hit-heavy' },
      { at:430, type:'creature_anim',   target:'target', class:'anim-hit-water-heavy' },
      { at:430, type:'preset',          id:'water_particle_heavy' },
      { at:430, type:'preset',          id:'water_hit_flash_heavy' },
      { at:430, type:'screen_shake',    intensity:6, duration:280, style:'stutter' },
      { at:430, type:'hit_stop',        duration:55 },
      { at:485, type:'shockwave',       origin:'target', size:60, color:'#2266dd', opacity:0.68, thickness:4 },
      { at:485, type:'creature_tint',   target:'target', color:'#0044aa', blend:'multiply', opacity:0.22, duration:340 },
    ],
  },

  // ── soak_hide ──────────────────────────────────────────────────────────────
  // Self-buff (defense). 💧 drips DOWN over the body as a water shell forms —
  // the drop direction and symbol make it unmistakably "armoring with water."
  soak_hide: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44bbee', count:3, interval:85, direction:'down', size:12, duration:480, content:'💧' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2288dd', blend:'screen', opacity:0.25, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-soak-hide' },
      { at:0,   type:'preset',          id:'water_cast_aura', direction:'all', spread:35 },
      { at:320, type:'impact' },
      { at:320, type:'field_flash',     color:'#0088cc', opacity:0.12, duration:180 },
      { at:320, type:'status_ring',     target:'actor',  color:'#44aaff', duration:700 },
    ],
  },

  // ── healing_wave ───────────────────────────────────────────────────────────
  // Self-heal. 💧 rises from the healer and recipient as teal restoration.
  // Teal palette separates heal from all attack blues.
  healing_wave: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44ffee', count:3, interval:80, direction:'up', size:12, glow:true, duration:380, content:'💧' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#33ddcc', blend:'screen', opacity:0.28, duration:500 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-healing-wave' },
      { at:0,   type:'preset',          id:'water_cast_aura', color:'#44ddcc', direction:'all', spread:38 },
      { at:260, type:'impact' },
      { at:260, type:'sound',           id:'beam-light' },
      { at:260, type:'creature_anim',   target:'target', class:'anim-hit-water-heal' },
      { at:260, type:'particle_burst',  origin:'actor',  color:'#66ffee', count:8, spread:40, direction:'up', duration:500, content:'💧', size:12 },
      { at:260, type:'field_flash',     color:'#00ccbb', opacity:0.20, duration:220 },
      { at:260, type:'particle_stream', origin:'target', color:'#44ffee', count:2, interval:90, direction:'up', size:12, glow:true, duration:500, content:'💧' },
      { at:260, type:'creature_tint',   target:'target', color:'#33ddcc', blend:'screen', opacity:0.30, duration:480 },
      { at:260, type:'status_ring',     target:'target', color:'#33ddcc', duration:700 },
    ],
  },

  // ── tidal_bump ─────────────────────────────────────────────────────────────
  // Water body slam. Full 460ms charge swirls with water energy; hit_stop +
  // large pressure ring + deep tint on the target.
  tidal_bump: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaee', count:4, interval:70, direction:'up', spread:28, duration:460, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#2288dd', blend:'screen', opacity:0.28, duration:460 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-tidal-charge' },
      { at:0,   type:'preset',          id:'water_cast_aura', count:8, spread:32 },
      { at:460, type:'sound',           id:'beam-light' },
      { at:460, type:'creature_anim',   target:'actor',  class:'anim-cast-tidal-bump', lunge:true },
      { at:685, type:'impact' },
      { at:685, type:'sound',           id:'hit-heavy' },
      { at:685, type:'creature_anim',   target:'target', class:'anim-hit-water-heavy' },
      { at:685, type:'preset',          id:'water_particle_heavy' },
      { at:685, type:'preset',          id:'water_hit_flash_heavy' },
      { at:685, type:'screen_shake',    intensity:6, duration:260, style:'stutter' },
      { at:685, type:'hit_stop',        duration:65 },
      { at:685, type:'particle_burst',  origin:'target', color:'#44aaee', count:6, spread:55, direction:'all', duration:500, content:'🌊', size:16 },
      { at:750, type:'shockwave',       origin:'target', size:68, color:'#2266dd', opacity:0.72, thickness:5 },
      { at:750, type:'creature_tint',   target:'target', color:'#0044aa', blend:'multiply', opacity:0.28, duration:400 },
    ],
  },

  // ── hydro_skin ─────────────────────────────────────────────────────────────
  // Dual self-buff (defense + spirit). Heavier 💧 drip armor than soak_hide;
  // two status rings signal the double stat raise.
  hydro_skin: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44bbee', count:3, interval:90, direction:'down', size:12, duration:500, content:'💧' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#0077cc', blend:'screen', opacity:0.30, duration:620 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-hydro-skin' },
      { at:0,   type:'preset',          id:'water_cast_aura', count:8, direction:'all', spread:40 },
      { at:340, type:'impact' },
      { at:340, type:'particle_burst',  origin:'actor',  color:'#44bbee', count:6, spread:28, direction:'up', duration:440, content:'💧', size:12 },
      { at:340, type:'field_flash',     color:'#0066cc', opacity:0.18, duration:220 },
      { at:340, type:'status_ring',     target:'actor',  color:'#4499ff', duration:700 },
      { at:420, type:'status_ring',     target:'actor',  color:'#33ddcc', duration:620 },
    ],
  },

  // ── undertow ───────────────────────────────────────────────────────────────
  // Slow utility. Target dragged into dark water — 💧 fall downward both on
  // actor and target, deep navy tint, slow status ring.
  undertow: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#2255aa', count:3, interval:90, direction:'down', size:11, duration:420, content:'💧' },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-undertow' },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#2255aa', count:5, spread:28, direction:'down', duration:480, content:'💧', size:11 },
      { at:280, type:'impact' },
      { at:280, type:'sound',           id:'hit-light' },
      { at:280, type:'creature_anim',   target:'target', class:'anim-hit-undertow' },
      { at:280, type:'particle_burst',  origin:'target', color:'#1133aa', count:8, spread:45, direction:'down', duration:500, content:'💧', size:11 },
      { at:280, type:'field_flash',     color:'#001144', opacity:0.22, duration:240 },
      { at:280, type:'particle_stream', origin:'target', color:'#1133aa', count:2, interval:100, direction:'down', size:11, duration:500, content:'💧' },
      { at:280, type:'creature_tint',   target:'target', color:'#001144', blend:'multiply', opacity:0.30, duration:500 },
      { at:280, type:'status_ring',     target:'target', color:'#2244aa', duration:700 },
    ],
  },

  // ── whirlpool ──────────────────────────────────────────────────────────────
  // Debuff utility (slow + accuracy drop). The vortex FORMS on the target rather
  // than being fired at them — three spinning elliptical rings materialize from
  // the inside out, the target gets pulled in, then the whirlpool locks in.
  whirlpool: {
    timeline: [
      // Actor conjures the vortex from afar — circular cast motion, water swirls around hand
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-whirlpool' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaee', count:3, interval:90, direction:'all', spread:28, duration:280 },
      // Rings materialize at the target from inner to outer (vortex forming)
      { at:120, type:'spinning_ring',   origin:'target', radius:16, squish:0.30, color:'#44aaee', thickness:2, spinMs:520,  duration:1080, glow:true },
      { at:200, type:'spinning_ring',   origin:'target', radius:30, squish:0.30, color:'#2277cc', thickness:2, spinMs:760,  duration:900 },
      { at:270, type:'spinning_ring',   origin:'target', radius:46, squish:0.30, color:'#0055aa', thickness:3, spinMs:1020, duration:720 },
      { at:240, type:'creature_tint',   target:'target', color:'#001155', blend:'multiply', opacity:0.18, duration:560 },
      // Impact — vortex locks on, target buffeted by the spinning water
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

  // ── surge_crash ────────────────────────────────────────────────────────────
  // AoE water. Pressure builds during charge; shockwave radiates from actor
  // at the crash point.
  surge_crash: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44aaee', count:3, interval:85, direction:'up', duration:340 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#0077cc', blend:'screen', opacity:0.25, duration:380 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-surge-crash' },
      { at:0,   type:'preset',          id:'water_cast_aura' },
      { at:320, type:'sound',           id:'beam-light' },
      { at:380, type:'impact' },
      { at:380, type:'sound',           id:'hit-heavy' },
      { at:380, type:'preset',          id:'water_field_effect' },
      { at:380, type:'screen_shake',    intensity:4, duration:250 },
      { at:380, type:'shockwave',       origin:'actor', size:78, color:'#2266dd', opacity:0.60, thickness:4 },
      { at:430, type:'preset',          id:'water_particle_heavy', origin:'actor' },
    ],
  },

  // ── surge_crash_2 ──────────────────────────────────────────────────────────
  // Bigger wave. Heavier charge presence, hit_stop, larger ring.
  surge_crash_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#2277dd', count:4, interval:75, direction:'up', duration:420, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#0055bb', blend:'screen', opacity:0.32, duration:460 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-surge-crash-2' },
      { at:0,   type:'preset',          id:'water_cast_aura', count:9 },
      { at:360, type:'sound',           id:'beam-light' },
      { at:460, type:'impact' },
      { at:460, type:'sound',           id:'hit-heavy' },
      { at:460, type:'preset',          id:'water_field_effect', opacity:0.70, duration:360 },
      { at:460, type:'screen_shake',    intensity:6, duration:300, style:'stutter' },
      { at:460, type:'hit_stop',        duration:55 },
      { at:515, type:'shockwave',       origin:'actor', size:100, color:'#0055bb', opacity:0.65, thickness:5 },
      { at:565, type:'preset',          id:'water_particle_heavy', origin:'actor' },
    ],
  },

  // ── surge_crash_3 ──────────────────────────────────────────────────────────
  // Maximum wave. Dense storm, hit_stop, double shockwave cascade, 🌊 linger
  // after the crash reads as the wave still washing over the field.
  surge_crash_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#1166dd', count:5, interval:68, direction:'up', spread:38, duration:500, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#003388', blend:'screen', opacity:0.38, duration:540 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-surge-crash-3' },
      { at:0,   type:'preset',          id:'water_cast_aura', count:11, spread:40 },
      { at:400, type:'sound',           id:'beam-light', repeat:2, interval:100 },
      { at:540, type:'impact' },
      { at:540, type:'sound',           id:'hit-heavy' },
      { at:540, type:'preset',          id:'water_field_effect', opacity:0.82, duration:400 },
      { at:540, type:'screen_shake',    intensity:8, duration:380, style:'stutter' },
      { at:540, type:'hit_stop',        duration:75 },
      { at:615, type:'shockwave',       origin:'actor', size:125, color:'#1155cc', opacity:0.72, thickness:6 },
      { at:615, type:'particle_stream', origin:'actor',  color:'#2266dd', count:3, interval:90, direction:'all', duration:340, content:'🌊', size:16 },
      { at:635, type:'preset',          id:'water_particle_heavy', origin:'actor' },
      { at:660, type:'field_flash',     color:'#003388', opacity:0.30, duration:220 },
      { at:745, type:'shockwave',       origin:'actor', size:65, color:'#44aaff', opacity:0.48, thickness:3 },
    ],
  },

  // ── torrent ────────────────────────────────────────────────────────────────
  // Aquaphant's signature lunge. Full 480ms charge churning with deep water
  // energy; hit_stop 75ms; 🌊 burst on impact + heavy pressure ring.
  torrent: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#2277dd', count:4, interval:72, direction:'up', spread:30, duration:480, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#0055bb', blend:'screen', opacity:0.35, duration:480 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-torrent-charge' },
      { at:0,   type:'preset',          id:'water_cast_aura', count:9, spread:35 },
      { at:480, type:'sound',           id:'beam-light' },
      { at:480, type:'creature_anim',   target:'actor',  class:'anim-cast-torrent', lunge:true },
      { at:720, type:'impact' },
      { at:720, type:'sound',           id:'hit-heavy' },
      { at:720, type:'creature_anim',   target:'target', class:'anim-hit-water-heavy' },
      { at:720, type:'preset',          id:'water_particle_heavy' },
      { at:720, type:'preset',          id:'water_hit_flash_heavy' },
      { at:720, type:'screen_shake',    intensity:8, duration:300, style:'stutter' },
      { at:720, type:'hit_stop',        duration:75 },
      { at:720, type:'particle_burst',  origin:'target', color:'#2266dd', count:8, spread:60, direction:'all', duration:560, content:'🌊', size:16 },
      { at:795, type:'shockwave',       origin:'target', size:75, color:'#0044cc', opacity:0.75, thickness:5 },
      { at:795, type:'creature_tint',   target:'target', color:'#0033aa', blend:'multiply', opacity:0.28, duration:420 },
    ],
  },

});
