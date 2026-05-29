registerMoveAnimations({

  // ── gust_slash ────────────────────────────────────────────────────────────
  // Quick lunge slash. Wind shimmer on actor → fast dash → cutting impact.
  gust_slash: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaccff', count:2, interval:90, direction:'up', duration:200 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.20, duration:260 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-gust-slash' },
      { at:0,   type:'preset',          id:'wind_cast_aura' },
      { at:220, type:'sound',           id:'hit-light' },
      { at:220, type:'creature_anim',   target:'actor',  class:'anim-cast-gust-slash-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim',   target:'target', class:'anim-hit-wind-light' },
      { at:340, type:'preset',          id:'wind_particle_light' },
      { at:340, type:'preset',          id:'wind_hit_flash_light' },
      { at:340, type:'shockwave',       origin:'target', size:28, color:'#aaccff', opacity:0.48, thickness:2 },
    ],
  },

  // ── gust_slash_2 ──────────────────────────────────────────────────────────
  // Sharper slash — wind pressure builds visibly on actor before the dash.
  gust_slash_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88aadd', count:3, interval:78, direction:'up', duration:230 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.26, duration:290 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-gust-slash-2' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:9 },
      { at:250, type:'sound',           id:'hit-heavy' },
      { at:250, type:'creature_anim',   target:'actor',  class:'anim-cast-gust-slash-2-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      { at:380, type:'preset',          id:'wind_particle_heavy' },
      { at:380, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:380, type:'screen_shake',    intensity:3, duration:180 },
      { at:380, type:'shockwave',       origin:'target', size:44, color:'#88aadd', opacity:0.55, thickness:3 },
      { at:380, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.18, duration:300 },
    ],
  },

  // ── gust_slash_3 ──────────────────────────────────────────────────────────
  // Full-tempo lunge — deep wind charge, hit_stop, shockwave, lasting wind cut.
  gust_slash_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#6699cc', count:4, interval:68, direction:'up', spread:28, duration:280, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#6699cc', blend:'screen', opacity:0.32, duration:340 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-gust-slash-3' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:12, spread:40 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:300, type:'creature_anim',   target:'actor',  class:'anim-cast-gust-slash-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      { at:460, type:'preset',          id:'wind_particle_heavy' },
      { at:460, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:460, type:'screen_shake',    intensity:6, duration:260, style:'stutter' },
      { at:460, type:'hit_stop',        duration:50 },
      { at:510, type:'shockwave',       origin:'target', size:60, color:'#5588bb', opacity:0.62, thickness:4 },
      { at:510, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.22, duration:360 },
    ],
  },

  // ── tailwind ──────────────────────────────────────────────────────────────
  // Self-buff (Speed +2). Wind burst propels actor — status ring locks in the
  // speed raise.
  tailwind: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ddeeff', count:3, interval:85, direction:'up', spread:38, duration:380 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#aaccff', blend:'screen', opacity:0.28, duration:560 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-tailwind' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:10, spread:45 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ddeeff', count:12, spread:50, direction:'up', duration:500 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',     color:'#ddeeff', opacity:0.22, duration:220 },
      { at:340, type:'status_ring',     target:'actor',  color:'#aaccff', duration:700 },
    ],
  },

  // ── wind_blade ────────────────────────────────────────────────────────────
  // Light wind projectile — two spinning rings launch from actor and fly to target.
  wind_blade: {
    timeline: [
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.20, duration:260 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-wind-blade' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaccff', count:2, interval:70, direction:'up', spread:20, duration:140 },
      // Outer ring launches first, inner ring trails slightly behind
      { at:80,  type:'spinning_ring',   origin:'actor',  travelTo:'target', travelDuration:340, color:'#aaccff', radius:22, squish:0.40, thickness:2, spinMs:240, duration:500, glow:true },
      { at:110, type:'spinning_ring',   origin:'actor',  travelTo:'target', travelDuration:320, color:'#ddeeff', radius:13, squish:0.52, thickness:1, spinMs:180, duration:480 },
      { at:440, type:'impact' },
      { at:440, type:'sound',           id:'hit-light' },
      { at:440, type:'creature_anim',   target:'target', class:'anim-hit-wind-light' },
      { at:440, type:'particle_burst',  origin:'target', color:'#ddeeff', count:12, spread:52, direction:'all', duration:360, size:5 },
      { at:440, type:'particle_burst',  origin:'target', color:'#ffffff', count:5,  spread:28, direction:'up',  duration:220, size:3 },
      { at:440, type:'preset',          id:'wind_hit_flash_light' },
      { at:440, type:'shockwave',       origin:'target', size:36, color:'#aaccff', opacity:0.52, thickness:2 },
    ],
  },

  // ── feather_storm ─────────────────────────────────────────────────────────
  // AoE wind. Feathers spiral off actor and sweep across the field.
  feather_storm: {
    timeline: [
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.24, duration:460 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-feather-storm' },
      // Rings of feathers spinning off the body
      { at:0,   type:'spinning_ring',   origin:'actor',  color:'#ddeeff', radius:34, squish:0.36, thickness:2, spinMs:300, duration:520, glow:true },
      { at:50,  type:'spinning_ring',   origin:'actor',  color:'#aaccff', radius:20, squish:0.48, thickness:1, spinMs:230, duration:460 },
      // Feathers scatter outward — wide upward burst looks like plumage releasing
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ffffff', count:20, spread:68, direction:'up',  duration:580, size:4 },
      { at:60,  type:'particle_burst',  origin:'actor',  color:'#ddeeff', count:14, spread:80, direction:'all', duration:540, size:3 },
      { at:270, type:'sound',           id:'hit-light' },
      // First wave of feathers sweeps the field
      { at:290, type:'wave_sweep',      color:'#ddeeff', duration:380 },
      { at:330, type:'impact' },
      // Second wave closes — feels like a storm rather than a single gust
      { at:380, type:'wave_sweep',      color:'#aaccff', duration:340 },
      { at:330, type:'screen_shake',    intensity:4, duration:220 },
      { at:330, type:'field_flash',     color:'#eef6ff', opacity:0.32, duration:300 },
      { at:330, type:'particle_burst',  origin:'actor',  color:'#ddeeff', count:22, spread:110, direction:'all', duration:600, size:5 },
      { at:330, type:'shockwave',       origin:'actor',  size:90, color:'#88aadd', opacity:0.55, thickness:4 },
      { at:420, type:'particle_burst',  origin:'target', color:'#cce8ff', count:14, spread:60, direction:'all', duration:480, size:5 },
    ],
  },

  // ── slipstream ────────────────────────────────────────────────────────────
  // Self-buff (Speed + Evasion). Full wind cocoon around actor — two rings confirm
  // both stat raises.
  slipstream: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#cce8ff', count:4, interval:78, direction:'all', spread:50, duration:560 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#aaccff', blend:'screen', opacity:0.32, duration:680 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-slipstream' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#cce8ff', count:16, spread:60, direction:'all', duration:600 },
      { at:440, type:'impact' },
      { at:440, type:'field_flash',     color:'#cce8ff', opacity:0.28, duration:260 },
      { at:440, type:'status_ring',     target:'actor',  color:'#aaccff', duration:720 },
      { at:520, type:'status_ring',     target:'actor',  color:'#cceeaa', duration:640 },
    ],
  },

  // ── cyclone_shot ──────────────────────────────────────────────────────────
  // Heavy wind projectile — vortex forms at actor, travels, erupts on target.
  cyclone_shot: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88aadd', count:3, interval:70, direction:'all', spread:42, duration:320 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.26, duration:380 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cyclone-shot' },
      // Vortex spinning up at actor — two rings at different speeds suggest rotation
      { at:0,   type:'spinning_ring',   origin:'actor',  color:'#aaccff', radius:30, squish:0.34, thickness:3, spinMs:320, duration:500, glow:true },
      { at:60,  type:'spinning_ring',   origin:'actor',  color:'#6699cc', radius:18, squish:0.46, thickness:2, spinMs:240, duration:440 },
      // Two overlapping projectiles at slightly different arcs — reads as the cyclone tumbling
      { at:160, type:'projectile',      from:'actor', to:'target', color:'#aaccff', size:18, shape:'circle', arc:-8,  duration:340, trail:true },
      { at:175, type:'projectile',      from:'actor', to:'target', color:'#ddeeff', size:10, shape:'oval',   arc:-24, duration:330, trail:true },
      { at:500, type:'impact' },
      { at:500, type:'sound',           id:'hit-heavy' },
      { at:500, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      // Cyclone erupts at target — spinning ring on landing sells the vortex contact
      { at:500, type:'spinning_ring',   origin:'target', color:'#88aadd', radius:42, squish:0.30, thickness:3, spinMs:420, duration:520, glow:true },
      { at:500, type:'particle_burst',  origin:'target', color:'#cce8ff', count:16, spread:70, direction:'all', duration:460, size:7 },
      { at:500, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:500, type:'screen_shake',    intensity:4, duration:220 },
      { at:500, type:'hit_stop',        duration:45 },
      { at:545, type:'shockwave',       origin:'target', size:56, color:'#6699cc', opacity:0.62, thickness:3 },
      { at:545, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.20, duration:340 },
    ],
  },

  // ── wind_shear ────────────────────────────────────────────────────────────
  // Slow debuff. Three rapid shard cuts shred through — lingering wind tint +
  // status ring settle on the target.
  wind_shear: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-wind-shear' },
      // Small spinning ring — the cutting edge condensing before release
      { at:0,   type:'spinning_ring',   origin:'actor',  color:'#99ccee', radius:16, squish:0.44, thickness:2, spinMs:220, duration:340, glow:true },
      // Three shard passes at staggered arcs — the shearing cuts landing in sequence
      { at:80,  type:'projectile',      from:'actor', to:'target', color:'#cce8ff', size:5, shape:'shard', arc:-32, duration:300, trail:true },
      { at:110, type:'projectile',      from:'actor', to:'target', color:'#99ccee', size:5, shape:'shard', arc:-16, duration:300, trail:true },
      { at:140, type:'projectile',      from:'actor', to:'target', color:'#bbddff', size:4, shape:'shard', arc:-46, duration:300, trail:true },
      { at:420, type:'impact' },
      { at:420, type:'sound',           id:'hit-light' },
      { at:420, type:'creature_anim',   target:'target', class:'anim-hit-wind-shear' },
      { at:420, type:'particle_burst',  origin:'target', color:'#cce8ff', count:12, spread:54, direction:'all', duration:400, size:4 },
      { at:420, type:'particle_burst',  origin:'target', color:'#ffffff', count:5,  spread:28, direction:'up',  duration:240, size:3 },
      { at:420, type:'field_flash',     color:'#99ccee', opacity:0.16, duration:180 },
      { at:420, type:'particle_stream', origin:'target', color:'#99ccee', count:2, interval:100, direction:'up', spread:30, duration:420 },
      { at:420, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.25, duration:500 },
      { at:420, type:'status_ring',     target:'target', color:'#88aadd', duration:700 },
    ],
  },

  // ── tempest_burst ─────────────────────────────────────────────────────────
  // Compressed wind detonation — beam + shockwave + shake.
  tempest_burst: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaccff', count:3, interval:80, direction:'up', spread:28, duration:300 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.26, duration:420 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-tempest-burst' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:10, spread:40 },
      { at:300, type:'sound',           id:'hit-heavy' },
      { at:300, type:'preset',          id:'wind_beam' },
      { at:500, type:'impact' },
      { at:500, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      { at:500, type:'preset',          id:'wind_particle_heavy' },
      { at:500, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:500, type:'screen_shake',    intensity:5, duration:240 },
      { at:500, type:'shockwave',       origin:'target', size:52, color:'#6699cc', opacity:0.58, thickness:3 },
      { at:500, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.20, duration:320 },
    ],
  },

  // ── blade_gale ────────────────────────────────────────────────────────────
  // Two-hit rapid blades. Impact on hit 1; shockwave ring closes on hit 2.
  blade_gale: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaccff', count:2, interval:90, direction:'up', duration:220 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.20, duration:380 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-blade-gale' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:6 },
      // Hit 1
      { at:80,  type:'preset',          id:'wind_projectile_light', size:11, duration:260 },
      { at:300, type:'impact' },
      { at:300, type:'sound',           id:'hit-light' },
      { at:300, type:'creature_anim',   target:'target', class:'anim-hit-wind-light' },
      { at:300, type:'preset',          id:'wind_particle_light' },
      // Hit 2
      { at:420, type:'sound',           id:'charge-light' },
      { at:460, type:'preset',          id:'wind_projectile_light', size:12, duration:260 },
      { at:680, type:'sound',           id:'hit-light' },
      { at:680, type:'creature_shake',  target:'target', intensity:4, duration:180 },
      { at:680, type:'preset',          id:'wind_particle_light' },
      { at:680, type:'preset',          id:'wind_hit_flash_light' },
      { at:680, type:'shockwave',       origin:'target', size:40, color:'#aaccff', opacity:0.52, thickness:3 },
    ],
  },

  // ── cyclone_shot_2 ────────────────────────────────────────────────────────
  // Reinforced cyclone — longer charge, bigger projectile, hit_stop, shockwave.
  cyclone_shot_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#6699cc', count:4, interval:72, direction:'up', spread:30, duration:380, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#6699cc', blend:'screen', opacity:0.32, duration:460 },
      { at:0,   type:'sound',           id:'charge-light', repeat:2, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cyclone-shot-2' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:11, spread:40 },
      { at:160, type:'preset',          id:'wind_projectile_heavy', size:22, duration:280 },
      { at:580, type:'impact' },
      { at:580, type:'sound',           id:'hit-heavy' },
      { at:580, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      { at:580, type:'preset',          id:'wind_particle_heavy' },
      { at:580, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:580, type:'screen_shake',    intensity:6, duration:260 },
      { at:580, type:'hit_stop',        duration:55 },
      { at:635, type:'shockwave',       origin:'target', size:72, color:'#4477aa', opacity:0.68, thickness:4 },
      { at:635, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.24, duration:380 },
    ],
  },

  // ── blade_gale_2 ──────────────────────────────────────────────────────────
  // Three-hit blade volley. Impact on hit 1; shakes on 2; hit_stop + shockwave
  // close on the final blade.
  blade_gale_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88aadd', count:3, interval:80, direction:'up', duration:280 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88aadd', blend:'screen', opacity:0.24, duration:520 },
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-blade-gale-2' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:8 },
      // Hit 1
      { at:80,  type:'preset',          id:'wind_projectile_light', size:11, duration:240 },
      { at:280, type:'impact' },
      { at:280, type:'sound',           id:'hit-light' },
      { at:280, type:'creature_anim',   target:'target', class:'anim-hit-wind-light' },
      { at:280, type:'preset',          id:'wind_particle_light' },
      // Hit 2
      { at:380, type:'sound',           id:'charge-light' },
      { at:420, type:'preset',          id:'wind_projectile_light', size:12, duration:240 },
      { at:620, type:'sound',           id:'hit-light' },
      { at:620, type:'creature_shake',  target:'target', intensity:4, duration:160 },
      { at:620, type:'preset',          id:'wind_particle_light' },
      // Hit 3
      { at:720, type:'sound',           id:'charge-light' },
      { at:760, type:'preset',          id:'wind_projectile_heavy', size:15, duration:240 },
      { at:960, type:'sound',           id:'hit-heavy' },
      { at:960, type:'creature_shake',  target:'target', intensity:6, duration:200 },
      { at:960, type:'hit_stop',        duration:50 },
      { at:960, type:'preset',          id:'wind_particle_heavy' },
      { at:960, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:1010,type:'shockwave',       origin:'target', size:58, color:'#5588bb', opacity:0.60, thickness:4 },
    ],
  },

  // ── tempest_burst_2 ───────────────────────────────────────────────────────
  // Heavy beam version — wide beam, hit_stop, stutter shake, shockwave.
  tempest_burst_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#6699cc', count:4, interval:72, direction:'up', spread:32, duration:440, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#6699cc', blend:'screen', opacity:0.34, duration:560 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-tempest-burst-2' },
      { at:0,   type:'preset',          id:'wind_cast_aura', count:14, spread:50 },
      { at:420, type:'sound',           id:'hit-heavy' },
      { at:420, type:'preset',          id:'wind_beam', width:5, duration:420 },
      { at:660, type:'impact' },
      { at:660, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      { at:660, type:'preset',          id:'wind_particle_heavy' },
      { at:660, type:'preset',          id:'wind_hit_flash_heavy' },
      { at:660, type:'screen_shake',    intensity:8, duration:320, style:'stutter' },
      { at:660, type:'hit_stop',        duration:65 },
      { at:725, type:'shockwave',       origin:'target', size:78, color:'#4477aa', opacity:0.68, thickness:5 },
      { at:725, type:'creature_tint',   target:'target', color:'#224466', blend:'multiply', opacity:0.24, duration:400 },
      { at:745, type:'field_flash',     color:'#aaccee', opacity:0.30, duration:220 },
    ],
  },

  // ── storm_finale ──────────────────────────────────────────────────────────
  // Ultimate lunge. Three-ring storm builds at actor → twin wave sweeps → lunge →
  // vortex eruption at target with triple spinning rings + shockwave cascade.
  storm_finale: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#5588bb', count:5, interval:65, direction:'up', spread:40, duration:560, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#5588bb', blend:'screen', opacity:0.40, duration:640 },
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-storm-finale-charge' },
      // Three spinning rings build up around actor — outer to inner, staggered
      { at:0,   type:'spinning_ring',   origin:'actor',  color:'#aaccff', radius:48, squish:0.30, thickness:4, spinMs:520, duration:720, glow:true },
      { at:100, type:'spinning_ring',   origin:'actor',  color:'#6699cc', radius:30, squish:0.40, thickness:3, spinMs:400, duration:620 },
      { at:200, type:'spinning_ring',   origin:'actor',  color:'#3366aa', radius:16, squish:0.52, thickness:2, spinMs:290, duration:520 },
      // Two wave sweeps during charge — the storm rolling out before the lunge
      { at:180, type:'wave_sweep',      color:'#aaccff', duration:420 },
      { at:380, type:'wave_sweep',      color:'#88aadd', duration:380 },
      { at:580, type:'sound',           id:'hit-heavy' },
      { at:580, type:'creature_anim',   target:'actor',  class:'anim-cast-storm-finale-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',           id:'hit-heavy' },
      { at:780, type:'creature_anim',   target:'target', class:'anim-hit-wind-heavy' },
      { at:780, type:'screen_shake',    intensity:11, duration:400, style:'stutter' },
      { at:780, type:'hit_stop',        duration:80 },
      // Vortex erupts at target — three rings collapse inward on the hit point
      { at:780, type:'spinning_ring',   origin:'target', color:'#aaccff', radius:62, squish:0.26, thickness:5, spinMs:620, duration:720, glow:true },
      { at:800, type:'spinning_ring',   origin:'target', color:'#6699cc', radius:38, squish:0.36, thickness:3, spinMs:460, duration:620 },
      { at:820, type:'spinning_ring',   origin:'target', color:'#3366aa', radius:20, squish:0.48, thickness:2, spinMs:340, duration:520 },
      { at:780, type:'particle_burst',  origin:'target', color:'#aaccff', count:26, spread:95, direction:'all', duration:620, size:7, glow:true },
      { at:780, type:'preset',          id:'wind_hit_flash_heavy' },
      // Third wave sweeps through on impact — storm is still moving
      { at:800, type:'wave_sweep',      color:'#5588bb', duration:480 },
      { at:860, type:'shockwave',       origin:'target', size:148, color:'#3366aa', opacity:0.78, thickness:7 },
      { at:860, type:'creature_tint',   target:'target', color:'#112244', blend:'multiply', opacity:0.28, duration:460 },
      { at:900, type:'wave_sweep',      color:'#3366aa', duration:400 },
      { at:980, type:'field_flash',     color:'#aaccee', opacity:0.38, duration:260 },
      { at:1020,type:'shockwave',       origin:'target', size:80, color:'#88aadd', opacity:0.52, thickness:4 },
      { at:1060,type:'particle_burst',  origin:'target', color:'#aaccff', count:12, spread:70, direction:'all', duration:500, glow:true },
    ],
  },

});
