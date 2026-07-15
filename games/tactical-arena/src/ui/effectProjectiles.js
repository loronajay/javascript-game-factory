// Projectile primitives for combat VFX. They own projectile SVG shapes and the
// shared quadratic flight path; callers decide when a projectile should launch.

export function createEffectProjectiles({ effectsLayer, reducedMotion, svg, waitForAnimation }) {
  const projectileBuilders = {
    arrow(colors, size) {
      const group = svg("g", { class: "fx-projectile" });
      group.appendChild(svg("line", { x1: -9 * size, y1: 0, x2: 7 * size, y2: 0, stroke: colors.trail, "stroke-width": 2.2 * size, "stroke-linecap": "round" }));
      group.appendChild(svg("polygon", { points: `${7 * size},${-3.2 * size} ${12.5 * size},0 ${7 * size},${3.2 * size}`, fill: colors.core }));
      group.appendChild(svg("line", { x1: -9 * size, y1: 0, x2: -5.5 * size, y2: -2.6 * size, stroke: colors.core, "stroke-width": 1.6 * size, "stroke-linecap": "round" }));
      group.appendChild(svg("line", { x1: -9 * size, y1: 0, x2: -5.5 * size, y2: 2.6 * size, stroke: colors.core, "stroke-width": 1.6 * size, "stroke-linecap": "round" }));
      return group;
    },
    orb(colors, size) {
      const group = svg("g", { class: "fx-projectile", filter: "url(#softGlow)" });
      const halo = svg("circle", { cx: 0, cy: 0, r: 7 * size, fill: colors.trail });
      halo.style.opacity = "0.4";
      group.appendChild(halo);
      const tail = svg("ellipse", { cx: -7 * size, cy: 0, rx: 7 * size, ry: 2.6 * size, fill: colors.trail });
      tail.style.opacity = "0.55";
      group.appendChild(tail);
      group.appendChild(svg("circle", { cx: 0, cy: 0, r: 4 * size, fill: colors.core }));
      const spark = svg("circle", { cx: 0, cy: 0, r: 1.8 * size, fill: "#ffffff" });
      spark.style.opacity = "0.9";
      group.appendChild(spark);
      return group;
    },
    tracer(colors, size) {
      const group = svg("g", { class: "fx-projectile", filter: "url(#softGlow)" });
      const wake = svg("line", { x1: -22 * size, y1: 0, x2: -6 * size, y2: 0, stroke: colors.trail, "stroke-width": 1.6 * size, "stroke-linecap": "round" });
      wake.style.opacity = "0.5";
      group.appendChild(wake);
      group.appendChild(svg("line", { x1: -8 * size, y1: 0, x2: 9 * size, y2: 0, stroke: colors.core, "stroke-width": 2.6 * size, "stroke-linecap": "round" }));
      group.appendChild(svg("circle", { cx: 9 * size, cy: 0, r: 2.1 * size, fill: "#ffffff" }));
      return group;
    },
    lob(colors, size) {
      const group = svg("g", { class: "fx-projectile" });
      group.appendChild(svg("rect", { x: -5 * size, y: -1.9 * size, width: 10 * size, height: 3.8 * size, rx: 1.8 * size, fill: colors.core, stroke: colors.trail, "stroke-width": 1 }));
      const ember = svg("circle", { cx: 5.5 * size, cy: 0, r: 2 * size, fill: "#ff8a4c", filter: "url(#softGlow)" });
      group.appendChild(ember);
      return group;
    },
    rock(colors, size) {
      const group = svg("g", { class: "fx-projectile" });
      group.appendChild(svg("polygon", {
        points: [
          `${-7 * size},${-2.5 * size}`,
          `${-3.5 * size},${-6.2 * size}`,
          `${2.5 * size},${-5.4 * size}`,
          `${7.2 * size},${-1.4 * size}`,
          `${5.6 * size},${4.1 * size}`,
          `${-1.2 * size},${6.2 * size}`,
          `${-6.4 * size},${3.1 * size}`
        ].join(" "),
        fill: colors.core,
        stroke: colors.trail,
        "stroke-width": 1.4 * size,
        "stroke-linejoin": "round"
      }));
      const ridge = svg("path", {
        d: `M ${-3.8 * size} ${-2.2 * size} L ${0.5 * size} ${-3.9 * size} L ${4.1 * size} ${-0.7 * size}`,
        fill: "none",
        stroke: "#d2c4a8",
        "stroke-width": 1.1 * size,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
      ridge.style.opacity = "0.45";
      group.appendChild(ridge);
      const chip = svg("circle", { cx: -1.8 * size, cy: 2.1 * size, r: 1.1 * size, fill: colors.trail });
      chip.style.opacity = "0.5";
      group.appendChild(chip);
      return group;
    }
  };

  // Flies one projectile and resolves when it lands. Shape builders draw pointing
  // +x; sampled keyframes rotate the projectile to the curve tangent.
  async function flyProjectile(from, to, spec = {}, { delay = 0, opacity = 1, trail = true } = {}) {
    if (reducedMotion()) return;
    const colors = spec.colors ?? { core: "#f7e27d", trail: "#8a6d3a" };
    const size = spec.size ?? 1;
    const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - (spec.arcHeight ?? 50) };
    const duration = spec.durationMs ?? 430;

    if (trail) {
      const wake = svg("path", {
        d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
        class: "fx-line fx-projectile-trail",
        stroke: colors.trail,
        "stroke-width": 2,
        filter: "url(#softGlow)"
      });
      effectsLayer.appendChild(wake);
      wake.animate([
        { opacity: 0 },
        { opacity: 0.3 * opacity, offset: 0.4 },
        { opacity: 0 }
      ], { duration: duration + 220, delay, easing: "ease-out", fill: "backwards" })
        .finished.catch(() => {}).then(() => wake.remove());
    }

    const builder = projectileBuilders[spec.shape] ?? projectileBuilders.orb;
    const projectile = builder(colors, size);
    projectile.style.opacity = String(opacity);
    effectsLayer.appendChild(projectile);

    const steps = 22;
    const tumble = spec.shape === "lob" || spec.shape === "rock" ? 540 : 0;
    const frames = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const inv = 1 - t;
      const x = inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x;
      const y = inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y;
      const dx = 2 * inv * (control.x - from.x) + 2 * t * (to.x - control.x);
      const dy = 2 * inv * (control.y - from.y) + 2 * t * (to.y - control.y);
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + tumble * t;
      frames.push({ transform: `translate(${x}px, ${y}px) rotate(${deg}deg)`, offset: t });
    }
    frames[0].opacity = 0;
    if (frames[1]) frames[1].opacity = opacity;
    await waitForAnimation(projectile.animate(frames, { duration, delay, easing: "linear", fill: "backwards" }));
    projectile.remove();
  }

  return { flyProjectile };
}
