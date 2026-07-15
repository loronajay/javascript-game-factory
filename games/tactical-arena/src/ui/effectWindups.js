// Caster anticipation primitives. Windups are awaited so cause precedes effect:
// gather casts converge into a glowing core; toss casts lean back before release.

export function createEffectWindups({
  effectsLayer,
  reducedMotion,
  svg,
  waitForAnimation,
  unitBase,
  unitElement,
  effectPoint,
  sound,
}) {
  async function castWindup(actor, vfx) {
    if (reducedMotion() || !actor) return;
    const windup = vfx.windup ?? {};
    const colors = vfx.colors ?? { core: "#f7e27d", trail: "#8a6d3a" };
    const duration = windup.durationMs ?? 420;
    const count = windup.particleCount ?? 9;
    const focus = effectPoint(actor.position, windup.lift ?? 26);
    const ground = unitBase(actor.position);
    sound.play("castCharge");
    const animations = [];

    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 30 + (i % 3) * 12;
      const startX = focus.x + Math.cos(angle) * dist;
      const startY = focus.y + Math.sin(angle) * dist * 0.6;
      const midX = startX + (focus.x - startX) * 0.55;
      const midY = startY + (focus.y - startY) * 0.55;
      const mote = svg("circle", {
        class: "fx-mote",
        cx: 0,
        cy: 0,
        r: 1.8 + (i % 2),
        fill: i % 2 ? colors.trail : colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(mote);
      const animation = mote.animate([
        { transform: `translate(${startX}px, ${startY}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${midX}px, ${midY}px) scale(1)`, opacity: 0.95, offset: 0.55 },
        { transform: `translate(${focus.x}px, ${focus.y}px) scale(.35)`, opacity: 0 }
      ], { duration: duration - 40, delay: i * 16, easing: "cubic-bezier(.4,0,.6,1)", fill: "backwards" });
      animations.push(waitForAnimation(animation).then(() => mote.remove()));
    }

    const core = svg("circle", { class: "fx-flash", cx: focus.x, cy: focus.y, r: 2, fill: colors.core, filter: "url(#softGlow)" });
    effectsLayer.appendChild(core);
    animations.push(waitForAnimation(core.animate([
      { r: 2, opacity: 0 },
      { r: 6.5, opacity: 0.95, offset: 0.82 },
      { r: 13, opacity: 0 }
    ], { duration, easing: "ease-in" })).then(() => core.remove()));

    const ring = svg("ellipse", {
      class: "fx-ring",
      cx: ground.x,
      cy: ground.y + 6,
      rx: 26,
      ry: 12,
      stroke: colors.trail,
      filter: "url(#softGlow)"
    });
    effectsLayer.appendChild(ring);
    animations.push(waitForAnimation(ring.animate([
      { rx: 26, ry: 12, opacity: 0, strokeWidth: 1 },
      { rx: 16, ry: 7.5, opacity: 0.7, strokeWidth: 2.5, offset: 0.55 },
      { rx: 7, ry: 3.2, opacity: 0, strokeWidth: 4 }
    ], { duration, easing: "ease-in" })).then(() => ring.remove()));

    const token = unitElement(actor.id);
    if (token) {
      animations.push(waitForAnimation(token.animate([
        { transform: `translate(${ground.x}px, ${ground.y}px) scale(1)` },
        { transform: `translate(${ground.x}px, ${ground.y - 5}px) scale(1.05)`, offset: 0.75 },
        { transform: `translate(${ground.x}px, ${ground.y}px) scale(1)` }
      ], { duration: duration + 60, easing: "ease-in-out" })));
    }

    await Promise.all(animations);
  }

  async function tossWindup(actor, targetPosition) {
    if (reducedMotion() || !actor) return;
    const element = unitElement(actor.id);
    if (!element) return;
    const base = unitBase(actor.position);
    const toward = targetPosition ? unitBase(targetPosition) : { x: base.x + 1, y: base.y };
    const dx = toward.x - base.x;
    const dy = toward.y - base.y;
    const length = Math.hypot(dx, dy) || 1;
    const backX = (-dx / length) * 7;
    const backY = (-dy / length) * 4;

    await element.animate([
      { transform: `translate(${base.x}px, ${base.y}px)` },
      { transform: `translate(${base.x + backX}px, ${base.y + backY - 3}px) rotate(-4deg)`, offset: 0.4 },
      { transform: `translate(${base.x + backX}px, ${base.y + backY - 3}px) rotate(-4deg)`, offset: 0.62 },
      { transform: `translate(${base.x - backX * 0.6}px, ${base.y - backY * 0.4}px) scale(1.06)`, offset: 0.85 },
      { transform: `translate(${base.x}px, ${base.y}px) scale(1)` }
    ], { duration: 320, easing: "cubic-bezier(.3,.7,.3,1)" }).finished.catch(() => {});
  }

  async function playWindup(actor, vfx, targetPosition = null) {
    if (!vfx?.windup) return;
    if (vfx.windup.style === "toss") await tossWindup(actor, targetPosition);
    else await castWindup(actor, vfx);
  }

  return { playWindup };
}
