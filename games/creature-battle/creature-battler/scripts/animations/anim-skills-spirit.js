// anim-skills-spirit.js - Timeline animations for spirit class-route skills.

registerMoveAnimations({

// ═══════════════════════════════════════════════════════════════════════════
  // SPIRIT ROUTE — color palette: cyan/teal (#00ccff / #00ffcc) for ward/restore,
  // indigo/silver (#6688ff / #ccddff) for bolts, gold (#ffdd44) for dominion.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── spirit_bolt / spirit_bolt_2 / spirit_bolt_3 ──────────────────────────
  spirit_bolt: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:14, spread:36, direction:'forward', duration:300 },
      { at:100, type:'projectile',     color:'#aabbff', size:12, speed:260 },
      { at:100, type:'impact' },
      { at:100, type:'sound',          id:'hit-magic' },
      { at:100, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:100, type:'particle_burst', origin:'target', color:'#6688ff', count:14, spread:42, direction:'all', duration:340 },
      { at:100, type:'particle_burst', origin:'target', color:'#ccddff', count:8,  spread:28, direction:'up',  duration:280 },
    ],
  },

// ── inner_reserve / inner_reserve_2 / inner_reserve_3 ────────────────────
  inner_reserve: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:20, spread:50, direction:'all', duration:400 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:10, spread:32, direction:'up',  duration:360 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-heal' },
    ],
  },

// ── ward / ward_2 / ward_3 ────────────────────────────────────────────────
  ward: {
    timeline: [
      { at:0,   type:'sound',          id:'defend' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:18, spread:46, direction:'all', duration:380 },
      { at:80,  type:'impact' },
      { at:80,  type:'status_ring',    target:'actor', color:'#00ccff' },
    ],
  },

// ── pulse ─────────────────────────────────────────────────────────────────
  pulse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:20, spread:60, direction:'forward', duration:360 },
      { at:80,  type:'field_flash',    color:'#334488', opacity:0.26, duration:300 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-magic' },
      { at:120, type:'particle_burst', origin:'actor', color:'#aabbff', count:28, spread:80, direction:'all', duration:420 },
      { at:120, type:'screen_shake',   intensity:3, duration:220 },
    ],
  },

// ── clarity_spirit ────────────────────────────────────────────────────────
  clarity_spirit: {
    timeline: [
      { at:0,   type:'sound',          id:'hit-heal' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:22, spread:48, direction:'up',  duration:400 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:12, spread:32, direction:'all', duration:340 },
      { at:100, type:'impact' },
      { at:100, type:'status_ring',    target:'actor', color:'#00ffcc' },
    ],
  },

spirit_bolt_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:18, spread:40, direction:'forward', duration:320 },
      { at:80,  type:'projectile',     color:'#aabbff', size:14, speed:270 },
      { at:80,  type:'projectile',     color:'#6688ff', size:9,  speed:300, offsetY: 8 },
      { at:130, type:'impact' },
      { at:130, type:'sound',          id:'hit-magic' },
      { at:130, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:130, type:'particle_burst', origin:'target', color:'#6688ff', count:18, spread:50, direction:'all', duration:360 },
      { at:130, type:'field_flash',    color:'#334488', opacity:0.18, duration:200 },
    ],
  },

// ── astral_rise / astral_rise_2 / astral_rise_3 ──────────────────────────
  astral_rise: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:20, spread:46, direction:'up', duration:400 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:12, spread:30, direction:'up', duration:360 },
      { at:120, type:'impact' },
      { at:120, type:'status_ring',    target:'actor', color:'#00ccff' },
    ],
  },

// ── mana_siphon ───────────────────────────────────────────────────────────
  mana_siphon: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:14, spread:36, direction:'forward', duration:320 },
      { at:80,  type:'projectile',     color:'#00aaff', size:12, speed:260 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-magic' },
      { at:80,  type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:80,  type:'particle_burst', origin:'target', color:'#00ccff', count:16, spread:44, direction:'all', duration:360 },
      { at:80,  type:'particle_burst', origin:'actor',  color:'#aaffee', count:10, spread:30, direction:'up',  duration:320 },
    ],
  },

// ── quicken ───────────────────────────────────────────────────────────────
  quicken: {
    timeline: [
      { at:0,   type:'sound',          id:'hit-heal' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:22, spread:50, direction:'up',  duration:380 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:14, spread:36, direction:'all', duration:320 },
      { at:100, type:'impact' },
      { at:100, type:'status_ring',    target:'actor', color:'#aaffee' },
    ],
  },

// ── null_field ────────────────────────────────────────────────────────────
  null_field: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#334466', count:18, spread:44, direction:'forward', duration:360 },
      { at:80,  type:'field_flash',    color:'#001122', opacity:0.30, duration:320 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-magic' },
      { at:120, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:120, type:'particle_burst', origin:'target', color:'#334466', count:16, spread:46, direction:'all', duration:360 },
      { at:120, type:'status_ring',    target:'target', color:'#334466' },
    ],
  },

inner_reserve_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:26, spread:54, direction:'all', duration:420 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:14, spread:36, direction:'up',  duration:380 },
      { at:100, type:'field_flash',    color:'#004466', opacity:0.20, duration:280 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-heal' },
    ],
  },

ward_2: {
    timeline: [
      { at:0,   type:'sound',          id:'defend' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:24, spread:50, direction:'all', duration:400 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:12, spread:34, direction:'up',  duration:340 },
      { at:80,  type:'impact' },
      { at:80,  type:'status_ring',    target:'actor', color:'#00ccff' },
      { at:80,  type:'field_flash',    color:'#003344', opacity:0.18, duration:240 },
    ],
  },

astral_rise_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:26, spread:50, direction:'up', duration:420 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:16, spread:34, direction:'up', duration:380 },
      { at:80,  type:'field_flash',    color:'#003344', opacity:0.20, duration:260 },
      { at:140, type:'impact' },
      { at:140, type:'status_ring',    target:'actor', color:'#00ccff' },
    ],
  },

// ── spirit_surge ──────────────────────────────────────────────────────────
  spirit_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:24, spread:50, direction:'forward', duration:380 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:14, spread:36, direction:'forward', duration:340 },
      { at:100, type:'projectile',     color:'#aabbff', size:18, speed:280 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:160, type:'particle_burst', origin:'target', color:'#6688ff', count:24, spread:58, direction:'all', duration:420 },
      { at:160, type:'particle_burst', origin:'target', color:'#aabbff', count:12, spread:38, direction:'up',  duration:360 },
      { at:160, type:'field_flash',    color:'#223366', opacity:0.28, duration:280 },
      { at:160, type:'screen_shake',   intensity:4, duration:240 },
    ],
  },

// ── deep_meditation ───────────────────────────────────────────────────────
  deep_meditation: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-medium' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:28, spread:52, direction:'up',  duration:440 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:16, spread:36, direction:'all', duration:400 },
      { at:60,  type:'field_flash',    color:'#003344', opacity:0.24, duration:320 },
      { at:140, type:'impact' },
      { at:140, type:'sound',          id:'hit-heal' },
      { at:140, type:'status_ring',    target:'actor', color:'#00ccff' },
    ],
  },

spirit_bolt_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:22, spread:46, direction:'forward', duration:360 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ccddff', count:12, spread:30, direction:'forward', duration:300 },
      { at:60,  type:'projectile',     color:'#aabbff', size:16, speed:280 },
      { at:60,  type:'projectile',     color:'#6688ff', size:10, speed:310, offsetY: 10 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-magic' },
      { at:120, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:120, type:'particle_burst', origin:'target', color:'#6688ff', count:22, spread:56, direction:'all', duration:400 },
      { at:120, type:'particle_burst', origin:'target', color:'#ccddff', count:10, spread:36, direction:'up',  duration:340 },
      { at:120, type:'field_flash',    color:'#334488', opacity:0.28, duration:240 },
      { at:120, type:'screen_shake',   intensity:3, duration:200 },
    ],
  },

// ── soul_rend ─────────────────────────────────────────────────────────────
  soul_rend: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#334466', count:20, spread:44, direction:'forward', duration:360 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:12, spread:30, direction:'forward', duration:320 },
      { at:80,  type:'projectile',     color:'#334466', size:16, speed:260 },
      { at:140, type:'impact' },
      { at:140, type:'sound',          id:'hit-magic' },
      { at:140, type:'creature_anim',  target:'target', class:'anim-hit-magic' },
      { at:140, type:'particle_burst', origin:'target', color:'#334466', count:22, spread:56, direction:'all', duration:420 },
      { at:140, type:'particle_burst', origin:'target', color:'#6688ff', count:10, spread:36, direction:'all', duration:360 },
      { at:140, type:'field_flash',    color:'#111133', opacity:0.32, duration:280 },
      { at:140, type:'screen_shake',   intensity:4, duration:260 },
      { at:140, type:'status_ring',    target:'target', color:'#334466' },
    ],
  },

// ── mana_well ─────────────────────────────────────────────────────────────
  mana_well: {
    timeline: [
      { at:0,   type:'sound',          id:'hit-heal' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:32, spread:70, direction:'all', duration:460 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:20, spread:54, direction:'up',  duration:420 },
      { at:60,  type:'field_flash',    color:'#003344', opacity:0.22, duration:320 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-heal' },
    ],
  },

// ── transcendence ─────────────────────────────────────────────────────────
  transcendence: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffdd44', count:28, spread:56, direction:'up',  duration:480 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffaa', count:18, spread:40, direction:'all', duration:440 },
      { at:60,  type:'field_flash',    color:'#443300', opacity:0.28, duration:360 },
      { at:100, type:'screen_shake',   intensity:3, duration:200 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-heal' },
      { at:160, type:'status_ring',    target:'actor', color:'#ffdd44' },
    ],
  },

// ── arcane_veil ───────────────────────────────────────────────────────────
  arcane_veil: {
    timeline: [
      { at:0,   type:'sound',          id:'defend' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aabbff', count:26, spread:58, direction:'all', duration:440 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:14, spread:40, direction:'up',  duration:400 },
      { at:60,  type:'field_flash',    color:'#224488', opacity:0.30, duration:340 },
      { at:100, type:'impact' },
      { at:100, type:'status_ring',    target:'actor', color:'#aabbff' },
      { at:100, type:'screen_shake',   intensity:2, duration:160 },
    ],
  },

inner_reserve_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:32, spread:58, direction:'all', duration:460 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:18, spread:42, direction:'up',  duration:420 },
      { at:60,  type:'field_flash',    color:'#00aacc', opacity:0.28, duration:320 },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-heal' },
      { at:200, type:'particle_burst', origin:'actor', color:'#ccffff', count:14, spread:44, direction:'up', duration:340 },
    ],
  },

ward_3: {
    timeline: [
      { at:0,   type:'sound',          id:'defend' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:30, spread:54, direction:'all', duration:420 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:16, spread:38, direction:'up',  duration:380 },
      { at:60,  type:'field_flash',    color:'#00aacc', opacity:0.24, duration:300 },
      { at:80,  type:'impact' },
      { at:80,  type:'status_ring',    target:'actor', color:'#00ccff' },
      { at:80,  type:'screen_shake',   intensity:2, duration:160 },
    ],
  },

astral_rise_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:32, spread:56, direction:'up', duration:460 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffee', count:18, spread:38, direction:'up', duration:420 },
      { at:60,  type:'field_flash',    color:'#00aacc', opacity:0.26, duration:300 },
      { at:100, type:'screen_shake',   intensity:2, duration:180 },
      { at:160, type:'impact' },
      { at:160, type:'status_ring',    target:'actor', color:'#00ccff' },
    ],
  },

// ── spirit_collapse ───────────────────────────────────────────────────────
  spirit_collapse: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#6688ff', count:30, spread:70, direction:'forward', duration:440 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ccff', count:18, spread:50, direction:'forward', duration:400 },
      { at:80,  type:'field_flash',    color:'#223366', opacity:0.36, duration:400 },
      { at:100, type:'screen_shake',   intensity:4, duration:260 },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-magic' },
      { at:160, type:'particle_burst', origin:'actor', color:'#aabbff', count:36, spread:90, direction:'all', duration:480 },
      { at:280, type:'creature_shake', target:'actor', intensity:4, duration:260 },
    ],
  },

// ── dominion ──────────────────────────────────────────────────────────────
  dominion: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffdd44', count:36, spread:80, direction:'up',  duration:520 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffaa', count:22, spread:60, direction:'all', duration:480 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:18, spread:50, direction:'all', duration:460 },
      { at:60,  type:'field_flash',    color:'#443300', opacity:0.34, duration:420 },
      { at:100, type:'screen_shake',   intensity:4, duration:280 },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-heal' },
      { at:180, type:'status_ring',    target:'actor', color:'#ffdd44' },
      { at:300, type:'particle_burst', origin:'actor', color:'#ffffee', count:20, spread:60, direction:'up', duration:400 },
    ],
  }

});
