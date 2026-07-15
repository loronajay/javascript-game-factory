// Nothing here touches authoritative state — every animation is fire-and-forget and
// goes silent (no transform left behind) under prefers-reduced-motion.

import { getAbilityVfx, getImpactVfx, getStatusVfx } from "./vfxCatalog.js";
import { createEffectProjectiles } from "./effectProjectiles.js";
import { createEffectWindups } from "./effectWindups.js";
import { createUnitMotionEffects } from "./unitMotionEffects.js";
import { reducedMotion, sleep, svg, waitForAnimation } from "./effectDom.js";
import { createEffectEnvironment } from "./effectEnvironment.js";

export function createEffects({ board, unitsLayer, effectsLayer, diceOverlay, dieFace, metrics, audio }) {
  const sound = audio ?? { play() {} };
  const { setMetrics, getMetrics, unitBase, unitElement, effectPoint } = createEffectEnvironment({ metrics, unitsLayer });
  let generation = 0;

  function clearActive() {
    generation += 1;
    for (const root of [board, unitsLayer, effectsLayer, diceOverlay]) {
      for (const animation of root?.getAnimations?.({ subtree: true }) ?? []) animation.cancel();
    }
    effectsLayer?.replaceChildren();
    diceOverlay?.classList.remove("show", "rolling");
    if (dieFace) { dieFace.className = "die"; dieFace.replaceChildren(); }
  }

  function shake(magnitude = 6) {
    if (!board || reducedMotion()) return;
    const throwTo = (m) => {
      const angle = Math.random() * Math.PI * 2;
      return `translate(${Math.cos(angle) * m}px, ${Math.sin(angle) * m}px)`;
    };
    board.animate([
      { transform: "translate(0,0)" },
      { transform: throwTo(magnitude) },
      { transform: throwTo(magnitude * 0.6) },
      { transform: throwTo(magnitude * 0.3) },
      { transform: "translate(0,0)" }
    ], { duration: 260, easing: "ease-out" });
  }

  // Whole-board white bloom on a crit — the highlight-reel flash.
  function critFlash() {
    if (!board || reducedMotion()) return;
    const box = board.viewBox.baseVal;
    const flash = svg("rect", { class: "fx-critflash", x: box.x, y: box.y, width: box.width, height: box.height, fill: "#e8f4ff" });
    effectsLayer.appendChild(flash);
    flash.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 220, easing: "ease-out" })
      .finished.catch(() => {}).then(() => flash.remove());
  }

  // type ("physical" | "magic" | "fire" | "true" — see IMPACT_VFX in vfxCatalog).
  function impact(point, critical, kind = "physical") {
    if (reducedMotion()) return;
    const style = getImpactVfx(kind);
    const center = { x: point.x, y: point.y + 8 };
    const flash = svg("circle", { class: "fx-flash", cx: center.x, cy: center.y, r: 6, fill: critical ? style.critFlash : style.flash, filter: "url(#softGlow)" });
    effectsLayer.appendChild(flash);
    flash.animate([{ r: 6, opacity: 0.95 }, { r: critical ? 30 : 24, opacity: 0 }], { duration: 200, easing: "ease-out" })
      .finished.catch(() => {}).then(() => flash.remove());
    const ring = svg("circle", { class: "fx-ring", cx: center.x, cy: center.y, r: 8, stroke: critical ? style.critRing : style.ring, filter: "url(#softGlow)" });
    effectsLayer.appendChild(ring);
    ring.animate([{ r: 8, opacity: 1, strokeWidth: 5 }, { r: 44, opacity: 0, strokeWidth: 1 }], { duration: 420, easing: "ease-out" })
      .finished.catch(() => {}).then(() => ring.remove());

    // (scale/rotate on SVG are user-space-origin-relative — see castWindup).
    const count = style.sparkCount + (critical ? 3 : 0);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const reach = 16 + Math.random() * 14 + (critical ? 6 : 0);
      const isChip = style.motion === "chips";
      const debris = isChip
        ? svg("rect", { class: "fx-spark", x: -2, y: -2, width: 4, height: 4, rx: 1, fill: style.spark, filter: "url(#softGlow)" })
        : svg("circle", { class: "fx-spark", cx: 0, cy: 0, r: style.motion === "embers" ? 1.8 + (i % 2) : 2.2 + (i % 2) * 0.8, fill: style.spark, filter: "url(#softGlow)" });
      effectsLayer.appendChild(debris);
      let frames;
      if (style.motion === "embers") {
        const driftX = Math.cos(angle) * reach * 0.5;
        frames = [
          { transform: `translate(${center.x}px, ${center.y}px) scale(1)`, opacity: 1 },
          { transform: `translate(${center.x + driftX}px, ${center.y - reach * 0.7}px) scale(.9)`, opacity: 0.5, offset: 0.45 },
          { transform: `translate(${center.x + driftX * 0.6}px, ${center.y - reach * 1.1}px) scale(1)`, opacity: 0.85, offset: 0.65 },
          { transform: `translate(${center.x + driftX * 1.3}px, ${center.y - reach * 1.7}px) scale(.4)`, opacity: 0 }
        ];
      } else if (style.motion === "motes") {
        frames = [
          { transform: `translate(${center.x}px, ${center.y}px) scale(.5)`, opacity: 0.95 },
          { transform: `translate(${center.x + Math.cos(angle) * reach}px, ${center.y + Math.sin(angle) * reach * 0.5 - 4}px) scale(1)`, opacity: 0.8, offset: 0.5 },
          { transform: `translate(${center.x + Math.cos(angle) * reach * 1.2}px, ${center.y + Math.sin(angle) * reach * 0.5 - 16}px) scale(.35)`, opacity: 0 }
        ];
      } else {
        frames = [
          { transform: `translate(${center.x}px, ${center.y}px) rotate(0deg) scale(1)`, opacity: 1 },
          { transform: `translate(${center.x + Math.cos(angle) * reach}px, ${center.y + Math.sin(angle) * reach * 0.55 - 8}px) rotate(${140 + i * 40}deg) scale(.8)`, opacity: 0.9, offset: 0.55 },
          { transform: `translate(${center.x + Math.cos(angle) * reach * 1.25}px, ${center.y + Math.sin(angle) * reach * 0.6 + 6}px) rotate(${220 + i * 40}deg) scale(.5)`, opacity: 0 }
        ];
      }
      debris.animate(frames, { duration: 340 + Math.random() * 140 + (style.motion === "embers" ? 160 : 0), delay: i * 6, easing: "ease-out", fill: "backwards" })
        .finished.catch(() => {}).then(() => debris.remove());
    }
  }

  const { flyProjectile } = createEffectProjectiles({ effectsLayer, reducedMotion, svg, waitForAnimation });
  const { playWindup } = createEffectWindups({
    effectsLayer,
    reducedMotion,
    svg,
    waitForAnimation,
    unitBase,
    unitElement,
    effectPoint,
    sound
  });

  function statusBurst(unit, status) {
    if (reducedMotion()) return;
    const visual = getStatusVfx(status);
    if (!visual) return;
    const point = effectPoint(unit.position, 35);
    const pulse = svg("circle", {
      class: "fx-status-burst",
      cx: point.x,
      cy: point.y,
      r: 10,
      fill: visual.color,
      stroke: visual.color,
      filter: "url(#softGlow)"
    });
    effectsLayer.appendChild(pulse);
    pulse.animate([
      { r: 10, opacity: 0.85, strokeWidth: 5 },
      { r: 34, opacity: 0, strokeWidth: 1 }
    ], { duration: 460, easing: "ease-out" }).finished.catch(() => {}).then(() => pulse.remove());
  }

  // Rising combat number (or "MISS"). Awaited so the resolver paces on it.
  async function floatText(point, text, color) {
    const element = svg("text", { class: "float-text", x: point.x, y: point.y - 2, "text-anchor": "middle", fill: color });
    element.textContent = text;
    effectsLayer.appendChild(element);
    await element.animate([
      { transform: "translateY(8px) scale(.7)", opacity: 0 },
      { transform: "translateY(-5px) scale(1.15)", opacity: 1, offset: 0.25 },
      { transform: "translateY(-42px) scale(1)", opacity: 0 }
    ], { duration: 720, easing: "ease-out" }).finished.catch(() => {});
    element.remove();
  }

  function artCallout(actor, label) {
    if (!effectsLayer || !actor || !label) return;
    const text = String(label);
    const width = Math.min(156, Math.max(54, text.length * 7.4 + 24));
    const height = 24;
    const origin = effectPoint(actor.position, 78);
    const group = svg("g", {
      class: "fx-art-callout",
      "aria-label": text
    });
    group.append(
      svg("rect", { class: "fx-art-callout-box", x: -width / 2, y: -height / 2, width, height, rx: 6 }),
      svg("path", { class: "fx-art-callout-tail", d: "M -5 11 L 0 18 L 5 11 Z" })
    );
    const labelText = svg("text", {
      class: "fx-art-callout-label",
      x: 0,
      y: 4,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      textLength: Math.max(0, width - 18),
      lengthAdjust: "spacingAndGlyphs"
    });
    labelText.textContent = text;
    group.append(labelText);
    effectsLayer.appendChild(group);

    if (reducedMotion()) {
      group.setAttribute("transform", `translate(${origin.x} ${origin.y - 18})`);
      window.setTimeout(() => group.remove(), 700);
      return;
    }

    group.animate([
      { transform: `translate(${origin.x}px, ${origin.y + 8}px) scale(.84)`, opacity: 0 },
      { transform: `translate(${origin.x}px, ${origin.y}px) scale(1)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${origin.x}px, ${origin.y - 16}px) scale(1)`, opacity: 1, offset: 0.72 },
      { transform: `translate(${origin.x}px, ${origin.y - 34}px) scale(.96)`, opacity: 0 }
    ], { duration: 1050, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" })
      .finished.catch(() => {}).then(() => group.remove());
  }

  async function projectileFan(actor, targets, targetPosition, vfx) {
    if (reducedMotion()) {
      sound.play(vfx.soundKey ?? "arrowAirborne");
      return;
    }
    await playWindup(actor, vfx, targets[0]?.position ?? targetPosition);
    sound.play(vfx.soundKey ?? "arrowAirborne");
    const from = effectPoint(actor.position, 22);
    const fallback = targetPosition ? effectPoint(targetPosition, 16) : from;
    const endpoints = targets.length ? targets.map((target) => effectPoint(target.position, 16)) : [fallback];
    const count = vfx.projectileCount ?? endpoints.length;
    const spec = vfx.projectile ?? { shape: "orb", arcHeight: vfx.arcHeight, durationMs: vfx.durationMs, colors: vfx.colors };
    const animations = [];
    for (let i = 0; i < count; i += 1) {
      const target = endpoints[i % endpoints.length];
      const lane = i - (count - 1) / 2;
      const end = { x: target.x + lane * 3.5, y: target.y - Math.abs(lane) * 1.5 };
      const laneSpec = {
        ...spec,
        arcHeight: (spec.arcHeight ?? vfx.arcHeight ?? 58) + Math.abs(lane) * 4
      };
      animations.push(
        flyProjectile(from, end, laneSpec, { delay: i * (vfx.staggerMs ?? 36) })
          .then(() => impact({ x: end.x, y: end.y }, false, vfx.impactKind ?? "magic"))
      );
    }
    await Promise.all(animations);
  }

  async function volleyRain(actor, coneCells, targets, targetPosition, vfx) {
    sound.play(vfx.soundKey ?? "arrowAirborne");
    if (reducedMotion() || !coneCells?.length) return;
    const from = effectPoint(actor.position, 22);
    const hitSet = new Set(targets.map((t) => `${t.position.x},${t.position.y}`));
    const dir = targetPosition
      ? { x: targetPosition.x - actor.position.x, y: targetPosition.y - actor.position.y }
      : { x: 0, y: 1 };
    const spec = vfx.projectile ?? { shape: "arrow", size: 0.8, colors: vfx.colors };
    const animations = [];
    for (const cell of coneCells) {
      const key = `${cell.x},${cell.y}`;
      const isHit = hitSet.has(key);
      const to = effectPoint(cell, isHit ? 14 : 4);
      const depth = Math.round((cell.x - actor.position.x) * dir.x + (cell.y - actor.position.y) * dir.y);
      const cellSpec = {
        ...spec,
        arcHeight: (vfx.arcHeight ?? 60) + depth * 7 + (Math.random() - 0.5) * 8,
        durationMs: (vfx.durationMs ?? 380) + depth * 18
      };
      const delay = Math.max(0, depth - 1) * (vfx.staggerMs ?? 65);
      // Real arrows now rain onto every cone tile — bright ones stick their targets,
      // faint trailless ones pepper the empty ground so the cone still reads.
      animations.push(
        flyProjectile(from, to, cellSpec, { delay, opacity: isHit ? 1 : 0.45, trail: false })
          .then(() => { if (isHit) impact({ x: to.x, y: to.y }, false); })
      );
    }
    await Promise.all(animations);
  }

  async function drain(actor, target, vfx) {
    if (vfx.soundKey) sound.play(vfx.soundKey);
    if (reducedMotion()) return;
    const from = effectPoint(target.position, 14);
    const to = effectPoint(actor.position, 20);
    const count = vfx.particleCount ?? 14;
    const animations = [];

    // Signature tether: a pulsing life-cord arcs victim → drinker for the duration
    // of the drain, so the motes read as riding a channel rather than floating free.
    if (vfx.tether) {
      const controlY = Math.min(from.y, to.y) - (vfx.curveHeight ?? 54) * 0.6;
      const tether = svg("path", {
        d: `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${controlY} ${to.x} ${to.y}`,
        class: "fx-line fx-tether",
        stroke: vfx.colors.core,
        "stroke-width": 2.5,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(tether);
      animations.push(waitForAnimation(tether.animate([
        { opacity: 0, strokeWidth: 1 },
        { opacity: 0.75, strokeWidth: 3.5, offset: 0.25 },
        { opacity: 0.45, strokeWidth: 2, offset: 0.6 },
        { opacity: 0.7, strokeWidth: 3, offset: 0.8 },
        { opacity: 0 }
      ], { duration: (vfx.durationMs ?? 680) + 160, easing: "ease-out" })).then(() => tether.remove()));
    }
    for (let i = 0; i < count; i += 1) {
      const drift = (i - (count - 1) / 2) * 1.9;
      // Origin-centered + absolute translate (SVG scale is origin-relative).
      const particle = svg("circle", {
        class: "fx-drain-particle",
        cx: 0,
        cy: 0,
        r: i % 3 === 0 ? 3.2 : 2.2,
        fill: i % 2 ? vfx.colors.trail : vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(particle);
      const animation = particle.animate([
        { transform: `translate(${from.x}px, ${from.y}px) scale(.5)`, opacity: 0 },
        { transform: `translate(${from.x + drift * 4}px, ${from.y - 12 - Math.abs(drift)}px) scale(1)`, opacity: 0.95, offset: 0.22 },
        { transform: `translate(${to.x + drift}px, ${to.y}px) scale(.45)`, opacity: 0 }
      ], {
        duration: vfx.durationMs ?? 680,
        delay: i * (vfx.staggerMs ?? 18),
        easing: "cubic-bezier(.25,.8,.25,1)",
        fill: "backwards"
      });
      animations.push(waitForAnimation(animation).then(() => particle.remove()));
    }
    await Promise.all(animations);
    // Absorb pulse: the drinker swells for a beat as the stolen life lands.
    if (vfx.tether) {
      const token = unitElement(actor.id);
      if (token) {
        const base = unitBase(actor.position);
        token.animate([
          { transform: `translate(${base.x}px, ${base.y}px) scale(1)` },
          { transform: `translate(${base.x}px, ${base.y - 3}px) scale(1.07)`, offset: 0.4 },
          { transform: `translate(${base.x}px, ${base.y}px) scale(1)` }
        ], { duration: 360, easing: "ease-out" });
      }
    }
    impact({ x: to.x, y: to.y }, false, "magic");
  }

  async function healPulse(actor, targets, vfx) {
    if (reducedMotion()) {
      sound.play(vfx.soundKey ?? "heal");
      return;
    }
    await playWindup(actor, vfx);
    sound.play(vfx.soundKey ?? "heal");
    const recipients = targets.length ? targets : [actor];
    const animations = [];
    for (const target of recipients) {
      const point = effectPoint(target.position, 18);
      const ring = svg("circle", {
        class: "fx-ring",
        cx: point.x,
        cy: point.y,
        r: 8,
        stroke: vfx.colors.trail,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(ring);
      animations.push(waitForAnimation(ring.animate([
        { r: 8, opacity: 0, strokeWidth: 5 },
        { r: vfx.radius ?? 28, opacity: 0.95, strokeWidth: 3, offset: 0.35 },
        { r: (vfx.radius ?? 28) + 12, opacity: 0, strokeWidth: 1 }
      ], { duration: vfx.durationMs ?? 560, easing: "ease-out" })).then(() => ring.remove()));

      for (let i = 0; i < (vfx.particleCount ?? 8); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.particleCount ?? 8);
        // Origin-centered + absolute translate (SVG scale is origin-relative).
        const mote = svg("circle", {
          class: "fx-mote",
          cx: 0,
          cy: 0,
          r: 2.4 + (i % 2),
          fill: i % 2 ? vfx.colors.impact : vfx.colors.core,
          filter: "url(#softGlow)"
        });
        effectsLayer.appendChild(mote);
        const animation = mote.animate([
          { transform: `translate(${point.x}px, ${point.y}px) scale(.45)`, opacity: 0 },
          { transform: `translate(${point.x + Math.cos(angle) * 12}px, ${point.y + Math.sin(angle) * 8 - 8}px) scale(1)`, opacity: 0.9, offset: 0.28 },
          { transform: `translate(${point.x + Math.cos(angle) * 22}px, ${point.y + Math.sin(angle) * 16 - 26}px) scale(.3)`, opacity: 0 }
        ], { duration: vfx.durationMs ?? 560, delay: i * 12, easing: "ease-out", fill: "backwards" });
        animations.push(waitForAnimation(animation).then(() => mote.remove()));
      }
    }
    await Promise.all(animations);
  }

  function darkPulseDissipate(point, vfx, stopKind = "unit") {
    const flash = svg("circle", {
      class: "fx-flash",
      cx: point.x,
      cy: point.y,
      r: stopKind === "border" ? 5 : 7,
      fill: vfx.colors.core,
      filter: "url(#softGlow)"
    });
    effectsLayer.appendChild(flash);
    flash.animate([
      { r: stopKind === "wall" ? 9 : 6, opacity: 0.9 },
      { r: stopKind === "unit" ? 24 : 18, opacity: 0 }
    ], { duration: stopKind === "unit" ? 260 : 220, easing: "ease-out" })
      .finished.catch(() => {}).then(() => flash.remove());

    const count = vfx.particleCount ?? 4;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.55;
      const reach = (stopKind === "unit" ? 18 : 12) + (i % 2) * 5;
      const mote = svg("circle", {
        class: "fx-mote",
        cx: 0,
        cy: 0,
        r: 2 + (i % 2) * 0.7,
        fill: i % 2 ? vfx.colors.impact : vfx.colors.trail,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(mote);
      mote.animate([
        { transform: `translate(${point.x}px, ${point.y}px) scale(.6)`, opacity: 0.95 },
        { transform: `translate(${point.x + Math.cos(angle) * reach}px, ${point.y + Math.sin(angle) * reach * 0.55 - 8}px) scale(1)`, opacity: 0.65, offset: 0.45 },
        { transform: `translate(${point.x + Math.cos(angle) * reach * 1.35}px, ${point.y + Math.sin(angle) * reach * 0.6 - 20}px) scale(.25)`, opacity: 0 }
      ], { duration: 360, delay: i * 18, easing: "ease-out", fill: "backwards" })
        .finished.catch(() => {}).then(() => mote.remove());
    }
  }

  async function darkPulseScatter(actor, targets, rays, vfx) {
    if (reducedMotion()) {
      if (vfx.soundKey) sound.play(vfx.soundKey);
      return;
    }
    await playWindup(actor, vfx);
    if (vfx.soundKey) sound.play(vfx.soundKey);
    if (vfx.shake) shake(vfx.shake);

    const from = effectPoint(actor.position, 22);
    const targetPositions = targets.map((target) => ({
      stopKind: "unit",
      targetId: target.id,
      position: target.position
    }));
    const stops = rays?.length ? rays : targetPositions;
    const spec = vfx.projectile ?? { shape: "orb", arcHeight: 14, durationMs: vfx.durationMs, colors: vfx.colors };
    const animations = stops
      .filter((ray) => ray?.position)
      .map((ray, index) => {
        const lift = ray.stopKind === "border" ? 6 : 16;
        const to = effectPoint(ray.position, lift);
        const distance = Math.max(1, ray.distance ?? 1);
        const raySpec = {
          ...spec,
          durationMs: Math.max(260, (spec.durationMs ?? vfx.durationMs ?? 430) + distance * 12),
          arcHeight: spec.arcHeight ?? 14
        };
        return flyProjectile(from, to, raySpec, { delay: index * (vfx.staggerMs ?? 18) })
          .then(() => darkPulseDissipate(to, vfx, ray.stopKind));
      });

    await Promise.all(animations);
  }

  async function dashTrail(actor, path, targets, vfx) {
    if (!path?.length) return;
    sound.play(vfx.soundKey ?? "unitMove");
    if (reducedMotion()) return;
    const bases = [actor.position, ...path].map((position) => unitBase(position));
    const lifted = bases.map((point) => ({ x: point.x, y: point.y - 7 }));
    const trailPath = lifted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const trail = svg("path", {
      d: trailPath,
      class: "fx-line fx-dash-trail",
      stroke: vfx.colors.trail,
      "stroke-width": 7,
      filter: "url(#softGlow)"
    });
    trail.style.strokeDasharray = "18 12";
    effectsLayer.appendChild(trail);

    const trailAnimation = trail.animate([
      { strokeDashoffset: "80", opacity: 0 },
      { strokeDashoffset: "0", opacity: 0.92, offset: 0.25 },
      { strokeDashoffset: "-80", opacity: 0 }
    ], { duration: vfx.durationMs ?? 760, easing: "cubic-bezier(.2,.8,.2,1)" });

    const token = unitElement(actor.id);
    // ABSOLUTE board coords (a CSS transform replaces the SVG attribute, so each keyframe
    // must carry the full position, not a delta). The token glides through every base.
    const tokenAnimation = token?.animate(bases.map((point, index) => ({
      transform: `translate(${point.x}px, ${point.y - (index % 2 ? 12 : 0)}px) scale(${index === bases.length - 1 ? 1.08 : 1})`,
      offset: bases.length === 1 ? 1 : index / (bases.length - 1)
    })), { duration: vfx.durationMs ?? 760, easing: "cubic-bezier(.17,.84,.28,1)", fill: "forwards" });

    for (let i = 1; i < lifted.length; i += 1) {
      const point = lifted[i];
      // Origin-centered + absolute translate (SVG scale is origin-relative).
      const afterimage = svg("circle", {
        class: "fx-afterimage",
        cx: 0,
        cy: 0,
        r: 5 + (i % 2) * 2,
        fill: vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(afterimage);
      afterimage.animate([
        { transform: `translate(${point.x}px, ${point.y + 8}px) scale(.7)`, opacity: 0.7 },
        { transform: `translate(${point.x}px, ${point.y + 8}px) scale(2.3)`, opacity: 0 }
      ], { duration: 420, delay: i * 48, easing: "ease-out", fill: "backwards" }).finished.catch(() => {}).then(() => afterimage.remove());
    }

    for (const target of targets) {
      const point = effectPoint(target.position, 8);
      for (let i = 0; i < (vfx.sparkCount ?? 8); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.sparkCount ?? 8);
        const spark = svg("rect", {
          class: "fx-spark",
          x: -2,
          y: -2,
          width: 4,
          height: 4,
          rx: 1,
          fill: vfx.colors.impact,
          filter: "url(#softGlow)"
        });
        effectsLayer.appendChild(spark);
        spark.animate([
          { transform: `translate(${point.x}px, ${point.y}px) rotate(0deg)`, opacity: 0.95 },
          { transform: `translate(${point.x + Math.cos(angle) * 24}px, ${point.y + Math.sin(angle) * 18}px) rotate(160deg)`, opacity: 0 }
        ], { duration: 430, delay: 220 + i * 10, easing: "ease-out", fill: "backwards" }).finished.catch(() => {}).then(() => spark.remove());
      }
    }

    await Promise.all([
      waitForAnimation(trailAnimation).then(() => trail.remove()),
      tokenAnimation ? waitForAnimation(tokenAnimation) : Promise.resolve()
    ]);
  }

  // Footwork's signature dash: unlike the all-at-once dashTrail (still used by Flee),
  // the actor slides tile-by-tile ALONG the chosen route, pausing a beat to strike each
  // enemy it passes through at the exact moment of contact. `onContact(tile)` is awaited
  // when the dasher arrives on each step, so the caller lands damage in cadence with the
  // slide instead of dumping every hit after a teleport. Resolves under reduced-motion
  // after firing each contact (so damage numbers still show) without moving the token.
  async function footworkCharge(actor, path, onContact) {
    if (!path?.length) return;
    const vfx = getAbilityVfx("footwork");
    if (!vfx) return;
    sound.play(vfx.soundKey ?? "footwork");
    if (reducedMotion()) {
      for (const tile of path) await onContact?.(tile);
      return;
    }
    const bases = [actor.position, ...path].map((position) => unitBase(position));
    const lifted = bases.map((point) => ({ x: point.x, y: point.y - 7 }));
    const stepMs = vfx.stepMs ?? 190;

    // Ambient guide line drawn beneath the whole route for the duration of the charge.
    const trailPath = lifted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const trail = svg("path", {
      d: trailPath,
      class: "fx-line fx-dash-trail",
      stroke: vfx.colors.trail,
      "stroke-width": 7,
      filter: "url(#softGlow)"
    });
    trail.style.strokeDasharray = "18 12";
    effectsLayer.appendChild(trail);
    const trailAnimation = trail.animate([
      { strokeDashoffset: "80", opacity: 0 },
      { strokeDashoffset: "0", opacity: 0.9, offset: 0.2 },
      { strokeDashoffset: "-80", opacity: 0 }
    ], { duration: stepMs * path.length + 220, easing: "linear" });

    const token = unitElement(actor.id);
    for (let i = 1; i < bases.length; i += 1) {
      // ABSOLUTE board coords (a CSS transform replaces the SVG attribute). Each segment
      // holds with fill:forwards so the token waits in place during a contact strike.
      const fromX = bases[i - 1].x;
      const fromY = bases[i - 1].y;
      const toX = bases[i].x;
      const toY = bases[i].y;
      if (token) {
        await waitForAnimation(token.animate([
          { transform: `translate(${fromX}px, ${fromY}px) scale(1.05)` },
          { transform: `translate(${(fromX + toX) / 2}px, ${(fromY + toY) / 2 - 12}px) scale(1.12)`, offset: 0.5 },
          { transform: `translate(${toX}px, ${toY}px) scale(1.05)` }
        ], { duration: stepMs, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" }));
      }
      // Afterimage ghost left on the tile just vacated.
      // Origin-centered + absolute translate (SVG scale is origin-relative).
      const ghostPoint = lifted[i];
      const afterimage = svg("circle", {
        class: "fx-afterimage",
        cx: 0,
        cy: 0,
        r: 6,
        fill: vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(afterimage);
      afterimage.animate([
        { transform: `translate(${ghostPoint.x}px, ${ghostPoint.y + 8}px) scale(.7)`, opacity: 0.7 },
        { transform: `translate(${ghostPoint.x}px, ${ghostPoint.y + 8}px) scale(2.3)`, opacity: 0 }
      ], { duration: 380, easing: "ease-out" }).finished.catch(() => {}).then(() => afterimage.remove());

      // Strike whoever stands on the tile we just reached, in the moment of contact.
      await onContact?.(path[i - 1]);
    }
    await waitForAnimation(trailAnimation).then(() => trail.remove());
  }

  async function statusStrike(actor, target, vfx) {
    if (!target) return;
    if (reducedMotion()) {
      if (vfx.soundKey) sound.play(vfx.soundKey);
      return;
    }
    // Pure casts carry a `castProjectile`: the caster winds up, then the payload
    // visibly travels before the motif blooms, so the effect never appears from
    // nowhere. Rolled attack ARTS omit both here — their windup + arrow already
    // played in animateAttack; only their post-roll motif belongs to this call.
    if (vfx.castProjectile && actor) {
      await playWindup(actor, vfx, target.position);
      if (vfx.soundKey) sound.play(vfx.soundKey);
      await flyProjectile(effectPoint(actor.position, 24), effectPoint(target.position, 20), vfx.castProjectile);
    } else if (vfx.soundKey) {
      sound.play(vfx.soundKey);
    }
    const point = effectPoint(target.position, 30);
    const base = effectPoint(target.position, 2);
    const animations = [];

    if (vfx.motif === "venom") {
      for (let i = 0; i < (vfx.particleCount ?? 12); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.particleCount ?? 12);
        // Origin-centered + absolute translate (SVG scale is origin-relative).
        const mote = svg("circle", { class: "fx-mote", cx: 0, cy: 0, r: 2.2 + (i % 3), fill: i % 2 ? vfx.colors.trail : vfx.colors.core, filter: "url(#softGlow)" });
        effectsLayer.appendChild(mote);
        const animation = mote.animate([
          { transform: `translate(${point.x}px, ${point.y}px) scale(.5)`, opacity: 0 },
          { transform: `translate(${point.x + Math.cos(angle) * 14}px, ${point.y + Math.sin(angle) * 8}px) scale(1)`, opacity: 0.9, offset: 0.25 },
          { transform: `translate(${point.x + Math.cos(angle) * 30}px, ${point.y + Math.sin(angle) * 22 - 18}px) scale(.35)`, opacity: 0 }
        ], { duration: 520, delay: i * 14, easing: "ease-out", fill: "backwards" });
        animations.push(waitForAnimation(animation).then(() => mote.remove()));
      }
    } else if (vfx.motif === "snare") {
      for (let i = 0; i < (vfx.ringCount ?? 3); i += 1) {
        const ring = svg("ellipse", { class: "fx-snare-ring", cx: base.x, cy: base.y + 10, rx: 14, ry: 6, fill: "none", stroke: vfx.colors.core, "stroke-width": 3, filter: "url(#softGlow)" });
        effectsLayer.appendChild(ring);
        const animation = ring.animate([
          { rx: 9, ry: 4, opacity: 0 },
          { rx: 24 + i * 4, ry: 10 + i * 2, opacity: 0.95, offset: 0.35 },
          { rx: 10, ry: 3, opacity: 0 }
        ], { duration: 520, delay: i * 90, easing: "cubic-bezier(.25,.8,.25,1)" });
        animations.push(waitForAnimation(animation).then(() => ring.remove()));
      }
    } else if (vfx.motif === "moon") {
      for (let i = 0; i < (vfx.particleCount ?? 8); i += 1) {
        const offset = i - ((vfx.particleCount ?? 8) - 1) / 2;
        // Path drawn around the origin; position carried in translate (SVG
        // scale is origin-relative, so absolute path coords + scale drift).
        const shard = svg("path", {
          class: "fx-rune",
          d: `M ${-8 + offset * 4} -28 Q ${offset * 2} -10 ${8 + offset * 4} -28`,
          stroke: vfx.colors.core,
          "stroke-width": 2.4,
          filter: "url(#softGlow)"
        });
        effectsLayer.appendChild(shard);
        const animation = shard.animate([
          { transform: `translate(${point.x}px, ${point.y - 12}px) scale(.7)`, opacity: 0 },
          { transform: `translate(${point.x}px, ${point.y}px) scale(1)`, opacity: 0.95, offset: 0.35 },
          { transform: `translate(${point.x}px, ${point.y + 24}px) scale(.85)`, opacity: 0 }
        ], { duration: 560, delay: i * 22, easing: "ease-out", fill: "backwards" });
        animations.push(waitForAnimation(animation).then(() => shard.remove()));
      }
    } else if (vfx.motif === "smoke") {
      // A cloud of grey puffs billowing up and outward from the target.
      for (let i = 0; i < (vfx.puffCount ?? 7); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.puffCount ?? 7) + Math.random() * 0.4;
        const spread = 14 + (i % 3) * 7;
        const puff = svg("circle", { class: "fx-mote", cx: 0, cy: 0, r: 5 + (i % 3) * 2, fill: i % 2 ? vfx.colors.trail : vfx.colors.core, filter: "url(#softGlow)" });
        puff.style.opacity = "0.62";
        effectsLayer.appendChild(puff);
        const animation = puff.animate([
          { transform: `translate(${point.x}px, ${point.y}px) scale(.4)`, opacity: 0 },
          { transform: `translate(${point.x + Math.cos(angle) * spread * 0.5}px, ${point.y + Math.sin(angle) * spread * 0.4 - 10}px) scale(1.1)`, opacity: 0.6, offset: 0.3 },
          { transform: `translate(${point.x + Math.cos(angle) * spread}px, ${point.y + Math.sin(angle) * spread * 0.6 - 22}px) scale(1.7)`, opacity: 0 }
        ], { duration: 620, delay: i * 16, easing: "ease-out", fill: "backwards" });
        animations.push(waitForAnimation(animation).then(() => puff.remove()));
      }
    } else if (vfx.motif === "silenceRune") {
      const ring = svg("circle", { class: "fx-rune", cx: point.x, cy: point.y, r: 11, fill: "none", stroke: vfx.colors.core, "stroke-width": 3, filter: "url(#softGlow)" });
      effectsLayer.appendChild(ring);
      animations.push(waitForAnimation(ring.animate([{ r: 11, opacity: 0 }, { r: 30, opacity: 0.95, offset: 0.38 }, { r: 18, opacity: 0 }], { duration: 560, easing: "ease-out" })).then(() => ring.remove()));
      for (let i = 0; i < (vfx.runeCount ?? 4); i += 1) {
        const degrees = (180 * i) / (vfx.runeCount ?? 4);
        // Line drawn through the origin; the keyframes carry BOTH the position and
        // the spoke rotation (a WAAPI transform replaces the SVG attribute, so the
        // old attribute-rotate + origin-relative keyframe rotate drew stray marks).
        const mark = svg("line", { class: "fx-rune", x1: -18, y1: 0, x2: 18, y2: 0, stroke: vfx.colors.core, "stroke-width": 3, filter: "url(#softGlow)" });
        effectsLayer.appendChild(mark);
        const animation = mark.animate([
          { opacity: 0, transform: `translate(${point.x}px, ${point.y}px) rotate(${degrees}deg) scale(.4)` },
          { opacity: 0.9, transform: `translate(${point.x}px, ${point.y}px) rotate(${degrees}deg) scale(1)`, offset: 0.35 },
          { opacity: 0, transform: `translate(${point.x}px, ${point.y}px) rotate(${degrees}deg) scale(1.25)` }
        ], { duration: 520, delay: i * 45, easing: "ease-out", fill: "backwards" });
        animations.push(waitForAnimation(animation).then(() => mark.remove()));
      }
    }

    statusBurst(target, vfx.status);
    await Promise.all(animations);
  }

  async function magicBurst(actor, targets, vfx) {
    if (reducedMotion()) {
      if (vfx.soundKey) sound.play(vfx.soundKey);
      return;
    }
    await playWindup(actor, vfx);
    if (vfx.soundKey) sound.play(vfx.soundKey);
    const center = effectPoint(actor.position, 18);
    const ground = unitBase(actor.position);
    const blast = Boolean(vfx.blast);
    const duration = vfx.durationMs ?? 680;
    const particleCount = vfx.particleCount ?? 20;
    const animations = [];

    // Signature extras (recipe-flagged, Nuke carries all three): a whole-board
    // bloom in the ability's color at the release instant…
    if (vfx.boardFlash && board) {
      const box = board.viewBox.baseVal;
      const bloom = svg("rect", { class: "fx-critflash", x: box.x, y: box.y, width: box.width, height: box.height, fill: vfx.colors.core });
      effectsLayer.appendChild(bloom);
      bloom.animate([{ opacity: 0.38 }, { opacity: 0 }], { duration: 340, easing: "ease-out" })
        .finished.catch(() => {}).then(() => bloom.remove());
    }

    // A blast detonates rather than just blooms: a flat shockwave sweeps the table
    // out to the real footprint, the core implodes then erupts, and the board jolts.
    if (blast) {
      shake(vfx.shake ?? 10);

      const { tileWidth } = getMetrics();
      const reach = tileWidth * 0.55 * (vfx.blastTiles ?? 2) + tileWidth * 0.5;
      const wave = svg("ellipse", {
        class: "fx-ring",
        cx: ground.x,
        cy: ground.y + 6,
        rx: 12,
        ry: 6,
        stroke: vfx.colors.impact,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(wave);
      animations.push(waitForAnimation(wave.animate([
        { rx: 12, ry: 6, opacity: 0, strokeWidth: 7 },
        { rx: reach, ry: reach * 0.5, opacity: 0.9, strokeWidth: 3, offset: 0.5 },
        { rx: reach + 18, ry: (reach + 18) * 0.5, opacity: 0, strokeWidth: 1 }
      ], { duration, easing: "cubic-bezier(.15,.85,.3,1)" })).then(() => wave.remove()));

      const core = svg("circle", { class: "fx-flash", cx: center.x, cy: center.y, r: 4, fill: vfx.colors.core, filter: "url(#softGlow)" });
      effectsLayer.appendChild(core);
      animations.push(waitForAnimation(core.animate([
        { r: 34, opacity: 0 },
        { r: 7, opacity: 1, offset: 0.34 },
        { r: 26, opacity: 1, offset: 0.52 },
        { r: 4, opacity: 0 }
      ], { duration: duration * 0.72, easing: "cubic-bezier(.4,0,.2,1)" })).then(() => core.remove()));

      // …a pillar of light climbing out of the epicenter as the core erupts…
      if (vfx.pillar) {
        const pillar = svg("ellipse", { class: "fx-flash", cx: ground.x, cy: ground.y - 72, rx: 24, ry: 92, fill: vfx.colors.core, filter: "url(#softGlow)" });
        effectsLayer.appendChild(pillar);
        animations.push(waitForAnimation(pillar.animate([
          { rx: 26, opacity: 0 },
          { rx: 15, opacity: 0.8, offset: 0.35 },
          { rx: 5, opacity: 0.9, offset: 0.7 },
          { rx: 2, opacity: 0 }
        ], { duration: duration * 0.8, delay: duration * 0.24, easing: "ease-out", fill: "backwards" })).then(() => pillar.remove()));
      }
    }

    // …and a scorch afterglow that outlives the burst on the ground. Fire-and-forget
    // so the lingering fade never slows the resolver's pacing.
    if (vfx.afterglow) {
      const reach = getMetrics().tileWidth * 0.5 * (vfx.blastTiles ?? 1.5);
      const scorch = svg("ellipse", { class: "fx-flash", cx: ground.x, cy: ground.y + 6, rx: reach, ry: reach * 0.5, fill: vfx.colors.trail, filter: "url(#softGlow)" });
      effectsLayer.appendChild(scorch);
      scorch.animate([
        { opacity: 0 },
        { opacity: 0.4, offset: 0.18 },
        { opacity: 0.28, offset: 0.55 },
        { opacity: 0 }
      ], { duration: 1300, delay: duration * 0.35, easing: "ease-out", fill: "backwards" })
        .finished.catch(() => {}).then(() => scorch.remove());
    }

    // Expanding ring centred on the caster
    const ring = svg("circle", {
      class: "fx-ring",
      cx: center.x,
      cy: center.y,
      r: 10,
      stroke: vfx.colors.core,
      filter: "url(#softGlow)"
    });
    effectsLayer.appendChild(ring);
    animations.push(waitForAnimation(ring.animate([
      { r: 10, opacity: 0, strokeWidth: 7 },
      { r: vfx.radius ?? 48, opacity: 0.85, strokeWidth: 3, offset: 0.4 },
      { r: (vfx.radius ?? 48) + 16, opacity: 0, strokeWidth: 1 }
    ], { duration, easing: "ease-out" })).then(() => ring.remove()));

    // Radial particle burst from caster. Blast motes implode toward the centre on
    // a short delay before erupting, so the detonation reads as a gathered collapse.
    // Origin-centered geometry + absolute translate (scale() on SVG is user-space-
    // origin-relative; cx/cy-placed motes with scale keyframes drift toward origin).
    for (let i = 0; i < particleCount; i += 1) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const dist = 28 + (i % 3) * 14;
      const outX = center.x + Math.cos(angle) * dist;
      const mote = svg("circle", {
        class: "fx-mote",
        cx: 0,
        cy: 0,
        r: 3 + (i % 2),
        fill: i % 3 === 0 ? vfx.colors.impact : vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(mote);
      const frames = blast
        ? [
            { transform: `translate(${outX}px, ${center.y + Math.sin(angle) * dist * 0.6 - 18}px) scale(.5)`, opacity: 0 },
            { transform: `translate(${center.x}px, ${center.y}px) scale(.7)`, opacity: 1, offset: 0.34 },
            { transform: `translate(${center.x + Math.cos(angle) * dist * 1.15}px, ${center.y + Math.sin(angle) * dist * 0.7 - 24}px) scale(.2)`, opacity: 0 }
          ]
        : [
            { transform: `translate(${center.x}px, ${center.y}px) scale(.3)`, opacity: 0 },
            { transform: `translate(${center.x + Math.cos(angle) * dist * 0.4}px, ${center.y + Math.sin(angle) * dist * 0.3 - 8}px) scale(1)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${outX}px, ${center.y + Math.sin(angle) * dist * 0.65 - 22}px) scale(.2)`, opacity: 0 }
          ];
      animations.push(waitForAnimation(mote.animate(frames, { duration, delay: i * 8, easing: "ease-out" })).then(() => mote.remove()));
    }

    // Impact on each struck target — a hard pop for blasts, a soft ring otherwise.
    for (const target of targets) {
      const pt = effectPoint(target.position, 18);
      if (blast) impact(pt, true, "magic");
      const flash = svg("circle", {
        class: "fx-ring",
        cx: pt.x,
        cy: pt.y,
        r: 6,
        stroke: blast ? vfx.colors.core : vfx.colors.trail,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(flash);
      animations.push(waitForAnimation(flash.animate([
        { r: 6, opacity: 0, strokeWidth: blast ? 6 : 5 },
        { r: blast ? 34 : 28, opacity: blast ? 0.9 : 0.7, strokeWidth: 2, offset: 0.5 },
        { r: blast ? 44 : 36, opacity: 0, strokeWidth: 1 }
      ], { duration: blast ? 420 : 340, delay: blast ? 140 : 80, easing: "ease-out" })).then(() => flash.remove()));
    }

    await Promise.all(animations);
  }

  // The grave-rising (Summon Ghoul's signature). Gather on the necromancer, a dark
  // stream pours into the summon tile, a summoning circle contracts, soil bursts
  // upward and falls back, a wraith silhouette climbs out — then lingering miasma
  // puffs stay behind (not awaited) to mask the ghoul token's pop-in on the next
  // render, which happens right after this resolves.
  async function summonRise(actor, targets, vfx) {
    if (reducedMotion()) {
      if (vfx.soundKey) sound.play(vfx.soundKey);
      return;
    }
    await playWindup(actor, vfx);
    if (vfx.soundKey) sound.play(vfx.soundKey);
    const spot = targets[0]?.position ?? actor.position;
    const ground = unitBase(spot);
    await flyProjectile(effectPoint(actor.position, 24), { x: ground.x, y: ground.y - 4 }, vfx.stream ?? { shape: "orb", arcHeight: 32, colors: vfx.colors });

    const animations = [];

    // Summoning circle contracting into the grave point.
    const circle = svg("ellipse", { class: "fx-ring", cx: ground.x, cy: ground.y + 5, rx: 30, ry: 14, stroke: vfx.colors.core, filter: "url(#softGlow)" });
    effectsLayer.appendChild(circle);
    animations.push(waitForAnimation(circle.animate([
      { rx: 30, ry: 14, opacity: 0, strokeWidth: 1.5 },
      { rx: 18, ry: 8.5, opacity: 0.85, strokeWidth: 3, offset: 0.5 },
      { rx: 8, ry: 3.6, opacity: 0, strokeWidth: 4.5 }
    ], { duration: 520, easing: "ease-in" })).then(() => circle.remove()));

    // Soil shards thrown up on a ballistic hop, falling back past the surface.
    for (let i = 0; i < (vfx.soilCount ?? 8); i += 1) {
      const angle = Math.PI * (0.15 + 0.7 * (i / Math.max(1, (vfx.soilCount ?? 8) - 1)));
      const throwX = Math.cos(angle) * (10 + (i % 3) * 8) * (i % 2 ? 1 : -1);
      const rise = 24 + (i % 4) * 9;
      const shard = svg("rect", { class: "fx-shard", x: -2, y: -2, width: 4, height: 4, rx: 1, fill: i % 2 ? "#5a4a38" : vfx.colors.trail, filter: "url(#softGlow)" });
      effectsLayer.appendChild(shard);
      animations.push(waitForAnimation(shard.animate([
        { transform: `translate(${ground.x}px, ${ground.y + 4}px) rotate(0deg) scale(1)`, opacity: 1 },
        { transform: `translate(${ground.x + throwX}px, ${ground.y - rise}px) rotate(${120 + i * 30}deg) scale(.9)`, opacity: 0.95, offset: 0.45 },
        { transform: `translate(${ground.x + throwX * 1.4}px, ${ground.y + 8}px) rotate(${240 + i * 30}deg) scale(.5)`, opacity: 0 }
      ], { duration: 560, delay: 60 + i * 22, easing: "cubic-bezier(.3,.6,.6,1)", fill: "backwards" })).then(() => shard.remove()));
    }

    // The wraith silhouette climbing out of the tile (origin-centered ellipse, so
    // the vertical stretch scales around its own body, not the SVG origin).
    const wraith = svg("ellipse", { class: "fx-mote", cx: 0, cy: 0, rx: 8, ry: 11, fill: vfx.colors.trail, filter: "url(#softGlow)" });
    effectsLayer.appendChild(wraith);
    animations.push(waitForAnimation(wraith.animate([
      { transform: `translate(${ground.x}px, ${ground.y}px) scale(1, .18)`, opacity: 0 },
      { transform: `translate(${ground.x}px, ${ground.y - 15}px) scale(1.05, 1.5)`, opacity: 0.8, offset: 0.55 },
      { transform: `translate(${ground.x}px, ${ground.y - 24}px) scale(.85, 1.9)`, opacity: 0 }
    ], { duration: vfx.riseDurationMs ?? 520, delay: 140, easing: "ease-out", fill: "backwards" })).then(() => wraith.remove()));

    await Promise.all(animations);

    // Lingering miasma — deliberately NOT awaited: the committing render pops the
    // ghoul in while these still drift, so it reads as emerging from the fog.
    for (let i = 0; i < (vfx.miasmaCount ?? 6); i += 1) {
      const angle = (Math.PI * 2 * i) / (vfx.miasmaCount ?? 6) + Math.random() * 0.5;
      const spread = 12 + (i % 3) * 6;
      const puff = svg("circle", { class: "fx-mote", cx: 0, cy: 0, r: 5 + (i % 3) * 2, fill: i % 2 ? vfx.colors.trail : vfx.colors.core, filter: "url(#softGlow)" });
      effectsLayer.appendChild(puff);
      puff.animate([
        { transform: `translate(${ground.x}px, ${ground.y - 4}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${ground.x + Math.cos(angle) * spread}px, ${ground.y - 10 - (i % 2) * 8}px) scale(1.15)`, opacity: 0.5, offset: 0.3 },
        { transform: `translate(${ground.x + Math.cos(angle) * spread * 1.6}px, ${ground.y - 26 - (i % 2) * 8}px) scale(1.8)`, opacity: 0 }
      ], { duration: 780, delay: i * 24, easing: "ease-out", fill: "backwards" })
        .finished.catch(() => {}).then(() => puff.remove());
    }
  }

  // The Witch Doctor's dances (and any future stance-caster). Every dance is a
  // GLOBAL effect — a team-wide or board-wide ritual — so it deliberately reads
  // differently from a single-target cast: a long gather on the dancer, a
  // whole-board color wash at release, a ring that ripples out past the edges of
  // any board size, an ambient aura orbiting the dancer, and a beacon pulse that
  // lands on every affected tile staggered by its distance from the dancer, so
  // the wave visibly propagates outward instead of just appearing everywhere.
  async function ritual(actor, targets, vfx) {
    if (reducedMotion()) {
      if (vfx.soundKey) sound.play(vfx.soundKey);
      return;
    }
    await playWindup(actor, vfx);
    if (vfx.soundKey) sound.play(vfx.soundKey);
    if (vfx.shake) shake(vfx.shake);
    const center = effectPoint(actor.position, 18);
    const ground = unitBase(actor.position);
    const duration = vfx.durationMs ?? 900;
    const animations = [];

    if (board) {
      const box = board.viewBox.baseVal;
      const wash = svg("rect", { class: "fx-critflash", x: box.x, y: box.y, width: box.width, height: box.height, fill: vfx.colors.core });
      effectsLayer.appendChild(wash);
      animations.push(waitForAnimation(wash.animate([
        { opacity: 0 },
        { opacity: 0.34, offset: 0.22 },
        { opacity: 0.16, offset: 0.6 },
        { opacity: 0 }
      ], { duration, easing: "ease-out" })).then(() => wash.remove()));
    }

    // A ring rippling outward from the dancer far enough to cross any board size.
    const reach = getMetrics().tileWidth * 9;
    const ring = svg("ellipse", { class: "fx-ring", cx: ground.x, cy: ground.y + 6, rx: 10, ry: 5, stroke: vfx.colors.core, filter: "url(#softGlow)" });
    effectsLayer.appendChild(ring);
    animations.push(waitForAnimation(ring.animate([
      { rx: 10, ry: 5, opacity: 0.9, strokeWidth: 6 },
      { rx: reach * 0.5, ry: reach * 0.25, opacity: 0.3, strokeWidth: 2, offset: 0.62 },
      { rx: reach, ry: reach * 0.5, opacity: 0, strokeWidth: 1 }
    ], { duration, easing: "cubic-bezier(.15,.75,.3,1)" })).then(() => ring.remove()));

    // Rising aura motes orbiting the dancer — the ritual's own signature glow.
    const count = vfx.particleCount ?? 16;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const dist = 20 + (i % 3) * 10;
      const mote = svg("circle", { class: "fx-mote", cx: 0, cy: 0, r: 2.6 + (i % 2), fill: i % 2 ? vfx.colors.trail : vfx.colors.core, filter: "url(#softGlow)" });
      effectsLayer.appendChild(mote);
      animations.push(waitForAnimation(mote.animate([
        { transform: `translate(${center.x}px, ${center.y}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${center.x + Math.cos(angle) * dist}px, ${center.y + Math.sin(angle) * dist * 0.6 - 14}px) scale(1)`, opacity: 0.9, offset: 0.4 },
        { transform: `translate(${center.x + Math.cos(angle) * dist * 1.5}px, ${center.y - 46 - (i % 3) * 6}px) scale(.3)`, opacity: 0 }
      ], { duration: duration * 0.85, delay: i * 18, easing: "ease-out", fill: "backwards" })).then(() => mote.remove()));
    }

    // A beacon pulse arrives at every affected tile, staggered by distance from the
    // dancer so the ritual reads as a wave washing over the whole team/board.
    for (const target of targets) {
      if (target.id === actor.id) continue;
      const point = unitBase(target.position);
      const distance = Math.hypot(target.position.x - actor.position.x, target.position.y - actor.position.y);
      const delay = Math.min(460, distance * 55);
      const beacon = svg("circle", { class: "fx-ring", cx: point.x, cy: point.y - 4, r: 4, stroke: vfx.colors.impact, filter: "url(#softGlow)" });
      effectsLayer.appendChild(beacon);
      animations.push(waitForAnimation(beacon.animate([
        { r: 4, opacity: 0, strokeWidth: 4 },
        { r: 22, opacity: 0.92, strokeWidth: 2.5, offset: 0.5 },
        { r: 30, opacity: 0, strokeWidth: 1 }
      ], { duration: 420, delay, easing: "ease-out" })).then(() => beacon.remove()));
    }

    await Promise.all(animations);
  }

  async function playAbilityVfx(artId, { actor, target, targets = [], targetPosition, path = [], effect, coneCells, rays = [] } = {}) {
    const vfx = getAbilityVfx(artId);
    if (!vfx || !actor) return;
    if (vfx.type === "dashTrail") {
      await dashTrail(actor, path, targets, vfx);
      return;
    }
    if (vfx.type === "volleyRain") {
      await volleyRain(actor, coneCells ?? [], targets, targetPosition, vfx);
      return;
    }
    if (vfx.type === "projectileFan") {
      await projectileFan(actor, targets, targetPosition, vfx);
      return;
    }
    if (vfx.type === "drain" && target && effect?.applied) {
      await drain(actor, target, vfx);
      return;
    }
    if (vfx.type === "healPulse") {
      await healPulse(actor, targets, vfx);
      return;
    }
    if (vfx.type === "darkPulseScatter") {
      await darkPulseScatter(actor, targets, rays, vfx);
      return;
    }
    if (vfx.type === "magicBurst") {
      await magicBurst(actor, targets, vfx);
      return;
    }
    if (vfx.type === "summonRise") {
      await summonRise(actor, targets, vfx);
      return;
    }
    if (vfx.type === "ritual") {
      await ritual(actor, targets, vfx);
      return;
    }
    if (vfx.type === "statusStrike" && target && effect?.applied) {
      await statusStrike(actor, target, { ...vfx, status: effect.status ?? vfx.status });
      return;
    }
    if (vfx.type === "lob") {
      const destination = targetPosition ?? target?.position;
      if (!destination) return;
      await playWindup(actor, vfx, destination);
      if (vfx.soundKey) sound.play(vfx.soundKey);
      const landing = effectPoint(destination, 4);
      await flyProjectile(effectPoint(actor.position, 24), landing, vfx.projectile ?? {});
      impact(landing, false, vfx.impactKind ?? "physical");
    }
  }

  // A defeated figurine bursts into team-colored shards at its tile.
  function deathBurst(point, color) {
    if (reducedMotion()) return;
    const hue = color?.trim() || "#f7f9fc";
    for (let i = 0; i < 11; i += 1) {
      const angle = (Math.PI * 2 * i) / 11 + Math.random() * 0.5;
      const distance = 26 + Math.random() * 30;
      const size = 2.5 + Math.random() * 3.5;
      // Origin-centered + absolute translate (SVG rotate/scale are origin-relative).
      const shard = svg("rect", { class: "fx-shard", x: -size / 2, y: -size / 2, width: size, height: size, rx: 1, fill: hue, filter: "url(#softGlow)" });
      effectsLayer.appendChild(shard);
      const driftX = Math.cos(angle) * distance;
      const driftY = Math.sin(angle) * distance - 10;
      shard.animate([
        { transform: `translate(${point.x}px, ${point.y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${point.x + driftX}px, ${point.y + driftY + 18}px) rotate(${(Math.random() - 0.5) * 220}deg) scale(.4)`, opacity: 0 }
      ], { duration: 480 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" })
        .finished.catch(() => {}).then(() => shard.remove());
    }
  }

  // ---------------------------------------------------------------------------
  const {
    animateMovement,
    animateAttack,
    hitRecoil,
    knockUp,
    deathDissolve,
  } = createUnitMotionEffects({
    unitBase,
    unitElement,
    reducedMotion,
    sleep,
    sound,
    flyProjectile,
    playWindup,
    deathBurst,
    shake,
  });

  // The roll reveal. Tumbles die faces then settles on an icon + label.
  // Pass a custom `label` for a second effect roll (e.g. "BLINDED", "RESISTED").
  async function rollReveal(outcome, label = null) {
    if (!diceOverlay || !dieFace) return;
    const token = generation;
    sound.play("diceRoll");
    diceOverlay.classList.add("show", "rolling");
    dieFace.className = "die";
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    if (!reducedMotion()) {
      for (let i = 0; i < 7; i += 1) {
        dieFace.textContent = faces[Math.floor(Math.random() * faces.length)];
        await sleep(46);
        if (token !== generation) return;
      }
    }
    const glyph = outcome.missed ? "✘" : outcome.critical ? "✦" : "⚔";
    const text = label ?? (outcome.missed ? "MISS" : outcome.critical ? "CRIT" : "HIT");
    dieFace.innerHTML = `<span class="die-glyph">${glyph}</span><span class="die-label">${text}</span>`;
    dieFace.classList.add(outcome.missed ? "die-miss" : outcome.critical ? "die-crit" : "die-hit");
    diceOverlay.classList.remove("rolling");
    await sleep(reducedMotion() ? 140 : 380);
    if (token !== generation) return;
    diceOverlay.classList.remove("show");
    await sleep(120);
  }

  return { setMetrics, clearActive, shake, critFlash, impact, statusBurst, floatText, artCallout, deathBurst, animateMovement, animateAttack, hitRecoil, knockUp, deathDissolve, rollReveal, playAbilityVfx, footworkCharge };
}
