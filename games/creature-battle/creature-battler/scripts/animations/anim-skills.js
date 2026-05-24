// anim-skills.js — Timeline animations for class route skills.
// Skills are class-based, not creature-based, so all animations here are
// element-neutral and use only universal CSS classes (anim-cast-lunge,
// anim-hit-physical) plus JS-driven effects (particle_burst, field_flash, etc.).
// No new CSS file is required.

registerMoveAnimations({

  // ── cleave ──────────────────────────────────────────────────────────────
  // Physical damage ignoring DEF. Fast and surgical — shorter wind-up than
  // a heavy move, silver/steel particle hit sells the "cutting through armor" feel.
  cleave: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-light' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:160, type:'particle_burst', origin:'target', color:'#c8d0e8', count:7, spread:42, direction:'all', duration:320 },
      { at:160, type:'field_flash',    color:'#8899bb', opacity:0.16, duration:160 },
    ],
  },

  // ── temper ──────────────────────────────────────────────────────────────
  // Raises user STR +2 stages. Self-targeting buff — no lunge.
  // Amber particles surge upward from the actor; warm gold field wash signals
  // the power increase. Impact fires mid-surge so the stat change and float
  // text land at the visual peak.
  temper: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#e89030', count:12, spread:44, direction:'up', duration:560 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#cc7700', opacity:0.22, duration:340 },
    ],
  },

  // ── reckless_strike ─────────────────────────────────────────────────────
  // Heaviest physical hit at Tier 1; user takes 10% max HP recoil.
  // Wind-up: actor trembles visibly before committing to the lunge.
  // Landing: heavy screen stutter + burst; actor staggers backward (post-impact
  // shake) to sell the recoil cost.
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
  // Physical damage that scales with the user's missing HP. Red particles
  // radiating from the actor during wind-up hint at the user burning their
  // own life force — the red field wash on impact reinforces it.
  // No HP-conditional branching in the animation; the damage number tells
  // the story.
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
  // Bonus damage when target is below 30% HP. Dark/void feel — the animation
  // looks like an execution regardless of HP state; the damage spike and
  // potential KO message carry the "finisher" weight.
  // Two-layer particle burst: dark void particles + purple accent, giving a
  // sinister, deliberate impact that differs clearly from plain physical hits.
  finishing_blow: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-heavy' },
      { at:180, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:180, type:'particle_burst', origin:'target', color:'#1a001a', count:12, spread:55, direction:'all', duration:460 },
      { at:180, type:'particle_burst', origin:'target', color:'#cc00aa', count:6,  spread:32, direction:'all', duration:360 },
      { at:180, type:'field_flash',    color:'#330022', opacity:0.30, duration:280 },
    ],
  },

  // ── cleave_2 ────────────────────────────────────────────────────────────────
  cleave_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:140, type:'impact' },
      { at:140, type:'sound',          id:'hit-light' },
      { at:140, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:140, type:'particle_burst', origin:'target', color:'#c8d0e8', count:10, spread:48, direction:'all', duration:320 },
      { at:140, type:'field_flash',    color:'#8899bb', opacity:0.20, duration:180 },
    ],
  },

  // ── cleave_3 ────────────────────────────────────────────────────────────────
  cleave_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:120, type:'impact' },
      { at:120, type:'sound',          id:'hit-heavy' },
      { at:120, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:120, type:'particle_burst', origin:'target', color:'#c8d0e8', count:14, spread:54, direction:'all', duration:340 },
      { at:120, type:'field_flash',    color:'#6688cc', opacity:0.24, duration:200 },
      { at:120, type:'screen_shake',   intensity:3, duration:200 },
    ],
  },

  // ── reckless_strike_2 ───────────────────────────────────────────────────────
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

  // ── reckless_strike_3 ───────────────────────────────────────────────────────
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

  // ── power_through ───────────────────────────────────────────────────────────
  // Strike + drain. Green particle burst on target; second burst rising from
  // actor afterward sells the HP flowing back.
  power_through: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-light' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:160, type:'particle_burst', origin:'target', color:'#88cc44', count:10, spread:50, direction:'all', duration:400 },
      { at:160, type:'field_flash',    color:'#448822', opacity:0.18, duration:220 },
      { at:300, type:'particle_burst', origin:'actor',  color:'#88ff44', count:8,  spread:30, direction:'up',  duration:360 },
    ],
  },

  // ── temper_2 ────────────────────────────────────────────────────────────────
  temper_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#f0a040', count:18, spread:52, direction:'up', duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#ee8800', opacity:0.28, duration:380 },
    ],
  },

  // ── temper_3 ────────────────────────────────────────────────────────────────
  // Golden explosion upward + secondary all-direction burst.
  temper_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffd040', count:24, spread:60, direction:'up',  duration:700 },
      { at:200, type:'impact' },
      { at:200, type:'particle_burst', origin:'actor', color:'#ffaa00', count:12, spread:40, direction:'all', duration:400 },
      { at:200, type:'field_flash',    color:'#ffaa00', opacity:0.34, duration:440 },
    ],
  },

  // ── final_strike_2 ──────────────────────────────────────────────────────────
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

  // ── final_strike_3 ──────────────────────────────────────────────────────────
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

  // ── war_stance ──────────────────────────────────────────────────────────────
  // Red power surge (STR up) followed by blue flicker (SPD down).
  war_stance: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#dd4422', count:16, spread:50, direction:'up',  duration:560 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#cc3300', opacity:0.24, duration:340 },
      { at:340, type:'particle_burst', origin:'actor', color:'#2244cc', count:8,  spread:30, direction:'all', duration:360 },
      { at:340, type:'field_flash',    color:'#223388', opacity:0.12, duration:240 },
    ],
  },

  // ── sweep ───────────────────────────────────────────────────────────────────
  // AoE sweep — wide particle spread from actor reads as multi-target.
  sweep: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:180, type:'impact' },
      { at:180, type:'sound',          id:'hit-light' },
      { at:180, type:'particle_burst', origin:'actor', color:'#d4c0a0', count:18, spread:80, direction:'all', duration:420 },
      { at:180, type:'field_flash',    color:'#aa9970', opacity:0.20, duration:240 },
    ],
  },

  // ── sweep_2 ─────────────────────────────────────────────────────────────────
  sweep_2: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-heavy' },
      { at:160, type:'particle_burst', origin:'actor', color:'#d4c0a0', count:24, spread:90, direction:'all', duration:460 },
      { at:160, type:'field_flash',    color:'#aa9970', opacity:0.26, duration:260 },
      { at:160, type:'screen_shake',   intensity:3, duration:200 },
    ],
  },

  // ── sweep_3 ─────────────────────────────────────────────────────────────────
  // Golden dust storm — widest spread, hardest shake.
  sweep_3: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:140, type:'impact' },
      { at:140, type:'sound',          id:'hit-heavy' },
      { at:140, type:'particle_burst', origin:'actor', color:'#e0d0a0', count:30, spread:100, direction:'all', duration:520 },
      { at:140, type:'field_flash',    color:'#cc9944', opacity:0.30, duration:300 },
      { at:140, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── rally_cry ───────────────────────────────────────────────────────────────
  // Golden upward burst + warm field wash. Reads as a rallying shout.
  rally_cry: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor', color:'#ffd060', count:20, spread:60, direction:'up',  duration:600 },
      { at:200, type:'impact' },
      { at:200, type:'field_flash',    color:'#dd9900', opacity:0.26, duration:380 },
      { at:320, type:'particle_burst', origin:'actor', color:'#ffcc44', count:12, spread:44, direction:'all', duration:380 },
    ],
  },

  // ── heroic_surge ────────────────────────────────────────────────────────────
  // Last-stand attack. Long wind-up with actor burning red; explosive finish.
  heroic_surge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#cc1100', count:20, spread:50, direction:'all', duration:600 },
      { at:0,   type:'creature_shake', target:'actor',  intensity:4, duration:300 },
      { at:300, type:'sound',          id:'hit-heavy' },
      { at:300, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:480, type:'impact' },
      { at:480, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:480, type:'particle_burst', origin:'target', color:'#ff2200', count:24, spread:70, direction:'all', duration:560 },
      { at:480, type:'field_flash',    color:'#990000', opacity:0.40, duration:280 },
      { at:480, type:'screen_shake',   intensity:8, duration:300, style:'stutter' },
    ],
  },

  // ── defiant ─────────────────────────────────────────────────────────────────
  // Conditional counter-strike. If the condition isn't met the move fizzles and
  // no animation plays (the engine returns no_activate before onImpact). When it
  // does fire, a brief white-hot flash precedes the lunge — visually reads as
  // "snapping back" at the super-effective hit.
  defiant: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'field_flash',    color:'#ffffff', opacity:0.20, duration:160 },
      { at:0,   type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:160, type:'impact' },
      { at:160, type:'sound',          id:'hit-heavy' },
      { at:160, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:160, type:'particle_burst', origin:'target', color:'#ffffff', count:8,  spread:44, direction:'all', duration:320 },
      { at:160, type:'particle_burst', origin:'target', color:'#cc6600', count:10, spread:54, direction:'all', duration:400 },
      { at:160, type:'field_flash',    color:'#885500', opacity:0.22, duration:200 },
      { at:160, type:'screen_shake',   intensity:4, duration:200 },
    ],
  },

  // ── castlebreaker ───────────────────────────────────────────────────────────
  // Armor-crushing strike. Purple/blue palette reads as "breaking fortification."
  castlebreaker: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:2, duration:200 },
      { at:200, type:'sound',          id:'hit-heavy' },
      { at:200, type:'creature_anim',  target:'actor',  class:'anim-cast-lunge', lunge:true },
      { at:380, type:'impact' },
      { at:380, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:380, type:'particle_burst', origin:'target', color:'#8866cc', count:14, spread:58, direction:'all', duration:500 },
      { at:380, type:'particle_burst', origin:'target', color:'#2244aa', count:8,  spread:36, direction:'all', duration:380 },
      { at:380, type:'field_flash',    color:'#442288', opacity:0.28, duration:280 },
      { at:380, type:'screen_shake',   intensity:5, duration:240 },
    ],
  },

  // ── challenge ───────────────────────────────────────────────────────────────
  // Taunting point at the target. No damage — red flash at target + aggressive
  // actor flash sells the dare. Short timeline, high readability.
  challenge: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'field_flash',    color:'#cc2200', opacity:0.18, duration:180 },
      { at:80,  type:'impact' },
      { at:80,  type:'particle_burst', origin:'target', color:'#ff4422', count:8,  spread:40, direction:'all', duration:300 },
      { at:80,  type:'creature_anim',  target:'target', class:'anim-hit-physical' },
    ],
  },

  // ── brace ───────────────────────────────────────────────────────────────────
  // User braces for impact. Heavy blue-gray surging inward toward the actor.
  // No lunge — the actor plants feet. Impact fires as the shield-glow lands.
  brace: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'particle_burst', origin:'actor',   color:'#6688cc', count:10, spread:30, direction:'all', duration:400 },
      { at:0,   type:'field_flash',    color:'#334466', opacity:0.20, duration:300 },
      { at:120, type:'impact' },
      { at:120, type:'creature_anim',  target:'actor',  class:'anim-hit-physical' },
    ],
  },

  // ── counter_strike ──────────────────────────────────────────────────────────
  // Auto-fires after Brace absorbs a hit. Explosive immediate lunge —
  // no wind-up since the setup already happened on the previous turn.
  counter_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'hit-light' },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:100, type:'impact' },
      { at:100, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:100, type:'particle_burst', origin:'target', color:'#ddbb44', count:12, spread:48, direction:'all', duration:360 },
      { at:100, type:'field_flash',    color:'#886600', opacity:0.20, duration:200 },
      { at:100, type:'screen_shake',   intensity:3, duration:180 },
    ],
  },

  // ── courage_strike ──────────────────────────────────────────────────────────
  // Wind-up turn: user pays 50% HP. Deep red surge inward, actor shakes —
  // no lunge, no target hit. Impact fires on the actor for the self-cost visual.
  courage_strike: {
    timeline: [
      { at:0,   type:'sound',          id:'charge-light' },
      { at:0,   type:'creature_shake', target:'actor',  intensity:3, duration:350 },
      { at:0,   type:'particle_burst', origin:'actor',  color:'#cc1111', count:12, spread:34, direction:'all', duration:500 },
      { at:0,   type:'field_flash',    color:'#550000', opacity:0.22, duration:400 },
      { at:180, type:'impact' },
    ],
  },

  // ── courage_strike_execute ───────────────────────────────────────────────────
  // Release turn: massive explosion. Long escalating shake + double particle
  // layer + full-screen flash sell the stored energy unleashing.
  courage_strike_execute: {
    timeline: [
      { at:0,   type:'sound',          id:'hit-heavy' },
      { at:0,   type:'screen_shake',   intensity:4, duration:150 },
      { at:0,   type:'creature_anim',  target:'actor', class:'anim-cast-lunge', lunge:true },
      { at:220, type:'impact' },
      { at:220, type:'creature_anim',  target:'target', class:'anim-hit-physical' },
      { at:220, type:'particle_burst', origin:'target', color:'#ff3300', count:20, spread:70, direction:'all', duration:600 },
      { at:220, type:'particle_burst', origin:'target', color:'#ffaa00', count:12, spread:45, direction:'all', duration:450 },
      { at:220, type:'field_flash',    color:'#660000', opacity:0.35, duration:320 },
      { at:220, type:'screen_shake',   intensity:7, duration:300 },
    ],
  },

});
