// Presentation-only combat effects, ported from Mini-Tactics' EffectsRenderer:
// the roll reveal, impact flash/ring, floating damage text, crit screen-flash,
// screen shake, and a death shard-burst. Nothing here touches authoritative
// state — every animation is fire-and-forget and goes silent (no transform left
// behind) under prefers-reduced-motion.

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

export function createEffects({ board, effectsLayer, diceOverlay, dieFace, audio }) {
  const sound = audio ?? { play() {} };

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
    const flash = svg("rect", { class: "fx-critflash", x: box.x, y: box.y, width: box.width, height: box.height, fill: "#fff6e0" });
    effectsLayer.appendChild(flash);
    flash.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 220, easing: "ease-out" })
      .finished.catch(() => {}).then(() => flash.remove());
  }

  // Brief impact pop + expanding ring at the point of contact.
  function impact(point, critical) {
    if (reducedMotion()) return;
    const flash = svg("circle", { class: "fx-flash", cx: point.x, cy: point.y + 8, r: 6, fill: critical ? "#fff0c2" : "#ffd7dc", filter: "url(#softGlow)" });
    effectsLayer.appendChild(flash);
    flash.animate([{ r: 6, opacity: 0.95 }, { r: critical ? 30 : 24, opacity: 0 }], { duration: 200, easing: "ease-out" })
      .finished.catch(() => {}).then(() => flash.remove());
    const ring = svg("circle", { class: "fx-ring", cx: point.x, cy: point.y + 8, r: 8, stroke: critical ? "#ffd26a" : "#ff7684", filter: "url(#softGlow)" });
    effectsLayer.appendChild(ring);
    ring.animate([{ r: 8, opacity: 1, strokeWidth: 5 }, { r: 44, opacity: 0, strokeWidth: 1 }], { duration: 420, easing: "ease-out" })
      .finished.catch(() => {}).then(() => ring.remove());
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

  // The roll reveal. The engine rolls a probability, not a literal d6, so the
  // token tumbles cosmetic glyphs and then lands on the *outcome* — HIT / MISS /
  // CRIT — which is the honest thing it resolved. Awaited so the strike lands
  // after the roll, never before.
  async function rollReveal(outcome) {
    if (!diceOverlay || !dieFace) return;
    sound.play("diceRoll");
    diceOverlay.classList.add("show", "rolling");
    dieFace.className = "die";
    const tumble = ["⚔", "✦", "✘", "✔", "✶", "●"];
    if (!reducedMotion()) {
      for (let i = 0; i < 7; i += 1) {
        dieFace.textContent = tumble[Math.floor(Math.random() * tumble.length)];
        await sleep(46);
      }
    }
    dieFace.textContent = outcome.missed ? "MISS" : outcome.critical ? "CRIT!" : "HIT";
    dieFace.classList.add(outcome.missed ? "die-miss" : outcome.critical ? "die-crit" : "die-hit");
    diceOverlay.classList.remove("rolling");
    await sleep(reducedMotion() ? 140 : 380);
    diceOverlay.classList.remove("show");
    await sleep(120);
  }

  return { shake, critFlash, impact, floatText, deathBurst, rollReveal };
}
