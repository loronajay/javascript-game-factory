registerMoveAnimations({

  // ── spark_jab ─────────────────────────────────────────────────────────────
  // Fast lunge jab. Electric shimmer → sharp dash → crackling ring on impact.
  spark_jab: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#eeff88', count:2, interval:90, direction:'up', duration:180 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.20, duration:240 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-spark-jab' },
      { at:0,   type:'preset',          id:'lightning_cast_aura' },
      { at:200, type:'sound',           id:'hit-light' },
      { at:200, type:'creature_anim',   target:'actor',  class:'anim-cast-spark-jab-lunge', lunge:true },
      { at:320, type:'impact' },
      { at:320, type:'creature_anim',   target:'target', class:'anim-hit-lightning-light' },
      { at:320, type:'preset',          id:'lightning_particle_light' },
      { at:320, type:'preset',          id:'lightning_hit_flash_light' },
      { at:320, type:'shockwave',       origin:'target', size:26, color:'#eeffaa', opacity:0.50, thickness:2 },
    ],
  },

  // ── spark_jab_2 ───────────────────────────────────────────────────────────
  // Heavier jab — electric build-up visible; shocked tint on target.
  spark_jab_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ddff66', count:3, interval:78, direction:'up', duration:210 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.26, duration:270 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-spark-jab-2' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:10 },
      { at:230, type:'sound',           id:'hit-heavy' },
      { at:230, type:'creature_anim',   target:'actor',  class:'anim-cast-spark-jab-2-lunge', lunge:true },
      { at:360, type:'impact' },
      { at:360, type:'creature_anim',   target:'target', class:'anim-hit-lightning-heavy' },
      { at:360, type:'preset',          id:'lightning_particle_heavy' },
      { at:360, type:'preset',          id:'lightning_hit_flash_heavy' },
      { at:360, type:'screen_shake',    intensity:3, duration:180 },
      { at:360, type:'shockwave',       origin:'target', size:42, color:'#ddff66', opacity:0.56, thickness:3 },
      { at:360, type:'creature_tint',   target:'target', color:'#aaaa00', blend:'multiply', opacity:0.18, duration:280 },
    ],
  },

  // ── spark_jab_3 ───────────────────────────────────────────────────────────
  // Overcharged — long cast, bright flash, stutter shake, scorched tint.
  spark_jab_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ccff44', count:4, interval:68, direction:'up', spread:28, duration:260, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ddff66', blend:'screen', opacity:0.32, duration:320 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-spark-jab-3' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:14, spread:45 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:300, type:'creature_anim',   target:'actor',  class:'anim-cast-spark-jab-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim',   target:'target', class:'anim-hit-lightning-heavy' },
      { at:460, type:'preset',          id:'lightning_particle_heavy' },
      { at:460, type:'preset',          id:'lightning_hit_flash_heavy' },
      { at:460, type:'screen_shake',    intensity:6, duration:260, style:'stutter' },
      { at:460, type:'hit_stop',        duration:50 },
      { at:510, type:'shockwave',       origin:'target', size:58, color:'#aabb00', opacity:0.62, thickness:4 },
      { at:510, type:'creature_tint',   target:'target', color:'#888800', blend:'multiply', opacity:0.22, duration:340 },
    ],
  },

  // ── dodge_step ────────────────────────────────────────────────────────────
  // Self-buff (Evasion +2). Electric blur on actor — status ring locks in the
  // evasion raise.
  dodge_step: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#eeffaa', count:3, interval:80, direction:'up', spread:40, duration:360 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.28, duration:520 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-dodge-step' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:10, spread:50 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#eeffaa', count:14, spread:55, direction:'all', duration:500, glow:true },
      { at:320, type:'impact' },
      { at:320, type:'field_flash',     color:'#eeffaa', opacity:0.20, duration:180 },
      { at:320, type:'status_ring',     target:'actor',  color:'#eeffaa', duration:700 },
    ],
  },

  // ── volt_dart ─────────────────────────────────────────────────────────────
  // Fast shard projectile — near-instant electric snap to target.
  volt_dart: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#eeff88', count:2, interval:90, direction:'up', duration:200 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.20, duration:260 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-volt-dart' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:5 },
      { at:80,  type:'preset',          id:'lightning_projectile_light' },
      { at:360, type:'impact' },
      { at:360, type:'sound',           id:'hit-light' },
      { at:360, type:'creature_anim',   target:'target', class:'anim-hit-lightning-light' },
      { at:360, type:'preset',          id:'lightning_particle_light' },
      { at:360, type:'preset',          id:'lightning_hit_flash_light' },
      { at:360, type:'shockwave',       origin:'target', size:34, color:'#eeffaa', opacity:0.52, thickness:2 },
    ],
  },

  // ── static_burst ──────────────────────────────────────────────────────────
  // AoE static discharge. Electric particles explode outward from actor.
  static_burst: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#eeffaa', count:3, interval:80, direction:'up', spread:35, duration:320 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.24, duration:400 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-static-burst' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:8 },
      { at:260, type:'sound',           id:'hit-light' },
      { at:300, type:'impact' },
      { at:300, type:'preset',          id:'lightning_field_effect' },
      { at:300, type:'screen_shake',    intensity:3, duration:200 },
      { at:300, type:'shockwave',       origin:'actor', size:82, color:'#ddff66', opacity:0.55, thickness:4 },
      { at:350, type:'preset',          id:'lightning_particle_light', origin:'actor' },
      { at:350, type:'particle_burst',  origin:'actor',  color:'#eeffaa', count:12, spread:85, direction:'all', duration:480, glow:true },
    ],
  },

  // ── phase_shift ───────────────────────────────────────────────────────────
  // Self-buff (Evasion + Speed). Full electric surge — two rings confirm both
  // stat raises.
  phase_shift: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffffff', count:4, interval:78, direction:'all', spread:50, duration:560 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.35, duration:680 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:210 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-phase-shift' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ffffff', count:16, spread:60, direction:'all', duration:580, glow:true },
      { at:430, type:'impact' },
      { at:430, type:'field_flash',     color:'#eeffaa', opacity:0.30, duration:240 },
      { at:430, type:'status_ring',     target:'actor',  color:'#eeffaa', duration:720 },
      { at:510, type:'status_ring',     target:'actor',  color:'#ccffaa', duration:640 },
    ],
  },

  // ── chain_spark ───────────────────────────────────────────────────────────
  // AoE chain lightning. Arcs fill the field — hit_stop + shockwave detonate
  // at the burst point.
  chain_spark: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#eeffaa', count:3, interval:80, direction:'up', spread:35, duration:420 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.28, duration:500 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-chain-spark' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:10 },
      { at:320, type:'sound',           id:'hit-heavy' },
      { at:380, type:'impact' },
      { at:380, type:'preset',          id:'lightning_field_effect', opacity:0.80, duration:200 },
      { at:380, type:'screen_shake',    intensity:4, duration:200 },
      { at:380, type:'hit_stop',        duration:45 },
      { at:425, type:'shockwave',       origin:'actor', size:96, color:'#ccff22', opacity:0.62, thickness:5 },
      { at:450, type:'preset',          id:'lightning_particle_heavy', origin:'actor' },
      { at:450, type:'particle_burst',  origin:'actor',  color:'#ffffff', count:18, spread:90, direction:'all', duration:500, glow:true },
    ],
  },

  // ── volt_snap ─────────────────────────────────────────────────────────────
  // Stun utility. White jolt snaps to target — the white status ring is the
  // key identity marker confirming the stun.
  volt_snap: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ffffff', count:2, interval:90, direction:'up', duration:180 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ffffff', blend:'screen', opacity:0.18, duration:240 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-volt-snap' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', color:'#ffffff', count:5 },
      { at:80,  type:'preset',          id:'lightning_projectile_light', size:12, color:'#ffffff', duration:200 },
      { at:380, type:'impact' },
      { at:380, type:'sound',           id:'hit-light' },
      { at:380, type:'creature_anim',   target:'target', class:'anim-hit-volt-snap' },
      { at:380, type:'particle_burst',  origin:'target', color:'#ffffff', count:10, spread:55, direction:'all', duration:400, glow:true },
      { at:380, type:'field_flash',     color:'#ffffff', opacity:0.45, duration:140 },
      { at:380, type:'creature_tint',   target:'target', color:'#aabb00', blend:'multiply', opacity:0.22, duration:500 },
      { at:380, type:'status_ring',     target:'target', color:'#ffffff', duration:750 },
    ],
  },

  // ── lightning_strike ──────────────────────────────────────────────────────
  // Focused bolt. Lightning beam fires to target — shockwave on arrival.
  lightning_strike: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ddff66', count:3, interval:80, direction:'up', spread:28, duration:300 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ddff66', blend:'screen', opacity:0.26, duration:420 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-lightning-strike' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:10, spread:40 },
      { at:280, type:'sound',           id:'hit-heavy' },
      { at:280, type:'preset',          id:'lightning_beam' },
      { at:480, type:'impact' },
      { at:480, type:'creature_anim',   target:'target', class:'anim-hit-lightning-heavy' },
      { at:480, type:'preset',          id:'lightning_particle_heavy' },
      { at:480, type:'preset',          id:'lightning_hit_flash_heavy' },
      { at:480, type:'screen_shake',    intensity:5, duration:220 },
      { at:480, type:'shockwave',       origin:'target', size:54, color:'#bbdd00', opacity:0.62, thickness:3 },
      { at:480, type:'creature_tint',   target:'target', color:'#888800', blend:'multiply', opacity:0.20, duration:320 },
    ],
  },

  // ── twin_bolt ─────────────────────────────────────────────────────────────
  // Two-hit shards. Impact on hit 1; shockwave ring closes on hit 2.
  twin_bolt: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#eeffaa', count:2, interval:90, direction:'up', duration:220 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#eeff88', blend:'screen', opacity:0.20, duration:380 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-twin-bolt' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:6 },
      // Hit 1
      { at:60,  type:'preset',          id:'lightning_projectile_light', duration:180 },
      { at:260, type:'impact' },
      { at:260, type:'sound',           id:'hit-light' },
      { at:260, type:'creature_anim',   target:'target', class:'anim-hit-lightning-light' },
      { at:260, type:'preset',          id:'lightning_particle_light' },
      // Hit 2
      { at:360, type:'sound',           id:'charge-light' },
      { at:400, type:'preset',          id:'lightning_projectile_heavy', duration:180 },
      { at:600, type:'sound',           id:'hit-heavy' },
      { at:600, type:'creature_shake',  target:'target', intensity:5, duration:180 },
      { at:600, type:'preset',          id:'lightning_particle_heavy' },
      { at:600, type:'preset',          id:'lightning_hit_flash_heavy' },
      { at:600, type:'shockwave',       origin:'target', size:44, color:'#eeffaa', opacity:0.58, thickness:3 },
    ],
  },

  // ── static_burst_2 ────────────────────────────────────────────────────────
  // Heavier AoE — hit_stop, larger shockwave, double field pulse.
  static_burst_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ccff44', count:4, interval:72, direction:'up', spread:32, duration:420, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ddff66', blend:'screen', opacity:0.32, duration:520 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-static-burst-2' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:12, spread:45 },
      { at:360, type:'sound',           id:'hit-heavy' },
      { at:420, type:'impact' },
      { at:420, type:'preset',          id:'lightning_field_effect', opacity:0.90, duration:220 },
      { at:420, type:'screen_shake',    intensity:6, duration:260 },
      { at:420, type:'hit_stop',        duration:55 },
      { at:475, type:'shockwave',       origin:'actor', size:115, color:'#aabb00', opacity:0.68, thickness:5 },
      { at:505, type:'preset',          id:'lightning_particle_heavy', origin:'actor' },
      { at:505, type:'particle_burst',  origin:'actor',  color:'#ffffff', count:20, spread:90, direction:'all', duration:540, glow:true },
      { at:505, type:'field_flash',     color:'#eeffaa', opacity:0.30, duration:200 },
    ],
  },

  // ── twin_bolt_2 ───────────────────────────────────────────────────────────
  // Three-hit rapid bolts. Impact on hit 1; shakes on 2; hit_stop + shockwave
  // close on the final bolt.
  twin_bolt_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ddff66', count:3, interval:80, direction:'up', duration:280 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ddff66', blend:'screen', opacity:0.24, duration:500 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-twin-bolt-2' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:8 },
      // Hit 1
      { at:60,  type:'preset',          id:'lightning_projectile_light', duration:160 },
      { at:240, type:'impact' },
      { at:240, type:'sound',           id:'hit-light' },
      { at:240, type:'creature_anim',   target:'target', class:'anim-hit-lightning-light' },
      { at:240, type:'preset',          id:'lightning_particle_light' },
      // Hit 2
      { at:340, type:'sound',           id:'charge-light' },
      { at:380, type:'preset',          id:'lightning_projectile_light', duration:160 },
      { at:560, type:'sound',           id:'hit-light' },
      { at:560, type:'creature_shake',  target:'target', intensity:4, duration:160 },
      { at:560, type:'preset',          id:'lightning_particle_light' },
      // Hit 3
      { at:660, type:'sound',           id:'charge-light' },
      { at:700, type:'preset',          id:'lightning_projectile_heavy', duration:160 },
      { at:880, type:'sound',           id:'hit-heavy' },
      { at:880, type:'creature_shake',  target:'target', intensity:6, duration:200 },
      { at:880, type:'hit_stop',        duration:50 },
      { at:880, type:'preset',          id:'lightning_particle_heavy' },
      { at:880, type:'preset',          id:'lightning_hit_flash_heavy' },
      { at:930, type:'shockwave',       origin:'target', size:58, color:'#bbdd00', opacity:0.62, thickness:4 },
      { at:930, type:'creature_tint',   target:'target', color:'#888800', blend:'multiply', opacity:0.22, duration:360 },
    ],
  },

  // ── lightning_strike_2 ────────────────────────────────────────────────────
  // Supercharged bolt — wide beam, hit_stop, stutter shake, shockwave.
  lightning_strike_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#bbdd00', count:4, interval:72, direction:'up', spread:32, duration:440, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ccee22', blend:'screen', opacity:0.36, duration:560 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-lightning-strike-2' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:14, spread:50 },
      { at:420, type:'sound',           id:'hit-heavy' },
      { at:420, type:'preset',          id:'lightning_beam', width:6, duration:380 },
      { at:640, type:'impact' },
      { at:640, type:'creature_anim',   target:'target', class:'anim-hit-lightning-heavy' },
      { at:640, type:'preset',          id:'lightning_particle_heavy' },
      { at:640, type:'preset',          id:'lightning_hit_flash_heavy' },
      { at:640, type:'screen_shake',    intensity:8, duration:320, style:'stutter' },
      { at:640, type:'hit_stop',        duration:65 },
      { at:705, type:'shockwave',       origin:'target', size:86, color:'#99bb00', opacity:0.70, thickness:5 },
      { at:705, type:'creature_tint',   target:'target', color:'#777700', blend:'multiply', opacity:0.26, duration:400 },
      { at:725, type:'field_flash',     color:'#eeffaa', opacity:0.28, duration:220 },
    ],
  },

  // ── thunderclap ───────────────────────────────────────────────────────────
  // AoE ultimate. The field goes white — full-charge burst, massive particle
  // eruption, hit_stop, stutter shake, triple aftershock pulse.
  thunderclap: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aabb00', count:5, interval:62, direction:'up', spread:42, duration:560, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#ccee22', blend:'screen', opacity:0.42, duration:640 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-thunderclap' },
      { at:0,   type:'preset',          id:'lightning_cast_aura', count:16, spread:55 },
      { at:560, type:'sound',           id:'hit-heavy' },
      { at:620, type:'impact' },
      { at:620, type:'preset',          id:'lightning_field_effect', opacity:1.0, duration:200 },
      { at:620, type:'screen_shake',    intensity:10, duration:380, style:'stutter' },
      { at:620, type:'hit_stop',        duration:80 },
      { at:700, type:'shockwave',       origin:'actor', size:155, color:'#88aa00', opacity:0.80, thickness:7 },
      { at:700, type:'particle_burst',  origin:'actor',  color:'#ffffff', count:24, spread:100, direction:'all', duration:600, glow:true },
      { at:700, type:'preset',          id:'lightning_particle_heavy', origin:'actor' },
      { at:740, type:'preset',          id:'lightning_field_effect', opacity:0.60, duration:180 },
      { at:780, type:'particle_stream', origin:'actor',  color:'#eeffaa', count:3, interval:85, direction:'all', spread:55, duration:360, glow:true },
      { at:840, type:'field_flash',     color:'#eeffaa', opacity:0.35, duration:240 },
      { at:940, type:'shockwave',       origin:'actor', size:80, color:'#ccff44', opacity:0.50, thickness:4 },
    ],
  },

});
