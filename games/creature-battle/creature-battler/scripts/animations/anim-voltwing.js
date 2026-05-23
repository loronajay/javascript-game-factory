registerMoveAnimations({

  // ── spark_jab ─────────────────────────────────────────────────────────────
  // Fast lunge jab. Electric aura then a sharp dash.
  spark_jab: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-spark-jab' },
      { at:0,   type:'preset',        id:'lightning_cast_aura' },
      { at:200, type:'sound',         id:'hit-light' },
      { at:200, type:'creature_anim', target:'actor',  class:'anim-cast-spark-jab-lunge', lunge:true },
      { at:320, type:'impact' },
      { at:320, type:'creature_anim', target:'target', class:'anim-hit-lightning-light' },
      { at:320, type:'preset',        id:'lightning_particle_light' },
      { at:320, type:'preset',        id:'lightning_hit_flash_light' },
    ],
  },

  // ── spark_jab_2 ───────────────────────────────────────────────────────────
  spark_jab_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-spark-jab-2' },
      { at:0,   type:'preset',        id:'lightning_cast_aura', count:10 },
      { at:230, type:'sound',         id:'hit-heavy' },
      { at:230, type:'creature_anim', target:'actor',  class:'anim-cast-spark-jab-2-lunge', lunge:true },
      { at:360, type:'impact' },
      { at:360, type:'creature_anim', target:'target', class:'anim-hit-lightning-heavy' },
      { at:360, type:'preset',        id:'lightning_particle_heavy' },
      { at:360, type:'preset',        id:'lightning_hit_flash_heavy' },
      { at:360, type:'screen_shake',  intensity:3, duration:180 },
    ],
  },

  // ── spark_jab_3 ───────────────────────────────────────────────────────────
  // Overcharged — long cast, bright flash, stutter shake.
  spark_jab_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-spark-jab-3' },
      { at:0,   type:'preset',        id:'lightning_cast_aura', count:14, spread:45 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'creature_anim', target:'actor',  class:'anim-cast-spark-jab-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim', target:'target', class:'anim-hit-lightning-heavy' },
      { at:460, type:'preset',        id:'lightning_particle_heavy' },
      { at:460, type:'preset',        id:'lightning_hit_flash_heavy' },
      { at:460, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── dodge_step ────────────────────────────────────────────────────────────
  // Self-buff (Evasion +2). Electric blur on actor, yellow flash.
  dodge_step: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-dodge-step' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:10, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#eeffaa', count:14, spread:55, direction:'all', duration:500, glow:true },
      { at:320, type:'impact' },
      { at:320, type:'field_flash',    color:'#eeffaa', opacity:0.20, duration:180 },
    ],
  },

  // ── volt_dart ─────────────────────────────────────────────────────────────
  // Fast shard projectile. Near-instant travel to target.
  volt_dart: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-volt-dart' },
      { at:0,   type:'preset',        id:'lightning_cast_aura', count:5 },
      { at:80,  type:'preset',        id:'lightning_projectile_light' },
      { at:360, type:'impact' },
      { at:360, type:'sound',         id:'hit-light' },
      { at:360, type:'creature_anim', target:'target', class:'anim-hit-lightning-light' },
      { at:360, type:'preset',        id:'lightning_particle_light' },
      { at:360, type:'preset',        id:'lightning_hit_flash_light' },
    ],
  },

  // ── static_burst ──────────────────────────────────────────────────────────
  // AoE static discharge. Electric particles explode outward from actor.
  static_burst: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-static-burst' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:8 },
      { at:260, type:'sound',          id:'hit-light' },
      { at:300, type:'impact' },
      { at:300, type:'preset',         id:'lightning_field_effect' },
      { at:350, type:'preset',         id:'lightning_particle_light', origin:'actor' },
      { at:350, type:'particle_burst', origin:'actor', color:'#eeffaa', count:12, spread:85, direction:'all', duration:480, glow:true },
    ],
  },

  // ── phase_shift ───────────────────────────────────────────────────────────
  // Self-buff (Evasion + Speed). Full electric surge on actor.
  phase_shift: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:210 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-phase-shift' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff',  count:16, spread:60, direction:'all', duration:580, glow:true },
      { at:430, type:'impact' },
      { at:430, type:'field_flash',    color:'#eeffaa', opacity:0.30, duration:240 },
    ],
  },

  // ── chain_spark ───────────────────────────────────────────────────────────
  // AoE chain lightning. Arcs fill the field then all enemies get zapped.
  chain_spark: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-chain-spark' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:10 },
      { at:320, type:'sound',          id:'hit-heavy' },
      { at:380, type:'impact' },
      { at:380, type:'preset',         id:'lightning_field_effect', opacity:0.80, duration:200 },
      { at:420, type:'preset',         id:'lightning_particle_heavy', origin:'actor' },
      { at:420, type:'particle_burst', origin:'actor', color:'#ffffff',  count:18, spread:90, direction:'all', duration:500, glow:true },
      { at:480, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

  // ── volt_snap ─────────────────────────────────────────────────────────────
  // Stun utility. Quick projectile with a jolt on arrival.
  volt_snap: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-volt-snap' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', color:'#ffffff', count:5 },
      { at:80,  type:'preset',         id:'lightning_projectile_light', size:12, color:'#ffffff', duration:200 },
      { at:380, type:'impact' },
      { at:380, type:'sound',          id:'hit-light' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-volt-snap' },
      { at:380, type:'particle_burst', origin:'target', color:'#ffffff', count:10, spread:55, direction:'all', duration:400, glow:true },
      { at:380, type:'field_flash',    color:'#ffffff', opacity:0.45, duration:140 },
    ],
  },

  // ── lightning_strike ──────────────────────────────────────────────────────
  // Focused bolt. Lightning beam fires to target; bright white flash.
  lightning_strike: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-lightning-strike' },
      { at:0,   type:'preset',        id:'lightning_cast_aura', count:10, spread:40 },
      { at:280, type:'sound',         id:'hit-heavy' },
      { at:280, type:'preset',        id:'lightning_beam' },
      { at:480, type:'impact' },
      { at:480, type:'creature_anim', target:'target', class:'anim-hit-lightning-heavy' },
      { at:480, type:'preset',        id:'lightning_particle_heavy' },
      { at:480, type:'preset',        id:'lightning_hit_flash_heavy' },
      { at:480, type:'screen_shake',  intensity:5, duration:220 },
    ],
  },

  // ── twin_bolt ─────────────────────────────────────────────────────────────
  // Two-hit shards. Impact on hit 1; creature_shake on hit 2.
  twin_bolt: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-twin-bolt' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:6 },
      // Hit 1
      { at:60,  type:'preset',         id:'lightning_projectile_light', duration:180 },
      { at:260, type:'impact' },
      { at:260, type:'sound',          id:'hit-light' },
      { at:260, type:'creature_anim',  target:'target', class:'anim-hit-lightning-light' },
      { at:260, type:'preset',         id:'lightning_particle_light' },
      // Hit 2
      { at:360, type:'sound',          id:'charge-light' },
      { at:400, type:'preset',         id:'lightning_projectile_heavy', duration:180 },
      { at:600, type:'sound',          id:'hit-heavy' },
      { at:600, type:'creature_shake', target:'target', intensity:5, duration:180 },
      { at:600, type:'preset',         id:'lightning_particle_heavy' },
      { at:600, type:'preset',         id:'lightning_hit_flash_heavy' },
    ],
  },

  // ── static_burst_2 ────────────────────────────────────────────────────────
  // Heavier AoE — double field pulse, screen shake.
  static_burst_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-static-burst-2' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:12, spread:45 },
      { at:360, type:'sound',          id:'hit-heavy' },
      { at:420, type:'impact' },
      { at:420, type:'preset',         id:'lightning_field_effect', opacity:0.90, duration:220 },
      { at:460, type:'preset',         id:'lightning_particle_heavy', origin:'actor' },
      { at:460, type:'particle_burst', origin:'actor', color:'#ffffff', count:20, spread:90, direction:'all', duration:540, glow:true },
      { at:460, type:'screen_shake',   intensity:6, duration:260 },
      { at:540, type:'field_flash',    color:'#eeffaa', opacity:0.30, duration:200 },
    ],
  },

  // ── twin_bolt_2 ───────────────────────────────────────────────────────────
  // Three-hit rapid bolts. Impact on hit 1; shakes on hits 2 and 3.
  twin_bolt_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-twin-bolt-2' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:8 },
      // Hit 1
      { at:60,  type:'preset',         id:'lightning_projectile_light', duration:160 },
      { at:240, type:'impact' },
      { at:240, type:'sound',          id:'hit-light' },
      { at:240, type:'creature_anim',  target:'target', class:'anim-hit-lightning-light' },
      { at:240, type:'preset',         id:'lightning_particle_light' },
      // Hit 2
      { at:340, type:'sound',          id:'charge-light' },
      { at:380, type:'preset',         id:'lightning_projectile_light', duration:160 },
      { at:560, type:'sound',          id:'hit-light' },
      { at:560, type:'creature_shake', target:'target', intensity:4, duration:160 },
      { at:560, type:'preset',         id:'lightning_particle_light' },
      // Hit 3
      { at:660, type:'sound',          id:'charge-light' },
      { at:700, type:'preset',         id:'lightning_projectile_heavy', duration:160 },
      { at:880, type:'sound',          id:'hit-heavy' },
      { at:880, type:'creature_shake', target:'target', intensity:6, duration:200 },
      { at:880, type:'preset',         id:'lightning_particle_heavy' },
      { at:880, type:'preset',         id:'lightning_hit_flash_heavy' },
    ],
  },

  // ── lightning_strike_2 ────────────────────────────────────────────────────
  // Supercharged bolt — wide beam, stutter shake, afterglow.
  lightning_strike_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-lightning-strike-2' },
      { at:0,   type:'preset',        id:'lightning_cast_aura', count:14, spread:50 },
      { at:420, type:'sound',         id:'hit-heavy' },
      { at:420, type:'preset',        id:'lightning_beam', width:6, duration:380 },
      { at:640, type:'impact' },
      { at:640, type:'creature_anim', target:'target', class:'anim-hit-lightning-heavy' },
      { at:640, type:'preset',        id:'lightning_particle_heavy' },
      { at:640, type:'preset',        id:'lightning_hit_flash_heavy' },
      { at:640, type:'screen_shake',  intensity:8, duration:320, style:'stutter' },
      { at:720, type:'field_flash',   color:'#eeffaa', opacity:0.28, duration:220 },
    ],
  },

  // ── thunderclap ───────────────────────────────────────────────────────────
  // AoE ultimate. Full-field white flash, massive particle eruption,
  // stutter shake, two aftershock pulses.
  thunderclap: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-thunderclap' },
      { at:0,   type:'preset',         id:'lightning_cast_aura', count:16, spread:55 },
      { at:560, type:'sound',          id:'hit-heavy' },
      { at:620, type:'impact' },
      { at:620, type:'preset',         id:'lightning_field_effect', opacity:1.0, duration:200 },
      { at:660, type:'preset',         id:'lightning_particle_heavy', origin:'actor' },
      { at:660, type:'particle_burst', origin:'actor', color:'#ffffff', count:24, spread:100, direction:'all', duration:600, glow:true },
      { at:660, type:'screen_shake',   intensity:10, duration:380, style:'stutter' },
      { at:740, type:'preset',         id:'lightning_field_effect', opacity:0.60, duration:180 },
      { at:860, type:'field_flash',    color:'#eeffaa', opacity:0.35, duration:240 },
    ],
  },

});
