// anim-skills-intelligence.js - Timeline animations for intelligence class-route skills.

registerMoveAnimations({

// ── Intelligence Tier 1 ───────────────────────────────────────────────────

  // ── mind_spike ────────────────────────────────────────────────────────────
  // Quick violet bolt — reliable magic damage. Fast wind-up, clean pop on impact.
  mind_spike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc88ff', count:8, spread:28, direction:'forward', duration:280 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-magic' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:180, type:'particle_burst', origin:'target', color:'#aa55ee', count:10, spread:38, direction:'all', duration:300 },
      { at:180, type:'field_flash',    color:'#7733bb', opacity:0.16, duration:180 },
    ],
  },

// ── focus ─────────────────────────────────────────────────────────────────
  // Concentrate energy upward — gold-violet shimmer, INT boost sealed by a status ring.
  focus: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ddaaff', count:14, spread:40, direction:'up', duration:560 },
      { at:220, type:'impact' },
      { at:220, type:'field_flash',    color:'#aa66ee', opacity:0.18, duration:320 },
      { at:220, type:'status_ring',    target:'actor', color:'#cc88ff', duration:700 },
    ],
  },

// ── reckless_cast ─────────────────────────────────────────────────────────
  // Reckless magic — red-hot surge followed by a recoil shudder on the actor.
  reckless_cast: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff6644', count:12, spread:36, direction:'forward', duration:340 },
      { at:0,   type:'field_flash',    color:'#cc2200', opacity:0.12, duration:300 },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-magic' },
      { at:200, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:200, type:'particle_burst', origin:'target', color:'#ff5533', count:14, spread:48, direction:'all', duration:360 },
      { at:200, type:'field_flash',    color:'#aa1100', opacity:0.26, duration:240 },
      { at:340, type:'creature_shake', target:'actor', intensity:3, duration:200 },
    ],
  },

// ── mana_surge ────────────────────────────────────────────────────────────
  // Blue-cyan MP pulse — stronger when drained. Low HP feel, high-tension cast.
  mana_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44ccff', count:10, spread:34, direction:'forward', duration:320 },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-magic' },
      { at:200, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:200, type:'particle_burst', origin:'target', color:'#2299ee', count:12, spread:44, direction:'all', duration:340 },
      { at:200, type:'field_flash',    color:'#0077bb', opacity:0.18, duration:200 },
    ],
  },

// ── spell_drain ───────────────────────────────────────────────────────────
  // Dark purple bolt — feeds MP back to the caster. A hungry, predatory cast.
  spell_drain: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#8833cc', count:10, spread:32, direction:'forward', duration:300 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-magic' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:180, type:'particle_burst', origin:'target', color:'#6622aa', count:12, spread:42, direction:'all', duration:320 },
      { at:180, type:'field_flash',    color:'#441188', opacity:0.20, duration:200 },
      { at:320, type:'particle_burst', origin:'actor', color:'#44bbff', count:8, spread:26, direction:'up', duration:360 },
    ],
  },

// ── mind_spike_2 ──────────────────────────────────────────────────────────
  mind_spike_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#dd99ff', count:12, spread:34, direction:'forward', duration:300 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:160, type:'particle_burst', origin:'target', color:'#bb66ff', count:14, spread:46, direction:'all', duration:340 },
      { at:160, type:'field_flash',    color:'#8844cc', opacity:0.20, duration:200 },
      { at:260, type:'creature_shake', target:'target', intensity:2, duration:160 },
    ],
  },

// ── reckless_cast_2 ───────────────────────────────────────────────────────
  reckless_cast_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff7755', count:16, spread:44, direction:'forward', duration:360 },
      { at:0,   type:'field_flash',    color:'#cc3300', opacity:0.16, duration:320 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-magic' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:180, type:'particle_burst', origin:'target', color:'#ff6644', count:18, spread:56, direction:'all', duration:380 },
      { at:180, type:'field_flash',    color:'#bb2200', opacity:0.30, duration:260 },
      { at:180, type:'screen_shake',   intensity:3, duration:200 },
      { at:320, type:'creature_shake', target:'actor', intensity:4, duration:220 },
    ],
  },

// ── Intelligence Tier 2 ───────────────────────────────────────────────────

  // ── wild_surge ────────────────────────────────────────────────────────────
  // Chaotic eruption — random colors signal the unpredictability. Screen shakes hard.
  wild_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff44cc', count:10, spread:36, direction:'all', duration:300 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44ffcc', count:8,  spread:28, direction:'all', duration:280 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:160, type:'particle_burst', origin:'target', color:'#ffcc44', count:14, spread:56, direction:'all', duration:360 },
      { at:160, type:'field_flash',    color:'#aa4488', opacity:0.28, duration:240 },
      { at:160, type:'screen_shake',   intensity:5, duration:280 },
      { at:300, type:'creature_shake', target:'target', intensity:4, duration:200 },
    ],
  },

// ── mana_burst ────────────────────────────────────────────────────────────
  // Concentrate MP into a single compressed shell. Cyan-gold explosion on contact.
  mana_burst: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffdd55', count:12, spread:28, direction:'forward', duration:320 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#55ddff', count:10, spread:24, direction:'forward', duration:300 },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:240 },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-magic' },
      { at:200, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:200, type:'particle_burst', origin:'target', color:'#ffcc00', count:18, spread:58, direction:'all', duration:400 },
      { at:200, type:'field_flash',    color:'#886600', opacity:0.30, duration:260 },
      { at:200, type:'screen_shake',   intensity:4, duration:240 },
    ],
  },

// ── channel ───────────────────────────────────────────────────────────────
  // Defensive meditative stance — teal aura wraps the actor, calm before impact.
  channel: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44ddcc', count:16, spread:50, direction:'all', duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#229988', opacity:0.18, duration:360 },
      { at:200, type:'status_ring',    target:'actor', color:'#44ddcc', duration:800 },
      { at:380, type:'particle_burst', origin:'actor', color:'#88ffee', count:10, spread:38, direction:'up', duration:440 },
    ],
  },

// ── focus_2 ───────────────────────────────────────────────────────────────
  focus_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#eeccff', count:20, spread:50, direction:'up', duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#bb77ff', opacity:0.24, duration:360 },
      { at:200, type:'status_ring',    target:'actor', color:'#dd99ff', duration:800 },
      { at:360, type:'particle_burst', origin:'actor', color:'#aa66dd', count:10, spread:36, direction:'up', duration:440 },
    ],
  },

// ── mana_surge_2 ──────────────────────────────────────────────────────────
  mana_surge_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#55ddff', count:14, spread:42, direction:'forward', duration:340 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:180 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-magic' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:180, type:'particle_burst', origin:'target', color:'#33aabb', count:16, spread:52, direction:'all', duration:360 },
      { at:180, type:'field_flash',    color:'#006688', opacity:0.24, duration:220 },
      { at:280, type:'creature_shake', target:'target', intensity:3, duration:180 },
    ],
  },

// ── Intelligence Tier 3 ───────────────────────────────────────────────────

  // ── arcane_surge ──────────────────────────────────────────────────────────
  // Wave of arcane energy sweeps all enemies — expanding violet ring and wide flash.
  arcane_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#bb77ff', count:20, spread:60, direction:'forward', duration:380 },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-magic' },
      { at:200, type:'field_flash',    color:'#7733aa', opacity:0.28, duration:320 },
      { at:200, type:'particle_burst', origin:'target', color:'#9955dd', count:16, spread:70, direction:'all', duration:420 },
      { at:200, type:'screen_shake',   intensity:3, duration:220 },
    ],
  },

// ── grand_incantation ─────────────────────────────────────────────────────
  // Wind-up only — a vast glowing rune builds around the actor. No strike yet.
  grand_incantation: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:22, spread:64, direction:'all', duration:700 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc88ff', count:16, spread:48, direction:'up', duration:640 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#aa66ff', opacity:0.30, duration:500 },
      { at:200, type:'status_ring',    target:'actor', color:'#ffffff', duration:1100 },
      { at:400, type:'status_ring',    target:'actor', color:'#cc99ff', duration:900 },
      { at:600, type:'status_ring',    target:'actor', color:'#aa77ee', duration:700 },
    ],
  },

// ── attune ────────────────────────────────────────────────────────────────
  // Harmonize with arcane forces — deep violet resonance pulses outward from the actor.
  attune: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#9944ee', count:18, spread:56, direction:'all', duration:580 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#6622bb', opacity:0.22, duration:380 },
      { at:200, type:'status_ring',    target:'actor', color:'#bb66ff', duration:900 },
      { at:380, type:'particle_burst', origin:'actor', color:'#dd99ff', count:12, spread:42, direction:'up', duration:460 },
    ],
  },

// ── mind_spike_3 ──────────────────────────────────────────────────────────
  // Peak precision — the bolt is invisible until it strikes. Hard impact, deep violet flash.
  mind_spike_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ee99ff', count:16, spread:40, direction:'forward', duration:320 },
      { at:140, type:'impact' },
      { at:140, type:'sound',          id:'hit-magic' },
      { at:140, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:140, type:'particle_burst', origin:'target', color:'#cc66ff', count:18, spread:54, direction:'all', duration:360 },
      { at:140, type:'field_flash',    color:'#6622aa', opacity:0.28, duration:220 },
      { at:140, type:'screen_shake',   intensity:2, duration:180 },
      { at:240, type:'creature_shake', target:'target', intensity:3, duration:200 },
    ],
  },

// ── reckless_cast_3 ───────────────────────────────────────────────────────
  reckless_cast_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff9966', count:20, spread:52, direction:'forward', duration:380 },
      { at:0,   type:'field_flash',    color:'#dd4400', opacity:0.18, duration:340 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:160, type:'particle_burst', origin:'target', color:'#ff7744', count:22, spread:64, direction:'all', duration:400 },
      { at:160, type:'field_flash',    color:'#cc3300', opacity:0.36, duration:280 },
      { at:160, type:'screen_shake',   intensity:5, duration:240 },
      { at:300, type:'creature_shake', target:'actor', intensity:5, duration:260 },
    ],
  },

// ── arcane_surge_2 ────────────────────────────────────────────────────────
  arcane_surge_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc88ff', count:24, spread:68, direction:'forward', duration:400 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-magic' },
      { at:180, type:'field_flash',    color:'#8844bb', opacity:0.34, duration:340 },
      { at:180, type:'particle_burst', origin:'target', color:'#aa66ee', count:20, spread:78, direction:'all', duration:440 },
      { at:180, type:'screen_shake',   intensity:4, duration:260 },
      { at:320, type:'particle_burst', origin:'target', color:'#cc99ff', count:10, spread:50, direction:'all', duration:360 },
    ],
  },

// ── Intelligence Tier 4 ───────────────────────────────────────────────────

  // ── unravel ───────────────────────────────────────────────────────────────
  // Erodes all enemies' SPI — a dark wave unravels their arcane defenses.
  unravel: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#442266', count:18, spread:62, direction:'forward', duration:400 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#330044', opacity:0.30, duration:360 },
      { at:200, type:'particle_burst', origin:'target', color:'#663388', count:14, spread:72, direction:'all', duration:440 },
      { at:200, type:'screen_shake',   intensity:3, duration:220 },
    ],
  },

// ── resonant_cast ─────────────────────────────────────────────────────────
  // Builds on the previous spell — shimmering afterimage gives it extra force.
  resonant_cast: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffbbff', count:12, spread:38, direction:'forward', duration:320 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc66ee', count:8,  spread:28, direction:'forward', duration:280 },
      { at:170, type:'impact' },
      { at:170, type:'sound',          id:'hit-magic' },
      { at:170, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:170, type:'particle_burst', origin:'target', color:'#dd88ff', count:16, spread:50, direction:'all', duration:360 },
      { at:170, type:'field_flash',    color:'#882299', opacity:0.22, duration:220 },
      { at:300, type:'particle_burst', origin:'target', color:'#ffccff', count:8,  spread:32, direction:'up', duration:320 },
    ],
  },

// ── focus_3 ───────────────────────────────────────────────────────────────
  // Maximum concentration — double ring flare, actor pulses with arcane energy.
  focus_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:24, spread:58, direction:'up', duration:640 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc88ff', count:14, spread:40, direction:'all', duration:520 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#cc88ff', opacity:0.30, duration:400 },
      { at:200, type:'status_ring',    target:'actor', color:'#ffffff', duration:900 },
      { at:360, type:'status_ring',    target:'actor', color:'#cc99ff', duration:700 },
      { at:500, type:'status_ring',    target:'actor', color:'#aa77ee', duration:500 },
    ],
  },

// ── mana_surge_3 ──────────────────────────────────────────────────────────
  // Near-empty mana explodes outward. Screen-flooding cyan-white burst.
  mana_surge_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaeeff', count:20, spread:52, direction:'forward', duration:360 },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:220 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:160, type:'particle_burst', origin:'target', color:'#66ccff', count:22, spread:62, direction:'all', duration:400 },
      { at:160, type:'field_flash',    color:'#004477', opacity:0.34, duration:260 },
      { at:160, type:'screen_shake',   intensity:4, duration:220 },
      { at:280, type:'creature_shake', target:'target', intensity:4, duration:200 },
    ],
  },

// ── arcane_surge_3 ────────────────────────────────────────────────────────
  arcane_surge_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#eeccff', count:28, spread:76, direction:'forward', duration:420 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'field_flash',    color:'#9944cc', opacity:0.40, duration:360 },
      { at:160, type:'particle_burst', origin:'target', color:'#cc88ff', count:26, spread:88, direction:'all', duration:480 },
      { at:160, type:'screen_shake',   intensity:5, duration:300 },
      { at:300, type:'particle_burst', origin:'target', color:'#ffffff', count:12, spread:56, direction:'all', duration:380 },
      { at:440, type:'creature_shake', target:'target', intensity:3, duration:200 },
    ],
  },

// ── Intelligence Tier 5 ───────────────────────────────────────────────────

  // ── shatter ───────────────────────────────────────────────────────────────
  // Exploits the target's own SPI — purple spikes crack through their defenses.
  shatter: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aa44ff', count:14, spread:40, direction:'forward', duration:360 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:180 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-magic' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:180, type:'particle_burst', origin:'target', color:'#8800ff', count:20, spread:58, direction:'all', duration:400 },
      { at:180, type:'particle_burst', origin:'target', color:'#ddaaff', count:10, spread:36, direction:'up', duration:360 },
      { at:180, type:'field_flash',    color:'#550088', opacity:0.34, duration:260 },
      { at:180, type:'screen_shake',   intensity:4, duration:240 },
      { at:320, type:'creature_shake', target:'target', intensity:4, duration:220 },
    ],
  },

// ── void_strike ───────────────────────────────────────────────────────────
  // Tears through SPI entirely — dark void rend, near-black flash, minimal color.
  void_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#220033', count:16, spread:44, direction:'forward', duration:380 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6622aa', count:10, spread:32, direction:'forward', duration:340 },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:240 },
      { at:160, type:'field_flash',    color:'#000011', opacity:0.50, duration:420 },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-magic' },
      { at:200, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:200, type:'particle_burst', origin:'target', color:'#4400aa', count:22, spread:66, direction:'all', duration:440 },
      { at:200, type:'particle_burst', origin:'target', color:'#000000', count:12, spread:46, direction:'all', duration:380 },
      { at:200, type:'screen_shake',   intensity:6, duration:320 },
      { at:360, type:'creature_shake', target:'target', intensity:5, duration:280 },
    ],
  },

// ── grand_incantation_execute ─────────────────────────────────────────────
  // The incantation releases — cosmic scale. Full-field white burst before the bolt lands.
  grand_incantation_execute: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:30, spread:80, direction:'all', duration:480 },
      { at:0,   type:'field_flash',    color:'#ffffff', opacity:0.50, duration:480 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:160, type:'particle_burst', origin:'target', color:'#eeddff', count:28, spread:82, direction:'all', duration:520 },
      { at:160, type:'field_flash',    color:'#7722cc', opacity:0.44, duration:380 },
      { at:160, type:'screen_shake',   intensity:7, duration:360 },
      { at:320, type:'creature_shake', target:'target', intensity:5, duration:280 },
    ],
  }

});
