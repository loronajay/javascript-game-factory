registerMoveAnimations({

  // ── sprout_tap ─────────────────────────────────────────────────────────────
  // Light gaia strike → small green burst.
  sprout_tap: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#66dd66', count:2, interval:80, direction:'up', duration:120 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-sprout-tap' },
      { at:0,   type:'preset',          id:'gaia_cast_aura' },
      { at:100, type:'preset',          id:'gaia_projectile_light', duration:260 },
      { at:290, type:'impact' },
      { at:290, type:'sound',           id:'hit-light' },
      { at:290, type:'creature_anim',   target:'target', class:'anim-hit-gaia-light' },
      { at:290, type:'preset',          id:'gaia_particle_light' },
      { at:290, type:'preset',          id:'gaia_hit_flash_light' },
      { at:290, type:'shockwave',       origin:'target', size:30, color:'#55cc55', opacity:0.50, thickness:3 },
    ],
  },

  // ── sprout_tap_2 ───────────────────────────────────────────────────────────
  // Heavier gaia strike — actor glows green during cast; larger impact ring.
  sprout_tap_2: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#44cc44', count:3, interval:72, direction:'up', duration:150 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#44cc44', blend:'screen', opacity:0.22, duration:260 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-sprout-tap-2' },
      { at:0,   type:'preset',          id:'gaia_cast_aura' },
      { at:110, type:'preset',          id:'gaia_projectile_heavy', size:16, duration:300 },
      { at:370, type:'impact' },
      { at:370, type:'sound',           id:'hit-light' },
      { at:370, type:'creature_anim',   target:'target', class:'anim-hit-gaia-light' },
      { at:370, type:'preset',          id:'gaia_particle_heavy' },
      { at:370, type:'preset',          id:'gaia_hit_flash_light' },
      { at:370, type:'screen_shake',    intensity:3, duration:200 },
      { at:370, type:'shockwave',       origin:'target', size:50, color:'#44bb44', opacity:0.60, thickness:3 },
    ],
  },

  // ── sprout_tap_3 ───────────────────────────────────────────────────────────
  // Full forest power: heavy projectile, hit_stop, shockwave + leaf-mark on target.
  sprout_tap_3: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#33bb33', count:4, interval:65, direction:'up', spread:30, duration:180 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#33bb33', blend:'screen', opacity:0.30, duration:320 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-sprout-tap-3' },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:9 },
      { at:130, type:'preset',          id:'gaia_projectile_heavy' },
      { at:440, type:'impact' },
      { at:440, type:'sound',           id:'hit-heavy' },
      { at:440, type:'creature_anim',   target:'target', class:'anim-hit-gaia-heavy' },
      { at:440, type:'preset',          id:'gaia_particle_heavy' },
      { at:440, type:'preset',          id:'gaia_hit_flash_heavy' },
      { at:440, type:'screen_shake',    intensity:6, duration:280, style:'stutter' },
      { at:440, type:'hit_stop',        duration:55 },
      { at:440, type:'particle_burst',  origin:'target', color:'#44cc44', count:6, spread:50, direction:'all', duration:500, content:'🍃' },
      { at:495, type:'shockwave',       origin:'target', size:70, color:'#228822', opacity:0.65, thickness:4 },
      { at:495, type:'creature_tint',   target:'target', color:'#224411', blend:'multiply', opacity:0.22, duration:360 },
    ],
  },

  // ── thorn_bind ─────────────────────────────────────────────────────────────
  // Damage + DEF down. Identity: vine entanglement lingers on target as proof
  // the bind landed — leaf particles + multiply tint + status ring.
  thorn_bind: {
    timeline: [
      { at:0,   type:'particle_stream', origin:'actor',  color:'#558833', count:3, interval:85, direction:'up', duration:160 },
      { at:0,   type:'sound',           id:'beam-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-thorn-bind' },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:5, spread:25 },
      { at:110, type:'preset',          id:'gaia_projectile_light', color:'#558833', arc:0, duration:320 },
      { at:360, type:'impact' },
      { at:360, type:'sound',           id:'hit-heavy' },
      { at:360, type:'creature_anim',   target:'target', class:'anim-hit-gaia-heavy' },
      { at:360, type:'particle_burst',  origin:'target', color:'#336622', count:10, spread:50, direction:'all', duration:540, content:'🍃' },
      { at:360, type:'preset',          id:'gaia_hit_flash_light' },
      { at:360, type:'particle_stream', origin:'target', color:'#336622', count:3, interval:90, direction:'all', spread:40, duration:520, content:'🍃' },
      { at:360, type:'creature_tint',   target:'target', color:'#224411', blend:'multiply', opacity:0.28, duration:560 },
      { at:360, type:'status_ring',     target:'target', color:'#558833', duration:700 },
    ],
  },

  // ── root_snare ─────────────────────────────────────────────────────────────
  // Damage + SPD down. Beam delivery — roots erupt UP from under the target.
  // Identity: upward leaf particles erupting at target + slow green multiply tint.
  root_snare: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-root-snare' },
      { at:0,   type:'preset',          id:'gaia_cast_aura', direction:'down', spread:30 },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#447722', count:2, interval:90, direction:'down', duration:200 },
      { at:120, type:'preset',          id:'gaia_beam', color:'#447722', width:3, duration:360 },
      { at:290, type:'impact' },
      { at:290, type:'sound',           id:'hit-heavy' },
      { at:290, type:'creature_anim',   target:'target', class:'anim-hit-root-snare' },
      { at:290, type:'particle_burst',  origin:'target', color:'#447722', count:12, spread:50, direction:'up', duration:560, content:'🍃' },
      { at:290, type:'preset',          id:'gaia_hit_flash_light' },
      { at:290, type:'particle_stream', origin:'target', color:'#447722', count:3, interval:95, direction:'up', duration:580, content:'🍃' },
      { at:290, type:'creature_tint',   target:'target', color:'#224411', blend:'multiply', opacity:0.30, duration:600 },
      { at:290, type:'status_ring',     target:'target', color:'#447722', duration:700 },
    ],
  },

  // ── petal_mend ─────────────────────────────────────────────────────────────
  // All-ally heal. Flower petals float upward from actor; wave_sweep carries the bloom.
  // targetSlot is null (all_allies) — no creature target animations.
  petal_mend: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-petal-mend' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88ee88', count:3, interval:80, direction:'up', spread:45, duration:300, content:'✿', size:10 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#66dd66', blend:'screen', opacity:0.22, duration:480 },
      { at:0,   type:'preset',          id:'gaia_cast_aura', direction:'all', spread:42 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#88ee88', count:8, spread:55, direction:'all', duration:600, content:'✿', size:12 },
      { at:300, type:'impact' },
      { at:300, type:'sound',           id:'beam-light' },
      { at:300, type:'field_flash',     color:'#44cc44', opacity:0.18, duration:240 },
      { at:300, type:'wave_sweep',      color:'#88ee88', opacity:0.45, duration:380 },
      { at:300, type:'particle_burst',  origin:'actor',  color:'#aaffaa', count:10, spread:70, direction:'up', duration:600, content:'✿', size:14 },
      { at:300, type:'status_ring',     target:'actor',  color:'#66ee66', duration:600 },
    ],
  },

  // ── petal_mend_2 ───────────────────────────────────────────────────────────
  // Richer petal bloom, stronger wave_sweep.
  petal_mend_2: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-petal-mend-2' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#77dd77', count:4, interval:72, direction:'up', spread:50, duration:380, content:'✿', size:11 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#55cc55', blend:'screen', opacity:0.28, duration:560 },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:9, direction:'all', spread:48 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#77dd77', count:12, spread:65, direction:'all', duration:680, content:'✿', size:12 },
      { at:340, type:'impact' },
      { at:340, type:'sound',           id:'beam-light' },
      { at:340, type:'field_flash',     color:'#33bb33', opacity:0.24, duration:280 },
      { at:340, type:'wave_sweep',      color:'#77dd77', opacity:0.55, duration:420 },
      { at:340, type:'particle_burst',  origin:'actor',  color:'#99ffaa', count:14, spread:80, direction:'up', duration:660, content:'✿', size:14 },
      { at:340, type:'status_ring',     target:'actor',  color:'#55ee55', duration:700 },
    ],
  },

  // ── petal_mend_3 ───────────────────────────────────────────────────────────
  // Torrent of healing petals, two-pulse field bloom.
  petal_mend_3: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-petal-mend-3' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#66dd66', count:5, interval:60, direction:'up', spread:55, duration:440, content:'✿', size:13, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#44cc44', blend:'screen', opacity:0.35, duration:640 },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:12, direction:'all', spread:55 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#66dd66', count:16, spread:75, direction:'all', duration:780, content:'✿', size:13 },
      { at:380, type:'impact' },
      { at:380, type:'sound',           id:'beam-light' },
      { at:380, type:'field_flash',     color:'#22aa22', opacity:0.30, duration:320 },
      { at:380, type:'wave_sweep',      color:'#66dd66', opacity:0.65, duration:460 },
      { at:380, type:'particle_burst',  origin:'actor',  color:'#bbffbb', count:18, spread:90, direction:'up', duration:740, content:'✿', size:15, glow:true },
      { at:380, type:'status_ring',     target:'actor',  color:'#44ee44', duration:800 },
      { at:480, type:'field_flash',     color:'#004400', opacity:0.12, duration:200 },
    ],
  },

  // ── verdant_guard ──────────────────────────────────────────────────────────
  // Utility (SPI buff, single ally). Bark-wrap pulse radiates to the target.
  // Identity: leaf particle_stream lingers on target + teal screen tint + status ring.
  verdant_guard: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-verdant-guard' },
      { at:0,   type:'preset',          id:'gaia_cast_aura', direction:'all', spread:36 },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#55bb55', count:2, interval:100, direction:'up', duration:280, content:'🍃', size:12 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#55bb55', count:6, spread:32, direction:'up', duration:480, content:'🍃', size:12 },
      { at:300, type:'impact' },
      { at:300, type:'sound',           id:'beam-light' },
      { at:300, type:'creature_anim',   target:'target', class:'anim-hit-petal-heal' },
      { at:300, type:'field_flash',     color:'#226622', opacity:0.16, duration:220 },
      { at:300, type:'particle_stream', origin:'target', color:'#77dd77', count:3, interval:85, direction:'up', duration:480, content:'🍃', size:12 },
      { at:300, type:'creature_tint',   target:'target', color:'#55bb55', blend:'screen', opacity:0.22, duration:520 },
      { at:300, type:'status_ring',     target:'target', color:'#66cc66', duration:700 },
    ],
  },

  // ── toxic_spores ───────────────────────────────────────────────────────────
  // Utility (permanent poison). Sickly yellow-green spore cloud drifts to target.
  // Identity: multiply toxic tint settles on target + lingering spore particle_stream
  // + poison status ring. Spores are dots (no symbol — blobs feel more biological).
  toxic_spores: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-toxic-spores' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aacc44', count:3, interval:85, direction:'up', spread:30, duration:200 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#aacc44', count:7, spread:35, direction:'up', duration:520 },
      { at:110, type:'projectile',      from:'actor', to:'target', color:'#88aa22', size:18, shape:'oval', arc:-15, duration:340 },
      { at:380, type:'impact' },
      { at:380, type:'sound',           id:'hit-light' },
      { at:380, type:'creature_anim',   target:'target', class:'anim-hit-toxic-spores' },
      { at:380, type:'particle_burst',  origin:'target', color:'#99bb33', count:10, spread:55, direction:'all', duration:560 },
      { at:380, type:'field_flash',     color:'#445500', opacity:0.20, duration:220 },
      { at:380, type:'particle_stream', origin:'target', color:'#aacc44', count:4, interval:75, direction:'all', spread:50, duration:600 },
      { at:380, type:'creature_tint',   target:'target', color:'#446600', blend:'multiply', opacity:0.32, duration:640 },
      { at:380, type:'status_ring',     target:'target', color:'#aacc44', duration:750 },
    ],
  },

  // ── bloom_surge ────────────────────────────────────────────────────────────
  // Self-buff (INT + SPI). Bright lime blossom erupts from actor.
  // Identity: dual status rings — lime for INT, teal for SPI.
  bloom_surge: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-bloom-surge' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaff77', count:4, interval:72, direction:'up', spread:38, duration:360, content:'✿', size:12 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#88ff44', blend:'screen', opacity:0.30, duration:560 },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:8, direction:'all', spread:42 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#aaff77', count:10, spread:45, direction:'all', duration:580, content:'✿', size:13 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',     color:'#228844', opacity:0.16, duration:220 },
      { at:340, type:'status_ring',     target:'actor',  color:'#aaff44', duration:700 },
      { at:440, type:'status_ring',     target:'actor',  color:'#44ffcc', duration:600 },
    ],
  },

  // ── cleanse ────────────────────────────────────────────────────────────────
  // Utility (remove ally status). Teal-green beam washes status off the target.
  // Identity: teal screen-blend tint on target + bright status ring = clean slate.
  // No flower symbols here — cleanse reads as "washing away", not blooming.
  cleanse: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-cleanse' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#aaffcc', count:3, interval:80, direction:'up', duration:240 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#aaffcc', count:6, spread:30, direction:'up', duration:480 },
      { at:100, type:'preset',          id:'gaia_beam', color:'#77eebb', width:3, duration:360 },
      { at:270, type:'impact' },
      { at:270, type:'sound',           id:'beam-light' },
      { at:270, type:'creature_anim',   target:'target', class:'anim-hit-cleanse' },
      { at:270, type:'particle_burst',  origin:'target', color:'#ccffee', count:8, spread:45, direction:'up', duration:480 },
      { at:270, type:'field_flash',     color:'#00aa66', opacity:0.16, duration:200 },
      { at:270, type:'particle_stream', origin:'target', color:'#aaffee', count:3, interval:90, direction:'up', duration:440 },
      { at:270, type:'creature_tint',   target:'target', color:'#00cc88', blend:'screen', opacity:0.28, duration:500 },
      { at:270, type:'status_ring',     target:'target', color:'#44ffcc', duration:700 },
    ],
  },

  // ── pollen_veil ────────────────────────────────────────────────────────────
  // Utility (silence). Yellow-green pollen oval drifts to target, muffles Arts.
  // Identity: multiply golden-green tint settles on target + dull status ring.
  // Dot particles here — pollen is fine particulate, not petals.
  pollen_veil: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-pollen-veil' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#ccdd44', count:3, interval:80, direction:'up', spread:35, duration:180 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#ccdd44', count:8, spread:38, direction:'up', duration:540 },
      { at:110, type:'projectile',      from:'actor', to:'target', color:'#bbcc33', size:20, shape:'oval', arc:-12, duration:360 },
      { at:400, type:'impact' },
      { at:400, type:'sound',           id:'hit-light' },
      { at:400, type:'creature_anim',   target:'target', class:'anim-hit-pollen-veil' },
      { at:400, type:'particle_burst',  origin:'target', color:'#ccdd55', count:11, spread:60, direction:'all', duration:580 },
      { at:400, type:'field_flash',     color:'#446600', opacity:0.18, duration:220 },
      { at:400, type:'particle_stream', origin:'target', color:'#ccdd44', count:4, interval:80, direction:'all', spread:55, duration:580 },
      { at:400, type:'creature_tint',   target:'target', color:'#556600', blend:'multiply', opacity:0.32, duration:620 },
      { at:400, type:'status_ring',     target:'target', color:'#bbcc33', duration:720 },
    ],
  },

  // ── natures_ward ───────────────────────────────────────────────────────────
  // Utility (SPI buff, all allies). Forest aura radiates from actor outward.
  // targetSlot is null (all_allies) — actor-origin effects only.
  // Identity: wave_sweep carries the ward + leaf particles shower down from above.
  natures_ward: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light' },
      { at:0,   type:'creature_anim',   target:'actor',  class:'anim-cast-natures-ward' },
      { at:0,   type:'particle_stream', origin:'actor',  color:'#88ee88', count:4, interval:72, direction:'up', spread:50, duration:400, content:'🍃', size:12 },
      { at:0,   type:'creature_tint',   target:'actor',  color:'#44cc44', blend:'screen', opacity:0.28, duration:580 },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:10, direction:'all', spread:50 },
      { at:0,   type:'particle_burst',  origin:'actor',  color:'#88ee88', count:12, spread:60, direction:'all', duration:640, content:'🍃', size:12 },
      { at:360, type:'impact' },
      { at:360, type:'sound',           id:'beam-light' },
      { at:360, type:'field_flash',     color:'#335533', opacity:0.18, duration:240 },
      { at:360, type:'wave_sweep',      color:'#88ee88', opacity:0.50, duration:420 },
      { at:360, type:'particle_burst',  origin:'actor',  color:'#aaffaa', count:10, spread:70, direction:'all', duration:560, content:'🍃', size:12 },
      { at:360, type:'status_ring',     target:'actor',  color:'#66ee66', duration:750 },
    ],
  },

  // ── world_tree ─────────────────────────────────────────────────────────────
  // Ultimate. Three-pulse charge → world tree erupts: strikes all enemies,
  // then healing bloom wave_sweeps over all allies.
  world_tree: {
    timeline: [
      { at:0,   type:'sound',           id:'charge-light', repeat:3, interval:220 },
      { at:0,   type:'creature_anim',   target:'actor',    class:'anim-cast-world-tree-charge' },
      { at:0,   type:'particle_stream', origin:'actor',    color:'#66dd66', count:5, interval:62, direction:'up', spread:50, duration:480, content:'🍃', size:13, glow:true },
      { at:0,   type:'creature_tint',   target:'actor',    color:'#33bb33', blend:'screen', opacity:0.40, duration:640 },
      { at:0,   type:'preset',          id:'gaia_cast_aura', count:12, spread:55, direction:'all' },
      { at:480, type:'sound',           id:'beam-light' },
      { at:480, type:'creature_anim',   target:'actor',    class:'anim-cast-world-tree' },
      { at:820, type:'impact' },
      { at:820, type:'sound',           id:'hit-heavy' },
      { at:820, type:'preset',          id:'gaia_field_effect', opacity:0.78, duration:380 },
      { at:820, type:'screen_shake',    intensity:7, duration:340, style:'stutter' },
      { at:820, type:'hit_stop',        duration:80 },
      { at:900, type:'shockwave',       origin:'actor', size:140, color:'#228833', opacity:0.75, thickness:6 },
      { at:900, type:'particle_stream', origin:'actor',    color:'#44dd44', count:4, interval:80, direction:'all', spread:55, duration:380, content:'🍃', size:12 },
      { at:900, type:'preset',          id:'gaia_particle_heavy', origin:'actor' },
      { at:960, type:'particle_burst',  origin:'actor',    color:'#aaffaa', count:16, spread:80, direction:'up', duration:700, content:'✿', size:14, glow:true },
      { at:980, type:'wave_sweep',      color:'#88ee88', opacity:0.65, duration:480 },
      { at:1020, type:'field_flash',    color:'#002200', opacity:0.14, duration:280 },
      { at:1060, type:'shockwave',      origin:'actor', size:80, color:'#66ff66', opacity:0.50, thickness:4 },
      { at:1100, type:'status_ring',    target:'actor',    color:'#44ff88', duration:800 },
    ],
  },

});
