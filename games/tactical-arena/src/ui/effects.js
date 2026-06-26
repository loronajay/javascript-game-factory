// Presentation-only combat effects, ported from Mini-Tactics' EffectsRenderer:
// the unit-element motion (movement slide, attack lunge / arrow projectile, hit
// recoil, death dissolve) AND the fire-and-forget atmosphere (roll reveal, impact
// flash/ring, floating damage text, crit screen-flash, screen shake, shard burst).
// Nothing here touches authoritative state — every animation is fire-and-forget and
// goes silent (no transform left behind) under prefers-reduced-motion.

import { gridToScreen } from "./isometric.js";
import { getAbilityVfx, getStatusVfx } from "./vfxCatalog.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForAnimation(animation) {
  return animation.finished.catch(() => {});
}

export function createEffects({ board, unitsLayer, effectsLayer, diceOverlay, dieFace, metrics, audio }) {
  const sound = audio ?? { play() {} };
  let boardMetrics = metrics;

  function setMetrics(next) {
    boardMetrics = next;
  }

  // A unit token's translate origin: the tile's screen point lowered onto the
  // figurine's standing spot (matches createUnitFigure's transform in main.js).
  function unitBase(position) {
    const point = gridToScreen(boardMetrics, position.x, position.y);
    return { x: point.x, y: point.y + boardMetrics.tileHeight * 0.45 };
  }

  function unitElement(unitId) {
    return unitsLayer?.querySelector(`[data-id="${unitId}"]`);
  }

  function effectPoint(position, lift = 0) {
    const base = unitBase(position);
    return { x: base.x, y: base.y - lift };
  }

  // Camera punch: jolt the board SVG a few pixels and settle, scaled by how much
  // the blow hurt. Fired, not awaited, so the board shivers under the float text.
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

  // Brief impact pop + expanding ring at the point of contact.
  function impact(point, critical) {
    if (reducedMotion()) return;
    const flash = svg("circle", { class: "fx-flash", cx: point.x, cy: point.y + 8, r: 6, fill: critical ? "#c8e8ff" : "#c0d8f0", filter: "url(#softGlow)" });
    effectsLayer.appendChild(flash);
    flash.animate([{ r: 6, opacity: 0.95 }, { r: critical ? 30 : 24, opacity: 0 }], { duration: 200, easing: "ease-out" })
      .finished.catch(() => {}).then(() => flash.remove());
    const ring = svg("circle", { class: "fx-ring", cx: point.x, cy: point.y + 8, r: 8, stroke: critical ? "#80c8f0" : "#ff7684", filter: "url(#softGlow)" });
    effectsLayer.appendChild(ring);
    ring.animate([{ r: 8, opacity: 1, strokeWidth: 5 }, { r: 44, opacity: 0, strokeWidth: 1 }], { duration: 420, easing: "ease-out" })
      .finished.catch(() => {}).then(() => ring.remove());
  }

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

  async function projectileFan(actor, targets, targetPosition, vfx) {
    sound.play(vfx.soundKey ?? "arrowAirborne");
    if (reducedMotion()) return;
    const from = effectPoint(actor.position, 12);
    const fallback = targetPosition ? effectPoint(targetPosition, 12) : from;
    const endpoints = targets.length ? targets.map((target) => effectPoint(target.position, 12)) : [fallback];
    const count = vfx.projectileCount ?? endpoints.length;
    const animations = [];
    for (let i = 0; i < count; i += 1) {
      const target = endpoints[i % endpoints.length];
      const lane = i - (count - 1) / 2;
      const end = { x: target.x + lane * 3.5, y: target.y - Math.abs(lane) * 1.5 };
      const control = {
        x: (from.x + end.x) / 2 + lane * (vfx.spread ?? 24) * 0.35,
        y: Math.min(from.y, end.y) - (vfx.arcHeight ?? 58) - Math.abs(lane) * 3
      };
      const path = svg("path", {
        d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
        class: "fx-line fx-projectile-fan",
        stroke: i % 2 ? vfx.colors.trail : vfx.colors.core,
        "stroke-width": i % 3 === 0 ? 4 : 3,
        filter: "url(#softGlow)"
      });
      path.style.strokeDasharray = "11 12";
      effectsLayer.appendChild(path);
      const animation = path.animate([
        { strokeDashoffset: "80", opacity: 0 },
        { strokeDashoffset: "20", opacity: 1, offset: 0.24 },
        { strokeDashoffset: "-55", opacity: 0 }
      ], {
        duration: vfx.durationMs ?? 520,
        delay: i * (vfx.staggerMs ?? 36),
        easing: "ease-out"
      });
      animations.push(waitForAnimation(animation).then(() => path.remove()));
    }
    await Promise.all(animations);
    for (const target of endpoints) impact({ x: target.x, y: target.y }, false);
  }

  async function volleyRain(actor, coneCells, targets, targetPosition, vfx) {
    sound.play(vfx.soundKey ?? "arrowAirborne");
    if (reducedMotion() || !coneCells?.length) return;
    const from = effectPoint(actor.position, 18);
    const hitSet = new Set(targets.map((t) => `${t.position.x},${t.position.y}`));
    const dir = targetPosition
      ? { x: targetPosition.x - actor.position.x, y: targetPosition.y - actor.position.y }
      : { x: 0, y: 1 };
    const animations = [];
    for (const cell of coneCells) {
      const key = `${cell.x},${cell.y}`;
      const isHit = hitSet.has(key);
      const to = effectPoint(cell, isHit ? 12 : 4);
      const depth = Math.round((cell.x - actor.position.x) * dir.x + (cell.y - actor.position.y) * dir.y);
      const ctrl = {
        x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 10,
        y: Math.min(from.y, to.y) - (vfx.arcHeight ?? 60) - depth * 7
      };
      const path = svg("path", {
        d: `M ${from.x} ${from.y} Q ${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`,
        class: "fx-line",
        stroke: isHit ? vfx.colors.core : vfx.colors.trail,
        "stroke-width": isHit ? 3 : 2,
        filter: "url(#softGlow)"
      });
      path.style.strokeDasharray = "8 12";
      path.style.opacity = isHit ? "1" : "0.45";
      effectsLayer.appendChild(path);
      const delay = Math.max(0, depth - 1) * (vfx.staggerMs ?? 65);
      const duration = (vfx.durationMs ?? 380) + depth * 18;
      const anim = path.animate([
        { strokeDashoffset: "60", opacity: 0 },
        { strokeDashoffset: "16", opacity: isHit ? 1 : 0.45, offset: 0.28 },
        { strokeDashoffset: "-40", opacity: 0 }
      ], { duration, delay, easing: "ease-in" });
      animations.push(waitForAnimation(anim).then(() => {
        path.remove();
        if (isHit) impact({ x: to.x, y: to.y }, false);
      }));
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
    for (let i = 0; i < count; i += 1) {
      const drift = (i - (count - 1) / 2) * 1.9;
      const particle = svg("circle", {
        class: "fx-drain-particle",
        cx: from.x,
        cy: from.y,
        r: i % 3 === 0 ? 3.2 : 2.2,
        fill: i % 2 ? vfx.colors.trail : vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(particle);
      const animation = particle.animate([
        { transform: "translate(0,0) scale(.5)", opacity: 0 },
        { transform: `translate(${drift * 4}px ${-12 - Math.abs(drift)}px) scale(1)`, opacity: 0.95, offset: 0.22 },
        { transform: `translate(${to.x - from.x + drift}px ${to.y - from.y}px) scale(.45)`, opacity: 0 }
      ], {
        duration: vfx.durationMs ?? 680,
        delay: i * (vfx.staggerMs ?? 18),
        easing: "cubic-bezier(.25,.8,.25,1)"
      });
      animations.push(waitForAnimation(animation).then(() => particle.remove()));
    }
    await Promise.all(animations);
    impact({ x: to.x, y: to.y }, false);
  }

  async function healPulse(actor, targets, vfx) {
    sound.play(vfx.soundKey ?? "heal");
    if (reducedMotion()) return;
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
        const mote = svg("circle", {
          class: "fx-mote",
          cx: point.x,
          cy: point.y,
          r: 2.4 + (i % 2),
          fill: i % 2 ? vfx.colors.impact : vfx.colors.core,
          filter: "url(#softGlow)"
        });
        effectsLayer.appendChild(mote);
        const animation = mote.animate([
          { transform: "translate(0,0) scale(.45)", opacity: 0 },
          { transform: `translate(${Math.cos(angle) * 12}px ${Math.sin(angle) * 8 - 8}px) scale(1)`, opacity: 0.9, offset: 0.28 },
          { transform: `translate(${Math.cos(angle) * 22}px ${Math.sin(angle) * 16 - 26}px) scale(.3)`, opacity: 0 }
        ], { duration: vfx.durationMs ?? 560, delay: i * 12, easing: "ease-out" });
        animations.push(waitForAnimation(animation).then(() => mote.remove()));
      }
    }
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
    // Relative offsets from bases[0] (the actor's SVG attribute position).
    const originX = bases[0].x;
    const originY = bases[0].y;
    const tokenAnimation = token?.animate(bases.map((point, index) => ({
      transform: `translate(${point.x - originX}px ${point.y - originY - (index % 2 ? 12 : 0)}px) scale(${index === bases.length - 1 ? 1.08 : 1})`,
      offset: bases.length === 1 ? 1 : index / (bases.length - 1)
    })), { duration: vfx.durationMs ?? 760, easing: "cubic-bezier(.17,.84,.28,1)", fill: "forwards" });

    for (let i = 1; i < lifted.length; i += 1) {
      const point = lifted[i];
      const afterimage = svg("circle", {
        class: "fx-afterimage",
        cx: point.x,
        cy: point.y + 8,
        r: 5 + (i % 2) * 2,
        fill: vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(afterimage);
      afterimage.animate([
        { transform: "scale(.7)", opacity: 0.7 },
        { transform: "scale(2.3)", opacity: 0 }
      ], { duration: 420, delay: i * 48, easing: "ease-out" }).finished.catch(() => {}).then(() => afterimage.remove());
    }

    for (const target of targets) {
      const point = effectPoint(target.position, 8);
      for (let i = 0; i < (vfx.sparkCount ?? 8); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.sparkCount ?? 8);
        const spark = svg("rect", {
          class: "fx-spark",
          x: point.x - 2,
          y: point.y - 2,
          width: 4,
          height: 4,
          rx: 1,
          fill: vfx.colors.impact,
          filter: "url(#softGlow)"
        });
        effectsLayer.appendChild(spark);
        spark.animate([
          { transform: "translate(0,0) rotate(0deg)", opacity: 0.95 },
          { transform: `translate(${Math.cos(angle) * 24}px ${Math.sin(angle) * 18}px) rotate(160deg)`, opacity: 0 }
        ], { duration: 430, delay: 220 + i * 10, easing: "ease-out" }).finished.catch(() => {}).then(() => spark.remove());
      }
    }

    await Promise.all([
      waitForAnimation(trailAnimation).then(() => trail.remove()),
      tokenAnimation ? waitForAnimation(tokenAnimation) : Promise.resolve()
    ]);
  }

  async function statusStrike(actor, target, vfx) {
    if (!target) return;
    if (vfx.soundKey) sound.play(vfx.soundKey);
    if (reducedMotion()) return;
    const point = effectPoint(target.position, 30);
    const base = effectPoint(target.position, 2);
    const animations = [];

    if (vfx.motif === "venom") {
      for (let i = 0; i < (vfx.particleCount ?? 12); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.particleCount ?? 12);
        const mote = svg("circle", { class: "fx-mote", cx: point.x, cy: point.y, r: 2.2 + (i % 3), fill: i % 2 ? vfx.colors.trail : vfx.colors.core, filter: "url(#softGlow)" });
        effectsLayer.appendChild(mote);
        const animation = mote.animate([
          { transform: "translate(0,0) scale(.5)", opacity: 0 },
          { transform: `translate(${Math.cos(angle) * 14}px ${Math.sin(angle) * 8}px) scale(1)`, opacity: 0.9, offset: 0.25 },
          { transform: `translate(${Math.cos(angle) * 30}px ${Math.sin(angle) * 22 - 18}px) scale(.35)`, opacity: 0 }
        ], { duration: 520, delay: i * 14, easing: "ease-out" });
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
        const shard = svg("path", {
          class: "fx-rune",
          d: `M ${point.x - 8 + offset * 4} ${point.y - 28} Q ${point.x + offset * 2} ${point.y - 10} ${point.x + 8 + offset * 4} ${point.y - 28}`,
          stroke: vfx.colors.core,
          "stroke-width": 2.4,
          filter: "url(#softGlow)"
        });
        effectsLayer.appendChild(shard);
        const animation = shard.animate([
          { transform: "translateY(-12px) scale(.7)", opacity: 0 },
          { transform: "translateY(0) scale(1)", opacity: 0.95, offset: 0.35 },
          { transform: "translateY(24px) scale(.85)", opacity: 0 }
        ], { duration: 560, delay: i * 22, easing: "ease-out" });
        animations.push(waitForAnimation(animation).then(() => shard.remove()));
      }
    } else if (vfx.motif === "silenceRune") {
      const ring = svg("circle", { class: "fx-rune", cx: point.x, cy: point.y, r: 11, fill: "none", stroke: vfx.colors.core, "stroke-width": 3, filter: "url(#softGlow)" });
      effectsLayer.appendChild(ring);
      animations.push(waitForAnimation(ring.animate([{ r: 11, opacity: 0 }, { r: 30, opacity: 0.95, offset: 0.38 }, { r: 18, opacity: 0 }], { duration: 560, easing: "ease-out" })).then(() => ring.remove()));
      for (let i = 0; i < (vfx.runeCount ?? 4); i += 1) {
        const angle = (Math.PI * 2 * i) / (vfx.runeCount ?? 4);
        const mark = svg("line", { class: "fx-rune", x1: point.x - 18, y1: point.y, x2: point.x + 18, y2: point.y, stroke: vfx.colors.core, "stroke-width": 3, filter: "url(#softGlow)" });
        mark.setAttribute("transform", `rotate(${angle * 180 / Math.PI} ${point.x} ${point.y})`);
        effectsLayer.appendChild(mark);
        const animation = mark.animate([
          { opacity: 0, transform: `rotate(${angle}rad) scale(.4)` },
          { opacity: 0.9, transform: `rotate(${angle}rad) scale(1)`, offset: 0.35 },
          { opacity: 0, transform: `rotate(${angle}rad) scale(1.25)` }
        ], { duration: 520, delay: i * 45, easing: "ease-out" });
        animations.push(waitForAnimation(animation).then(() => mark.remove()));
      }
    }

    statusBurst(target, vfx.status);
    await Promise.all(animations);
  }

  async function magicBurst(actor, targets, vfx) {
    if (vfx.soundKey) sound.play(vfx.soundKey);
    if (reducedMotion()) return;
    const center = effectPoint(actor.position, 18);
    const ground = unitBase(actor.position);
    const blast = Boolean(vfx.blast);
    const duration = vfx.durationMs ?? 680;
    const particleCount = vfx.particleCount ?? 20;
    const animations = [];

    // A blast detonates rather than just blooms: a flat shockwave sweeps the table
    // out to the real footprint, the core implodes then erupts, and the board jolts.
    if (blast) {
      shake(vfx.shake ?? 10);

      const reach = boardMetrics.tileWidth * 0.55 * (vfx.blastTiles ?? 2) + boardMetrics.tileWidth * 0.5;
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
    for (let i = 0; i < particleCount; i += 1) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const dist = 28 + (i % 3) * 14;
      const mote = svg("circle", {
        class: "fx-mote",
        cx: center.x,
        cy: center.y,
        r: 3 + (i % 2),
        fill: i % 3 === 0 ? vfx.colors.impact : vfx.colors.core,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(mote);
      const frames = blast
        ? [
            { transform: `translate(${Math.cos(angle) * dist}px ${Math.sin(angle) * dist * 0.6 - 18}px) scale(.5)`, opacity: 0 },
            { transform: "translate(0,0) scale(.7)", opacity: 1, offset: 0.34 },
            { transform: `translate(${Math.cos(angle) * dist * 1.15}px ${Math.sin(angle) * dist * 0.7 - 24}px) scale(.2)`, opacity: 0 }
          ]
        : [
            { transform: "translate(0,0) scale(.3)", opacity: 0 },
            { transform: `translate(${Math.cos(angle) * dist * 0.4}px ${Math.sin(angle) * dist * 0.3 - 8}px) scale(1)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${Math.cos(angle) * dist}px ${Math.sin(angle) * dist * 0.65 - 22}px) scale(.2)`, opacity: 0 }
          ];
      animations.push(waitForAnimation(mote.animate(frames, { duration, delay: i * 8, easing: "ease-out" })).then(() => mote.remove()));
    }

    // Impact on each struck target — a hard pop for blasts, a soft ring otherwise.
    for (const target of targets) {
      const pt = effectPoint(target.position, 18);
      if (blast) impact(pt, true);
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

  async function playAbilityVfx(artId, { actor, target, targets = [], targetPosition, path = [], effect, coneCells } = {}) {
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
    if (vfx.type === "magicBurst") {
      await magicBurst(actor, targets, vfx);
      return;
    }
    if (vfx.type === "statusStrike" && target && effect?.applied) {
      await statusStrike(actor, target, { ...vfx, status: effect.status ?? vfx.status });
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
      const shard = svg("rect", { class: "fx-shard", x: point.x - size / 2, y: point.y - size / 2, width: size, height: size, rx: 1, fill: hue, filter: "url(#softGlow)" });
      effectsLayer.appendChild(shard);
      const driftX = Math.cos(angle) * distance;
      const driftY = Math.sin(angle) * distance - 10;
      shard.animate([
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${driftX}px, ${driftY + 18}px) rotate(${(Math.random() - 0.5) * 220}deg) scale(.4)`, opacity: 0 }
      ], { duration: 480 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" })
        .finished.catch(() => {}).then(() => shard.remove());
    }
  }

  // ---------------------------------------------------------------------------
  // Unit-element motion (Mini-Tactics parity). These animate the actual figurine
  // <g> via the Web Animations API, which temporarily overrides its `transform`
  // and releases back to the element's own transform when finished — so the next
  // full render() snaps it cleanly into place. Each one resolves immediately under
  // reduced-motion (or if the token is gone) so the resolver never stalls.
  // ---------------------------------------------------------------------------

  // Slide a unit from its old tile to its new tile. Called after the board has
  // re-rendered the token at its DESTINATION, so we animate from the old point in.
  // Keyframes use relative offsets (delta from the SVG attribute position) because
  // WAAPI CSS transforms stack on top of the SVG `transform` attribute rather than
  // replacing it — using absolute SVG coordinates here would double the offset.
  async function animateMovement(unitId, from, to) {
    const element = unitElement(unitId);
    if (!element || reducedMotion()) return;
    const fromBase = unitBase(from);
    const toBase = unitBase(to);
    // SVG attr is already at toBase; dx/dy is the vector back to the old position.
    const dx = fromBase.x - toBase.x;
    const dy = fromBase.y - toBase.y;
    await element.animate([
      { transform: `translate(${dx}px ${dy}px) scale(1)` },
      { transform: `translate(0px -12px) scale(1.08)`, offset: 0.55 },
      { transform: `translate(0px 0px) scale(1)` }
    ], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => {});
  }

  // The attacker commits: a melee fighter lunges a fraction toward the target; a
  // ranged unit fires a glowing projectile arc that flies across to land just as
  // the dice resolve. Awaited so the strike reads as cause → effect.
  async function animateAttack(attacker, target, ranged) {
    const fromBase = unitBase(attacker.position);
    const toBase = unitBase(target.position);
    if (!ranged) {
      const element = unitElement(attacker.id);
      if (!element || reducedMotion()) return;
      // Relative offsets: SVG attr is already at fromBase; delta is a fraction toward target.
      const deltaX = (toBase.x - fromBase.x) * 0.18;
      const deltaY = (toBase.y - fromBase.y) * 0.18;
      await element.animate([
        { transform: `translate(0px 0px)` },
        { transform: `translate(${-deltaX * 0.3}px ${-deltaY * 0.3}px)` },
        { transform: `translate(${deltaX}px ${deltaY}px) scale(1.12)` },
        { transform: `translate(0px 0px)` }
      ], { duration: 360, easing: "cubic-bezier(.2,.75,.2,1)" }).finished.catch(() => {});
      return;
    }
    // Ranged: launch whoosh + projectile arc. The hit sound is played by the
    // controller once the roll resolves, so the launch and the land stay distinct.
    sound.play("arrowAirborne");
    if (reducedMotion()) return;
    const path = svg("path", {
      d: `M ${fromBase.x} ${fromBase.y - 8} Q ${(fromBase.x + toBase.x) / 2} ${Math.min(fromBase.y, toBase.y) - 60} ${toBase.x} ${toBase.y - 8}`,
      class: "fx-line", stroke: "#f7e27d", "stroke-width": 5, filter: "url(#softGlow)"
    });
    path.style.strokeDasharray = "14 10";
    effectsLayer.appendChild(path);
    await path.animate([
      { strokeDashoffset: "70", opacity: 0 },
      { strokeDashoffset: "0", opacity: 1, offset: 0.25 },
      { strokeDashoffset: "-50", opacity: 0 }
    ], { duration: 420, easing: "ease-out" }).finished.catch(() => {});
    path.remove();
  }

  // The target reels from the blow: a short side-to-side wobble, then a held beat
  // (hit-stop) so the hit lands with weight. Awaited.
  async function hitRecoil(unitId, position, critical) {
    const element = unitElement(unitId);
    if (element && !reducedMotion()) {
      // Relative offsets: SVG attr already positions the token; we just wobble it.
      await element.animate([
        { transform: `translate(0px 0px)` },
        { transform: `translate(-8px 0px) rotate(-5deg)` },
        { transform: `translate(7px 0px) rotate(4deg)` },
        { transform: `translate(0px 0px)` }
      ], { duration: 330, easing: "ease-out" }).finished.catch(() => {});
    }
    if (!reducedMotion()) await sleep(critical ? 110 : 70);
  }

  // A defeated figurine dissolves: it squashes, sinks, and fades while its shards
  // burst outward. Runs on the LIVE token before the committing render removes it.
  async function deathDissolve(unitId, position, color) {
    const base = unitBase(position);
    deathBurst(base, color);
    shake(6);
    const element = unitElement(unitId);
    if (!element || reducedMotion()) return;
    // Relative offsets: SVG attr already positions the token at `base`.
    await element.animate([
      { transform: `translate(0px 0px) scale(1)`, opacity: 1 },
      { transform: `translate(0px 8px) scale(1.12,.7) rotate(8deg)`, opacity: 0.75 },
      { transform: `translate(0px 24px) scale(.2) rotate(30deg)`, opacity: 0 }
    ], { duration: 620, easing: "cubic-bezier(.3,.7,.3,1)" }).finished.catch(() => {});
  }

  // The roll reveal. Tumbles die faces then settles on an icon + label.
  // Pass a custom `label` for a second effect roll (e.g. "BLINDED", "RESISTED").
  async function rollReveal(outcome, label = null) {
    if (!diceOverlay || !dieFace) return;
    sound.play("diceRoll");
    diceOverlay.classList.add("show", "rolling");
    dieFace.className = "die";
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    if (!reducedMotion()) {
      for (let i = 0; i < 7; i += 1) {
        dieFace.textContent = faces[Math.floor(Math.random() * faces.length)];
        await sleep(46);
      }
    }
    const glyph = outcome.missed ? "✘" : outcome.critical ? "✦" : "⚔";
    const text = label ?? (outcome.missed ? "MISS" : outcome.critical ? "CRIT" : "HIT");
    dieFace.innerHTML = `<span class="die-glyph">${glyph}</span><span class="die-label">${text}</span>`;
    dieFace.classList.add(outcome.missed ? "die-miss" : outcome.critical ? "die-crit" : "die-hit");
    diceOverlay.classList.remove("rolling");
    await sleep(reducedMotion() ? 140 : 380);
    diceOverlay.classList.remove("show");
    await sleep(120);
  }

  return { setMetrics, shake, critFlash, impact, statusBurst, floatText, deathBurst, animateMovement, animateAttack, hitRecoil, deathDissolve, rollReveal, playAbilityVfx };
}
