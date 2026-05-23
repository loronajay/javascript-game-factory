registerMoveAnimations({

  // ── shadow_claw ───────────────────────────────────────────────────────────
  // Fast lunge rake. Dark aura charge, quick dash, particle claws on hit.
  shadow_claw: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-shadow-claw' },
      { at:0,   type:'preset',        id:'dark_cast_aura' },
      { at:220, type:'sound',         id:'hit-light' },
      { at:220, type:'creature_anim', target:'actor',  class:'anim-cast-shadow-claw-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim', target:'target', class:'anim-hit-dark-light' },
      { at:340, type:'preset',        id:'dark_particle_light' },
      { at:340, type:'preset',        id:'dark_hit_flash_light' },
    ],
  },

  // ── shadow_claw_2 ─────────────────────────────────────────────────────────
  shadow_claw_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-shadow-claw-2' },
      { at:0,   type:'preset',        id:'dark_cast_aura', count:9 },
      { at:250, type:'sound',         id:'hit-heavy' },
      { at:250, type:'creature_anim', target:'actor',  class:'anim-cast-shadow-claw-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim', target:'target', class:'anim-hit-dark-heavy' },
      { at:380, type:'preset',        id:'dark_particle_heavy' },
      { at:380, type:'preset',        id:'dark_hit_flash_heavy' },
      { at:380, type:'screen_shake',  intensity:4, duration:200 },
    ],
  },

  // ── shadow_claw_3 ─────────────────────────────────────────────────────────
  // Full-power rake — long charge, deep void eruption on land.
  shadow_claw_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-shadow-claw-3' },
      { at:0,   type:'preset',        id:'dark_cast_aura', count:12, spread:40 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'creature_anim', target:'actor',  class:'anim-cast-shadow-claw-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim', target:'target', class:'anim-hit-dark-heavy' },
      { at:460, type:'preset',        id:'dark_particle_heavy' },
      { at:460, type:'preset',        id:'dark_hit_flash_heavy' },
      { at:460, type:'screen_shake',  intensity:6, duration:260, style:'stutter' },
    ],
  },

  // ── life_drain ────────────────────────────────────────────────────────────
  // Lifesteal projectile. Dark tendril flies to target, returns energy.
  life_drain: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-life-drain' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:6 },
      { at:100, type:'preset',         id:'dark_projectile_light' },
      { at:520, type:'impact' },
      { at:520, type:'sound',          id:'hit-light' },
      { at:520, type:'creature_anim',  target:'target', class:'anim-hit-dark-light' },
      { at:520, type:'preset',         id:'dark_particle_light' },
      { at:520, type:'preset',         id:'dark_hit_flash_light' },
      { at:620, type:'particle_burst', origin:'actor',  color:'#8800cc', count:8, spread:35, direction:'all', duration:400 },
    ],
  },

  // ── soul_rend ─────────────────────────────────────────────────────────────
  // Heavy lifesteal — larger projectile, prominent actor drain return.
  soul_rend: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-soul-rend' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:10, spread:35 },
      { at:120, type:'preset',         id:'dark_projectile_heavy' },
      { at:660, type:'impact' },
      { at:660, type:'sound',          id:'hit-heavy' },
      { at:660, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:660, type:'preset',         id:'dark_particle_heavy' },
      { at:660, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:660, type:'screen_shake',   intensity:4, duration:200 },
      { at:760, type:'particle_burst', origin:'actor',  color:'#8800cc', count:14, spread:45, direction:'all', duration:500 },
    ],
  },

  // ── soul_rend_2 ───────────────────────────────────────────────────────────
  soul_rend_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-soul-rend-2' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:13, spread:45 },
      { at:140, type:'preset',         id:'dark_projectile_heavy', size:28, duration:480 },
      { at:740, type:'impact' },
      { at:740, type:'sound',          id:'hit-heavy' },
      { at:740, type:'creature_anim',  target:'target', class:'anim-hit-dark-heavy' },
      { at:740, type:'preset',         id:'dark_particle_heavy' },
      { at:740, type:'preset',         id:'dark_hit_flash_heavy' },
      { at:740, type:'screen_shake',   intensity:6, duration:260 },
      { at:840, type:'particle_burst', origin:'actor',  color:'#550099', count:18, spread:55, direction:'all', duration:580 },
      { at:840, type:'field_flash',    color:'#440066', opacity:0.25, duration:220 },
    ],
  },

  // ── curse ─────────────────────────────────────────────────────────────────
  // Permanent poison utility. Dark projectile brands the target.
  curse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-curse' },
      { at:0,   type:'preset',         id:'dark_cast_aura', color:'#440066', count:6 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#440066', size:14, duration:480 },
      { at:500, type:'impact' },
      { at:500, type:'sound',          id:'hit-light' },
      { at:500, type:'creature_anim',  target:'target', class:'anim-hit-curse' },
      { at:500, type:'particle_burst', origin:'target', color:'#440066', count:10, spread:45, direction:'all', duration:560 },
      { at:500, type:'field_flash',    color:'#220033', opacity:0.30, duration:260 },
    ],
  },

  // ── dark_pulse ────────────────────────────────────────────────────────────
  // Standard dark projectile with trailing purple energy.
  dark_pulse: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-dark-pulse' },
      { at:0,   type:'preset',        id:'dark_cast_aura', count:6 },
      { at:100, type:'preset',        id:'dark_projectile_light' },
      { at:520, type:'impact' },
      { at:520, type:'sound',         id:'hit-light' },
      { at:520, type:'creature_anim', target:'target', class:'anim-hit-dark-light' },
      { at:520, type:'preset',        id:'dark_particle_light' },
      { at:520, type:'preset',        id:'dark_hit_flash_light' },
    ],
  },

  // ── silence ───────────────────────────────────────────────────────────────
  // Silence utility. Void tendril suppresses the target's Arts channels.
  silence: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-silence' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:5 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#220033', size:18, duration:440 },
      { at:480, type:'impact' },
      { at:480, type:'sound',          id:'hit-light' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-silence' },
      { at:480, type:'particle_burst', origin:'target', color:'#220033', count:10, spread:50, direction:'all', duration:500 },
      { at:480, type:'field_flash',    color:'#110022', opacity:0.50, duration:280 },
    ],
  },

  // ── shadow_surge ──────────────────────────────────────────────────────────
  // Self-buff (INT +2, DEF -1). Dark energy floods actor — power at a cost.
  shadow_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-shadow-surge' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:14, spread:55 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#8800cc', count:18, spread:65, direction:'all', duration:640 },
      { at:460, type:'impact' },
      { at:460, type:'field_flash',    color:'#440066', opacity:0.40, duration:280 },
    ],
  },

  // ── phantom_strike ────────────────────────────────────────────────────────
  // High-power dark lunge — long wind-up, massive impact, deep void shake.
  phantom_strike: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-phantom-strike' },
      { at:0,   type:'preset',        id:'dark_cast_aura', count:10, spread:40 },
      { at:380, type:'sound',         id:'hit-heavy' },
      { at:380, type:'creature_anim', target:'actor',  class:'anim-cast-phantom-strike-lunge', lunge:true },
      { at:560, type:'impact' },
      { at:560, type:'creature_anim', target:'target', class:'anim-hit-dark-heavy' },
      { at:560, type:'preset',        id:'dark_particle_heavy' },
      { at:560, type:'preset',        id:'dark_hit_flash_heavy' },
      { at:560, type:'screen_shake',  intensity:7, duration:300, style:'stutter' },
    ],
  },

  // ── phantom_strike_2 ──────────────────────────────────────────────────────
  // Maximum-risk strike. Very long charge, catastrophic impact.
  phantom_strike_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:190 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-phantom-strike-2' },
      { at:0,   type:'preset',        id:'dark_cast_aura', count:14, spread:50 },
      { at:500, type:'sound',         id:'hit-heavy' },
      { at:500, type:'creature_anim', target:'actor',  class:'anim-cast-phantom-strike-2-lunge', lunge:true },
      { at:700, type:'impact' },
      { at:700, type:'creature_anim', target:'target', class:'anim-hit-dark-heavy' },
      { at:700, type:'preset',        id:'dark_particle_heavy' },
      { at:700, type:'preset',        id:'dark_hit_flash_heavy' },
      { at:700, type:'screen_shake',  intensity:10, duration:360, style:'stutter' },
      { at:780, type:'field_flash',   color:'#220033', opacity:0.45, duration:260 },
    ],
  },

  // ── dark_eruption ─────────────────────────────────────────────────────────
  // AoE dark burst. Void energy erupts from actor across all enemies.
  dark_eruption: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-dark-eruption' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:10 },
      { at:360, type:'sound',          id:'hit-heavy' },
      { at:420, type:'impact' },
      { at:420, type:'preset',         id:'dark_field_effect' },
      { at:460, type:'preset',         id:'dark_particle_heavy', origin:'actor' },
      { at:460, type:'particle_burst', origin:'actor', color:'#8800cc', count:16, spread:85, direction:'all', duration:560 },
      { at:460, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── dark_eruption_2 ───────────────────────────────────────────────────────
  // Heavier AoE — deeper void collapse, double field pulses.
  dark_eruption_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-dark-eruption-2' },
      { at:0,   type:'preset',         id:'dark_cast_aura', count:14, spread:50 },
      { at:460, type:'sound',          id:'hit-heavy' },
      { at:520, type:'impact' },
      { at:520, type:'preset',         id:'dark_field_effect', opacity:0.85, duration:400 },
      { at:560, type:'preset',         id:'dark_particle_heavy', origin:'actor' },
      { at:560, type:'particle_burst', origin:'actor', color:'#550099', count:22, spread:90, direction:'all', duration:620 },
      { at:560, type:'screen_shake',   intensity:8, duration:320, style:'stutter' },
      { at:660, type:'field_flash',    color:'#220033', opacity:0.40, duration:260 },
    ],
  },

  // ── void_collapse ─────────────────────────────────────────────────────────
  // Ultimate lunge. Two-phase charge into a catastrophic void implosion.
  void_collapse: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-void-collapse-charge' },
      { at:0,   type:'preset',        id:'dark_cast_aura', count:16, spread:55 },
      { at:580, type:'sound',         id:'hit-heavy' },
      { at:580, type:'creature_anim', target:'actor',  class:'anim-cast-void-collapse-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',         id:'hit-heavy' },
      { at:780, type:'creature_anim', target:'target', class:'anim-hit-dark-heavy' },
      { at:780, type:'preset',        id:'dark_particle_heavy' },
      { at:780, type:'preset',        id:'dark_hit_flash_heavy' },
      { at:780, type:'screen_shake',  intensity:12, duration:420, style:'stutter' },
      { at:860, type:'preset',        id:'dark_field_effect', opacity:0.90, duration:380 },
      { at:960, type:'field_flash',   color:'#440066', opacity:0.45, duration:280 },
    ],
  },

});
