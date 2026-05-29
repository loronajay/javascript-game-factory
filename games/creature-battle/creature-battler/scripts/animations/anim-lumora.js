registerMoveAnimations({

  // ── radiant_tap ───────────────────────────────────────────────────────────
  // Gentle lunge. Golden ✦ sparkles trail the actor; warm ring on impact.
  radiant_tap: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffee88', count:2, interval:90, direction:'up', size:10, duration:200, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.20, duration:260 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-radiant-tap' },
      { at:0,   type:'preset',          id:'light_cast_aura' },
      { at:220, type:'sound',           id:'hit-light' },
      { at:220, type:'creature_anim',   target:'actor',  class:'anim-cast-radiant-tap-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim',   target:'target', class:'anim-hit-light-light' },
      { at:340, type:'preset',          id:'light_particle_light' },
      { at:340, type:'preset',          id:'light_hit_flash_light' },
      { at:340, type:'shockwave',       origin:'target', size:28, color:'#ffeeaa', opacity:0.48, thickness:2 },
    ],
  },

  // ── radiant_tap_2 ─────────────────────────────────────────────────────────
  // Heavier lunge — divine glow visible on actor; light-burned tint on target.
  radiant_tap_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffdd88', count:3, interval:78, direction:'up', size:11, duration:230, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.26, duration:290 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-radiant-tap-2' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:9 },
      { at:250, type:'sound',           id:'hit-heavy' },
      { at:250, type:'creature_anim',   target:'actor',  class:'anim-cast-radiant-tap-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',   target:'target', class:'anim-hit-light-heavy' },
      { at:380, type:'preset',          id:'light_particle_heavy' },
      { at:380, type:'preset',          id:'light_hit_flash_heavy' },
      { at:380, type:'screen_shake',    intensity:3, duration:180 },
      { at:380, type:'shockwave',       origin:'target', size:44, color:'#ffcc88', opacity:0.55, thickness:3 },
      { at:380, type:'creature_tint',   target:'target', color:'#ffcc44', blend:'multiply', opacity:0.18, duration:300 },
    ],
  },

  // ── radiant_tap_3 ─────────────────────────────────────────────────────────
  // Full-power lunge — brilliant charge, hit_stop, large light ring.
  radiant_tap_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffcc66', count:4, interval:68, direction:'up', spread:28, size:12, duration:280, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.32, duration:340 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-radiant-tap-3' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:12, spread:45 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:300, type:'creature_anim',   target:'actor',  class:'anim-cast-radiant-tap-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim',   target:'target', class:'anim-hit-light-heavy' },
      { at:460, type:'preset',          id:'light_particle_heavy' },
      { at:460, type:'preset',          id:'light_hit_flash_heavy' },
      { at:460, type:'screen_shake',    intensity:5, duration:240, style:'stutter' },
      { at:460, type:'hit_stop',        duration:50 },
      { at:510, type:'shockwave',       origin:'target', size:60, color:'#ffbb44', opacity:0.62, thickness:4 },
      { at:510, type:'creature_tint',   target:'target', color:'#ffcc44', blend:'multiply', opacity:0.22, duration:360 },
    ],
  },

  // ── mend_light ────────────────────────────────────────────────────────────
  // Single-ally heal. Warm ✦ sparkles rise on the healed ally — status ring
  // confirms HP restoration.
  mend_light: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffeeaa', count:2, interval:88, direction:'up', size:11, duration:280, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.22, duration:460 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-mend-light' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:6 },
      { at:300, type:'impact' },
      { at:300, type:'sound',           id:'beam-light' },
      { at:300, type:'particle_burst',  origin:'target', color:'#ffeeaa', count:12, spread:50, direction:'up', duration:560, glow:true, content:'✦', size:11 },
      { at:300, type:'field_flash',     color:'#ffeeaa', opacity:0.20, duration:260 },
      { at:300, type:'particle_stream', origin:'target', color:'#ffee88', count:2, interval:90, direction:'up', size:10, duration:460, content:'✦' },
      { at:300, type:'creature_tint',   target:'target', color:'#ffeeaa', blend:'screen', opacity:0.26, duration:500 },
      { at:300, type:'status_ring',     target:'target', color:'#ffeeaa', duration:700 },
    ],
  },

  // ── mend_light_2 ──────────────────────────────────────────────────────────
  // Larger single-ally heal — denser ✦ bloom, status ring.
  mend_light_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffddaa', count:3, interval:80, direction:'up', size:12, duration:360, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.28, duration:580 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-mend-light-2' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:10, spread:45 },
      { at:380, type:'impact' },
      { at:380, type:'sound',           id:'beam-light' },
      { at:380, type:'preset',          id:'light_particle_heavy', origin:'target' },
      { at:380, type:'particle_burst',  origin:'target', color:'#ffeeaa', count:18, spread:60, direction:'up', duration:640, glow:true, content:'✦', size:12 },
      { at:380, type:'field_flash',     color:'#ffeeaa', opacity:0.32, duration:320 },
      { at:380, type:'particle_stream', origin:'target', color:'#ffee88', count:3, interval:85, direction:'up', size:11, duration:560, content:'✦' },
      { at:380, type:'creature_tint',   target:'target', color:'#ffeeaa', blend:'screen', opacity:0.30, duration:560 },
      { at:380, type:'status_ring',     target:'target', color:'#ffeeaa', duration:750 },
    ],
  },

  // ── cleanse ───────────────────────────────────────────────────────────────
  // Status cleanse. Pure white light washes status off the ally — bright ring
  // confirms afflictions dissolved.
  cleanse: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffffee', count:3, interval:80, direction:'up', size:10, duration:240, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffffff', blend:'screen', opacity:0.20, duration:420 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cleanse' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:8, spread:40 },
      { at:280, type:'impact' },
      { at:280, type:'sound',           id:'beam-light' },
      { at:280, type:'particle_burst',  origin:'target', color:'#ffffff', count:14, spread:60, direction:'all', duration:500, glow:true },
      { at:280, type:'field_flash',     color:'#ffffff', opacity:0.45, duration:220 },
      { at:280, type:'particle_stream', origin:'target', color:'#ffffee', count:3, interval:90, direction:'up', size:10, duration:440, content:'✦' },
      { at:280, type:'creature_tint',   target:'target', color:'#ffffff', blend:'screen', opacity:0.28, duration:480 },
      { at:280, type:'status_ring',     target:'target', color:'#ffffff', duration:750 },
    ],
  },

  // ── light_ray ─────────────────────────────────────────────────────────────
  // Focused light projectile — ✦ sparkles emit from actor during cast.
  light_ray: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffee88', count:2, interval:90, direction:'up', size:10, duration:220, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.22, duration:280 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-light-ray' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:5 },
      { at:100, type:'preset',          id:'light_projectile_light' },
      { at:500, type:'impact' },
      { at:500, type:'sound',           id:'hit-light' },
      { at:500, type:'creature_anim',   target:'target', class:'anim-hit-light-light' },
      { at:500, type:'preset',          id:'light_particle_light' },
      { at:500, type:'preset',          id:'light_hit_flash_light' },
      { at:500, type:'shockwave',       origin:'target', size:36, color:'#ffeeaa', opacity:0.52, thickness:2 },
    ],
  },

  // ── rejuvenate ────────────────────────────────────────────────────────────
  // AoE team heal. Golden ✦ rain fills the field; wave_sweep carries the
  // restoration over all allies.
  rejuvenate: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffeeaa', count:3, interval:80, direction:'up', spread:40, size:11, duration:380, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.26, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-rejuvenate' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:8 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ffeeaa', count:12, spread:65, direction:'all', duration:580, content:'✦', size:11 },
      { at:320, type:'impact' },
      { at:320, type:'sound',           id:'beam-light' },
      { at:320, type:'particle_burst',  origin:'actor',  color:'#ffffcc', count:16, spread:80, direction:'up', duration:600, glow:true, content:'✦', size:12 },
      { at:320, type:'field_flash',     color:'#ffeeaa', opacity:0.22, duration:300 },
      { at:320, type:'wave_sweep',      color:'#ffeeaa', opacity:0.45, duration:380 },
      { at:320, type:'status_ring',     target:'actor',  color:'#ffeeaa', duration:700 },
    ],
  },

  // ── clarity ───────────────────────────────────────────────────────────────
  // Self-buff (Speed + Accuracy). Crisp white-gold flash — dual rings confirm
  // both stat raises.
  clarity: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffffff', count:3, interval:82, direction:'up', spread:38, size:10, duration:360, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.30, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-clarity' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:10, spread:45 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ffffff', count:12, spread:50, direction:'up', duration:500, glow:true },
      { at:360, type:'impact' },
      { at:360, type:'field_flash',     color:'#ffffff', opacity:0.40, duration:200 },
      { at:360, type:'status_ring',     target:'actor',  color:'#ffeeaa', duration:720 },
      { at:440, type:'status_ring',     target:'actor',  color:'#ffffcc', duration:640 },
    ],
  },

  // ── blind_flash ───────────────────────────────────────────────────────────
  // Blind utility. Blinding white projectile — full-white field flash + white
  // status ring confirm the blind has landed.
  blind_flash: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffffff', count:2, interval:90, direction:'up', size:12, duration:200, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffffff', blend:'screen', opacity:0.22, duration:280 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-blind-flash' },
      { at:0,   type:'preset',          id:'light_cast_aura', color:'#ffffff', count:6 },
      { at:80,  type:'preset',          id:'light_projectile_light', size:16, color:'#ffffff', duration:320 },
      { at:480, type:'impact' },
      { at:480, type:'sound',           id:'hit-light' },
      { at:480, type:'creature_anim',   target:'target', class:'anim-hit-blind-flash' },
      { at:480, type:'particle_burst',  origin:'target', color:'#ffffff', count:14, spread:65, direction:'all', duration:480, glow:true },
      { at:480, type:'field_flash',     color:'#ffffff', opacity:0.70, duration:200 },
      { at:480, type:'creature_tint',   target:'target', color:'#ffeeaa', blend:'multiply', opacity:0.20, duration:500 },
      { at:480, type:'status_ring',     target:'target', color:'#ffffff', duration:750 },
    ],
  },

  // ── healing_surge ─────────────────────────────────────────────────────────
  // Large single-ally heal — luminous cast, ✦ cascade on ally, status ring.
  healing_surge: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffddaa', count:4, interval:72, direction:'up', spread:36, size:12, duration:420, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.34, duration:600 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-healing-surge' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:12, spread:50 },
      { at:420, type:'impact' },
      { at:420, type:'sound',           id:'beam-light' },
      { at:420, type:'preset',          id:'light_particle_heavy', origin:'target' },
      { at:420, type:'particle_burst',  origin:'target', color:'#ffffff', count:16, spread:65, direction:'up', duration:600, glow:true, content:'✦', size:12 },
      { at:420, type:'field_flash',     color:'#ffffee', opacity:0.45, duration:300 },
      { at:420, type:'particle_stream', origin:'target', color:'#ffeeaa', count:3, interval:85, direction:'up', size:11, duration:540, content:'✦' },
      { at:420, type:'creature_tint',   target:'target', color:'#ffeeaa', blend:'screen', opacity:0.32, duration:560 },
      { at:420, type:'status_ring',     target:'target', color:'#ffeeaa', duration:750 },
    ],
  },

  // ── light_beam ────────────────────────────────────────────────────────────
  // Sustained holy beam — shockwave and hit_stop confirm the divine impact.
  light_beam: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffee88', count:3, interval:80, direction:'up', spread:28, size:11, duration:320, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.28, duration:460 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-light-beam' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:10, spread:40 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:300, type:'preset',          id:'light_beam' },
      { at:600, type:'impact' },
      { at:600, type:'creature_anim',   target:'target', class:'anim-hit-light-heavy' },
      { at:600, type:'preset',          id:'light_particle_heavy' },
      { at:600, type:'preset',          id:'light_hit_flash_heavy' },
      { at:600, type:'screen_shake',    intensity:5, duration:240 },
      { at:600, type:'hit_stop',        duration:50 },
      { at:650, type:'shockwave',       origin:'target', size:58, color:'#ffcc88', opacity:0.62, thickness:3 },
      { at:650, type:'creature_tint',   target:'target', color:'#ffcc44', blend:'multiply', opacity:0.22, duration:360 },
    ],
  },

  // ── holy_ward ─────────────────────────────────────────────────────────────
  // Self-buff (SPI +2). Divine light cocoon envelops actor — status ring locks
  // in the spirit raise.
  holy_ward: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffeeaa', count:4, interval:78, direction:'all', spread:40, size:11, duration:520, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.34, duration:680 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-holy-ward' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ffeeaa', count:18, spread:65, direction:'all', duration:680, glow:true },
      { at:460, type:'impact' },
      { at:460, type:'field_flash',     color:'#ffeeaa', opacity:0.35, duration:280 },
      { at:460, type:'status_ring',     target:'actor',  color:'#ffeeaa', duration:750 },
    ],
  },

  // ── full_restore ──────────────────────────────────────────────────────────
  // AoE team heal — divine golden light floods the field; wave_sweep carries
  // the full restoration over the entire team.
  full_restore: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffddaa', count:5, interval:62, direction:'up', spread:50, size:13, duration:520, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.38, duration:700 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:190 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-full-restore' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:16, spread:60 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ffeeaa', count:14, spread:65, direction:'all', duration:640, content:'✦', size:12 },
      { at:520, type:'impact' },
      { at:520, type:'sound',           id:'beam-light' },
      { at:520, type:'preset',          id:'light_field_effect', opacity:0.85, duration:380 },
      { at:560, type:'particle_burst',  origin:'actor',  color:'#ffffcc', count:22, spread:90, direction:'up', duration:700, glow:true, content:'✦', size:13 },
      { at:560, type:'field_flash',     color:'#ffeeaa', opacity:0.30, duration:320 },
      { at:560, type:'wave_sweep',      color:'#ffeeaa', opacity:0.55, duration:460 },
      { at:600, type:'status_ring',     target:'actor',  color:'#ffeeaa', duration:800 },
    ],
  },

  // ── divine_light ──────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase divine charge → blinding eruption on landing →
  // hit_stop + twin shockwave cascade + ✦ cascade.
  divine_light: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffcc66', count:5, interval:62, direction:'up', spread:42, size:13, duration:580, glow:true, content:'✦' },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffeeaa', blend:'screen', opacity:0.44, duration:660 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-divine-light-charge' },
      { at:0,   type:'preset',          id:'light_cast_aura', count:16, spread:55 },
      { at:580, type:'sound',           id:'hit-heavy' },
      { at:580, type:'creature_anim',   target:'actor',  class:'anim-cast-divine-light-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',           id:'hit-heavy' },
      { at:780, type:'creature_anim',   target:'target', class:'anim-hit-light-heavy' },
      { at:780, type:'preset',          id:'light_particle_heavy' },
      { at:780, type:'preset',          id:'light_hit_flash_heavy' },
      { at:780, type:'screen_shake',    intensity:10, duration:400, style:'stutter' },
      { at:780, type:'hit_stop',        duration:85 },
      { at:865, type:'shockwave',       origin:'target', size:148, color:'#ffcc44', opacity:0.82, thickness:7 },
      { at:865, type:'creature_tint',   target:'target', color:'#ffcc44', blend:'multiply', opacity:0.28, duration:480 },
      { at:885, type:'preset',          id:'light_field_effect', opacity:0.92, duration:380 },
      { at:885, type:'particle_burst',  origin:'target', color:'#ffffff', count:16, spread:70, direction:'up', duration:640, glow:true, content:'✦', size:13 },
      { at:985, type:'field_flash',     color:'#ffeeaa', opacity:0.42, duration:280 },
      { at:1025,type:'shockwave',       origin:'target', size:80, color:'#ffee88', opacity:0.55, thickness:4 },
      { at:1065,type:'particle_stream', origin:'target', color:'#ffeeaa', count:3, interval:90, direction:'up', size:11, duration:340, content:'✦' },
    ],
  },

});
