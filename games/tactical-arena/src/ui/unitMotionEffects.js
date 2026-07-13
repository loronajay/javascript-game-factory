import { getAbilityVfx, getAttackProjectile } from "./vfxCatalog.js";

/**
 * Animates the live SVG unit tokens. Geometry and effect primitives are injected by
 * the effects composition root so this module owns motion sequencing, not DOM wiring.
 */
export function createUnitMotionEffects({
  unitBase,
  unitElement,
  reducedMotion,
  sleep,
  sound,
  flyProjectile,
  playWindup,
  deathBurst,
  shake,
}) {
  // Unit-element motion (Mini-Tactics parity). These animate the actual figurine
  // <g> via the Web Animations API, which temporarily overrides its `transform`
  // and releases back to the element's own transform when finished — so the next
  // full render() snaps it cleanly into place. Each one resolves immediately under
  // reduced-motion (or if the token is gone) so the resolver never stalls.
  // ---------------------------------------------------------------------------

  // Slide a unit from its old tile to its new tile. Called after the board has
  // re-rendered the token at its DESTINATION, so we animate from the old point in.
  // Keyframes use ABSOLUTE board coordinates that match the token's `transform`
  // attribute. A CSS/WAAPI `transform` REPLACES the SVG `transform` attribute (it does
  // not stack on top of it), so a relative `translate(0,0)` resting keyframe would fling
  // the token to the SVG origin (0,0) and snap back — the old "teleport" bug. The final
  // keyframe equals the element's resting `translate(base.x base.y)`, so the token lands
  // exactly where the next render() will place it, with no jump.
  async function animateMovement(unitId, from, to) {
    const element = unitElement(unitId);
    if (!element || reducedMotion()) return;
    const fromBase = unitBase(from);
    const toBase = unitBase(to);
    const midX = (fromBase.x + toBase.x) / 2;
    const midY = (fromBase.y + toBase.y) / 2;
    await element.animate([
      { transform: `translate(${fromBase.x}px, ${fromBase.y}px) scale(1)` },
      { transform: `translate(${midX}px, ${midY - 12}px) scale(1.08)`, offset: 0.55 },
      { transform: `translate(${toBase.x}px, ${toBase.y}px) scale(1)` }
    ], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => {});
  }

  // The attacker commits: a melee fighter lunges a fraction toward the target; a
  // ranged unit fires a REAL projectile (per-unit-type: the Archer's arrow, the
  // Sniper's tracer, a class-colored magic bolt) that flies across to land just as
  // the dice resolve. A rolled attack ART passes its `artId` so its recipe's own
  // `projectile` (Poison Arrow's venom arrow, Spark's blue orb…) replaces the
  // unit's basic shot. Awaited so the strike reads as cause → effect.
  async function animateAttack(attacker, target, ranged, artId = null) {
    const fromBase = unitBase(attacker.position);
    const toBase = unitBase(target.position);
    if (!ranged) {
      const element = unitElement(attacker.id);
      if (!element || reducedMotion()) return;
      // Absolute coords around the attacker's base; delta is a fraction toward the target
      // (a small wind-up away, then a lunge in, then settle back exactly onto the base).
      const deltaX = (toBase.x - fromBase.x) * 0.18;
      const deltaY = (toBase.y - fromBase.y) * 0.18;
      await element.animate([
        { transform: `translate(${fromBase.x}px, ${fromBase.y}px)` },
        { transform: `translate(${fromBase.x - deltaX * 0.3}px, ${fromBase.y - deltaY * 0.3}px)` },
        { transform: `translate(${fromBase.x + deltaX}px, ${fromBase.y + deltaY}px) scale(1.12)` },
        { transform: `translate(${fromBase.x}px, ${fromBase.y}px)` }
      ], { duration: 360, easing: "cubic-bezier(.2,.75,.2,1)" }).finished.catch(() => {});
      return;
    }
    // Ranged: launch whoosh + a real projectile in flight. The hit sound is played
    // by the controller once the roll resolves, so the launch and the land stay
    // distinct. (The projectile flies even on a MISS — the roll reveal after it
    // lands is what tells the player whether it found its mark.) A magic art's
    // recipe windup gathers on the caster before its bolt releases.
    const artVfx = artId ? getAbilityVfx(artId) : null;
    if (!reducedMotion() && artVfx?.windup) await playWindup(attacker, artVfx, target.position);
    sound.play("arrowAirborne");
    if (reducedMotion()) return;
    const spec = artVfx?.projectile ?? getAttackProjectile(attacker.type);
    await flyProjectile(
      { x: fromBase.x, y: fromBase.y - 24 },
      { x: toBase.x, y: toBase.y - 18 },
      spec
    );
  }

  // The target reels from the blow with real hit-stop: it snaps to max displacement
  // fast, FREEZES there for a beat (the frozen frame is what sells the weight), then
  // wobbles back to rest. A crit kicks harder, squashes the token, and holds longer.
  async function hitRecoil(unitId, position, critical) {
    const element = unitElement(unitId);
    if (element && !reducedMotion()) {
      // Absolute coords around the token's base; a wobble that settles back onto it.
      const base = unitBase(position);
      const kick = critical ? 12 : 8;
      const squash = critical ? " scale(1.08, .94)" : "";
      await element.animate([
        { transform: `translate(${base.x}px, ${base.y}px)` },
        { transform: `translate(${base.x - kick}px, ${base.y}px) rotate(-5deg)${squash}`, offset: critical ? 0.16 : 0.2 },
        { transform: `translate(${base.x - kick}px, ${base.y}px) rotate(-5deg)${squash}`, offset: critical ? 0.46 : 0.38 },
        { transform: `translate(${base.x + kick * 0.8}px, ${base.y}px) rotate(4deg)`, offset: 0.72 },
        { transform: `translate(${base.x}px, ${base.y}px)` }
      ], { duration: critical ? 430 : 340, easing: "ease-out" }).finished.catch(() => {});
    }
    if (!reducedMotion()) await sleep(critical ? 120 : 60);
  }

  // The token is launched straight up and drops right back onto its tile — a brief pop
  // for a shockwave/quake (Clod's Thunderous Charge). Absolute coords around the token's
  // base (a CSS transform REPLACES the SVG transform attribute), so the last keyframe
  // equals the resting translate and the next render() snaps it cleanly into place.
  async function knockUp(unitId, position, { height = 30 } = {}) {
    const element = unitElement(unitId);
    if (!element || reducedMotion()) return;
    const base = unitBase(position);
    await element.animate([
      { transform: `translate(${base.x}px, ${base.y}px) scale(1)`, easing: "cubic-bezier(.2,.7,.4,1)" },
      { transform: `translate(${base.x}px, ${base.y - height}px) scale(1.02,1.04)`, offset: 0.4 },
      { transform: `translate(${base.x}px, ${base.y - height * 0.9}px) scale(1.02,1.04)`, offset: 0.52, easing: "cubic-bezier(.5,0,.7,.4)" },
      { transform: `translate(${base.x}px, ${base.y}px) scale(1.1,.9)`, offset: 0.88 },
      { transform: `translate(${base.x}px, ${base.y}px) scale(1)` }
    ], { duration: 520, easing: "ease-in" }).finished.catch(() => {});
  }

  // A defeated figurine dissolves: it squashes, sinks, and fades while its shards
  // burst outward. Runs on the LIVE token before the committing render removes it.
  async function deathDissolve(unitId, position, color) {
    const base = unitBase(position);
    deathBurst(base, color);
    shake(6);
    const element = unitElement(unitId);
    if (!element || reducedMotion()) return;
    // Absolute coords around the token's base; it sinks and shrinks in place.
    await element.animate([
      { transform: `translate(${base.x}px, ${base.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${base.x}px, ${base.y + 8}px) scale(1.12,.7) rotate(8deg)`, opacity: 0.75 },
      { transform: `translate(${base.x}px, ${base.y + 24}px) scale(.2) rotate(30deg)`, opacity: 0 }
    ], { duration: 620, easing: "cubic-bezier(.3,.7,.3,1)" }).finished.catch(() => {});
  }

  return { animateMovement, animateAttack, hitRecoil, knockUp, deathDissolve };
}

