// anim-skills.js — Timeline animations for class route skills.
// Skills are class-based, not creature-based, so all animations here are
// element-neutral and use only universal CSS classes (anim-cast-lunge,
// anim-hit-physical) plus JS-driven effects (particle_burst, field_flash, etc.).
// No new CSS file is required.
//
// status_ring events: { type:'status_ring', target:'actor'|'target', color, duration }
// Engine fires it, clears after duration ms. Visual-only — does not apply a game status.

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
  },


  // ══════════════════════════════════════════════════════════════════════════
  // DEFENSE ROUTE — Beefcake → Brolic → Garrison → Vigorous → Aegis
  // Palette: steel blue / slate / silver / deep teal for defensive moves;
  //          cool white for barriers and shields; amber/copper for recovery.
  // ══════════════════════════════════════════════════════════════════════════

  // ── T1: Beefcake ─────────────────────────────────────────────────────────

  // ── rampart ──────────────────────────────────────────────────────────────
  // Raises a barrier absorbing 15% max HP of incoming damage. Actor settles
  // into a guard stance — steel-blue particles collapse inward, then a
  // blue ring seals the barrier layer around the body.
  rampart: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#4488cc', count:12, spread:38, direction:'all', duration:500 },
      { at:160, type:'impact' },
      { at:160, type:'field_flash',    color:'#224466', opacity:0.22, duration:320 },
      { at:160, type:'status_ring',    target:'actor', color:'#5599dd', duration:800 },
    ],
  },

  // ── thick_skin ──────────────────────────────────────────────────────────
  // DEF +2 for 2 turns. Slate particles surge upward; a silver ring locks in
  // the hardened hide.
  thick_skin: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#aabbcc', count:12, spread:40, direction:'up', duration:540 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#4455aa', opacity:0.18, duration:300 },
      { at:200, type:'status_ring',    target:'actor', color:'#88aabb', duration:700 },
    ],
  },

  // ── shield_bash ──────────────────────────────────────────────────────────
  // Physical hit + STR -1 on target. Hard shoulder check — actor charges
  // directly in. Silver burst on contact; a blue ring on target flags the debuff.
  shield_bash: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-heavy' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:160, type:'particle_burst', origin:'target', color:'#c0ccdd', count:12, spread:50, direction:'all', duration:380 },
      { at:160, type:'field_flash',    color:'#334466', opacity:0.22, duration:220 },
      { at:160, type:'screen_shake',   intensity:4, duration:200 },
      { at:280, type:'status_ring',    target:'target', color:'#4488cc', duration:560 },
    ],
  },

  // ── recover ──────────────────────────────────────────────────────────────
  // Restores 25% max HP. Amber warmth surges upward — natural recuperation.
  recover: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc9933', count:14, spread:44, direction:'up', duration:580 },
      { at:240, type:'impact' },
      { at:240, type:'field_flash',    color:'#886622', opacity:0.20, duration:340 },
      { at:240, type:'status_ring',    target:'actor', color:'#ddaa44', duration:700 },
    ],
  },

  // ── counter_stance ────────────────────────────────────────────────────────
  // Braces to halve incoming physical hits; auto-fires counter_stance_counter.
  // Deep-teal particles swirl inward (pulling power in), then a long ring
  // signals the reactive stance is set.
  counter_stance: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#226688', count:14, spread:40, direction:'all', duration:480 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:220 },
      { at:180, type:'impact' },
      { at:180, type:'field_flash',    color:'#113344', opacity:0.24, duration:340 },
      { at:180, type:'status_ring',    target:'actor', color:'#2288aa', duration:900 },
    ],
  },

  // ── counter_stance_counter ────────────────────────────────────────────────
  // Auto-fires when Counter Stance absorbs a hit. Snap-back reaction —
  // teal flash triggers the instinct, then the actor is already lunging.
  counter_stance_counter: {
    timeline: [
      { at:0,   type:'field_flash',    color:'#44bbcc', opacity:0.24, duration:120 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:80,  type:'sound',          id:'hit-light' },
      { at:100, type:'impact' },
      { at:100, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:100, type:'particle_burst', origin:'target', color:'#66bbcc', count:12, spread:50, direction:'all', duration:380 },
      { at:100, type:'field_flash',    color:'#226677', opacity:0.22, duration:220 },
      { at:100, type:'screen_shake',   intensity:3, duration:180 },
    ],
  },

  // ── T2: Brolic ────────────────────────────────────────────────────────────

  // ── taunt ────────────────────────────────────────────────────────────────
  // Forces target to use only offensive moves against this creature. Actor
  // plants and bellows — a steel-blue pressure wave hits the target. Blue
  // taunt ring (distinct from Strength's red challenge ring).
  taunt: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:3, duration:200 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#4488cc', count:10, spread:36, direction:'all', duration:380 },
      { at:80,  type:'impact' },
      { at:80,  type:'creature_shake', target:'target', intensity:4, duration:200 },
      { at:80,  type:'particle_burst', origin:'target', color:'#3377bb', count:8,  spread:42, direction:'all', duration:300 },
      { at:80,  type:'status_ring',    target:'target', color:'#2266cc', duration:700 },
      { at:80,  type:'creature_anim',  target:'target', class:'anim-hit-physical' },
    ],
  },

  // ── thick_skin_2 ──────────────────────────────────────────────────────────
  // DEF +2 for 3 turns. Bigger, brighter; secondary burst seals the extra turn.
  thick_skin_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#bbccdd', count:18, spread:50, direction:'up', duration:580 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#3355aa', opacity:0.24, duration:340 },
      { at:200, type:'status_ring',    target:'actor', color:'#99bbcc', duration:800 },
      { at:380, type:'particle_burst', origin:'actor', color:'#aabbcc', count:8,  spread:30, direction:'all', duration:340 },
    ],
  },

  // ── grit ─────────────────────────────────────────────────────────────────
  // DEF +3 for 1 turn; costs 8% HP. Actor strains — pain flash, then
  // willpower surges in blue. Red ring for HP cost, blue ring for the boost.
  grit: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:240 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc4422', count:6,  spread:24, direction:'all', duration:280 },
      { at:160, type:'sound',          id:'hit-light' },
      { at:200, type:'particle_burst', origin:'actor', color:'#3366bb', count:20, spread:52, direction:'up',  duration:600 },
      { at:280, type:'impact' },
      { at:280, type:'field_flash',    color:'#223366', opacity:0.26, duration:340 },
      { at:280, type:'status_ring',    target:'actor', color:'#cc4422', duration:260 },
      { at:420, type:'status_ring',    target:'actor', color:'#4477bb', duration:700 },
    ],
  },

  // ── body_check ────────────────────────────────────────────────────────────
  // DEF-scaled physical hit. A bulldozing bulk charge — heavier plume than
  // shield_bash (body weight, not a shield edge). Gray-blue dust on impact.
  body_check: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:180 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:200, type:'impact' },
      { at:200, type:'sound',          id:'hit-heavy' },
      { at:200, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:200, type:'particle_burst', origin:'target', color:'#8899aa', count:16, spread:58, direction:'all', duration:440 },
      { at:200, type:'field_flash',    color:'#445566', opacity:0.24, duration:260 },
      { at:200, type:'screen_shake',   intensity:5, duration:240 },
      { at:360, type:'creature_shake', target:'target', intensity:4, duration:200 },
    ],
  },

  // ── stand_firm ────────────────────────────────────────────────────────────
  // Once-per-battle: next physical hit reduced to 50% damage. Actor locks
  // into an iron stance — deep silver field surge; solid white ring signals
  // total commitment. A secondary burst seals it shut.
  stand_firm: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#c8d4e0', count:16, spread:44, direction:'all', duration:520 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:200 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#334455', opacity:0.30, duration:380 },
      { at:200, type:'status_ring',    target:'actor', color:'#dde4ec', duration:1000 },
      { at:360, type:'particle_burst', origin:'actor', color:'#ffffff', count:8,  spread:30, direction:'all', duration:340 },
    ],
  },

  // ── T3: Garrison ──────────────────────────────────────────────────────────

  // ── retaliation ──────────────────────────────────────────────────────────
  // Sets stance: auto-counter after each physical hit received (up to 3/turn).
  // Teal-green particles coil around the actor in a tensed counter posture.
  // Dual ring pulses signal the multi-counter readiness.
  retaliation: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#228877', count:14, spread:42, direction:'all', duration:520 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:220 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#114433', opacity:0.24, duration:360 },
      { at:200, type:'status_ring',    target:'actor', color:'#33aa88', duration:700 },
      { at:360, type:'particle_burst', origin:'actor', color:'#44bbaa', count:8,  spread:28, direction:'up',  duration:360 },
      { at:480, type:'status_ring',    target:'actor', color:'#55ccaa', duration:500 },
    ],
  },

  // ── retaliation_counter ───────────────────────────────────────────────────
  // Auto-fires after each physical hit while Retaliation is active.
  // Faster and lighter than counter_stance_counter — a quick reflex snap.
  retaliation_counter: {
    timeline: [
      { at:0,   type:'field_flash',    color:'#33bbaa', opacity:0.20, duration:100 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:70,  type:'sound',          id:'hit-light' },
      { at:90,  type:'impact' },
      { at:90,  type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:90,  type:'particle_burst', origin:'target', color:'#44bb99', count:10, spread:44, direction:'all', duration:340 },
      { at:90,  type:'field_flash',    color:'#115544', opacity:0.18, duration:180 },
    ],
  },

  // ── recover_2 ────────────────────────────────────────────────────────────
  // 35% HP restore. Larger amber burst; ring persists longer; trailing surge.
  recover_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#dd9922', count:20, spread:52, direction:'up', duration:620 },
      { at:240, type:'impact' },
      { at:240, type:'field_flash',    color:'#997733', opacity:0.24, duration:380 },
      { at:240, type:'status_ring',    target:'actor', color:'#eebb44', duration:800 },
      { at:400, type:'particle_burst', origin:'actor', color:'#ffcc66', count:8,  spread:30, direction:'all', duration:360 },
    ],
  },

  // ── damage_store ──────────────────────────────────────────────────────────
  // Defers all incoming physical damage to a pool; releases it next round as
  // a strike. Actor seems to absorb blows into itself — particles drawn inward,
  // deep teal field, a slow pulsing ring that reads as held-back pain.
  damage_store: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#226699', count:16, spread:50, direction:'all', duration:560 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#112244', opacity:0.28, duration:400 },
      { at:200, type:'status_ring',    target:'actor', color:'#3377cc', duration:1000 },
      { at:400, type:'particle_burst', origin:'actor', color:'#4488bb', count:8,  spread:28, direction:'all', duration:360 },
    ],
  },

  // ── damage_store_strike ───────────────────────────────────────────────────
  // Auto-fires next round, releasing stored damage as a physical strike.
  // Compressed energy explodes outward — actor shakes as it vents,
  // then lunges with the built-up force.
  damage_store_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:200 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#2255aa', count:12, spread:34, direction:'all', duration:400 },
      { at:180, type:'sound',          id:'hit-heavy' },
      { at:180, type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:340, type:'particle_burst', origin:'target', color:'#3366bb', count:18, spread:62, direction:'all', duration:480 },
      { at:340, type:'field_flash',    color:'#1a2d55', opacity:0.32, duration:280 },
      { at:340, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── meditate ─────────────────────────────────────────────────────────────
  // Restores 8% HP immediately + 25% physical reduction this turn. A moment
  // of stillness — silver-white particles drift softly upward (settling,
  // not surging). Calm ring. No aggressive motion.
  meditate: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#dde4ee', count:16, spread:44, direction:'up', duration:600 },
      { at:0,   type:'creature_shake', target:'actor', intensity:1, duration:180 },
      { at:220, type:'impact' },
      { at:220, type:'field_flash',    color:'#556677', opacity:0.18, duration:380 },
      { at:220, type:'status_ring',    target:'actor', color:'#c4d0e0', duration:900 },
      { at:380, type:'particle_burst', origin:'actor', color:'#eef4ff', count:6,  spread:26, direction:'all', duration:400 },
    ],
  },

  // ── shield_wall ───────────────────────────────────────────────────────────
  // Team-wide 15% physical reduction for 2 turns. A broad barrier expands
  // from the actor across the whole ally side — three staggered particle waves
  // simulate the wall spreading outward. Wide spread on all bursts.
  shield_wall: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:200 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#3366bb', count:22, spread:80, direction:'all', duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#1a2d55', opacity:0.30, duration:440 },
      { at:200, type:'status_ring',    target:'actor', color:'#4477cc', duration:1000 },
      { at:340, type:'particle_burst', origin:'actor', color:'#6699dd', count:14, spread:90, direction:'all', duration:480 },
      { at:480, type:'particle_burst', origin:'actor', color:'#99bbee', count:8,  spread:60, direction:'all', duration:360 },
    ],
  },

  // ── T4: Vigorous ─────────────────────────────────────────────────────────

  // ── rampart_2 ────────────────────────────────────────────────────────────
  // Barrier HP at 25% max HP — larger and more solid. Blue-white particles
  // pack tighter around the actor; a stronger, brighter ring; trailing burst.
  rampart_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#5599cc', count:18, spread:48, direction:'all', duration:560 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:200 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#1a3355', opacity:0.28, duration:380 },
      { at:200, type:'status_ring',    target:'actor', color:'#77aadd', duration:1000 },
      { at:360, type:'particle_burst', origin:'actor', color:'#aaccee', count:10, spread:34, direction:'all', duration:380 },
    ],
  },

  // ── shield_bash_2 ─────────────────────────────────────────────────────────
  // Guaranteed STR -1 for 2 turns. More deliberate — actor winds up with a
  // shake before committing. Wider burst and longer status ring than T1.
  shield_bash_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:200 },
      { at:180, type:'sound',          id:'hit-heavy' },
      { at:180, type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:340, type:'impact' },
      { at:340, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:340, type:'particle_burst', origin:'target', color:'#b0c4dc', count:16, spread:56, direction:'all', duration:420 },
      { at:340, type:'field_flash',    color:'#223355', opacity:0.26, duration:260 },
      { at:340, type:'screen_shake',   intensity:5, duration:240 },
      { at:460, type:'status_ring',    target:'target', color:'#3377bb', duration:700 },
      { at:460, type:'creature_shake', target:'target', intensity:3, duration:200 },
    ],
  },

  // ── last_bastion ──────────────────────────────────────────────────────────
  // DEF +2 for all allies, costs 20% HP. Actor sacrifices endurance to shield
  // the team — red flicker for the HP cost, then blue energy floods outward.
  last_bastion: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:260 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#cc3322', count:8,  spread:26, direction:'all', duration:280 },
      { at:160, type:'sound',          id:'hit-light' },
      { at:200, type:'particle_burst', origin:'actor', color:'#3366cc', count:26, spread:90, direction:'all', duration:640 },
      { at:280, type:'impact' },
      { at:280, type:'field_flash',    color:'#1122aa', opacity:0.28, duration:420 },
      { at:280, type:'status_ring',    target:'actor', color:'#5588dd', duration:900 },
      { at:440, type:'particle_burst', origin:'actor', color:'#88aae8', count:14, spread:70, direction:'all', duration:440 },
    ],
  },

  // ── absorb ───────────────────────────────────────────────────────────────
  // Redirects hits aimed at allies to self at 60% damage. Actor steps forward
  // into the path — a deep-blue shield aura pulses outward toward the ally
  // side. Long ring signals the intercept stance.
  absorb: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#2255aa', count:18, spread:52, direction:'all', duration:520 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:200 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#0f1f44', opacity:0.30, duration:360 },
      { at:200, type:'status_ring',    target:'actor', color:'#2266cc', duration:1000 },
      { at:360, type:'particle_burst', origin:'actor', color:'#5599ee', count:10, spread:38, direction:'all', duration:380 },
    ],
  },

  // ── total_defense ─────────────────────────────────────────────────────────
  // Zeroes all physical damage for 1 turn. The most complete guard stance —
  // cool-white surge, near-white field flash, dual rings for the absolute block.
  total_defense: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#e0eaf8', count:22, spread:56, direction:'all', duration:580 },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:260 },
      { at:220, type:'impact' },
      { at:220, type:'field_flash',    color:'#ffffff', opacity:0.30, duration:360 },
      { at:220, type:'status_ring',    target:'actor', color:'#ffffff', duration:900 },
      { at:380, type:'particle_burst', origin:'actor', color:'#c0d8ff', count:14, spread:42, direction:'all', duration:420 },
      { at:500, type:'status_ring',    target:'actor', color:'#aaccff', duration:600 },
    ],
  },

  // ── T5: Aegis ────────────────────────────────────────────────────────────

  // ── recover_3 ────────────────────────────────────────────────────────────
  // 50% HP restore. Grand amber recovery — triple burst, glowing ring.
  recover_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#e8aa33', count:28, spread:60, direction:'up',  duration:680 },
      { at:0,   type:'creature_shake', target:'actor', intensity:1, duration:180 },
      { at:240, type:'impact' },
      { at:240, type:'field_flash',    color:'#aa8800', opacity:0.30, duration:440 },
      { at:240, type:'status_ring',    target:'actor', color:'#ffcc44', duration:900 },
      { at:400, type:'particle_burst', origin:'actor', color:'#ffdd88', count:16, spread:50, direction:'all', duration:440 },
      { at:520, type:'particle_burst', origin:'actor', color:'#ffd055', count:8,  spread:36, direction:'up',  duration:340 },
    ],
  },

  // ── shield_bash_3 ─────────────────────────────────────────────────────────
  // STR -1 for 3 turns. The definitive armor-shattering bash — wide silver
  // explosion, stutter screen shake, extended status ring.
  shield_bash_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:260 },
      { at:240, type:'sound',          id:'hit-heavy' },
      { at:240, type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:400, type:'impact' },
      { at:400, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:400, type:'particle_burst', origin:'target', color:'#d0dde8', count:22, spread:64, direction:'all', duration:480 },
      { at:400, type:'field_flash',    color:'#1a2d44', opacity:0.30, duration:300 },
      { at:400, type:'screen_shake',   intensity:7, duration:280, style:'stutter' },
      { at:540, type:'status_ring',    target:'target', color:'#2266aa', duration:900 },
      { at:540, type:'creature_shake', target:'target', intensity:4, duration:240 },
    ],
  },

  // ── iron_fortress ─────────────────────────────────────────────────────────
  // Once-per-battle: DEF +4 permanent + max HP +15%. The ultimate defensive
  // transformation — monumental silver explosion, heavy screen shake, dual rings.
  iron_fortress: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor', intensity:4, duration:360 },
      { at:0,   type:'particle_burst', origin:'actor', color:'#8899bb', count:20, spread:54, direction:'up',  duration:640 },
      { at:200, type:'sound',          id:'hit-heavy' },
      { at:280, type:'particle_burst', origin:'actor', color:'#d0dce8', count:30, spread:72, direction:'all', duration:680 },
      { at:360, type:'impact' },
      { at:360, type:'field_flash',    color:'#334466', opacity:0.38, duration:460 },
      { at:360, type:'status_ring',    target:'actor', color:'#aabbcc', duration:1000 },
      { at:360, type:'screen_shake',   intensity:5, duration:300 },
      { at:560, type:'particle_burst', origin:'actor', color:'#ffffff', count:18, spread:60, direction:'all', duration:480 },
      { at:700, type:'status_ring',    target:'actor', color:'#ddeeff', duration:700 },
    ],
  },

  // ── counter_surge ─────────────────────────────────────────────────────────
  // Consumes Counter Stance's absorbed damage as bonus power. Compressed energy
  // releases all at once — dark-blue burst, then explosive lunge. Heavier the
  // absorption, the more satisfying the payoff.
  counter_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#224488', count:16, spread:38, direction:'all', duration:480 },
      { at:0,   type:'creature_shake', target:'actor', intensity:3, duration:260 },
      { at:220, type:'sound',          id:'hit-heavy' },
      { at:220, type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:380, type:'particle_burst', origin:'target', color:'#3355cc', count:20, spread:66, direction:'all', duration:520 },
      { at:380, type:'particle_burst', origin:'target', color:'#99bbff', count:10, spread:42, direction:'all', duration:400 },
      { at:380, type:'field_flash',    color:'#112266', opacity:0.36, duration:300 },
      { at:380, type:'screen_shake',   intensity:6, duration:280 },
    ],
  },

  // ── aegis_shield ──────────────────────────────────────────────────────────
  // Zeroes all physical damage; offensive moves also disabled for 1 turn.
  // The supreme defensive posture — pure cool-white aura. Actor becomes
  // untouchable. Triple-ring sequence seals the total stasis.
  aegis_shield: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#eef4ff', count:26, spread:62, direction:'all', duration:640 },
      { at:0,   type:'creature_shake', target:'actor', intensity:2, duration:180 },
      { at:220, type:'impact' },
      { at:220, type:'field_flash',    color:'#ffffff', opacity:0.38, duration:420 },
      { at:220, type:'status_ring',    target:'actor', color:'#ffffff', duration:1000 },
      { at:380, type:'particle_burst', origin:'actor', color:'#ddeeff', count:16, spread:46, direction:'all', duration:480 },
      { at:500, type:'status_ring',    target:'actor', color:'#c8e0ff', duration:800 },
      { at:640, type:'status_ring',    target:'actor', color:'#aacce8', duration:600 },
    ],
  },

});
