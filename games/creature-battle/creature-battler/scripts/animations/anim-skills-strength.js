// anim-skills-strength.js - Timeline animations for strength class-route skills.

registerMoveAnimations({

// ── cleave ──────────────────────────────────────────────────────────────
  // Fast surgical slash — ignores DEF. Shorter wind-up than a heavy move.
  // Silver arc on impact, clean and quick. No recoil on actor.
  cleave: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:140, type:'impact' },
      { at:140, type:'sound',          id:'hit-light' },
      { at:140, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:140, type:'particle_burst', origin:'target', color:'#c8d0e8', count:7, spread:42, direction:'all', duration:320 },
      { at:140, type:'field_flash',    color:'#8899bb', opacity:0.16, duration:160 },
    ],
  },

// ── temper ──────────────────────────────────────────────────────────────
  // Raises STR +2 stages. Amber surge upward; gold ring seals the power boost.
  temper: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#e89030', count:12, spread:44, direction:'up', duration:560 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#cc7700', opacity:0.22, duration:340 },
      { at:200, type:'status_ring',    target:'actor', color:'#ffaa22', duration:700 },
    ],
  },

// ── reckless_strike ─────────────────────────────────────────────────────
  // Heaviest physical hit at Tier 1; user takes 10% max HP recoil.
  // Actor trembles before committing. Lands with a stutter shake; staggers back.
  reckless_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:3, duration:260 },
      { at:260, type:'sound',          id:'hit-heavy' },
      { at:260, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:420, type:'impact' },
      { at:420, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:420, type:'particle_burst', origin:'target', color:'#ff8844', count:14, spread:60, direction:'all', duration:480 },
      { at:420, type:'field_flash',    color:'#dd4400', opacity:0.26, duration:200 },
      { at:420, type:'screen_shake',   intensity:6, duration:260, style:'stutter' },
      { at:580, type:'creature_shake', target:'actor',  intensity:4, duration:200 },
    ],
  },

// ── final_strike ────────────────────────────────────────────────────────
  // Damage scales with missing HP. Blood-red surge from actor during wind-up
  // (life force being drawn). Red field on impact.
  final_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc3333', count:8, spread:36, direction:'all', duration:420 },
      { at:200, type:'sound',          id:'hit-heavy' },
      { at:200, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:360, type:'impact' },
      { at:360, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:360, type:'particle_burst', origin:'target', color:'#dd3333', count:11, spread:55, direction:'all', duration:440 },
      { at:360, type:'field_flash',    color:'#aa2200', opacity:0.22, duration:220 },
      { at:360, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

// ── finishing_blow ──────────────────────────────────────────────────────
  // Bonus damage below 30% HP. Brief dark targeting ring on target before the
  // lunge — a deliberate execution pause. Dark + purple burst on impact.
  finishing_blow: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'status_ring',    target:'target', color:'#880044', duration:220 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:220, type:'impact' },
      { at:220, type:'sound',          id:'hit-heavy' },
      { at:220, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:220, type:'particle_burst', origin:'target', color:'#1a001a', count:12, spread:55, direction:'all', duration:460 },
      { at:220, type:'particle_burst', origin:'target', color:'#cc00aa', count:6,  spread:32, direction:'all', duration:360 },
      { at:220, type:'field_flash',    color:'#330022', opacity:0.30, duration:280 },
    ],
  },

// ── cleave_2 ────────────────────────────────────────────────────────────
  // Deeper cut — the DEF ignore starts to show. Target staggers on impact.
  cleave_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-light' },
      { at:120, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:120, type:'particle_burst', origin:'target', color:'#c8d0e8', count:10, spread:48, direction:'all', duration:320 },
      { at:120, type:'field_flash',    color:'#8899bb', opacity:0.20, duration:180 },
      { at:220, type:'creature_shake', target:'target', intensity:3, duration:180 },
    ],
  },

// ── reckless_strike_2 ───────────────────────────────────────────────────
  reckless_strike_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:4, duration:280 },
      { at:280, type:'sound',          id:'hit-heavy' },
      { at:280, type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:440, type:'impact' },
      { at:440, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:440, type:'particle_burst', origin:'target', color:'#ff8844', count:18, spread:65, direction:'all', duration:500 },
      { at:440, type:'field_flash',    color:'#dd4400', opacity:0.30, duration:220 },
      { at:440, type:'screen_shake',   intensity:7, duration:280, style:'stutter' },
      { at:620, type:'creature_shake', target:'actor', intensity:5, duration:220 },
    ],
  },

// ── challenge ───────────────────────────────────────────────────────────
  // Taunt: forces target to attack the challenger. Actor steps aggressively
  // forward (creature_shake reads as a forward lurch). Target flinches from the
  // pressure + gets a red taunt ring. No damage — timing is fast and confrontational.
  challenge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:3, duration:200 },
      { at:80,  type:'impact' },
      { at:80,  type:'creature_shake', target:'target', intensity:4, duration:200 },
      { at:80,  type:'particle_burst', origin:'target', color:'#ff4422', count:8,  spread:40, direction:'all', duration:300 },
      { at:80,  type:'status_ring',    target:'target', color:'#dd2200', duration:600 },
      { at:80,  type:'creature_anim',  target:'target', class:'anim-hit-physical' },
    ],
  },

// ── power_through ───────────────────────────────────────────────────────
  // Strike + drain. Green burst on target; bright green surge up actor afterward
  // sells the HP flowing back clearly.
  power_through: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-light' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:160, type:'particle_burst', origin:'target', color:'#88cc44', count:10, spread:50, direction:'all', duration:400 },
      { at:160, type:'field_flash',    color:'#448822', opacity:0.18, duration:220 },
      { at:320, type:'particle_burst', origin:'actor',  color:'#aaff44', count:12, spread:36, direction:'up',  duration:420, glow:true },
      { at:420, type:'field_flash',    color:'#22aa00', opacity:0.14, duration:200 },
    ],
  },

// ── brace ───────────────────────────────────────────────────────────────
  // Actor plants and braces for impact. Blue-gray particles radiate outward;
  // a shield ring snaps around the actor on the brace frame. No hit reaction
  // on the actor — bracing isn't getting hit.
  brace: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#6688cc', count:10, spread:30, direction:'all', duration:400 },
      { at:0,   type:'field_flash',    color:'#334466', opacity:0.20, duration:300 },
      { at:120, type:'impact' },
      { at:120, type:'status_ring',    target:'actor', color:'#4466bb', duration:800 },
    ],
  },

// ── temper_2 ────────────────────────────────────────────────────────────
  temper_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#f0a040', count:18, spread:52, direction:'up', duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#ee8800', opacity:0.28, duration:380 },
      { at:200, type:'status_ring',    target:'actor', color:'#ffbb33', duration:800 },
    ],
  },

// ── final_strike_2 ──────────────────────────────────────────────────────
  final_strike_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#dd2222', count:12, spread:40, direction:'all', duration:460 },
      { at:220, type:'sound',          id:'hit-heavy' },
      { at:220, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:380, type:'particle_burst', origin:'target', color:'#ee2222', count:15, spread:60, direction:'all', duration:460 },
      { at:380, type:'field_flash',    color:'#cc1100', opacity:0.26, duration:240 },
      { at:380, type:'screen_shake',   intensity:5, duration:220 },
    ],
  },

// ── war_stance ──────────────────────────────────────────────────────────
  // STR up / SPD down tradeoff. Extended red surge for the power gain; ring
  // seals it. Then blue flicker for the speed cost — visually legible tradeoff.
  war_stance: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#dd4422', count:16, spread:50, direction:'up',  duration:600 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:240 },
      { at:240, type:'impact' },
      { at:240, type:'field_flash',    color:'#cc3300', opacity:0.28, duration:360 },
      { at:240, type:'status_ring',    target:'actor', color:'#ee4400', duration:700 },
      { at:440, type:'particle_burst', origin:'actor', color:'#2244cc', count:8,  spread:30, direction:'all', duration:360 },
      { at:440, type:'field_flash',    color:'#223388', opacity:0.14, duration:260 },
      { at:440, type:'status_ring',    target:'actor', color:'#3355bb', duration:500 },
    ],
  },

// ── sweep ───────────────────────────────────────────────────────────────
  // AoE physical sweep. An expanding wave rolls out from the actor toward all
  // enemies — visible travel, visible arrival. Impact fires as the wave front
  // reaches the target side; particle burst adds dust at the wave's peak.
  sweep: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge' },
      { at:60,  type:'wave_sweep',     color:'#d4c0a0', duration:340 },
      { at:260, type:'impact' },
      { at:260, type:'sound',          id:'hit-light' },
      { at:260, type:'particle_burst', origin:'actor', color:'#d4c0a0', count:16, spread:110, direction:'all', duration:400 },
      { at:260, type:'field_flash',    color:'#aa9970', opacity:0.20, duration:240 },
      { at:260, type:'screen_shake',   intensity:2, duration:180 },
    ],
  },

// ── courage_strike ──────────────────────────────────────────────────────
  // Wind-up turn: user pays 50% HP. Deep red surge, actor shakes from the cost.
  // Red status ring on actor shows the charge is locked in.
  courage_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:3, duration:350 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#cc1111', count:12, spread:34, direction:'all', duration:500 },
      { at:0,   type:'field_flash',    color:'#550000', opacity:0.22, duration:400 },
      { at:180, type:'impact' },
      { at:180, type:'status_ring',    target:'actor',  color:'#ff0000', duration:900 },
    ],
  },

// ── cleave_3 ────────────────────────────────────────────────────────────
  // Full force. Hard impact, armor-crack shake, heavy screen feedback.
  cleave_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:100, type:'impact' },
      { at:100, type:'sound',          id:'hit-heavy' },
      { at:100, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:100, type:'particle_burst', origin:'target', color:'#c8d0e8', count:14, spread:54, direction:'all', duration:340 },
      { at:100, type:'field_flash',    color:'#6688cc', opacity:0.24, duration:200 },
      { at:100, type:'screen_shake',   intensity:3, duration:200 },
      { at:200, type:'creature_shake', target:'target', intensity:4, duration:200 },
    ],
  },

// ── reckless_strike_3 ───────────────────────────────────────────────────
  reckless_strike_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:5, duration:300 },
      { at:300, type:'sound',          id:'hit-heavy' },
      { at:300, type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:460, type:'impact' },
      { at:460, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:460, type:'particle_burst', origin:'target', color:'#ff6600', count:22, spread:70, direction:'all', duration:540 },
      { at:460, type:'field_flash',    color:'#cc3300', opacity:0.36, duration:260 },
      { at:460, type:'screen_shake',   intensity:9, duration:300, style:'stutter' },
      { at:660, type:'creature_shake', target:'actor', intensity:6, duration:260 },
    ],
  },

// ── sweep_2 ─────────────────────────────────────────────────────────────
  // Heavier wave, hits harder. A second dust burst trails the wave front.
  sweep_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge' },
      { at:60,  type:'wave_sweep',     color:'#ccb890', duration:360 },
      { at:280, type:'impact' },
      { at:280, type:'sound',          id:'hit-heavy' },
      { at:280, type:'particle_burst', origin:'actor', color:'#d4c0a0', count:22, spread:120, direction:'all', duration:460 },
      { at:280, type:'field_flash',    color:'#aa9970', opacity:0.26, duration:260 },
      { at:280, type:'screen_shake',   intensity:4, duration:220 },
      { at:400, type:'particle_burst', origin:'actor', color:'#c8b080', count:10, spread:80, direction:'all', duration:320 },
    ],
  },

// ── rally_cry ───────────────────────────────────────────────────────────
  // STR buff to all allies. Golden shout radiates from actor; two staggered
  // particle pulses simulate the cry landing on each ally in sequence.
  rally_cry: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffd060', count:20, spread:60, direction:'up',  duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#dd9900', opacity:0.28, duration:380 },
      { at:200, type:'status_ring',    target:'actor', color:'#ffcc00', duration:700 },
      { at:300, type:'particle_burst', origin:'actor', color:'#ffcc44', count:10, spread:55, direction:'all', duration:380 },
      { at:400, type:'particle_burst', origin:'actor', color:'#ffe066', count:8,  spread:44, direction:'all', duration:320 },
    ],
  },

// ── heroic_surge ────────────────────────────────────────────────────────
  // Last-stand nuke. Red ring on actor signals life force cost; actor
  // trembles as it draws from its remaining HP. Explosive finish.
  heroic_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#cc1100', count:20, spread:50, direction:'all', duration:600 },
      { at:0,   type:'creature_shake', target:'actor',  intensity:4, duration:300 },
      { at:0,   type:'status_ring',    target:'actor',  color:'#ff2200', duration:340 },
      { at:300, type:'sound',          id:'hit-heavy' },
      { at:300, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:480, type:'impact' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:480, type:'particle_burst', origin:'target', color:'#ff2200', count:24, spread:70, direction:'all', duration:560 },
      { at:480, type:'field_flash',    color:'#990000', opacity:0.40, duration:280 },
      { at:480, type:'screen_shake',   intensity:8, duration:300, style:'stutter' },
    ],
  },

// ── temper_3 ────────────────────────────────────────────────────────────
  // Golden explosion upward + secondary burst. Dual ring seals both charges.
  temper_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffd040', count:24, spread:60, direction:'up',  duration:700 },
      { at:200, type:'impact' },
      { at:200, type:'particle_burst', origin:'actor', color:'#ffaa00', count:12, spread:40, direction:'all', duration:400 },
      { at:200, type:'field_flash',    color:'#ffaa00', opacity:0.34, duration:440 },
      { at:200, type:'status_ring',    target:'actor', color:'#ffcc00', duration:900 },
      { at:380, type:'status_ring',    target:'actor', color:'#ffe066', duration:600 },
    ],
  },

// ── final_strike_3 ──────────────────────────────────────────────────────
  final_strike_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#aa0000', count:16, spread:44, direction:'all', duration:520 },
      { at:240, type:'sound',          id:'hit-heavy' },
      { at:240, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:400, type:'impact' },
      { at:400, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:400, type:'particle_burst', origin:'target', color:'#cc0000', count:20, spread:65, direction:'all', duration:500 },
      { at:400, type:'field_flash',    color:'#990000', opacity:0.30, duration:260 },
      { at:400, type:'screen_shake',   intensity:6, duration:260 },
    ],
  },

// ── sweep_3 ─────────────────────────────────────────────────────────────
  // Golden dust storm. Double wave — a second wave chases the first, creating
  // a rolling wall. Stutter shake as both waves crash into the enemy side.
  sweep_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:160 },
      { at:60,  type:'creature_anim',  target:'actor', class:'anim-cast-lunge' },
      { at:80,  type:'wave_sweep',     color:'#d4be90', duration:380 },
      { at:160, type:'wave_sweep',     color:'#e8d4a0', duration:340 },
      { at:300, type:'impact' },
      { at:300, type:'sound',          id:'hit-heavy' },
      { at:300, type:'particle_burst', origin:'actor', color:'#e0d0a0', count:30, spread:130, direction:'all', duration:520 },
      { at:300, type:'field_flash',    color:'#cc9944', opacity:0.32, duration:300 },
      { at:300, type:'screen_shake',   intensity:6, duration:260, style:'stutter' },
    ],
  },

// ── defiant ─────────────────────────────────────────────────────────────
  // Fires only after being hit super-effectively. Actor shakes from the
  // super-effective hit, then snaps back with a white flash and lunges.
  // Stutter shake on impact — the snap-back anger.
  defiant: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:3, duration:160 },
      { at:60,  type:'field_flash',    color:'#ffffff', opacity:0.26, duration:160 },
      { at:60,  type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:220, type:'impact' },
      { at:220, type:'sound',          id:'hit-heavy' },
      { at:220, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:220, type:'particle_burst', origin:'target', color:'#ffffff', count:8,  spread:44, direction:'all', duration:320 },
      { at:220, type:'particle_burst', origin:'target', color:'#cc6600', count:10, spread:54, direction:'all', duration:400 },
      { at:220, type:'field_flash',    color:'#885500', opacity:0.22, duration:200 },
      { at:220, type:'screen_shake',   intensity:5, duration:220, style:'stutter' },
    ],
  },

// ── castlebreaker ───────────────────────────────────────────────────────
  // Armor-crushing strike. Target's DEF is destroyed: target strains during
  // wind-up (shake before impact = armor compressing), then shatters post-impact.
  // Two particle waves — tight burst (compress) then wide shatter.
  castlebreaker: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:2, duration:200 },
      { at:160, type:'creature_shake', target:'target', intensity:3, duration:200 },
      { at:200, type:'sound',          id:'hit-heavy' },
      { at:200, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:380, type:'particle_burst', origin:'target', color:'#8866cc', count:10, spread:28, direction:'all', duration:300 },
      { at:380, type:'field_flash',    color:'#442288', opacity:0.28, duration:280 },
      { at:380, type:'screen_shake',   intensity:5, duration:240 },
      { at:480, type:'particle_burst', origin:'target', color:'#2244aa', count:14, spread:62, direction:'all', duration:440 },
      { at:480, type:'creature_shake', target:'target', intensity:4, duration:200 },
    ],
  },

// ── counter_strike ──────────────────────────────────────────────────────
  // Auto-fires after Brace absorbs a hit. A snap-back reaction — instant white
  // flash signals the trigger, then the actor is already lunging. Fastest skill.
  counter_strike: {
    timeline: [
      { at:0,   type:'field_flash',    color:'#ffffff', opacity:0.22, duration:120 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:80,  type:'sound',          id:'hit-light' },
      { at:100, type:'impact' },
      { at:100, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:100, type:'particle_burst', origin:'target', color:'#ddbb44', count:12, spread:48, direction:'all', duration:360 },
      { at:100, type:'field_flash',    color:'#886600', opacity:0.20, duration:200 },
      { at:100, type:'screen_shake',   intensity:3, duration:180 },
    ],
  },

// ── courage_strike_execute ───────────────────────────────────────────────
  // Release turn: stored energy unleashes. Target gets an anticipation shake
  // just before the lunge arrives. Massive double-burst on impact.
  courage_strike_execute: {
    timeline: [
      { at:0,   type:'sound',          id:'hit-heavy' },
      { at:0,   type:'screen_shake',   intensity:4, duration:150 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:160, type:'creature_shake', target:'target', intensity:3, duration:180 },
      { at:240, type:'impact' },
      { at:240, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:240, type:'particle_burst', origin:'target', color:'#ff3300', count:20, spread:70, direction:'all', duration:600 },
      { at:240, type:'particle_burst', origin:'target', color:'#ffaa00', count:12, spread:45, direction:'all', duration:450 },
      { at:240, type:'field_flash',    color:'#660000', opacity:0.35, duration:320 },
      { at:240, type:'screen_shake',   intensity:7, duration:300 },
    ],
  }

});
