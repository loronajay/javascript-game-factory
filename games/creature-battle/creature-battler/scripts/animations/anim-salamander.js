registerMoveAnimations({

  // ── spark_flick ────────────────────────────────────────────────────────────
  // Snappy 2-beat: brief ember shimmer → light projectile → fire flash + ring.
  spark_flick: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff9900', count:2, interval:75, direction:'up', duration:120 },
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-spark-flick' },
      { at:0,   type:'preset',          id:'fire_cast_aura' },
      { at:120, type:'preset',          id:'fire_projectile_light' },
      { at:280, type:'impact' },
      { at:280, type:'sound',           id:'hit-light' },
      { at:280, type:'creature_anim',   target:'target', class:'anim-hit-fire-light' },
      { at:280, type:'preset',          id:'fire_particle_light' },
      { at:280, type:'preset',          id:'fire_hit_flash_light' },
      { at:280, type:'shockwave',       origin:'target', size:28, color:'#ff8822', opacity:0.55, thickness:3 },
    ],
  },

  // ── spark_flick_2 ──────────────────────────────────────────────────────────
  // Heavier shot. Actor glows orange during cast; impact ring is larger.
  spark_flick_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff8800', count:3, interval:70, direction:'up', duration:140 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff8800', blend:'screen', opacity:0.25, duration:250 },
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-spark-flick-2' },
      { at:0,   type:'preset',          id:'fire_cast_aura' },
      { at:140, type:'preset',          id:'fire_projectile_heavy', size:16, duration:300 },
      { at:390, type:'impact' },
      { at:390, type:'sound',           id:'hit-light' },
      { at:390, type:'creature_anim',   target:'target', class:'anim-hit-fire-heavy' },
      { at:390, type:'preset',          id:'fire_particle_heavy' },
      { at:390, type:'preset',          id:'fire_hit_flash_light' },
      { at:390, type:'screen_shake',    intensity:3, duration:200 },
      { at:390, type:'shockwave',       origin:'target', size:44, color:'#ff6600', opacity:0.65, thickness:3 },
    ],
  },

  // ── spark_flick_3 ──────────────────────────────────────────────────────────
  // Full-force blaze. Hot actor glow throughout cast; hit_stop + large ring.
  spark_flick_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff6600', count:4, interval:60, direction:'up', duration:150, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff5500', blend:'screen', opacity:0.35, duration:300 },
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-spark-flick-3' },
      { at:0,   type:'preset',          id:'fire_cast_aura', count:10 },
      { at:150, type:'preset',          id:'fire_projectile_heavy' },
      { at:440, type:'impact' },
      { at:440, type:'sound',           id:'hit-heavy' },
      { at:440, type:'creature_anim',   target:'target', class:'anim-hit-fire-heavy' },
      { at:440, type:'preset',          id:'fire_particle_heavy' },
      { at:440, type:'preset',          id:'fire_hit_flash_heavy' },
      { at:440, type:'screen_shake',    intensity:6, duration:280, style:'stutter' },
      { at:440, type:'hit_stop',        duration:60 },
      { at:500, type:'shockwave',       origin:'target', size:65, color:'#ff4400', opacity:0.7, thickness:4 },
      { at:500, type:'creature_tint',   target:'target', color:'#ff4400', blend:'multiply', opacity:0.25, duration:360 },
    ],
  },

  // ── heat_haze ──────────────────────────────────────────────────────────────
  // Self-buff (evasion). Creature radiates heat — embers in all directions,
  // warm screen-blend glow, status ring locks in the evasion raise.
  heat_haze: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff9900', count:3, interval:80, direction:'all', spread:38, duration:300 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff8800', blend:'screen', opacity:0.28, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-heat-haze' },
      { at:0,   type:'preset',          id:'fire_cast_aura', direction:'all', spread:40 },
      { at:300, type:'impact' },
      { at:300, type:'field_flash',     color:'#ff9900', opacity:0.12, duration:180 },
      { at:300, type:'status_ring',     target:'actor',  color:'#ffaa22', duration:700 },
    ],
  },

  // ── ember_trail ────────────────────────────────────────────────────────────
  // Burn application. Pre-impact stays identical; the identity is the aftermath:
  // embers rise from the target for ~600ms as proof the burn landed.
  ember_trail: {
    timeline: [
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-ember-trail' },
      { at:0,   type:'preset',          id:'fire_cast_aura', count:4, spread:20 },
      { at:100, type:'preset',          id:'fire_projectile_light', duration:380, arc:-10, color:'#ff6600' },
      { at:420, type:'impact' },
      { at:420, type:'sound',           id:'hit-light' },
      { at:420, type:'creature_anim',   target:'target', class:'anim-hit-ember-burn' },
      { at:420, type:'particle_burst',  origin:'target', color:'#cc4400', count:7, spread:40, direction:'up', glow:true, duration:500 },
      { at:420, type:'field_flash',     color:'#cc4400', opacity:0.20, duration:200 },
      { at:420, type:'particle_stream', origin:'target', color:'#cc4400', count:2, interval:100, direction:'up', size:4, glow:true, duration:620 },
      { at:420, type:'creature_tint',   target:'target', color:'#cc4400', blend:'multiply', opacity:0.22, duration:500 },
      { at:420, type:'status_ring',     target:'target', color:'#ff5500', duration:700 },
    ],
  },

  // ── ash_veil ───────────────────────────────────────────────────────────────
  // Self-buff (spirit). Ash settles DOWN (not up — ash falls, embers rise).
  // Pale screen-blend tint + status ring locks in the spirit raise.
  ash_veil: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaaaaa', count:3, interval:90, direction:'down', size:3, duration:480 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#cccccc', blend:'screen', opacity:0.20, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-ash-veil' },
      { at:300, type:'impact' },
      { at:300, type:'field_flash',     color:'#cccccc', opacity:0.10, duration:180 },
      { at:300, type:'status_ring',     target:'actor',  color:'#bbbbaa', duration:700 },
    ],
  },

  // ── smoke_screen ───────────────────────────────────────────────────────────
  // Utility (blind). Dark projectile → smoke lingers on target after hit.
  smoke_screen: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-smoke-screen' },
      { at:0,   type:'preset',          id:'fire_cast_aura', color:'#555555', count:5 },
      { at:100, type:'projectile',      from:'actor', to:'target', color:'#444444', size:18, shape:'oval', arc:-12, duration:380 },
      { at:430, type:'impact' },
      { at:430, type:'sound',           id:'hit-light' },
      { at:430, type:'creature_anim',   target:'target', class:'anim-hit-smoke-blind' },
      { at:430, type:'particle_burst',  origin:'target', color:'#666666', count:10, spread:65, duration:560 },
      { at:430, type:'field_flash',     color:'#222222', opacity:0.22, duration:240 },
      { at:430, type:'particle_stream', origin:'target', color:'#666666', count:4, interval:75, direction:'all', spread:55, duration:560 },
      { at:430, type:'creature_tint',   target:'target', color:'#333333', blend:'multiply', opacity:0.38, duration:600 },
      { at:430, type:'status_ring',     target:'target', color:'#555555', duration:700 },
    ],
  },

  // ── flare_bite ─────────────────────────────────────────────────────────────
  // Signature lunge: 560ms charge full of rising fire energy → heavy bite →
  // hit_stop + kinetic ring + fire jaw mark on target.
  flare_bite: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff7700', count:4, interval:68, direction:'up', spread:32, duration:560, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff5500', blend:'screen', opacity:0.3, duration:560 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-flare-charge' },
      { at:0,   type:'preset',          id:'fire_cast_aura', count:9, spread:35 },
      { at:560, type:'sound',           id:'fire' },
      { at:560, type:'creature_anim',   target:'actor',  class:'anim-cast-flare-bite', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',           id:'hit-heavy' },
      { at:780, type:'creature_anim',   target:'target', class:'anim-hit-fire-heavy' },
      { at:780, type:'preset',          id:'fire_particle_heavy' },
      { at:780, type:'preset',          id:'fire_hit_flash_heavy' },
      { at:780, type:'screen_shake',    intensity:6, duration:260, style:'stutter' },
      { at:780, type:'hit_stop',        duration:70 },
      { at:850, type:'shockwave',       origin:'target', size:72, color:'#ff4400', opacity:0.75, thickness:5 },
      { at:850, type:'creature_tint',   target:'target', color:'#ff3300', blend:'multiply', opacity:0.30, duration:420 },
    ],
  },

  // ── cinder_burst ───────────────────────────────────────────────────────────
  // AoE fire. Embers build during charge; shockwave radiates outward from actor
  // at the detonation point.
  cinder_burst: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff7700', count:3, interval:80, direction:'up', duration:300 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff6600', blend:'screen', opacity:0.28, duration:350 },
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cinder-burst' },
      { at:0,   type:'preset',          id:'fire_cast_aura' },
      { at:300, type:'sound',           id:'fire' },
      { at:350, type:'impact' },
      { at:350, type:'sound',           id:'hit-heavy' },
      { at:350, type:'preset',          id:'fire_field_effect' },
      { at:350, type:'screen_shake',    intensity:4, duration:250 },
      { at:350, type:'shockwave',       origin:'actor', size:82, color:'#ff5500', opacity:0.65, thickness:4 },
      { at:400, type:'preset',          id:'fire_particle_heavy', origin:'actor' },
    ],
  },

  // ── cinder_burst_2 ─────────────────────────────────────────────────────────
  // Larger AoE. Heavier ember storm, hit_stop at detonation, bigger ring.
  cinder_burst_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff6600', count:4, interval:72, direction:'up', duration:450, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff4400', blend:'screen', opacity:0.35, duration:420 },
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cinder-burst-2' },
      { at:0,   type:'preset',          id:'fire_cast_aura', count:9 },
      { at:350, type:'sound',           id:'fire' },
      { at:450, type:'impact' },
      { at:450, type:'sound',           id:'hit-heavy' },
      { at:450, type:'preset',          id:'fire_field_effect', opacity:0.75, duration:360 },
      { at:450, type:'screen_shake',    intensity:6, duration:300, style:'stutter' },
      { at:450, type:'hit_stop',        duration:60 },
      { at:510, type:'shockwave',       origin:'actor', size:105, color:'#ff4400', opacity:0.7, thickness:5 },
      { at:560, type:'preset',          id:'fire_particle_heavy', origin:'actor' },
    ],
  },

  // ── cinder_burst_3 ─────────────────────────────────────────────────────────
  // Field-scorching eruption. Full heavy ember storm, hit_stop, double shockwave
  // cascade with aftershock ring, lingering fire wash.
  cinder_burst_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff5500', count:5, interval:65, direction:'up', spread:40, duration:520, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ff3300', blend:'screen', opacity:0.42, duration:480 },
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cinder-burst-3' },
      { at:0,   type:'preset',          id:'fire_cast_aura', count:11, spread:40 },
      { at:380, type:'sound',           id:'fire', repeat:2, interval:100 },
      { at:520, type:'impact' },
      { at:520, type:'sound',           id:'hit-heavy' },
      { at:520, type:'preset',          id:'fire_field_effect', opacity:0.85, duration:400 },
      { at:520, type:'screen_shake',    intensity:8, duration:380, style:'stutter' },
      { at:520, type:'hit_stop',        duration:80 },
      { at:600, type:'shockwave',       origin:'actor', size:130, color:'#ff3300', opacity:0.75, thickness:6 },
      { at:600, type:'particle_stream', origin:'actor',  color:'#ff5500', count:3, interval:90, direction:'all', duration:360 },
      { at:620, type:'preset',          id:'fire_particle_heavy', origin:'actor' },
      { at:640, type:'field_flash',     color:'#cc2200', opacity:0.35, duration:200 },
      { at:740, type:'shockwave',       origin:'actor', size:70, color:'#ff7700', opacity:0.5, thickness:3 },
    ],
  },

  // ── scorch ─────────────────────────────────────────────────────────────────
  // Two-hit move. Between hits, embers rise from the already-struck target.
  // Second projectile arrives into a smoking target; second hit has a ring.
  scorch: {
    timeline: [
      { at:0,   type:'sound',           id:'fire' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-scorch' },
      { at:0,   type:'preset',          id:'fire_cast_aura' },
      { at:80,  type:'preset',          id:'fire_projectile_light', color:'#ff4400' },
      { at:280, type:'impact' },
      { at:280, type:'sound',           id:'hit-light' },
      { at:280, type:'creature_anim',   target:'target', class:'anim-hit-fire-light' },
      { at:280, type:'preset',          id:'fire_particle_light' },
      { at:280, type:'preset',          id:'fire_hit_flash_light' },
      { at:360, type:'particle_stream', origin:'target', color:'#cc4400', count:2, interval:80, direction:'up', duration:280 },
      { at:400, type:'sound',           id:'fire' },
      { at:440, type:'preset',          id:'fire_projectile_light', color:'#ff5500' },
      { at:640, type:'sound',           id:'hit-light' },
      { at:640, type:'creature_shake',  target:'target', intensity:4, duration:180 },
      { at:640, type:'preset',          id:'fire_particle_light' },
      { at:640, type:'preset',          id:'fire_hit_flash_light' },
      { at:640, type:'shockwave',       origin:'target', size:40, color:'#ff6600', opacity:0.60, thickness:3 },
      { at:640, type:'creature_tint',   target:'target', color:'#cc4400', blend:'multiply', opacity:0.22, duration:300 },
    ],
  },

  // ── magma_surge ────────────────────────────────────────────────────────────
  // Ultimate AoE. Everything deployed: sustained fire energy for the full
  // 540ms charge, crimson actor tint, hit_stop 100ms, triple shockwave cascade,
  // lingering magma particle wash.
  magma_surge: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ff5500', count:5, interval:62, direction:'up', spread:42, duration:540, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#cc2200', blend:'screen', opacity:0.45, duration:600 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-magma-surge' },
      { at:0,   type:'preset',          id:'fire_cast_aura', count:12, spread:50, direction:'all' },
      { at:260, type:'sound',           id:'fire' },
      { at:350, type:'sound',           id:'fire', repeat:3, interval:90 },
      { at:540, type:'impact' },
      { at:540, type:'sound',           id:'hit-heavy' },
      { at:540, type:'preset',          id:'fire_field_effect', opacity:0.90, duration:480 },
      { at:540, type:'screen_shake',    intensity:10, duration:500, style:'stutter' },
      { at:540, type:'hit_stop',        duration:100 },
      { at:640, type:'shockwave',       origin:'actor', size:160, color:'#ff3300', opacity:0.80, thickness:7 },
      { at:640, type:'particle_stream', origin:'actor',  color:'#ff4400', count:4, interval:85, direction:'all', spread:55, duration:440 },
      { at:690, type:'preset',          id:'fire_particle_heavy', origin:'actor' },
      { at:760, type:'field_flash',     color:'#ff2200', opacity:0.40, duration:280 },
      { at:840, type:'shockwave',       origin:'actor', size:90, color:'#ff8800', opacity:0.55, thickness:4 },
      { at:860, type:'field_flash',     color:'#881100', opacity:0.20, duration:200 },
      { at:1020, type:'shockwave',      origin:'actor', size:50, color:'#ffaa00', opacity:0.40, thickness:3 },
    ],
  },

});
