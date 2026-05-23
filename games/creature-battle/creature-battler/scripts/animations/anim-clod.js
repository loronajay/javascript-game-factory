registerMoveAnimations({

  // ── stone_strike ──────────────────────────────────────────────────────────
  // Basic physical lunge. Short earth-aura charge then a direct slam.
  stone_strike: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-stone-strike' },
      { at:0,   type:'preset',        id:'earth_cast_aura' },
      { at:260, type:'sound',         id:'hit-light' },
      { at:260, type:'creature_anim', target:'actor',  class:'anim-cast-stone-strike-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim', target:'target', class:'anim-hit-earth-light' },
      { at:380, type:'preset',        id:'earth_particle_light' },
      { at:380, type:'preset',        id:'earth_hit_flash_light' },
    ],
  },

  // ── stone_strike_2 ────────────────────────────────────────────────────────
  // Same shape, heavier impact and a shake on land.
  stone_strike_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-stone-strike-2' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:9 },
      { at:280, type:'sound',         id:'hit-heavy' },
      { at:280, type:'creature_anim', target:'actor',  class:'anim-cast-stone-strike-2-lunge', lunge:true },
      { at:420, type:'impact' },
      { at:420, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:420, type:'preset',        id:'earth_particle_heavy' },
      { at:420, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:420, type:'screen_shake',  intensity:4, duration:200 },
    ],
  },

  // ── stone_strike_3 ────────────────────────────────────────────────────────
  // Full-force earth lunge with stutter shake.
  stone_strike_3: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-stone-strike-3' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:12, spread:40 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:300, type:'creature_anim', target:'actor',  class:'anim-cast-stone-strike-3-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:460, type:'preset',        id:'earth_particle_heavy' },
      { at:460, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:460, type:'screen_shake',  intensity:7, duration:280, style:'stutter' },
    ],
  },

  // ── boulder_wall ──────────────────────────────────────────────────────────
  // Self-buff (Defense). Earth aura rises from actor, warm brown field wash.
  boulder_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-boulder-wall' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:8, spread:40 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#886644', count:8, spread:50, direction:'all', duration:500 },
      { at:320, type:'impact' },
      { at:320, type:'field_flash',    color:'#886633', opacity:0.18, duration:200 },
    ],
  },

  // ── rock_toss ─────────────────────────────────────────────────────────────
  // Light earth projectile. Cast aura then a thrown rock flies to target.
  rock_toss: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-rock-toss' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:5 },
      { at:120, type:'preset',        id:'earth_projectile_light' },
      { at:480, type:'impact' },
      { at:480, type:'sound',         id:'hit-light' },
      { at:480, type:'creature_anim', target:'target', class:'anim-hit-earth-light' },
      { at:480, type:'preset',        id:'earth_particle_light' },
      { at:480, type:'preset',        id:'earth_hit_flash_light' },
    ],
  },

  // ── mud_slap ──────────────────────────────────────────────────────────────
  // Utility debuff (slow). Dark muddy projectile → splash of brown particles.
  mud_slap: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-mud-slap' },
      { at:0,   type:'preset',         id:'earth_cast_aura', color:'#554422', count:4 },
      { at:100, type:'projectile',     from:'actor', to:'target', color:'#553311', size:16, shape:'oval', arc:-8, duration:360 },
      { at:420, type:'impact' },
      { at:420, type:'sound',          id:'hit-light' },
      { at:420, type:'creature_anim',  target:'target', class:'anim-hit-mud-slap' },
      { at:420, type:'particle_burst', origin:'target', color:'#553311', count:9, spread:55, direction:'all', duration:480 },
      { at:420, type:'field_flash',    color:'#554422', opacity:0.16, duration:180 },
    ],
  },

  // ── earthen_shell ─────────────────────────────────────────────────────────
  // Self-buff (Defense + Spirit). Heavy armored aura, bigger particle burst.
  earthen_shell: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light', repeat:2, interval:220 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-earthen-shell' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:12, spread:50 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#886644', count:14, spread:60, direction:'all', duration:600 },
      { at:420, type:'impact' },
      { at:420, type:'field_flash',    color:'#775533', opacity:0.25, duration:260 },
    ],
  },

  // ── quake_stomp ───────────────────────────────────────────────────────────
  // AoE physical. Cast aura → screen shake → earth field covers all enemies.
  quake_stomp: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light' },
      { at:0,   type:'creature_anim', target:'actor', class:'anim-cast-quake-stomp' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:6 },
      { at:300, type:'sound',         id:'hit-heavy' },
      { at:350, type:'impact' },
      { at:350, type:'screen_shake',  intensity:5, duration:260 },
      { at:350, type:'preset',        id:'earth_field_effect' },
      { at:400, type:'preset',        id:'earth_particle_heavy', origin:'actor' },
    ],
  },

  // ── quake_stomp_2 ─────────────────────────────────────────────────────────
  // Heavier stomp with stutter shake and double field pulse.
  quake_stomp_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor', class:'anim-cast-quake-stomp-2' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:10 },
      { at:380, type:'sound',         id:'hit-heavy' },
      { at:440, type:'impact' },
      { at:440, type:'screen_shake',  intensity:7, duration:320, style:'stutter' },
      { at:440, type:'preset',        id:'earth_field_effect', opacity:0.75, duration:380 },
      { at:490, type:'preset',        id:'earth_particle_heavy', origin:'actor' },
      { at:560, type:'field_flash',   color:'#664422', opacity:0.30, duration:200 },
    ],
  },

  // ── dust_cloud ────────────────────────────────────────────────────────────
  // AoE blind utility. Gritty particles erupt from actor across the field.
  dust_cloud: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-dust-cloud' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aa9966', count:16, spread:80, direction:'all', duration:640 },
      { at:260, type:'impact' },
      { at:260, type:'field_flash',    color:'#998855', opacity:0.28, duration:300 },
    ],
  },

  // ── rubble_crash ──────────────────────────────────────────────────────────
  // Heavy physical lunge with stutter shake and big earth burst.
  rubble_crash: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:2, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-rubble-crash' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:10, spread:35 },
      { at:420, type:'sound',         id:'hit-heavy' },
      { at:420, type:'creature_anim', target:'actor',  class:'anim-cast-rubble-crash-lunge', lunge:true },
      { at:580, type:'impact' },
      { at:580, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:580, type:'preset',        id:'earth_particle_heavy' },
      { at:580, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:580, type:'screen_shake',  intensity:8, duration:320, style:'stutter' },
    ],
  },

  // ── rubble_crash_2 ────────────────────────────────────────────────────────
  // Maximum-weight version. Long charge, brutal landing, two shake pulses.
  rubble_crash_2: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:180 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-rubble-crash-2' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:14, spread:45 },
      { at:520, type:'sound',         id:'hit-heavy' },
      { at:520, type:'creature_anim', target:'actor',  class:'anim-cast-rubble-crash-2-lunge', lunge:true },
      { at:700, type:'impact' },
      { at:700, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:700, type:'preset',        id:'earth_particle_heavy' },
      { at:700, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:700, type:'screen_shake',  intensity:10, duration:360, style:'stutter' },
      { at:780, type:'field_flash',   color:'#664422', opacity:0.35, duration:220 },
    ],
  },

  // ── gravel_barrage ────────────────────────────────────────────────────────
  // Two-hit projectile volley. Impact on first hit; creature_shake on second.
  gravel_barrage: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-gravel-barrage' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:5 },
      // Hit 1
      { at:80,  type:'preset',         id:'earth_projectile_light', size:10, duration:300 },
      { at:340, type:'impact' },
      { at:340, type:'sound',          id:'hit-light' },
      { at:340, type:'creature_anim',  target:'target', class:'anim-hit-earth-light' },
      { at:340, type:'preset',         id:'earth_particle_light' },
      // Hit 2
      { at:460, type:'sound',          id:'charge-light' },
      { at:500, type:'preset',         id:'earth_projectile_light', size:10, duration:300 },
      { at:760, type:'sound',          id:'hit-light' },
      { at:760, type:'creature_shake', target:'target', intensity:4, duration:180 },
      { at:760, type:'preset',         id:'earth_particle_light' },
      { at:760, type:'preset',         id:'earth_hit_flash_light' },
    ],
  },

  // ── gravel_barrage_2 ──────────────────────────────────────────────────────
  // Three-hit volley. Impact on first; creature_shake on hits 2 and 3.
  gravel_barrage_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-gravel-barrage-2' },
      { at:0,   type:'preset',         id:'earth_cast_aura', count:7 },
      // Hit 1
      { at:80,  type:'preset',         id:'earth_projectile_light', size:11, duration:300 },
      { at:340, type:'impact' },
      { at:340, type:'sound',          id:'hit-light' },
      { at:340, type:'creature_anim',  target:'target', class:'anim-hit-earth-light' },
      { at:340, type:'preset',         id:'earth_particle_light' },
      // Hit 2
      { at:440, type:'sound',          id:'charge-light' },
      { at:480, type:'preset',         id:'earth_projectile_light', size:11, duration:280 },
      { at:720, type:'sound',          id:'hit-light' },
      { at:720, type:'creature_shake', target:'target', intensity:4, duration:160 },
      { at:720, type:'preset',         id:'earth_particle_light' },
      // Hit 3
      { at:820, type:'sound',          id:'charge-light' },
      { at:860, type:'preset',         id:'earth_projectile_heavy', size:14, duration:280 },
      { at:1100,type:'sound',          id:'hit-heavy' },
      { at:1100,type:'creature_shake', target:'target', intensity:6, duration:200 },
      { at:1100,type:'preset',         id:'earth_particle_heavy' },
      { at:1100,type:'preset',         id:'earth_hit_flash_heavy' },
    ],
  },

  // ── tectonic_crash ────────────────────────────────────────────────────────
  // Ultimate lunge. Long two-phase charge, earth eruption on landing, two
  // aftershock field pulses.
  tectonic_crash: {
    timeline: [
      { at:0,   type:'sound',         id:'charge-light', repeat:3, interval:200 },
      { at:0,   type:'creature_anim', target:'actor',  class:'anim-cast-tectonic-charge' },
      { at:0,   type:'preset',        id:'earth_cast_aura', count:14, spread:50 },
      { at:580, type:'sound',         id:'hit-heavy' },
      { at:580, type:'creature_anim', target:'actor',  class:'anim-cast-tectonic-crash-lunge', lunge:true },
      { at:780, type:'impact' },
      { at:780, type:'sound',         id:'hit-heavy' },
      { at:780, type:'creature_anim', target:'target', class:'anim-hit-earth-heavy' },
      { at:780, type:'preset',        id:'earth_particle_heavy' },
      { at:780, type:'preset',        id:'earth_hit_flash_heavy' },
      { at:780, type:'screen_shake',  intensity:12, duration:420, style:'stutter' },
      { at:860, type:'preset',        id:'earth_field_effect', opacity:0.70, duration:340 },
      { at:960, type:'field_flash',   color:'#664422', opacity:0.40, duration:240 },
    ],
  },

});
