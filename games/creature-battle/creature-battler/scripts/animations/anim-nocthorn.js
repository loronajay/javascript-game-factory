registerMoveAnimations({

  // ── shadow_claw ───────────────────────────────────────────────────────────
  shadow_claw: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-shadow-claw' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:380 },
      { at:0,   type:'preset',         id:'dark_cast_aura' },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#220033', count:4, spread:22, direction:'up', duration:260 },
      { at:220, type:'sound',          id:'hit-light' },
      { at:220, type:'creature_anim',  target:'actor',  class:'anim-cast-shadow-claw-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim',  target:'target', class:'anim-hit-dark-light' },
      { at:340, type:'creature_tint',  target:'target', color:'#220033', blend:'multiply', duration:480 },
      { at:340, type:'creature_shake', target:'target', intensity:5, duration:180 },
      { at:340, type:'preset',         id:'dark_particle_light' },
      { at:340, type:'preset',         id:'dark_hit_flash_light' },
      { at:380, type:'particle_burst', origin:'target', color:'#440066', count:7, spread:35, direction:'up', duration:340 },
    ],
  },

  // ── shadow_claw_2 ─────────────────────────────────────────────────────────
  shadow_claw_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-shadow-claw-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:400 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:9 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#330055', count:5, spread:28, direction:'up', duration:300 },
      { at:250, type:'sound',          id:'hit-heavy' },
      { at:250, type:'creature_anim',  target:'actor',  class:'anim-cast-shadow-claw-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:380, type:'creature_tint',  target:'target', color:'#220033', blend:'multiply', duration:500 },
      { at:380, type:'creature_shake', target:'target', intensity:6, duration:220 },
      { at:380, type:'preset',         id:'dark_particle_heavy' },
      { at:380, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:380, type:'shockwave',      origin:'target', size:80, color:'#440066', opacity:0.60, thickness:3, duration:380 },
      { at:400, type:'particle_burst', origin:'target', color:'#550088', count:9, spread:42, direction:'up', duration:380 },
      { at:380, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

  // ── shadow_claw_3 ─────────────────────────────────────────────────────────
  shadow_claw_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-shadow-claw-3' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:480 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:12, spread:40 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#440066', count:6, spread:34, direction:'up', duration:360 },
      { at:300, type:'sound',          id:'hit-heavy' },
      { at:300, type:'creature_anim',  target:'actor',  class:'anim-cast-shadow-claw-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'hit_stop',       duration:45 },
      { at:460, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:460, type:'creature_tint',  target:'target', color:'#220033', blend:'multiply', duration:520 },
      { at:460, type:'creature_shake', target:'target', intensity:8, duration:260 },
      { at:460, type:'preset',         id:'dark_particle_heavy' },
      { at:460, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:460, type:'shockwave',      origin:'target', size:100, color:'#440066', opacity:0.70, thickness:4, duration:400 },
      { at:480, type:'particle_burst', origin:'target', color:'#660099', count:12, spread:50, direction:'up', duration:420 },
      { at:460, type:'screen_shake',   intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── life_drain ────────────────────────────────────────────────────────────
  // Lifesteal projectile. Dark tendril flies to target; stolen life floods back.
  // Drain particles travel from target back to actor to sell the lifesteal.
  life_drain: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-life-drain' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:480 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:6 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:5, spread:30, direction:'all', duration:320 },
      { at:100, type:'preset',         id:'dark_projectile_light' },
      { at:520, type:'impact' },
      { at:520, type:'sound',          id:'hit-light' },
      { at:520, type:'creature_anim',  target:'target', class:'anim-hit-dark-light' },
      { at:520, type:'creature_tint',  target:'target', color:'#440066', blend:'multiply', duration:500 },
      { at:520, type:'preset',         id:'dark_particle_light' },
      { at:520, type:'preset',         id:'dark_hit_flash_light' },
      // Drain particles travel from target back to Nocthorn
      { at:560, type:'spinning_ring',  origin:'target', travelTo:'actor', color:'#8800cc', radius:20, duration:480, travelDuration:360, glow:true },
      { at:580, type:'projectile',     from:'target', to:'actor', color:'#aa44ff', size:7, duration:340, trail:true },
      { at:620, type:'projectile',     from:'target', to:'actor', color:'#660099', size:5, duration:300, trail:true },
      // Life floods back into actor
      { at:680, type:'particle_burst', origin:'actor',  color:'#8800cc', count:10, spread:40, direction:'all', duration:460 },
      { at:680, type:'status_ring',    target:'actor',  color:'#8800cc', duration:500 },
    ],
  },

  // ── soul_rend ─────────────────────────────────────────────────────────────
  // Heavy lifesteal — larger projectile, prominent void-life return.
  soul_rend: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-soul-rend' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:540 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:10, spread:35 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:6, spread:32, direction:'all', duration:380 },
      { at:120, type:'preset',         id:'dark_projectile_heavy' },
      { at:660, type:'impact' },
      { at:660, type:'hit_stop',       duration:45 },
      { at:660, type:'sound',          id:'hit-heavy' },
      { at:660, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:660, type:'creature_tint',  target:'target', color:'#440066', blend:'multiply', duration:540 },
      { at:660, type:'preset',         id:'dark_particle_heavy' },
      { at:660, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:660, type:'shockwave',      origin:'target', size:95, color:'#440066', opacity:0.65, thickness:3, duration:400 },
      { at:660, type:'screen_shake',   intensity:4, duration:200 },
      // Drain particles stream from target back to actor
      { at:700, type:'spinning_ring',  origin:'target', travelTo:'actor', color:'#8800cc', radius:28, duration:540, travelDuration:420, glow:true },
      { at:720, type:'projectile',     from:'target', to:'actor', color:'#aa44ff', size:9, duration:380, trail:true },
      { at:755, type:'projectile',     from:'target', to:'actor', color:'#660099', size:6, duration:320, trail:true },
      { at:780, type:'projectile',     from:'target', to:'actor', color:'#8800cc', size:7, duration:340, trail:true },
      // Life floods back
      { at:840, type:'particle_burst', origin:'actor',  color:'#8800cc', count:16, spread:50, direction:'all', duration:540 },
      { at:840, type:'status_ring',    target:'actor',  color:'#8800cc', duration:600 },
    ],
  },

  // ── soul_rend_2 ───────────────────────────────────────────────────────────
  soul_rend_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-soul-rend-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:620 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:13, spread:45 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:8, spread:38, direction:'all', duration:440 },
      { at:140, type:'preset',         id:'dark_projectile_heavy', size:28, duration:480 },
      { at:740, type:'impact' },
      { at:740, type:'hit_stop',       duration:55 },
      { at:740, type:'sound',          id:'hit-heavy' },
      { at:740, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:740, type:'creature_tint',  target:'target', color:'#440066', blend:'multiply', duration:560 },
      { at:740, type:'preset',         id:'dark_particle_heavy' },
      { at:740, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:740, type:'shockwave',      origin:'target', size:115, color:'#440066', opacity:0.72, thickness:4, duration:420 },
      { at:740, type:'screen_shake',   intensity:6, duration:260 },
      // Heavy drain — three rings and four projectiles traveling back to actor
      { at:780, type:'spinning_ring',  origin:'target', travelTo:'actor', color:'#550099', radius:34, duration:600, travelDuration:460, glow:true },
      { at:800, type:'projectile',     from:'target', to:'actor', color:'#cc88ff', size:10, duration:420, trail:true },
      { at:830, type:'projectile',     from:'target', to:'actor', color:'#aa44ff', size:7,  duration:360, trail:true },
      { at:855, type:'projectile',     from:'target', to:'actor', color:'#8800cc', size:8,  duration:380, trail:true },
      { at:880, type:'projectile',     from:'target', to:'actor', color:'#660099', size:5,  duration:300, trail:true },
      // Life erupts back into actor
      { at:920, type:'particle_burst', origin:'actor',  color:'#550099', count:22, spread:60, direction:'all', duration:600 },
      { at:920, type:'status_ring',    target:'actor',  color:'#aa44ff', duration:700 },
      { at:920, type:'field_flash',    color:'#440066', opacity:0.25, duration:220 },
    ],
  },

  // ── curse ─────────────────────────────────────────────────────────────────
  // Permanent poison utility. Dark projectile brands the target with a void curse.
  curse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-curse' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:460 },
      { at:0,   type:'preset',         id:'dark_cast_aura', color:'#440066', count:6 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#440066', size:14, duration:480 },
      { at:500, type:'impact' },
      { at:500, type:'sound',          id:'hit-light' },
      { at:500, type:'creature_anim',  target:'target', class:'anim-hit-curse' },
      { at:500, type:'creature_tint',  target:'target', color:'#440066', blend:'multiply', duration:600 },
      { at:500, type:'particle_burst', origin:'target', color:'#440066', count:10, spread:45, direction:'all', duration:560 },
      { at:500, type:'status_ring',    target:'target', color:'#440066', duration:680 },
      { at:500, type:'field_flash',    color:'#220033', opacity:0.30, duration:260 },
      // Curse seeping in — slow upward particles from target suggesting dark corruption
      { at:560, type:'particle_stream',origin:'target', color:'#330044', count:3, spread:18, direction:'up', duration:500 },
    ],
  },

  // ── dark_pulse ────────────────────────────────────────────────────────────
  // Standard dark projectile — trailing purple void energy.
  dark_pulse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-dark-pulse' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:400 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:6 },
      { at:0,   type:'shockwave',      origin:'actor',  size:45, color:'#440066', opacity:0.45, thickness:2, duration:300 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:5, spread:28, direction:'all', duration:300 },
      { at:100, type:'preset',         id:'dark_projectile_light' },
      { at:520, type:'impact' },
      { at:520, type:'sound',          id:'hit-light' },
      { at:520, type:'creature_anim',  target:'target', class:'anim-hit-dark-light' },
      { at:520, type:'creature_tint',  target:'target', color:'#220033', blend:'multiply', duration:480 },
      { at:520, type:'preset',         id:'dark_particle_light' },
      { at:520, type:'preset',         id:'dark_hit_flash_light' },
    ],
  },

  // ── silence ───────────────────────────────────────────────────────────────
  // Silence utility. Void tendril suppresses the target's Arts channels.
  silence: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-silence' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:460 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:5 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#220033', size:18, duration:440 },
      { at:480, type:'impact' },
      { at:480, type:'sound',          id:'hit-light' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-silence' },
      { at:480, type:'creature_tint',  target:'target', color:'#220033', blend:'multiply', duration:600 },
      { at:480, type:'particle_burst', origin:'target', color:'#220033', count:10, spread:50, direction:'all', duration:500 },
      { at:480, type:'status_ring',    target:'target', color:'#220033', duration:720 },
      // Field dims — the battle goes quiet
      { at:480, type:'field_flash',    color:'#110022', opacity:0.55, duration:320 },
      // Silence lingering upward from target (Arts being suppressed)
      { at:540, type:'particle_stream',origin:'target', color:'#110022', count:2, spread:14, direction:'up', duration:400 },
    ],
  },

  // ── shadow_surge ──────────────────────────────────────────────────────────
  // Self-buff (INT +2, DEF -1). Dark energy floods actor — power at a cost.
  shadow_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-shadow-surge' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:620 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#8800cc', count:18, spread:65, direction:'all', duration:640 },
      { at:200, type:'spinning_ring',  origin:'actor',  color:'#aa44ff', radius:36, duration:460, glow:true },
      { at:360, type:'spinning_ring',  origin:'actor',  color:'#8800cc', radius:22, duration:360, glow:false },
      { at:460, type:'impact' },
      { at:460, type:'status_ring',    target:'actor',  color:'#cc88ff', duration:800 },
      { at:460, type:'field_flash',    color:'#440066', opacity:0.40, duration:280 },
    ],
  },

  // ── phantom_strike ────────────────────────────────────────────────────────
  // High-power dark lunge — long wind-up, void shockwave on land.
  phantom_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-phantom-strike' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:560 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:10, spread:40 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:7, spread:35, direction:'all', duration:420 },
      // Void tears open as actor phases through space
      { at:180, type:'field_flash',    color:'#220033', opacity:0.22, duration:180 },
      { at:320, type:'field_flash',    color:'#110011', opacity:0.30, duration:200 },
      { at:380, type:'sound',          id:'hit-heavy' },
      { at:380, type:'creature_anim',  target:'actor',  class:'anim-cast-phantom-strike-lunge', lunge:true },
      { at:560, type:'impact' },
      { at:560, type:'hit_stop',       duration:45 },
      { at:560, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:560, type:'creature_tint',  target:'target', color:'#220033', blend:'multiply', duration:520 },
      { at:560, type:'creature_shake', target:'target', intensity:7, duration:240 },
      { at:560, type:'preset',         id:'dark_particle_heavy' },
      { at:560, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:560, type:'shockwave',      origin:'target', size:108, color:'#440066', opacity:0.72, thickness:4, duration:400 },
      { at:560, type:'screen_shake',   intensity:7, duration:300, style:'stutter' },
    ],
  },

  // ── phantom_strike_2 ──────────────────────────────────────────────────────
  // Maximum-risk strike. Very long charge, catastrophic void impact.
  phantom_strike_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:190 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-phantom-strike-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:680 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:14, spread:50 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:9, spread:40, direction:'all', duration:500 },
      // Three void-tear pulses during wind-up — builds dread
      { at:160, type:'field_flash',    color:'#220033', opacity:0.20, duration:160 },
      { at:320, type:'field_flash',    color:'#1a0022', opacity:0.28, duration:180 },
      { at:440, type:'field_flash',    color:'#110011', opacity:0.36, duration:200 },
      { at:500, type:'sound',          id:'hit-heavy' },
      { at:500, type:'creature_anim',  target:'actor',  class:'anim-cast-phantom-strike-2-lunge', lunge:true },
      { at:700, type:'impact' },
      { at:700, type:'hit_stop',       duration:60 },
      { at:700, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:700, type:'creature_tint',  target:'target', color:'#440066', blend:'multiply', duration:600 },
      { at:700, type:'creature_shake', target:'target', intensity:9, duration:280 },
      { at:700, type:'preset',         id:'dark_particle_heavy' },
      { at:700, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:700, type:'shockwave',      origin:'target', size:130, color:'#440066', opacity:0.78, thickness:5, duration:440 },
      { at:720, type:'shockwave',      origin:'target', size:70,  color:'#8800cc', opacity:0.50, thickness:2, duration:360 },
      { at:700, type:'screen_shake',   intensity:10, duration:360, style:'stutter' },
      { at:780, type:'field_flash',    color:'#220033', opacity:0.45, duration:260 },
    ],
  },

  // ── dark_eruption ─────────────────────────────────────────────────────────
  // AoE dark burst. Void energy erupts from actor across all enemies.
  dark_eruption: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-dark-eruption' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:520 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:10 },
      { at:0,   type:'spinning_ring',  origin:'actor',  color:'#440066', radius:32, duration:400, glow:false },
      { at:360, type:'sound',          id:'hit-heavy' },
      { at:420, type:'impact' },
      // Dark void erupts upward from actor's position like shadowy spikes
      { at:420, type:'wall_slam',      origin:'target', slabs:5, slabHeight:80, color:'#330044', duration:500, stagger:25 },
      { at:420, type:'shockwave',      origin:'actor',  size:95, color:'#440066', opacity:0.65, thickness:3, duration:400 },
      { at:420, type:'preset',         id:'dark_field_effect' },
      { at:460, type:'preset',         id:'dark_particle_heavy', origin:'actor' },
      { at:460, type:'particle_burst', origin:'actor',  color:'#8800cc', count:16, spread:85, direction:'all', duration:560 },
      { at:460, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── dark_eruption_2 ───────────────────────────────────────────────────────
  // Heavier AoE — deeper void collapse, double field pulses.
  dark_eruption_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-dark-eruption-2' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:640 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:14, spread:50 },
      { at:0,   type:'spinning_ring',  origin:'actor',  color:'#550099', radius:42, duration:520, glow:true },
      { at:120, type:'spinning_ring',  origin:'actor',  color:'#330055', radius:24, duration:420, glow:false },
      { at:460, type:'sound',          id:'hit-heavy' },
      { at:520, type:'impact' },
      { at:520, type:'hit_stop',       duration:50 },
      // Larger void eruption
      { at:520, type:'wall_slam',      origin:'target', slabs:7, slabHeight:100, color:'#440055', duration:600, stagger:20 },
      { at:520, type:'shockwave',      origin:'actor',  size:120, color:'#440066', opacity:0.75, thickness:4, duration:420 },
      { at:520, type:'preset',         id:'dark_field_effect', opacity:0.85, duration:400 },
      { at:560, type:'preset',         id:'dark_particle_heavy', origin:'actor' },
      { at:560, type:'particle_burst', origin:'actor',  color:'#550099', count:22, spread:90, direction:'all', duration:620 },
      { at:560, type:'screen_shake',   intensity:8, duration:320, style:'stutter' },
      { at:660, type:'field_flash',    color:'#220033', opacity:0.40, duration:260 },
    ],
  },

  // ── void_collapse ─────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge into a catastrophic void implosion.
  void_collapse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-void-collapse-charge' },
      { at:0,   type:'creature_tint',  target:'actor',  color:'#8800cc', blend:'screen',   duration:760 },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:16, spread:55 },
      { at:0,   type:'particle_stream',origin:'actor',  color:'#8800cc', count:10, spread:45, direction:'all', duration:580 },
      // Void implodes inward on actor as it charges — spiral rings pulling in
      { at:80,  type:'spinning_ring',  origin:'actor',  color:'#550099', radius:55, duration:500, glow:true },
      { at:200, type:'spinning_ring',  origin:'actor',  color:'#440077', radius:38, duration:420, glow:false },
      { at:340, type:'spinning_ring',  origin:'actor',  color:'#8800cc', radius:22, duration:340, glow:true },
      // Void tears accelerate
      { at:360, type:'field_flash',    color:'#220033', opacity:0.22, duration:160 },
      { at:500, type:'field_flash',    color:'#1a0022', opacity:0.34, duration:180 },
      { at:580, type:'sound',          id:'hit-heavy' },
      { at:580, type:'creature_anim',  target:'actor',  class:'anim-cast-void-collapse-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'hit_stop',       duration:90 },
      { at:780, type:'sound',          id:'hit-heavy' },
      { at:780, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:780, type:'creature_tint',  target:'target', color:'#440066', blend:'multiply', duration:720 },
      { at:780, type:'creature_shake', target:'target', intensity:11, duration:320 },
      { at:780, type:'preset',         id:'dark_particle_heavy' },
      { at:780, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:780, type:'shockwave',      origin:'target', size:150, color:'#440066', opacity:0.85, thickness:5, duration:480 },
      { at:820, type:'shockwave',      origin:'target', size:82,  color:'#8800cc', opacity:0.60, thickness:3, duration:400 },
      { at:860, type:'shockwave',      origin:'target', size:42,  color:'#cc88ff', opacity:0.45, thickness:2, duration:320 },
      { at:780, type:'screen_shake',   intensity:12, duration:420, style:'stutter' },
      { at:860, type:'preset',         id:'dark_field_effect', opacity:0.90, duration:380 },
      { at:960, type:'particle_burst', origin:'target', color:'#8800cc', count:18, spread:70, direction:'all', duration:500 },
      { at:960, type:'field_flash',    color:'#440066', opacity:0.45, duration:280 },
    ],
  },

});
