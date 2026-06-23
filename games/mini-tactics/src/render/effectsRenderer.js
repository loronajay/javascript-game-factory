import { gridToScreen } from "../geometry/isometric.js";
import { createSvgElement } from "./svg.js";
import { prefersReducedMotion } from "./motion.js";

export class EffectsRenderer {
  constructor({ unitsLayer, effectsLayer, diceOverlay, dieFace, metrics, audio, svg }) {
    this.unitsLayer = unitsLayer;
    this.effectsLayer = effectsLayer;
    this.diceOverlay = diceOverlay;
    this.dieFace = dieFace;
    // The board SVG is the camera surface for screen-shake. Optional so the
    // renderer still constructs in isolation / headless smoke.
    this.svg = svg ?? null;
    this.metrics = metrics;
    // Sounds that ARE the animation (dice rattle, footstep, projectile whoosh).
    // Outcome sounds (hit/miss/crit/heal) stay with the controller, which reads
    // the resolved event. Defaults to a silent stub for headless use.
    this.audio = audio ?? { play() {} };
  }

  setMetrics(metrics) {
    this.metrics = metrics;
  }

  // Camera punch. Jolts the board SVG a few pixels and settles, scaled by
  // `magnitude` (≈ pixels of throw). Fire-and-forget: the caller does not await
  // it, so the hit's float text rises while the board is still shivering. Skipped
  // entirely under reduced-motion (no transform left behind).
  shake(magnitude = 6) {
    if (!this.svg || prefersReducedMotion()) {
      return;
    }

    const throwTo = (m) => {
      const angle = Math.random() * Math.PI * 2;
      return `translate(${Math.cos(angle) * m}px, ${Math.sin(angle) * m}px)`;
    };

    this.svg.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: throwTo(magnitude) },
        { transform: throwTo(magnitude * 0.6) },
        { transform: throwTo(magnitude * 0.3) },
        { transform: "translate(0, 0)" },
      ],
      { duration: 260, easing: "ease-out" },
    );
  }

  // Whole-board white bloom for a critical hit — the highlight-reel flash. A
  // viewBox-filling rect in the fx layer pops bright and clears fast.
  critFlash() {
    if (prefersReducedMotion() || !this.svg) {
      return;
    }

    const box = this.svg.viewBox.baseVal;
    const flash = createSvgElement("rect", {
      class: "fx-critflash",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fill: "#fff6e0",
    });

    this.effectsLayer.appendChild(flash);
    flash
      .animate(
        [{ opacity: 0.55 }, { opacity: 0 }],
        { duration: 220, easing: "ease-out" },
      )
      .finished.catch(() => {})
      .then(() => flash.remove());
  }

  // A brief held beat at the moment of impact so a hit lands with weight instead
  // of flowing straight into the next animation. Honors reduced-motion by not
  // stalling. Presentation only — never gates rules.
  async holdFrame(ms) {
    if (prefersReducedMotion()) {
      return;
    }
    await sleep(ms);
  }

  async rollDie(rollResult) {
    this.audio.play("diceRoll");
    this.diceOverlay.classList.add("show", "rolling");

    for (let index = 0; index < 8; index += 1) {
      this.dieFace.textContent = String(1 + Math.floor(Math.random() * 6));
      await sleep(42);
    }

    this.dieFace.textContent = String(rollResult);
    await sleep(300);
    this.diceOverlay.classList.remove("rolling");
    await sleep(200);
    this.diceOverlay.classList.remove("show");
  }

  async animateMovement(unit, from, to) {
    const point = gridToScreen(this.metrics, to.x, to.y);
    const element = this.unitsLayer.querySelector(`[data-id="${unit.id}"]`);

    if (!element) {
      return;
    }

    this.audio.play("unitMove");

    const fromPoint = gridToScreen(this.metrics, from.x, from.y);
    const dx = fromPoint.x - point.x;
    const dy = fromPoint.y - point.y;
    const baseY = point.y + this.metrics.tileHeight * 0.45;

    await element.animate(
      [
        {
          transform:
            `translate(${point.x + dx}px ${baseY + dy}px) scale(1)`
        },
        {
          transform:
            `translate(${point.x}px ${baseY - 12}px) scale(1.08)`,
          offset: 0.55
        },
        {
          transform:
            `translate(${point.x}px ${baseY}px) scale(1)`
        }
      ],
      {
        duration: 420,
        easing: "cubic-bezier(.2,.8,.2,1)"
      }
    ).finished.catch(() => {});
  }

  async animateAttack(attacker, target) {
    const attackerPoint = gridToScreen(
      this.metrics,
      attacker.x,
      attacker.y
    );
    const targetPoint = gridToScreen(
      this.metrics,
      target.x,
      target.y
    );

    if (attacker.type === "warrior" || attacker.type === "tank") {
      await this.animateMeleeLunge(attacker, attackerPoint, targetPoint);
      return;
    }

    // Ranged launch whoosh — the impact sound is played by the controller once
    // the roll resolves. Ranger and medic each have their own projectile.
    this.audio.play(
      attacker.type === "ranger" ? "arrowAirborne" : "medicAttackAirborne",
    );

    const attackColor =
      attacker.type === "ranger" ? "#f7e27d" : "#9ef6d0";

    const path = createSvgElement("path", {
      d:
        `M ${attackerPoint.x} ${attackerPoint.y + 8} ` +
        `Q ${(attackerPoint.x + targetPoint.x) / 2} ` +
        `${Math.min(attackerPoint.y, targetPoint.y) - 45} ` +
        `${targetPoint.x} ${targetPoint.y + 8}`,
      class: "fx-line",
      stroke: attackColor,
      "stroke-width": attacker.type === "ranger" ? 5 : 7,
      filter: "url(#softGlow)"
    });

    path.style.strokeDasharray = "14 10";
    this.effectsLayer.appendChild(path);

    await path.animate(
      [
        { strokeDashoffset: "70", opacity: 0 },
        { strokeDashoffset: "0", opacity: 1, offset: 0.25 },
        { strokeDashoffset: "-50", opacity: 0 }
      ],
      {
        duration: 420,
        easing: "ease-out"
      }
    ).finished.catch(() => {});

    path.remove();
  }

  async animateHealBeam(medic, target) {
    const source = gridToScreen(this.metrics, medic.x, medic.y);
    const destination = gridToScreen(this.metrics, target.x, target.y);

    const line = createSvgElement("path", {
      d:
        `M ${source.x} ${source.y + 8} ` +
        `C ${source.x} ${source.y - 45}, ` +
        `${destination.x} ${destination.y - 45}, ` +
        `${destination.x} ${destination.y + 8}`,
      class: "fx-line",
      stroke: "#74f0ac",
      "stroke-width": 8,
      filter: "url(#softGlow)"
    });

    this.effectsLayer.appendChild(line);

    await line.animate(
      [
        {
          strokeDasharray: "1 120",
          strokeDashoffset: "0",
          opacity: 0.2
        },
        {
          strokeDasharray: "70 40",
          strokeDashoffset: "-90",
          opacity: 1
        },
        {
          strokeDasharray: "1 120",
          strokeDashoffset: "-180",
          opacity: 0
        }
      ],
      {
        duration: 520,
        easing: "ease-in-out"
      }
    ).finished.catch(() => {});

    line.remove();
  }

  async animateHit(target, damage, critical) {
    const point = gridToScreen(this.metrics, target.x, target.y);

    // Camera reacts to the blow: a crit throws the board hard and flashes white;
    // an ordinary hit gives a small jolt scaled by how much it hurt. A pure 0
    // (fully defended) barely registers. Fired, not awaited, so the board shivers
    // under the rest of the impact animation.
    if (critical) {
      this.critFlash();
      this.shake(11);
    } else {
      this.shake(Math.min(8, 2.5 + damage * 1.4));
    }

    // Brief impact flash for punch — pops bright and clears fast under the ring.
    const flash = createSvgElement("circle", {
      class: "fx-flash",
      cx: point.x,
      cy: point.y + 8,
      r: 6,
      fill: critical ? "#fff0c2" : "#ffd7dc",
      filter: "url(#softGlow)"
    });

    this.effectsLayer.appendChild(flash);
    flash.animate(
      [
        { r: 6, opacity: .95 },
        { r: critical ? 30 : 24, opacity: 0 }
      ],
      { duration: 200, easing: "ease-out" }
    ).finished.catch(() => {}).then(() => flash.remove());

    const ring = createSvgElement("circle", {
      class: "fx-ring",
      cx: point.x,
      cy: point.y + 8,
      r: 8,
      stroke: critical ? "#ffd26a" : "#ff7684",
      filter: "url(#softGlow)"
    });

    this.effectsLayer.appendChild(ring);

    const animations = [
      ring.animate(
        [
          { r: 8, opacity: 1, strokeWidth: 5 },
          { r: 44, opacity: 0, strokeWidth: 1 }
        ],
        {
          duration: 420,
          easing: "ease-out"
        }
      ).finished.catch(() => {})
    ];

    const unitElement =
      this.unitsLayer.querySelector(`[data-id="${target.id}"]`);

    if (unitElement) {
      const baseY = point.y + this.metrics.tileHeight * 0.45;

      animations.push(
        unitElement.animate(
          [
            { transform: `translate(${point.x}px ${baseY}px)` },
            {
              transform:
                `translate(${point.x - 8}px ${baseY}px) rotate(-5deg)`
            },
            {
              transform:
                `translate(${point.x + 7}px ${baseY}px) rotate(4deg)`
            },
            { transform: `translate(${point.x}px ${baseY}px)` }
          ],
          {
            duration: 330,
            easing: "ease-out"
          }
        ).finished.catch(() => {})
      );
    }

    await Promise.all(animations);
    ring.remove();

    // Hit-stop: a held beat at the moment of contact gives the blow weight. A
    // crit lingers a touch longer for emphasis.
    await this.holdFrame(critical ? 110 : 70);

    await this.floatText(
      target,
      damage === 0 ? "0" : `-${damage}`,
      critical ? "#ffd26a" : "#ff7684"
    );
  }

  async animateHeal(target, amount, critical) {
    const point = gridToScreen(this.metrics, target.x, target.y);
    const ring = createSvgElement("circle", {
      class: "fx-ring",
      cx: point.x,
      cy: point.y + 8,
      r: 10,
      stroke: critical ? "#eaff95" : "#73e6a6",
      filter: "url(#softGlow)"
    });

    this.effectsLayer.appendChild(ring);

    await ring.animate(
      [
        { r: 10, opacity: 0.2, strokeWidth: 10 },
        { r: 40, opacity: 1, strokeWidth: 4, offset: 0.45 },
        { r: 58, opacity: 0, strokeWidth: 1 }
      ],
      {
        duration: 560,
        easing: "ease-out"
      }
    ).finished.catch(() => {});

    ring.remove();
    await this.floatText(target, `+${amount}`, "#73e6a6");
  }

  async animateDeath(target) {
    const point = gridToScreen(this.metrics, target.x, target.y);
    const element =
      this.unitsLayer.querySelector(`[data-id="${target.id}"]`);

    if (!element) {
      return;
    }

    const baseY = point.y + this.metrics.tileHeight * 0.45;

    // A deactivated holo-token shatters: a burst of team-colored shards flung
    // from the unit point. Color is read off the element's own --team so it
    // stays faithful to the roster hue without the renderer needing match state.
    this.shatterBurst(point.x, baseY - 8, element.style.getPropertyValue("--team"));
    this.shake(6);

    await element.animate(
      [
        {
          transform:
            `translate(${point.x}px ${baseY}px) scale(1)`,
          opacity: 1
        },
        {
          transform:
            `translate(${point.x}px ${baseY + 8}px) ` +
            "scale(1.12,.7) rotate(8deg)",
          opacity: 0.75
        },
        {
          transform:
            `translate(${point.x}px ${baseY + 24}px) ` +
            "scale(.2) rotate(30deg)",
          opacity: 0
        }
      ],
      {
        duration: 620,
        easing: "cubic-bezier(.3,.7,.3,1)"
      }
    ).finished.catch(() => {});
  }

  // Fling a handful of small shards outward from (x, y) in the given hue. Pure
  // decoration over the death dissolve; skipped under reduced-motion. Each shard
  // removes itself when its flight finishes.
  shatterBurst(x, y, color) {
    if (prefersReducedMotion()) {
      return;
    }

    const hue = color?.trim() || "#f7f9fc";
    const count = 11;

    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = 26 + Math.random() * 30;
      const size = 2.5 + Math.random() * 3.5;
      const shard = createSvgElement("rect", {
        class: "fx-shard",
        x: x - size / 2,
        y: y - size / 2,
        width: size,
        height: size,
        rx: 1,
        fill: hue,
        filter: "url(#softGlow)",
      });

      this.effectsLayer.appendChild(shard);

      const driftX = Math.cos(angle) * distance;
      const driftY = Math.sin(angle) * distance - 10; // bias upward a little
      shard
        .animate(
          [
            { transform: "translate(0,0) scale(1)", opacity: 1 },
            {
              transform:
                `translate(${driftX}px, ${driftY + 18}px) ` +
                `rotate(${(Math.random() - 0.5) * 220}deg) scale(.4)`,
              opacity: 0,
            },
          ],
          { duration: 480 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" },
        )
        .finished.catch(() => {})
        .then(() => shard.remove());
    }
  }

  async floatText(unit, text, color) {
    const point = gridToScreen(this.metrics, unit.x, unit.y);
    const element = createSvgElement("text", {
      class: "float-text",
      x: point.x,
      y: point.y - 2,
      "text-anchor": "middle",
      fill: color,
      text
    });

    this.effectsLayer.appendChild(element);

    await element.animate(
      [
        {
          transform: "translateY(8px) scale(.7)",
          opacity: 0
        },
        {
          transform: "translateY(-5px) scale(1.15)",
          opacity: 1,
          offset: 0.25
        },
        {
          transform: "translateY(-42px) scale(1)",
          opacity: 0
        }
      ],
      {
        duration: 720,
        easing: "ease-out"
      }
    ).finished.catch(() => {});

    element.remove();
  }

  async animateMeleeLunge(attacker, attackerPoint, targetPoint) {
    const element =
      this.unitsLayer.querySelector(`[data-id="${attacker.id}"]`);

    if (!element) {
      return;
    }

    const deltaX = (targetPoint.x - attackerPoint.x) * 0.18;
    const deltaY = (targetPoint.y - attackerPoint.y) * 0.18;
    const baseY =
      attackerPoint.y + this.metrics.tileHeight * 0.45;

    await element.animate(
      [
        {
          transform:
            `translate(${attackerPoint.x}px ${baseY}px)`
        },
        {
          transform:
            `translate(${attackerPoint.x - deltaX * 0.3}px ` +
            `${baseY - deltaY * 0.3}px)`
        },
        {
          transform:
            `translate(${attackerPoint.x + deltaX}px ` +
            `${baseY + deltaY}px) scale(1.12)`
        },
        {
          transform:
            `translate(${attackerPoint.x}px ${baseY}px)`
        }
      ],
      {
        duration: 360,
        easing: "cubic-bezier(.2,.75,.2,1)"
      }
    ).finished.catch(() => {});
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
