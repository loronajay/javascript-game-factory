registerMoveAnimations({

  // ── sprout_tap ─────────────────────────────────────────────────────────────
  // Light gaia strike → small green burst.
  sprout_tap: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-sprout-tap' },
      { at:0,   type:'preset',        id:'gaia_cast_aura' },
      { at:100, type:'preset',        id:'gaia_projectile_light', duration:260 },
      { at:290, type:'impact' },
      { at:290, type:'sound',         id:'hit-light' },
      { at:290, type:'creature_anim', target:'target', class:'anim-hit-gaia-light' },
      { at:290, type:'preset',        id:'gaia_particle_light' },
      { at:290, type:'preset',        id:'gaia_hit_flash_light' },
    ],
  },

  // ── sprout_tap_2 ───────────────────────────────────────────────────────────
  // Heavier gaia strike, medium shake.
  sprout_tap_2: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-sprout-tap-2' },
      { at:0,   type:'preset',        id:'gaia_cast_aura' },
      { at:110, type:'preset',        id:'gaia_projectile_heavy', size:16, duration:300 },
      { at:370, type:'impact' },
      { at:370, type:'sound',         id:'hit-light' },
      { at:370, type:'creature_anim', target:'target', class:'anim-hit-gaia-light' },
      { at:370, type:'preset',        id:'gaia_particle_heavy' },
      { at:370, type:'preset',        id:'gaia_hit_flash_light' },
      { at:370, type:'screen_shake',  intensity:3, duration:200 },
    ],
  },

  // ── sprout_tap_3 ───────────────────────────────────────────────────────────
  // Full forest power: heavy projectile, stutter shake.
  sprout_tap_3: {
    timeline: [
      { at:0,   type:'sound',         id:'beam-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-sprout-tap-3' },
      { at:0,   type:'preset',        id:'gaia_cast_aura', count:9 },
      { at:130, type:'preset',        id:'gaia_projectile_heavy' },
      { at:440, type:'impact' },
      { at:440, type:'sound',         id:'hit-heavy' },
      { at:440, type:'creature_anim', target:'target', class:'anim-hit-gaia-heavy' },
      { at:440, type:'preset',        id:'gaia_particle_heavy' },
      { at:440, type:'preset',        id:'gaia_hit_flash_heavy' },
      { at:440, type:'screen_shake',  intensity:6, duration:280, style:'stutter' },
    ],
  },

  // ── thorn_bind ─────────────────────────────────────────────────────────────
  // Damage + DEF down. Flat vine projectile snares the target.
  thorn_bind: {
    timeline: [
      { at:0,   type:'sound',          id:'beam-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-thorn-bind' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', count:5, spread:25 },
      { at:110, type:'preset',         id:'gaia_projectile_light', color:'#558833', arc:0, duration:320 },
      { at:360, type:'impact' },
      { at:360, type:'sound',          id:'hit-heavy' },
      { at:360, type:'creature_anim',  target:'target', class:'anim-hit-gaia-heavy' },
      { at:360, type:'particle_burst', origin:'target', color:'#336622', count:8, spread:45, direction:'all', duration:500 },
      { at:360, type:'preset',         id:'gaia_hit_flash_light' },
    ],
  },

  // ── root_snare ─────────────────────────────────────────────────────────────
  // Damage + SPD down. Beam delivery — roots erupt up from under the target.
  root_snare: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-root-snare' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', direction:'down', spread:30 },
      { at:120, type:'preset',         id:'gaia_beam', color:'#447722', width:3, duration:360 },
      { at:290, type:'impact' },
      { at:290, type:'sound',          id:'hit-heavy' },
      { at:290, type:'creature_anim',  target:'target', class:'anim-hit-root-snare' },
      { at:290, type:'particle_burst', origin:'target', color:'#336611', count:10, spread:45, direction:'up', duration:520 },
      { at:290, type:'preset',         id:'gaia_hit_flash_light' },
    ],
  },

  // ── petal_mend ─────────────────────────────────────────────────────────────
  // All-ally heal. Petals scatter from actor; green wash covers the field.
  // targetSlot is null (all_allies) — no creature target animations.
  petal_mend: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-petal-mend' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', direction:'all', spread:42 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#88ee88', count:10, spread:55, direction:'all', duration:600 },
      { at:300, type:'impact' },
      { at:300, type:'sound',          id:'beam-light' },
      { at:300, type:'field_flash',    color:'#44cc44', opacity:0.18, duration:240 },
      { at:300, type:'particle_burst', origin:'actor', color:'#aaffaa', count:8, spread:70, direction:'up', duration:560 },
    ],
  },

  // ── petal_mend_2 ───────────────────────────────────────────────────────────
  // Richer petal bloom, stronger field wash.
  petal_mend_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-petal-mend-2' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', count:9, direction:'all', spread:48 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#77dd77', count:14, spread:65, direction:'all', duration:680 },
      { at:340, type:'impact' },
      { at:340, type:'sound',          id:'beam-light' },
      { at:340, type:'field_flash',    color:'#33bb33', opacity:0.24, duration:280 },
      { at:340, type:'particle_burst', origin:'actor', color:'#99ffaa', count:12, spread:80, direction:'up', duration:640 },
    ],
  },

  // ── petal_mend_3 ───────────────────────────────────────────────────────────
  // Torrent of healing petals, two-pulse field bloom.
  petal_mend_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-petal-mend-3' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', count:12, direction:'all', spread:55 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#66dd66', count:18, spread:75, direction:'all', duration:780 },
      { at:380, type:'impact' },
      { at:380, type:'sound',          id:'beam-light' },
      { at:380, type:'field_flash',    color:'#22aa22', opacity:0.30, duration:320 },
      { at:380, type:'particle_burst', origin:'actor', color:'#bbffbb', count:16, spread:90, direction:'up', duration:720 },
      { at:480, type:'field_flash',    color:'#004400', opacity:0.12, duration:200 },
    ],
  },

  // ── verdant_guard ──────────────────────────────────────────────────────────
  // Utility (SPI buff, single ally). Bark-wrap pulse radiates to the target.
  verdant_guard: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-verdant-guard' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', direction:'all', spread:36 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#55bb55', count:6, spread:32, direction:'up', duration:480 },
      { at:300, type:'impact' },
      { at:300, type:'sound',          id:'beam-light' },
      { at:300, type:'creature_anim',  target:'target', class:'anim-hit-petal-heal' },
      { at:300, type:'field_flash',    color:'#226622', opacity:0.16, duration:220 },
    ],
  },

  // ── toxic_spores ───────────────────────────────────────────────────────────
  // Utility (permanent poison). Oval spore cloud projectile, sickly yellow-green.
  toxic_spores: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-toxic-spores' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#aacc44', count:7, spread:35, direction:'up', duration:520 },
      { at:110, type:'projectile',     from:'actor', to:'target', color:'#88aa22', size:18, shape:'oval', arc:-15, duration:340 },
      { at:380, type:'impact' },
      { at:380, type:'sound',          id:'hit-light' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-toxic-spores' },
      { at:380, type:'particle_burst', origin:'target', color:'#99bb33', count:10, spread:55, direction:'all', duration:560 },
      { at:380, type:'field_flash',    color:'#445500', opacity:0.20, duration:220 },
    ],
  },

  // ── bloom_surge ────────────────────────────────────────────────────────────
  // Self-buff (INT + SPI). Bright lime burst from actor.
  bloom_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-bloom-surge' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', count:8, direction:'all', spread:42 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaff77', count:8, spread:40, direction:'up', duration:560 },
      { at:340, type:'impact' },
      { at:340, type:'field_flash',    color:'#228844', opacity:0.16, duration:220 },
    ],
  },

  // ── cleanse ────────────────────────────────────────────────────────────────
  // Utility (remove ally status). Teal-green beam washes status off the target.
  cleanse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-cleanse' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#aaffcc', count:6, spread:30, direction:'up', duration:480 },
      { at:100, type:'preset',         id:'gaia_beam', color:'#77eebb', width:3, duration:360 },
      { at:270, type:'impact' },
      { at:270, type:'sound',          id:'beam-light' },
      { at:270, type:'creature_anim',  target:'target', class:'anim-hit-cleanse' },
      { at:270, type:'particle_burst', origin:'target', color:'#ccffee', count:8, spread:45, direction:'up', duration:480 },
      { at:270, type:'field_flash',    color:'#00aa66', opacity:0.16, duration:200 },
    ],
  },

  // ── pollen_veil ────────────────────────────────────────────────────────────
  // Utility (silence). Yellow-green pollen oval drifts to target, muffles Arts.
  pollen_veil: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-pollen-veil' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#ccdd44', count:8, spread:38, direction:'up', duration:540 },
      { at:110, type:'projectile',     from:'actor', to:'target', color:'#bbcc33', size:20, shape:'oval', arc:-12, duration:360 },
      { at:400, type:'impact' },
      { at:400, type:'sound',          id:'hit-light' },
      { at:400, type:'creature_anim',  target:'target', class:'anim-hit-pollen-veil' },
      { at:400, type:'particle_burst', origin:'target', color:'#ccdd55', count:11, spread:60, direction:'all', duration:580 },
      { at:400, type:'field_flash',    color:'#446600', opacity:0.18, duration:220 },
    ],
  },

  // ── natures_ward ───────────────────────────────────────────────────────────
  // Utility (SPI buff, all allies). Forest aura radiates from actor outward.
  // targetSlot is null (all_allies) — actor-origin effects only.
  natures_ward: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-natures-ward' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', count:10, direction:'all', spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#88ee88', count:10, spread:55, direction:'up', duration:620 },
      { at:360, type:'impact' },
      { at:360, type:'sound',          id:'beam-light' },
      { at:360, type:'field_flash',    color:'#335533', opacity:0.18, duration:240 },
      { at:360, type:'particle_burst', origin:'actor', color:'#aaffaa', count:8, spread:65, direction:'all', duration:540 },
    ],
  },

  // ── world_tree ─────────────────────────────────────────────────────────────
  // Ultimate. Three-pulse charge → world tree erupts: strikes all enemies,
  // then healing bloom washes over all allies. Two-phase field flash.
  world_tree: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:3, interval:220 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-world-tree-charge' },
      { at:0,   type:'preset',         id:'gaia_cast_aura', count:12, spread:55, direction:'all' },
      { at:480, type:'sound',          id:'beam-light' },
      { at:480, type:'creature_anim',  target:'actor', class:'anim-cast-world-tree' },
      { at:820, type:'impact' },
      { at:820, type:'sound',          id:'hit-heavy' },
      { at:820, type:'preset',         id:'gaia_field_effect', opacity:0.78, duration:380 },
      { at:820, type:'screen_shake',   intensity:7, duration:340, style:'stutter' },
      { at:870, type:'preset',         id:'gaia_particle_heavy', origin:'actor' },
      { at:960, type:'particle_burst', origin:'actor', color:'#aaffaa', count:16, spread:80, direction:'up', duration:700 },
      { at:1020,type:'field_flash',    color:'#002200', opacity:0.14, duration:280 },
    ],
  },

});
