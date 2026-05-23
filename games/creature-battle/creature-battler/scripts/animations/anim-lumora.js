registerMoveAnimations({

  // ── radiant_tap ───────────────────────────────────────────────────────────
  // Gentle lunge, soft golden glow, light particles on hit.
  radiant_tap: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-radiant-tap' },
      { at:0,   type:'preset',        id:'light_cast_aura' },
      { at:220, type:'sound',         id:'hit-light' },
      { at:220, type:'creature_anim', target:'actor',  class:'anim-cast-radiant-tap-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim', target:'target', class:'anim-hit-light-light' },
      { at:340, type:'preset',        id:'light_particle_light' },
      { at:340, type:'preset',        id:'light_hit_flash_light' },
    ],
  },

  // ── radiant_tap_2 ─────────────────────────────────────────────────────────
  radiant_tap_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-radiant-tap-2' },
      { at:0,   type:'preset',        id:'light_cast_aura', count:9 },
      { at:250, type:'sound',         id:'hit-heavy' },
      { at:250, type:'creature_anim', target:'actor',  class:'anim-cast-radiant-tap-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim', target:'target', class:'anim-hit-light-heavy' },
      { at:380, type:'preset',        id:'light_particle_heavy' },
      { at:380, type:'preset',        id:'light_hit_flash_heavy' },
      { at:380, type:'screen_shake',  intensity:3, duration:180 },
    ],
  },

  // ── radiant_tap_3 ─────────────────────────────────────────────────────────
  // Full-power lunge — long charge, bright eruption, stutter shake.
  radiant_tap_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-radiant-tap-3' },
      { at:0,   type:'preset',        id:'light_cast_aura', count:12, spread:45 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'creature_anim', target:'actor',  class:'anim-cast-radiant-tap-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim', target:'target', class:'anim-hit-light-heavy' },
      { at:460, type:'preset',        id:'light_particle_heavy' },
      { at:460, type:'preset',        id:'light_hit_flash_heavy' },
      { at:460, type:'screen_shake',  intensity:5, duration:240, style:'stutter' },
    ],
  },

  // ── mend_light ────────────────────────────────────────────────────────────
  // Single-ally heal. Warm golden particles rise on the ally.
  mend_light: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-mend-light' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:6 },
      { at:300, type:'impact' },
      { at:300, type:'particle_burst', origin:'target', color:'#ffeeaa', count:12, spread:50, direction:'up', duration:560, glow:true },
      { at:300, type:'field_flash',    color:'#ffeeaa', opacity:0.20, duration:260 },
    ],
  },

  // ── mend_light_2 ──────────────────────────────────────────────────────────
  // Larger single-ally heal — more particles, brighter field.
  mend_light_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-mend-light-2' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:10, spread:45 },
      { at:380, type:'impact' },
      { at:380, type:'preset',         id:'light_particle_heavy', origin:'target' },
      { at:380, type:'particle_burst', origin:'target', color:'#ffeeaa', count:18, spread:60, direction:'up', duration:640, glow:true },
      { at:380, type:'field_flash',    color:'#ffeeaa', opacity:0.32, duration:320 },
    ],
  },

  // ── cleanse ───────────────────────────────────────────────────────────────
  // Status cleanse. Pure white pulse on ally — their afflictions dissolve.
  cleanse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-cleanse' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:8, spread:40 },
      { at:280, type:'impact' },
      { at:280, type:'particle_burst', origin:'target', color:'#ffffff', count:14, spread:60, direction:'all', duration:500, glow:true },
      { at:280, type:'field_flash',    color:'#ffffff', opacity:0.45, duration:220 },
    ],
  },

  // ── light_ray ─────────────────────────────────────────────────────────────
  // Focused light projectile arcing to target.
  light_ray: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-light-ray' },
      { at:0,   type:'preset',        id:'light_cast_aura', count:5 },
      { at:100, type:'preset',        id:'light_projectile_light' },
      { at:500, type:'impact' },
      { at:500, type:'sound',         id:'hit-light' },
      { at:500, type:'creature_anim', target:'target', class:'anim-hit-light-light' },
      { at:500, type:'preset',        id:'light_particle_light' },
      { at:500, type:'preset',        id:'light_hit_flash_light' },
    ],
  },

  // ── rejuvenate ────────────────────────────────────────────────────────────
  // AoE team heal. Gentle golden rain descends on all allies.
  rejuvenate: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-rejuvenate' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:8 },
      { at:320, type:'impact' },
      { at:320, type:'particle_burst', origin:'actor', color:'#ffeeaa', count:16, spread:80, direction:'up', duration:600, glow:true },
      { at:320, type:'field_flash',    color:'#ffeeaa', opacity:0.22, duration:300 },
    ],
  },

  // ── clarity ───────────────────────────────────────────────────────────────
  // Self-buff (Speed + Accuracy). Crisp white flash, focused aura.
  clarity: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-clarity' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:10, spread:45 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:12, spread:50, direction:'up', duration:500, glow:true },
      { at:360, type:'impact' },
      { at:360, type:'field_flash',    color:'#ffffff', opacity:0.40, duration:200 },
    ],
  },

  // ── blind_flash ───────────────────────────────────────────────────────────
  // Blind utility. A blinding projectile of pure white light.
  blind_flash: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-blind-flash' },
      { at:0,   type:'preset',         id:'light_cast_aura', color:'#ffffff', count:6 },
      { at:80,  type:'preset',         id:'light_projectile_light', size:16, color:'#ffffff', duration:320 },
      { at:480, type:'impact' },
      { at:480, type:'sound',          id:'hit-light' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-blind-flash' },
      { at:480, type:'particle_burst', origin:'target', color:'#ffffff', count:14, spread:65, direction:'all', duration:480, glow:true },
      { at:480, type:'field_flash',    color:'#ffffff', opacity:0.70, duration:200 },
    ],
  },

  // ── healing_surge ─────────────────────────────────────────────────────────
  // Large single-ally heal — cast is visible, bright surge on ally.
  healing_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-healing-surge' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:12, spread:50 },
      { at:420, type:'impact' },
      { at:420, type:'preset',         id:'light_particle_heavy', origin:'target' },
      { at:420, type:'particle_burst', origin:'target', color:'#ffffff', count:16, spread:65, direction:'up', duration:600, glow:true },
      { at:420, type:'field_flash',    color:'#ffffee', opacity:0.45, duration:300 },
    ],
  },

  // ── light_beam ────────────────────────────────────────────────────────────
  // Sustained holy beam into a single target.
  light_beam: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-light-beam' },
      { at:0,   type:'preset',        id:'light_cast_aura', count:10, spread:40 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'preset',        id:'light_beam' },
      { at:600, type:'impact' },
      { at:600, type:'creature_anim', target:'target', class:'anim-hit-light-heavy' },
      { at:600, type:'preset',        id:'light_particle_heavy' },
      { at:600, type:'preset',        id:'light_hit_flash_heavy' },
      { at:600, type:'screen_shake',  intensity:5, duration:240 },
    ],
  },

  // ── holy_ward ─────────────────────────────────────────────────────────────
  // Self-buff (Spirit +2). Divine barrier of golden-white light envelops actor.
  holy_ward: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-holy-ward' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffeeaa', count:18, spread:65, direction:'all', duration:680, glow:true },
      { at:460, type:'impact' },
      { at:460, type:'field_flash',    color:'#ffeeaa', opacity:0.35, duration:280 },
    ],
  },

  // ── full_restore ──────────────────────────────────────────────────────────
  // AoE team heal — big golden light floods the field.
  full_restore: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-full-restore' },
      { at:0,   type:'preset',         id:'light_cast_aura', count:16, spread:60 },
      { at:520, type:'impact' },
      { at:520, type:'preset',         id:'light_field_effect', opacity:0.85, duration:380 },
      { at:560, type:'particle_burst', origin:'actor', color:'#ffeeaa', count:22, spread:90, direction:'up', duration:700, glow:true },
      { at:560, type:'field_flash',    color:'#ffeeaa', opacity:0.30, duration:320 },
    ],
  },

  // ── divine_light ──────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge, divine eruption on landing, blinding
  // white field, two aftershock pulses.
  divine_light: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-divine-light-charge' },
      { at:0,   type:'preset',        id:'light_cast_aura', count:16, spread:55 },
      { at:580, type:'sound',         id:'hit-heavy' },
      { at:580, type:'creature_anim', target:'actor',  class:'anim-cast-divine-light-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',         id:'hit-heavy' },
      { at:780, type:'creature_anim', target:'target', class:'anim-hit-light-heavy' },
      { at:780, type:'preset',        id:'light_particle_heavy' },
      { at:780, type:'preset',        id:'light_hit_flash_heavy' },
      { at:780, type:'screen_shake',  intensity:10, duration:400, style:'stutter' },
      { at:860, type:'preset',        id:'light_field_effect', opacity:0.90, duration:360 },
      { at:960, type:'field_flash',   color:'#ffeeaa', opacity:0.40, duration:260 },
    ],
  },

});
