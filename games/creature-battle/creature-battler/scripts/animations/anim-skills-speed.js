// anim-skills-speed.js - Timeline animations for speed class-route skills.

registerMoveAnimations({

// ── Speed route skills ────────────────────────────────────────────────────
  // Palette: white/yellow (#ffffff / #ffee44) for quick strikes, teal (#00ffcc) for dash/evasion,
  // red-orange (#ff6622) for blitz, purple (#cc44ff) for afterimage/phantom, green (#44ff88) for haste.

  // ── quick_strike / quick_strike_2 / quick_strike_3 ───────────────────────
  quick_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-physical-light' },
      { at:80,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:80,  type:'particle_burst', origin:'target', color:'#ffee44', count:8, spread:25, direction:'all', duration:220 },
    ],
  },

// ── feint ─────────────────────────────────────────────────────────────────
  feint: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-status' },
      { at:80,  type:'status_ring',    target:'target', color:'#aaccff' },
      { at:80,  type:'particle_burst', origin:'target', color:'#aaccff', count:10, spread:28, direction:'all', duration:240 },
    ],
  },

// ── dash / dash_2 / dash_3 ───────────────────────────────────────────────
  dash: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:14, spread:30, direction:'up', duration:260 },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-heal' },
      { at:60,  type:'status_ring',    target:'actor', color:'#00ffcc' },
    ],
  },

// ── double_tap ───────────────────────────────────────────────────────────
  double_tap: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-physical-light' },
      { at:60,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:60,  type:'particle_burst', origin:'target', color:'#ffee44', count:8,  spread:22, direction:'all', duration:200 },
      { at:130, type:'sound',          id:'hit-physical-light' },
      { at:130, type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:130, type:'particle_burst', origin:'target', color:'#ffee44', count:8,  spread:22, direction:'all', duration:200 },
    ],
  },

// ── low_blow ─────────────────────────────────────────────────────────────
  low_blow: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:70,  type:'impact' },
      { at:70,  type:'sound',          id:'hit-physical-light' },
      { at:70,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:70,  type:'particle_burst', origin:'target', color:'#ff8844', count:10, spread:26, direction:'all', duration:240 },
      { at:90,  type:'status_ring',    target:'target', color:'#aabbff' },
    ],
  },

quick_strike_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-physical-light' },
      { at:60,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:60,  type:'particle_burst', origin:'target', color:'#ffee44', count:12, spread:30, direction:'all', duration:260 },
      { at:80,  type:'screen_shake',   intensity:2, duration:180 },
    ],
  },

// ── afterimage / afterimage_2 / afterimage_3 ─────────────────────────────
  afterimage: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc44ff', count:14, spread:36, direction:'all', duration:300 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-heal' },
      { at:80,  type:'status_ring',    target:'actor', color:'#cc44ff' },
    ],
  },

// ── blitz / blitz_2 / blitz_3 ────────────────────────────────────────────
  blitz: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff6622', count:14, spread:30, direction:'forward', duration:260 },
      { at:70,  type:'impact' },
      { at:70,  type:'sound',          id:'hit-physical-heavy' },
      { at:70,  type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:70,  type:'particle_burst', origin:'target', color:'#ff6622', count:18, spread:40, direction:'all', duration:300 },
      { at:80,  type:'screen_shake',   intensity:4, duration:240 },
    ],
  },

// ── trip ─────────────────────────────────────────────────────────────────
  trip: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:70,  type:'impact' },
      { at:70,  type:'sound',          id:'hit-status' },
      { at:70,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:70,  type:'status_ring',    target:'target', color:'#aabbff' },
      { at:70,  type:'particle_burst', origin:'target', color:'#aabbff', count:12, spread:28, direction:'all', duration:240 },
    ],
  },

// ── haste / haste_2 ──────────────────────────────────────────────────────
  haste: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44ff88', count:16, spread:36, direction:'up', duration:300 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-heal' },
      { at:80,  type:'status_ring',    target:'target', color:'#44ff88' },
      { at:80,  type:'particle_burst', origin:'actor', color:'#44ff88', count:10, spread:24, direction:'up', duration:240 },
    ],
  },

dash_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:20, spread:40, direction:'up', duration:300 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-heal' },
      { at:80,  type:'status_ring',    target:'actor', color:'#00ffcc' },
      { at:100, type:'particle_burst', origin:'actor', color:'#ffffff', count:12, spread:28, direction:'all', duration:260 },
    ],
  },

afterimage_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc44ff', count:20, spread:44, direction:'all', duration:360 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:10, spread:28, direction:'up',  duration:280 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-heal' },
      { at:80,  type:'status_ring',    target:'actor', color:'#cc44ff' },
    ],
  },

// ── flurry / flurry_2 / flurry_3 ─────────────────────────────────────────
  flurry: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:50,  type:'impact' },
      { at:50,  type:'sound',          id:'hit-physical-light' },
      { at:50,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:100, type:'sound',          id:'hit-physical-light' },
      { at:100, type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:150, type:'sound',          id:'hit-physical-light' },
      { at:150, type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:150, type:'particle_burst', origin:'target', color:'#ffee44', count:14, spread:32, direction:'all', duration:260 },
    ],
  },

// ── vault ─────────────────────────────────────────────────────────────────
  vault: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:16, spread:38, direction:'up', duration:320 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-heal' },
      { at:80,  type:'status_ring',    target:'actor', color:'#00ffcc' },
    ],
  },

haste_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'field_flash',    color:'#002211', opacity:0.22, duration:380 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#44ff88', count:26, spread:55, direction:'up',  duration:400 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aaffcc', count:14, spread:36, direction:'all', duration:340 },
      { at:100, type:'impact' },
      { at:100, type:'sound',          id:'hit-heal' },
      { at:100, type:'status_ring',    target:'actor', color:'#44ff88' },
      { at:120, type:'screen_shake',   intensity:2, duration:180 },
    ],
  },

quick_strike_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:50,  type:'impact' },
      { at:50,  type:'sound',          id:'hit-physical-heavy' },
      { at:50,  type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:50,  type:'particle_burst', origin:'target', color:'#ffee44', count:18, spread:36, direction:'all', duration:300 },
      { at:70,  type:'screen_shake',   intensity:3, duration:200 },
    ],
  },

afterimage_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'field_flash',    color:'#220033', opacity:0.26, duration:380 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc44ff', count:28, spread:55, direction:'all', duration:420 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:16, spread:36, direction:'up',  duration:340 },
      { at:100, type:'impact' },
      { at:100, type:'sound',          id:'hit-heal' },
      { at:100, type:'status_ring',    target:'actor', color:'#cc44ff' },
      { at:130, type:'screen_shake',   intensity:2, duration:180 },
    ],
  },

blitz_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff6622', count:20, spread:38, direction:'forward', duration:300 },
      { at:60,  type:'field_flash',    color:'#330800', opacity:0.30, duration:360 },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-physical-heavy' },
      { at:60,  type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:60,  type:'particle_burst', origin:'target', color:'#ff6622', count:24, spread:48, direction:'all', duration:340 },
      { at:80,  type:'screen_shake',   intensity:5, duration:260 },
    ],
  },

flurry_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:40,  type:'impact' },
      { at:40,  type:'sound',          id:'hit-physical-light' },
      { at:40,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:85,  type:'sound',          id:'hit-physical-light' },
      { at:85,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:130, type:'sound',          id:'hit-physical-light' },
      { at:130, type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:175, type:'sound',          id:'hit-physical-heavy' },
      { at:175, type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:175, type:'particle_burst', origin:'target', color:'#ffee44', count:18, spread:38, direction:'all', duration:300 },
    ],
  },

// ── phantom_drive ─────────────────────────────────────────────────────────
  phantom_drive: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc44ff', count:16, spread:36, direction:'forward', duration:280 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffee44', count:10, spread:28, direction:'forward', duration:240 },
      { at:50,  type:'field_flash',    color:'#220033', opacity:0.28, duration:360 },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-physical-heavy' },
      { at:60,  type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:60,  type:'particle_burst', origin:'target', color:'#cc44ff', count:22, spread:44, direction:'all', duration:340 },
      { at:80,  type:'screen_shake',   intensity:5, duration:260 },
    ],
  },

dash_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'field_flash',    color:'#003322', opacity:0.22, duration:320 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:28, spread:55, direction:'up', duration:380 },
      { at:100, type:'impact' },
      { at:100, type:'sound',          id:'hit-heal' },
      { at:100, type:'status_ring',    target:'actor', color:'#00ffcc' },
      { at:120, type:'particle_burst', origin:'actor', color:'#ffffff', count:18, spread:36, direction:'all', duration:300 },
    ],
  },

flurry_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:35,  type:'impact' },
      { at:35,  type:'sound',          id:'hit-physical-light' },
      { at:35,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:75,  type:'sound',          id:'hit-physical-light' },
      { at:75,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:115, type:'sound',          id:'hit-physical-light' },
      { at:115, type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:155, type:'sound',          id:'hit-physical-light' },
      { at:155, type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:195, type:'sound',          id:'hit-physical-heavy' },
      { at:195, type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:195, type:'particle_burst', origin:'target', color:'#ffee44', count:24, spread:46, direction:'all', duration:360 },
      { at:210, type:'screen_shake',   intensity:4, duration:220 },
    ],
  },

blitz_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ff6622', count:28, spread:46, direction:'forward', duration:360 },
      { at:40,  type:'field_flash',    color:'#330800', opacity:0.38, duration:420 },
      { at:50,  type:'impact' },
      { at:50,  type:'sound',          id:'hit-physical-heavy' },
      { at:50,  type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:50,  type:'particle_burst', origin:'target', color:'#ff6622', count:32, spread:55, direction:'all', duration:380 },
      { at:60,  type:'screen_shake',   intensity:6, duration:300 },
    ],
  },

// ── tempo_crush ───────────────────────────────────────────────────────────
  tempo_crush: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffee44', count:14, spread:32, direction:'forward', duration:260 },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-physical-heavy' },
      { at:60,  type:'creature_anim',  target:'target', class:'anim-hit-physical-heavy' },
      { at:60,  type:'particle_burst', origin:'target', color:'#ffee44', count:20, spread:42, direction:'all', duration:320 },
      { at:80,  type:'screen_shake',   intensity:4, duration:240 },
      { at:100, type:'status_ring',    target:'target', color:'#aabbff' },
      { at:110, type:'status_ring',    target:'actor',  color:'#44ff88' },
    ],
  },

// ── velocity ──────────────────────────────────────────────────────────────
  velocity: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-magic' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffee44', count:24, spread:55, direction:'forward', duration:380 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:14, spread:36, direction:'all',     duration:320 },
      { at:60,  type:'field_flash',    color:'#222200', opacity:0.28, duration:380 },
      { at:80,  type:'impact' },
      { at:80,  type:'sound',          id:'hit-physical-heavy' },
      { at:80,  type:'screen_shake',   intensity:5, duration:280 },
      { at:80,  type:'particle_burst', origin:'actor', color:'#ffee44', count:16, spread:40, direction:'all', duration:300 },
    ],
  },

// ── vault_counter ─────────────────────────────────────────────────────────
  vault_counter: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#00ffcc', count:12, spread:28, direction:'forward', duration:220 },
      { at:60,  type:'impact' },
      { at:60,  type:'sound',          id:'hit-physical-light' },
      { at:60,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:60,  type:'particle_burst', origin:'target', color:'#00ffcc', count:10, spread:24, direction:'all', duration:220 },
    ],
  },

// ── dodge_counter_strike ──────────────────────────────────────────────────
  dodge_counter_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-lunge', lunge:true },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc44ff', count:10, spread:24, direction:'forward', duration:200 },
      { at:55,  type:'impact' },
      { at:55,  type:'sound',          id:'hit-physical-light' },
      { at:55,  type:'creature_anim',  target:'target', class:'anim-hit-physical-light' },
      { at:55,  type:'particle_burst', origin:'target', color:'#cc44ff', count:10, spread:24, direction:'all', duration:220 },
    ],
  },

// ── ghost_step ────────────────────────────────────────────────────────────
  ghost_step: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-heavy' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-buff' },
      { at:0,   type:'field_flash',    color:'#220033', opacity:0.30, duration:420 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc44ff', count:26, spread:55, direction:'all', duration:440 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffffff', count:16, spread:38, direction:'up',  duration:380 },
      { at:100, type:'impact' },
      { at:100, type:'sound',          id:'hit-heal' },
      { at:100, type:'status_ring',    target:'actor', color:'#cc44ff' },
      { at:130, type:'screen_shake',   intensity:2, duration:180 },
    ],
  }

});
