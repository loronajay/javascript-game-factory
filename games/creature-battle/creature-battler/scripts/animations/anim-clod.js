registerMoveAnimations({

  // ── stone_strike ──────────────────────────────────────────────────────────
  // Basic physical lunge. Earth-charged body slam — rumbling power, hard landing.
  stone_strike: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#886644', count:2, interval:90, direction:'up', duration:220 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.22, duration:280 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-stone-strike' },
      { at:0,   type:'preset',          id:'earth_cast_aura' },
      { at:260, type:'sound',           id:'hit-light' },
      { at:260, type:'creature_anim',   target:'actor',  class:'anim-cast-stone-strike-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',   target:'target', class:'anim-hit-earth-light' },
      { at:380, type:'preset',          id:'earth_particle_light' },
      { at:380, type:'preset',          id:'earth_hit_flash_light' },
      { at:380, type:'shockwave',       origin:'target', size:30, color:'#886644', opacity:0.50, thickness:2 },
    ],
  },

  // ── stone_strike_2 ────────────────────────────────────────────────────────
  // Heavier slam — actor visibly charges with earth energy; bruising tint on target.
  stone_strike_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#776633', count:3, interval:78, direction:'up', duration:260 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.28, duration:300 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-stone-strike-2' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:9 },
      { at:280, type:'sound',           id:'hit-heavy' },
      { at:280, type:'creature_anim',   target:'actor',  class:'anim-cast-stone-strike-2-lunge', lunge:true },
      { at:420, type:'impact' },
      { at:420, type:'creature_anim',   target:'target', class:'anim-hit-earth-heavy' },
      { at:420, type:'preset',          id:'earth_particle_heavy' },
      { at:420, type:'preset',          id:'earth_hit_flash_heavy' },
      { at:420, type:'screen_shake',    intensity:4, duration:200 },
      { at:420, type:'shockwave',       origin:'target', size:46, color:'#775533', opacity:0.58, thickness:3 },
      { at:420, type:'creature_tint',   target:'target', color:'#553311', blend:'multiply', opacity:0.20, duration:300 },
    ],
  },

  // ── stone_strike_3 ────────────────────────────────────────────────────────
  // Full-force earth lunge. Long charge, hit_stop, shockwave, lingering earth mark.
  stone_strike_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#664422', count:4, interval:68, direction:'up', spread:30, duration:280, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#775533', blend:'screen', opacity:0.35, duration:340 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-stone-strike-3' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:12, spread:40 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:300, type:'creature_anim',   target:'actor',  class:'anim-cast-stone-strike-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim',   target:'target', class:'anim-hit-earth-heavy' },
      { at:460, type:'preset',          id:'earth_particle_heavy' },
      { at:460, type:'preset',          id:'earth_hit_flash_heavy' },
      { at:460, type:'screen_shake',    intensity:7, duration:280, style:'stutter' },
      { at:460, type:'hit_stop',        duration:55 },
      { at:515, type:'shockwave',       origin:'target', size:62, color:'#664422', opacity:0.65, thickness:4 },
      { at:515, type:'creature_tint',   target:'target', color:'#442200', blend:'multiply', opacity:0.25, duration:380 },
    ],
  },

  // ── boulder_wall ──────────────────────────────────────────────────────────
  // Self-buff (DEF). Rocky plates rise around actor — status ring locks in the
  // defense raise.
  boulder_wall: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#886644', count:3, interval:85, direction:'up', spread:40, duration:400 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#aa8855', blend:'screen', opacity:0.28, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-boulder-wall' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:8, spread:40 },
      { at:180, type:'wall_slam',       origin:'actor',  color:'#886644', slabs:6, slabWidth:14, slabHeight:74, gap:4, duration:680, stagger:35 },
      { at:320, type:'impact' },
      { at:320, type:'field_flash',     color:'#886633', opacity:0.18, duration:200 },
      { at:320, type:'status_ring',     target:'actor',  color:'#aa8855', duration:700 },
    ],
  },

  // ── rock_toss ─────────────────────────────────────────────────────────────
  // Light earth projectile. Clod heaves a chunk of rock across the field.
  rock_toss: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#886644', count:2, interval:90, direction:'up', duration:200 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.20, duration:260 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-rock-toss' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:5 },
      { at:120, type:'preset',          id:'earth_projectile_light' },
      { at:480, type:'impact' },
      { at:480, type:'sound',           id:'hit-light' },
      { at:480, type:'creature_anim',   target:'target', class:'anim-hit-earth-light' },
      { at:480, type:'preset',          id:'earth_particle_light' },
      { at:480, type:'preset',          id:'earth_hit_flash_light' },
      { at:480, type:'shockwave',       origin:'target', size:34, color:'#886644', opacity:0.52, thickness:2 },
    ],
  },

  // ── mud_slap ──────────────────────────────────────────────────────────────
  // Slow debuff. Dark mud coats the target — multiply tint + lingering drip +
  // status ring signals the speed drain.
  mud_slap: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#554422', count:2, interval:90, direction:'up', duration:200 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-mud-slap' },
      { at:0,   type:'preset',          id:'earth_cast_aura', color:'#554422', count:4 },
      { at:100, type:'projectile',      from:'actor', to:'target', color:'#553311', size:16, shape:'oval', arc:-8, duration:360 },
      { at:420, type:'impact' },
      { at:420, type:'sound',           id:'hit-light' },
      { at:420, type:'creature_anim',   target:'target', class:'anim-hit-mud-slap' },
      { at:420, type:'particle_burst',  origin:'target', color:'#553311', count:9, spread:55, direction:'all', duration:480 },
      { at:420, type:'field_flash',     color:'#554422', opacity:0.16, duration:180 },
      { at:420, type:'particle_stream', origin:'target', color:'#554422', count:2, interval:100, direction:'down', size:5, duration:500 },
      { at:420, type:'creature_tint',   target:'target', color:'#442200', blend:'multiply', opacity:0.28, duration:540 },
      { at:420, type:'status_ring',     target:'target', color:'#886644', duration:700 },
    ],
  },

  // ── earthen_shell ─────────────────────────────────────────────────────────
  // Dual buff (DEF + SPI). Thick mineral plates encase the body — two rings
  // confirm both stat raises.
  earthen_shell: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aa8855', count:3, interval:80, direction:'up', spread:35, duration:500 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#aa8855', blend:'screen', opacity:0.32, duration:680 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-earthen-shell' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#886644', count:14, spread:60, direction:'all', duration:600 },
      { at:420, type:'impact' },
      { at:420, type:'field_flash',     color:'#775533', opacity:0.25, duration:260 },
      { at:420, type:'status_ring',     target:'actor',  color:'#aa8855', duration:720 },
      { at:500, type:'status_ring',     target:'actor',  color:'#886644', duration:640 },
    ],
  },

  // ── quake_stomp ───────────────────────────────────────────────────────────
  // AoE physical. Stomp detonates into a ground shockwave sweeping all enemies.
  quake_stomp: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#886644', count:2, interval:90, direction:'up', duration:260 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.22, duration:380 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-quake-stomp' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:6 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:350, type:'impact' },
      { at:350, type:'screen_shake',    intensity:5, duration:260 },
      { at:350, type:'wave_sweep',      color:'#886644', duration:420 },
      { at:350, type:'shockwave',       origin:'actor', size:85, color:'#886644', opacity:0.55, thickness:4 },
      { at:400, type:'preset',          id:'earth_particle_heavy', origin:'actor' },
    ],
  },

  // ── quake_stomp_2 ─────────────────────────────────────────────────────────
  // Heavier stomp. Longer charge, hit_stop, larger shockwave, double field pulse.
  quake_stomp_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#775533', count:3, interval:78, direction:'up', spread:30, duration:380, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.30, duration:480 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-quake-stomp-2' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:10 },
      { at:380, type:'sound',           id:'hit-heavy' },
      { at:440, type:'impact' },
      { at:440, type:'screen_shake',    intensity:7, duration:320, style:'stutter' },
      { at:440, type:'hit_stop',        duration:55 },
      { at:440, type:'wave_sweep',      color:'#664422', duration:500 },
      { at:495, type:'shockwave',       origin:'actor', size:108, color:'#664422', opacity:0.65, thickness:5 },
      { at:545, type:'preset',          id:'earth_particle_heavy', origin:'actor' },
      { at:560, type:'field_flash',     color:'#664422', opacity:0.30, duration:200 },
    ],
  },

  // ── dust_cloud ────────────────────────────────────────────────────────────
  // AoE blind utility. Clod kicks up a dust storm that blankets the targets.
  dust_cloud: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aa9966', count:2, interval:85, direction:'up', spread:35, duration:240 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#aa9966', blend:'screen', opacity:0.18, duration:340 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-dust-cloud' },
      { at:260, type:'impact' },
      { at:260, type:'field_flash',     color:'#ccbb88', opacity:0.48, duration:520 },
      { at:260, type:'particle_burst',  origin:'target', color:'#ccbb88', count:22, spread:88, direction:'all', duration:680, size:9 },
      { at:280, type:'particle_stream', origin:'target', color:'#aa9966', count:4, interval:80, direction:'up', spread:60, duration:480 },
      { at:360, type:'particle_burst',  origin:'target', color:'#aa9966', count:14, spread:65, direction:'all', duration:500, size:7 },
      { at:360, type:'field_flash',     color:'#998855', opacity:0.18, duration:280 },
    ],
  },

  // ── rubble_crash ──────────────────────────────────────────────────────────
  // Heavy physical lunge. Extended charge, thunderous landing, hard stutter shake.
  rubble_crash: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#775533', count:3, interval:80, direction:'up', spread:30, duration:380 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.30, duration:440 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-rubble-crash' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:10, spread:35 },
      { at:420, type:'sound',           id:'hit-heavy' },
      { at:420, type:'creature_anim',   target:'actor',  class:'anim-cast-rubble-crash-lunge', lunge:true },
      { at:580, type:'impact' },
      { at:580, type:'creature_anim',   target:'target', class:'anim-hit-earth-heavy' },
      { at:580, type:'preset',          id:'earth_particle_heavy' },
      { at:580, type:'preset',          id:'earth_hit_flash_heavy' },
      { at:580, type:'screen_shake',    intensity:8, duration:320, style:'stutter' },
      { at:580, type:'hit_stop',        duration:55 },
      { at:635, type:'shockwave',       origin:'target', size:68, color:'#664422', opacity:0.62, thickness:4 },
      { at:635, type:'creature_tint',   target:'target', color:'#442200', blend:'multiply', opacity:0.25, duration:400 },
    ],
  },

  // ── rubble_crash_2 ────────────────────────────────────────────────────────
  // Maximum-weight version. Crushing charge, hit_stop, double shockwave cascade.
  rubble_crash_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#664422', count:4, interval:70, direction:'up', spread:35, duration:480, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#775533', blend:'screen', opacity:0.38, duration:560 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-rubble-crash-2' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:14, spread:45 },
      { at:520, type:'sound',           id:'hit-heavy' },
      { at:520, type:'creature_anim',   target:'actor',  class:'anim-cast-rubble-crash-2-lunge', lunge:true },
      { at:700, type:'impact' },
      { at:700, type:'creature_anim',   target:'target', class:'anim-hit-earth-heavy' },
      { at:700, type:'preset',          id:'earth_particle_heavy' },
      { at:700, type:'preset',          id:'earth_hit_flash_heavy' },
      { at:700, type:'screen_shake',    intensity:10, duration:360, style:'stutter' },
      { at:700, type:'hit_stop',        duration:70 },
      { at:770, type:'shockwave',       origin:'target', size:88, color:'#553311', opacity:0.70, thickness:5 },
      { at:770, type:'creature_tint',   target:'target', color:'#331100', blend:'multiply', opacity:0.30, duration:440 },
      { at:820, type:'field_flash',     color:'#664422', opacity:0.35, duration:220 },
      { at:900, type:'shockwave',       origin:'target', size:48, color:'#886644', opacity:0.45, thickness:3 },
    ],
  },

  // ── gravel_barrage ────────────────────────────────────────────────────────
  // Two-hit projectile volley. Impact on first; shockwave ring closes on second.
  gravel_barrage: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#886644', count:2, interval:90, direction:'up', duration:200 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.20, duration:360 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-gravel-barrage' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:5 },
      // Hit 1
      { at:80,  type:'preset',          id:'earth_projectile_light', size:10, duration:300 },
      { at:340, type:'impact' },
      { at:340, type:'sound',           id:'hit-light' },
      { at:340, type:'creature_anim',   target:'target', class:'anim-hit-earth-light' },
      { at:340, type:'preset',          id:'earth_particle_light' },
      // Hit 2
      { at:460, type:'sound',           id:'charge-light' },
      { at:500, type:'preset',          id:'earth_projectile_light', size:10, duration:300 },
      { at:760, type:'sound',           id:'hit-light' },
      { at:760, type:'creature_shake',  target:'target', intensity:4, duration:180 },
      { at:760, type:'preset',          id:'earth_particle_light' },
      { at:760, type:'preset',          id:'earth_hit_flash_light' },
      { at:760, type:'shockwave',       origin:'target', size:42, color:'#886644', opacity:0.55, thickness:3 },
    ],
  },

  // ── gravel_barrage_2 ──────────────────────────────────────────────────────
  // Three-hit volley. Impact on first; shake on 2; hit_stop + shockwave on 3.
  gravel_barrage_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#775533', count:3, interval:80, direction:'up', duration:240 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#886644', blend:'screen', opacity:0.24, duration:500 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-gravel-barrage-2' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:7 },
      // Hit 1
      { at:80,  type:'preset',          id:'earth_projectile_light', size:11, duration:300 },
      { at:340, type:'impact' },
      { at:340, type:'sound',           id:'hit-light' },
      { at:340, type:'creature_anim',   target:'target', class:'anim-hit-earth-light' },
      { at:340, type:'preset',          id:'earth_particle_light' },
      // Hit 2
      { at:440, type:'sound',           id:'charge-light' },
      { at:480, type:'preset',          id:'earth_projectile_light', size:11, duration:280 },
      { at:720, type:'sound',           id:'hit-light' },
      { at:720, type:'creature_shake',  target:'target', intensity:4, duration:160 },
      { at:720, type:'preset',          id:'earth_particle_light' },
      // Hit 3
      { at:820, type:'sound',           id:'charge-light' },
      { at:860, type:'preset',          id:'earth_projectile_heavy', size:14, duration:280 },
      { at:1100,type:'sound',           id:'hit-heavy' },
      { at:1100,type:'creature_shake',  target:'target', intensity:6, duration:200 },
      { at:1100,type:'hit_stop',        duration:50 },
      { at:1100,type:'preset',          id:'earth_particle_heavy' },
      { at:1100,type:'preset',          id:'earth_hit_flash_heavy' },
      { at:1150,type:'shockwave',       origin:'target', size:58, color:'#664422', opacity:0.62, thickness:4 },
    ],
  },

  // ── tectonic_crash ────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase tremor charge → earth eruption on landing →
  // hit_stop + twin shockwave cascade + lingering earth wash.
  tectonic_crash: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#664422', count:4, interval:68, direction:'up', spread:38, duration:580, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#664422', blend:'screen', opacity:0.42, duration:640 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-tectonic-charge' },
      { at:0,   type:'preset',          id:'earth_cast_aura', count:14, spread:50 },
      { at:580, type:'sound',           id:'hit-heavy' },
      { at:580, type:'creature_anim',   target:'actor',  class:'anim-cast-tectonic-crash-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',           id:'hit-heavy' },
      { at:780, type:'creature_anim',   target:'target', class:'anim-hit-earth-heavy' },
      { at:780, type:'preset',          id:'earth_particle_heavy' },
      { at:780, type:'preset',          id:'earth_hit_flash_heavy' },
      { at:780, type:'screen_shake',    intensity:12, duration:420, style:'stutter' },
      { at:780, type:'hit_stop',        duration:90 },
      { at:870, type:'shockwave',       origin:'target', size:140, color:'#553311', opacity:0.80, thickness:7 },
      { at:870, type:'creature_tint',   target:'target', color:'#331100', blend:'multiply', opacity:0.32, duration:480 },
      { at:890, type:'preset',          id:'earth_field_effect', opacity:0.80, duration:360 },
      { at:970, type:'field_flash',     color:'#442200', opacity:0.40, duration:260 },
      { at:1020,type:'shockwave',       origin:'target', size:78, color:'#886644', opacity:0.55, thickness:4 },
      { at:1060,type:'particle_burst',  origin:'target', color:'#775533', count:8, spread:55, direction:'all', duration:480 },
    ],
  },

});
