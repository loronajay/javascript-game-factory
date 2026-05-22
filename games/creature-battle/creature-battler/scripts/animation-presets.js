// ── Animation Preset Library ──────────────────────────────────────────────
// 81 named presets covering all canonical elements.
// Move definitions reference these by string — never hardcode colors or counts.
//
// Preset slot types per element:
//   {el}_particle_light    small burst on target (4–6 particles)
//   {el}_particle_heavy    large burst on target (10–14 particles)
//   {el}_projectile_light  small / fast projectile
//   {el}_projectile_heavy  large / slow projectile
//   {el}_beam              sustained beam (channeled / multi-hit moves)
//   {el}_hit_flash_light   field color overlay, light tier
//   {el}_hit_flash_heavy   field color overlay, heavy tier
//   {el}_field_effect      AoE field wash (all-enemy moves)
//   {el}_cast_aura         particles from actor during cast wind-up
//
// Wind element has two visual sub-types (wind + lightning) = 18 presets.
// All other elements = 9 presets each. Total: 81.
//
// Each preset is a single component definition. Compound effects (e.g. heavy
// hit = particles + field flash + screen shake) are composed in the move
// timeline as multiple events, not inside a single preset.
//
// Note: dark particles ideally swirl INWARD — the current particle_burst
// component only radiates outward. Dark presets use a tight spread as a
// placeholder; a future "inward" direction mode can refine this.
// ─────────────────────────────────────────────────────────────────────────

const ANIM_PRESETS = {

  // ════════════════════════════════════════════════════════════════════════
  // FIRE
  // Upward-floating embers, orange-red-yellow palette, warm field washes.
  // ════════════════════════════════════════════════════════════════════════

  fire_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 5, spread: 45, duration: 380, size: 5,
    color: '#ff8822', glow: true, direction: 'all',
  },
  fire_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 12, spread: 75, duration: 480, size: 7,
    color: '#ff5500', glow: true, direction: 'all',
  },
  fire_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 12, color: '#ff8833', arc: -20, duration: 280, trail: true,
  },
  fire_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 22, color: '#ff4400', arc: -30, duration: 380, trail: true,
  },
  fire_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#ff6600', width: 5, duration: 400, glow: true,
  },
  fire_hit_flash_light: {
    type: 'field_flash',
    color: '#ff6600', opacity: 0.30, duration: 180,
  },
  fire_hit_flash_heavy: {
    type: 'field_flash',
    color: '#cc2200', opacity: 0.55, duration: 250,
  },
  fire_field_effect: {
    type: 'field_flash',
    color: '#ff4400', opacity: 0.65, duration: 320,
  },
  fire_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 6, spread: 30, duration: 420, size: 5,
    color: '#ff9900', glow: true, direction: 'up',
  },

  // ════════════════════════════════════════════════════════════════════════
  // ICE
  // Angular shards that fall, pale blue–cyan palette, cold field washes.
  // ════════════════════════════════════════════════════════════════════════

  ice_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 5, spread: 40, duration: 360, size: 4,
    color: '#aaeeff', direction: 'all',
  },
  ice_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 12, spread: 65, duration: 460, size: 6,
    color: '#55ddff', glow: true, direction: 'all',
  },
  ice_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 10, color: '#aaeeff', shape: 'oval', duration: 260,
  },
  ice_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 18, color: '#55ddff', shape: 'shard', duration: 340, trail: true,
  },
  ice_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#88eeff', width: 4, duration: 400, glow: true,
  },
  ice_hit_flash_light: {
    type: 'field_flash',
    color: '#aaddff', opacity: 0.30, duration: 180,
  },
  ice_hit_flash_heavy: {
    type: 'field_flash',
    color: '#55ccff', opacity: 0.50, duration: 240,
  },
  ice_field_effect: {
    type: 'field_flash',
    color: '#88ddff', opacity: 0.60, duration: 300,
  },
  ice_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 5, spread: 28, duration: 400, size: 4,
    color: '#aaeeff', direction: 'up',
  },

  // ════════════════════════════════════════════════════════════════════════
  // WATER
  // Arc-upward droplets, ocean blue–teal palette, blue field washes.
  // ════════════════════════════════════════════════════════════════════════

  water_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 6, spread: 50, duration: 400, size: 5,
    color: '#44aaee', glow: false, direction: 'up',
  },
  water_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 13, spread: 70, duration: 500, size: 7,
    color: '#0077cc', glow: true, direction: 'up',
  },
  water_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 12, color: '#44bbee', arc: -25, duration: 300, trail: false,
  },
  water_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 22, color: '#0077cc', arc: -35, duration: 400, trail: true,
  },
  water_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#0099cc', width: 5, duration: 420, glow: true,
  },
  water_hit_flash_light: {
    type: 'field_flash',
    color: '#0088cc', opacity: 0.28, duration: 180,
  },
  water_hit_flash_heavy: {
    type: 'field_flash',
    color: '#005599', opacity: 0.50, duration: 240,
  },
  water_field_effect: {
    type: 'field_flash',
    color: '#0077bb', opacity: 0.55, duration: 300,
  },
  water_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 6, spread: 28, duration: 420, size: 5,
    color: '#44bbee', direction: 'up',
  },

  // ════════════════════════════════════════════════════════════════════════
  // GAIA
  // Slow-drifting leaves and spores, forest green palette, growth washes.
  // ════════════════════════════════════════════════════════════════════════

  gaia_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 6, spread: 50, duration: 520, size: 5,
    color: '#44bb44', glow: false, direction: 'all',
  },
  gaia_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 14, spread: 70, duration: 620, size: 6,
    color: '#228822', glow: true, direction: 'all',
  },
  gaia_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 11, color: '#44bb44', arc: -28, duration: 340,
  },
  gaia_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 20, color: '#228822', arc: -38, duration: 440,
  },
  gaia_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#33aa33', width: 4, duration: 440, glow: true,
  },
  gaia_hit_flash_light: {
    type: 'field_flash',
    color: '#33aa33', opacity: 0.28, duration: 200,
  },
  gaia_hit_flash_heavy: {
    type: 'field_flash',
    color: '#117711', opacity: 0.50, duration: 260,
  },
  gaia_field_effect: {
    type: 'field_flash',
    color: '#228822', opacity: 0.55, duration: 320,
  },
  gaia_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 7, spread: 32, duration: 560, size: 5,
    color: '#55cc55', direction: 'up',
  },

  // ════════════════════════════════════════════════════════════════════════
  // WIND  (gust / slash sub-type)
  // Near-invisible swirling wisps, pale blue-gray palette, sweep washes.
  // ════════════════════════════════════════════════════════════════════════

  wind_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 5, spread: 60, duration: 300, size: 5,
    color: '#ddeeff', direction: 'all',
  },
  wind_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 10, spread: 80, duration: 360, size: 6,
    color: '#bbddff', direction: 'all',
  },
  wind_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 10, color: '#ddeeff', shape: 'oval', arc: -15, duration: 200,
  },
  wind_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 18, color: '#cce8ff', shape: 'oval', arc: -20, duration: 250,
  },
  wind_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#cce8ff', width: 3, duration: 360, glow: false,
  },
  wind_hit_flash_light: {
    type: 'field_flash',
    color: '#ddeeff', opacity: 0.22, duration: 150,
  },
  wind_hit_flash_heavy: {
    type: 'field_flash',
    color: '#bbd8ff', opacity: 0.40, duration: 200,
  },
  wind_field_effect: {
    type: 'field_flash',
    color: '#eef4ff', opacity: 0.45, duration: 250,
  },
  wind_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 5, spread: 35, duration: 320, size: 5,
    color: '#ddeeff', direction: 'up',
  },

  // ════════════════════════════════════════════════════════════════════════
  // LIGHTNING  (wind element, electric sub-type)
  // Jagged spark streaks, electric yellow-white palette, stutter flashes.
  // Projectiles are near-instant. Particles are tight and sharp.
  // ════════════════════════════════════════════════════════════════════════

  lightning_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 6, spread: 50, duration: 240, size: 4,
    color: '#eeffaa', glow: true, direction: 'all',
  },
  lightning_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 14, spread: 80, duration: 300, size: 5,
    color: '#ffffff', glow: true, direction: 'all',
  },
  lightning_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 8, color: '#eeffaa', shape: 'shard', duration: 150,
  },
  lightning_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 14, color: '#ffffff', shape: 'shard', duration: 180, trail: true,
  },
  lightning_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#eeffaa', width: 3, duration: 320, glow: true,
  },
  lightning_hit_flash_light: {
    type: 'field_flash',
    color: '#eeffaa', opacity: 0.35, duration: 120,
  },
  lightning_hit_flash_heavy: {
    type: 'field_flash',
    color: '#ffffff', opacity: 0.65, duration: 150,
  },
  lightning_field_effect: {
    type: 'field_flash',
    color: '#ffffff', opacity: 0.72, duration: 180,
  },
  lightning_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 8, spread: 35, duration: 280, size: 4,
    color: '#eeffbb', glow: true, direction: 'all',
  },

  // ════════════════════════════════════════════════════════════════════════
  // EARTH
  // Heavy rock chunks and dirt, brown-tan-gray palette, ground rumble.
  // Projectiles are slow and weighty. No arc — gravity pulls them down.
  // ════════════════════════════════════════════════════════════════════════

  earth_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 6, spread: 50, duration: 460, size: 6,
    color: '#997744', direction: 'all',
  },
  earth_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 14, spread: 70, duration: 560, size: 8,
    color: '#774433', direction: 'all',
  },
  earth_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 13, color: '#997744', shape: 'oval', duration: 420,
  },
  earth_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 24, color: '#774433', shape: 'oval', duration: 560,
  },
  earth_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#886644', width: 6, duration: 460, glow: false,
  },
  earth_hit_flash_light: {
    type: 'field_flash',
    color: '#886633', opacity: 0.28, duration: 220,
  },
  earth_hit_flash_heavy: {
    type: 'field_flash',
    color: '#664422', opacity: 0.50, duration: 280,
  },
  earth_field_effect: {
    type: 'field_flash',
    color: '#775533', opacity: 0.58, duration: 340,
  },
  earth_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 6, spread: 30, duration: 460, size: 6,
    color: '#997744', direction: 'up',
  },

  // ════════════════════════════════════════════════════════════════════════
  // LIGHT
  // Radiant sparkle rays, white-gold palette, brightest field flashes.
  // Heavy moves produce near-whiteout field effects.
  // ════════════════════════════════════════════════════════════════════════

  light_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 6, spread: 50, duration: 440, size: 5,
    color: '#ffeeaa', glow: true, direction: 'all',
  },
  light_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 14, spread: 80, duration: 540, size: 7,
    color: '#ffffff', glow: true, direction: 'all',
  },
  light_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 12, color: '#ffeeaa', arc: -20, duration: 280, trail: true,
  },
  light_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 22, color: '#ffffff', arc: -30, duration: 360, trail: true,
  },
  light_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#ffeeaa', width: 5, duration: 420, glow: true,
  },
  light_hit_flash_light: {
    type: 'field_flash',
    color: '#ffffee', opacity: 0.40, duration: 200,
  },
  light_hit_flash_heavy: {
    type: 'field_flash',
    color: '#ffffff', opacity: 0.75, duration: 260,
  },
  light_field_effect: {
    type: 'field_flash',
    color: '#ffffff', opacity: 0.82, duration: 320,
  },
  light_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 8, spread: 40, duration: 480, size: 5,
    color: '#ffeeaa', glow: true, direction: 'all',
  },

  // ════════════════════════════════════════════════════════════════════════
  // DARK
  // Shadow wisps with tight spread (ideally inward — see file header note),
  // deep purple–near-black palette, screen-dimming field effects.
  // ════════════════════════════════════════════════════════════════════════

  dark_particle_light: {
    type: 'particle_burst', origin: 'target',
    count: 5, spread: 38, duration: 480, size: 5,
    color: '#8800cc', direction: 'all',
  },
  dark_particle_heavy: {
    type: 'particle_burst', origin: 'target',
    count: 12, spread: 58, duration: 580, size: 7,
    color: '#440088', direction: 'all',
  },
  dark_projectile_light: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 12, color: '#8800cc', duration: 340,
  },
  dark_projectile_heavy: {
    type: 'projectile', from: 'actor', to: 'target',
    size: 22, color: '#550099', duration: 440,
  },
  dark_beam: {
    type: 'beam', from: 'actor', to: 'target',
    color: '#8800cc', width: 5, duration: 440, glow: true,
  },
  dark_hit_flash_light: {
    type: 'field_flash',
    color: '#440066', opacity: 0.30, duration: 220,
  },
  dark_hit_flash_heavy: {
    type: 'field_flash',
    color: '#220033', opacity: 0.58, duration: 300,
  },
  dark_field_effect: {
    type: 'field_flash',
    color: '#110022', opacity: 0.68, duration: 360,
  },
  dark_cast_aura: {
    type: 'particle_burst', origin: 'actor',
    count: 6, spread: 28, duration: 500, size: 5,
    color: '#8800cc', direction: 'all',
  },

};
