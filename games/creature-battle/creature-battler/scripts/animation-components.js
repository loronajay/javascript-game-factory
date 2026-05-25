// ── Animation Components ──────────────────────────────────────────────────
// Low-level VFX building blocks used by the animation engine.
// Each function returns a Promise that resolves when the effect is done,
// except animStatusRing which returns a { clear } controller.
//
// Load order: this file must load BEFORE animation-engine.js and
// battle-animations.js since both depend on these globals.
// ─────────────────────────────────────────────────────────────────────────

// ── Shared utilities ─────────────────────────────────────────────────────

function delayMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Adds a CSS class to an element, resolves when animationend fires.
// 1200ms hard timeout guards against missing animationend events.
// Uses e.target === el to ignore animationend events that bubble up from
// child elements (e.g. creature_tint divs inside creature-breathe-wrapper).
function animateEl(el, className, cssVars) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', handler);
      el.classList.remove(className);
      if (cssVars) {
        for (const key of Object.keys(cssVars)) el.style.removeProperty(key);
      }
      resolve();
    };
    const handler = (e) => {
      if (e.target !== el) return;
      finish();
    };
    if (cssVars) {
      for (const [key, val] of Object.entries(cssVars)) el.style.setProperty(key, val);
    }
    el.classList.add(className);
    el.addEventListener('animationend', handler);
    setTimeout(finish, 1200);
  });
}

// ── DOM helpers ──────────────────────────────────────────────────────────

// Returns the CSS scale factor applied to #game-canvas.
// getBoundingClientRect() returns viewport px; dividing by this converts back
// to unscaled CSS px so projectile/lunge positions land on the right creature.
function _getCanvasScale() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return 1;
  if (canvas.classList.contains('mobile-layout')) return 1;
  const rect = canvas.getBoundingClientRect();
  return rect.width / 960;
}

// Returns (or lazily creates) the VFX overlay inside #battle-field.
function getAnimOverlay() {
  let overlay = document.getElementById('battle-anim-overlay');
  if (!overlay) {
    const field = document.getElementById('battle-field');
    if (!field) return null;
    overlay = document.createElement('div');
    overlay.id = 'battle-anim-overlay';
    field.appendChild(overlay);
  }
  return overlay;
}

// Field flashes cover the visual battlefield from the battle screen layer so
// mobile command-panel overlays cannot reveal the clipped edge of #battle-field.
function getFieldFlashHost() {
  return document.getElementById('screen-battle') || getAnimOverlay();
}

// Returns the center of an element in overlay-relative CSS px (unscaled).
function getElementCenter(el, overlay) {
  const er    = el.getBoundingClientRect();
  const or    = overlay.getBoundingClientRect();
  const scale = _getCanvasScale();
  return {
    x: ((er.left + er.width  / 2) - or.left) / scale,
    y: ((er.top  + er.height / 2) - or.top)  / scale,
  };
}

// ── animProjectile ───────────────────────────────────────────────────────
// Spawns an element at fromEl's center and animates it to toEl's center.
//
// options:
//   duration  ms         travel time (default 300)
//   arc       px         negative = arc upward, positive = arc downward (omit for flat)
//   size      px         diameter (default 14)
//   color     css color  fill color (default '#ffffff')
//   shape     string     'circle' (default) | 'oval' | 'shard'
//   trail     bool       adds a trailing glow via box-shadow (default false)

function animProjectile(fromEl, toEl, options = {}) {
  const overlay = getAnimOverlay();
  if (!fromEl || !toEl || !overlay) return Promise.resolve();

  const from     = getElementCenter(fromEl, overlay);
  const to       = getElementCenter(toEl,   overlay);
  const dx       = to.x - from.x;
  const dy       = to.y - from.y;
  const angle    = Math.atan2(dy, dx) * (180 / Math.PI);
  const duration = options.duration ?? 300;
  const size     = options.size     ?? 14;
  const color    = options.color    ?? '#ffffff';

  const el = document.createElement('div');
  el.className = 'anim-projectile';

  // Shape variants
  let borderRadius = '50%';
  let width = size, height = size;
  if (options.shape === 'oval') {
    width = size * 1.8; height = size * 0.7;
    borderRadius = '40%';
  } else if (options.shape === 'shard') {
    width = size * 0.6; height = size * 2;
    borderRadius = '2px';
  }

  const shadow = options.trail
    ? `box-shadow: 0 0 ${size}px ${color}, 0 0 ${Math.round(size * 0.4)}px #fff;`
    : '';

  el.style.cssText = `
    left: ${from.x}px;
    top:  ${from.y}px;
    width: ${width}px;
    height: ${height}px;
    background: ${color};
    border-radius: ${borderRadius};
    ${shadow}
  `;

  el.style.setProperty('--proj-dx',       `${dx}px`);
  el.style.setProperty('--proj-dy',       `${dy}px`);
  el.style.setProperty('--proj-angle',    `${angle}deg`);
  el.style.setProperty('--proj-duration', `${duration}ms`);
  if (options.arc != null) {
    el.style.setProperty('--proj-arc', `${options.arc}px`);
  }

  overlay.appendChild(el);
  el.classList.add(options.arc != null ? 'anim-proj-arc' : 'anim-proj-flat');

  return new Promise(resolve => {
    setTimeout(() => { el.remove(); resolve(); }, duration + 50);
  });
}

// ── animBeam ─────────────────────────────────────────────────────────────
// Draws a line that extends from fromEl to toEl then fades out.
//
// options:
//   duration  ms         total time including fade (default 400)
//   color     css color  (default '#ffffff')
//   width     px         beam thickness (default 4)
//   glow      bool       adds a drop-shadow glow (default false)

function animBeam(fromEl, toEl, options = {}) {
  const overlay = getAnimOverlay();
  if (!fromEl || !toEl || !overlay) return Promise.resolve();

  const from     = getElementCenter(fromEl, overlay);
  const to       = getElementCenter(toEl,   overlay);
  const dx       = to.x - from.x;
  const dy       = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle    = Math.atan2(dy, dx) * (180 / Math.PI);
  const duration = options.duration ?? 400;
  const color    = options.color    ?? '#ffffff';
  const thick    = options.width    ?? 4;

  const el = document.createElement('div');
  el.className = 'anim-beam';

  const glow = options.glow
    ? `filter: drop-shadow(0 0 ${thick * 2}px ${color});`
    : '';

  el.style.cssText = `
    left: ${from.x}px;
    top:  ${from.y}px;
    height: ${thick}px;
    background: ${color};
    transform: translateY(-50%) rotate(${angle}deg);
    transform-origin: left center;
    ${glow}
  `;

  el.style.setProperty('--beam-length',   `${distance}px`);
  el.style.setProperty('--beam-duration', `${duration}ms`);

  overlay.appendChild(el);
  el.classList.add('anim-beam-extend');

  return new Promise(resolve => {
    setTimeout(() => { el.remove(); resolve(); }, duration + 50);
  });
}

// ── animParticleBurst ────────────────────────────────────────────────────
// Spawns N particles radiating from originEl's center.
//
// options:
//   count     int        number of particles (default 8)
//   spread    px         max radius of burst (default 55)
//   duration  ms         (default 420)
//   size      px         particle diameter / font-size (default 6)
//   color     css color  (default '#ffffff')
//   direction 'up'|'down'|'all'  bias (default 'all')
//   glow      bool       adds a radial glow per particle (default false)
//   content   string     if set, render this text/emoji as the particle instead of a colored dot

function animParticleBurst(originEl, options = {}) {
  const overlay = getAnimOverlay();
  if (!originEl || !overlay) return Promise.resolve();

  const center   = getElementCenter(originEl, overlay);
  const count    = options.count    ?? 8;
  const spread   = options.spread   ?? 55;
  const duration = options.duration ?? 420;
  const size     = options.size     ?? 6;
  const color    = options.color    ?? '#ffffff';
  const content  = options.content  ?? null;

  // Direction bias: limit angle range
  let angleMin = 0, angleMax = Math.PI * 2;
  if (options.direction === 'up')   { angleMin = Math.PI * 1.15; angleMax = Math.PI * 1.85; }
  if (options.direction === 'down') { angleMin = Math.PI * 0.15; angleMax = Math.PI * 0.85; }

  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = angleMin + (i / count) * (angleMax - angleMin) + (Math.random() - 0.5) * 0.6;
    const dist  = spread * (0.45 + Math.random() * 0.55);
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist;

    const el = document.createElement('div');
    el.className = 'anim-particle';

    if (content) {
      el.textContent = content;
      const glow = options.glow ? `text-shadow: 0 0 ${size}px ${color};` : '';
      el.style.cssText = `
        left: ${center.x}px;
        top:  ${center.y}px;
        width: auto;
        height: auto;
        background: transparent;
        font-size: ${size}px;
        line-height: 1;
        color: ${color};
        user-select: none;
        ${glow}
        transform: translate(-50%, -50%);
        transition: transform ${duration}ms ease-out, opacity ${duration * 0.9}ms ease-out;
      `;
    } else {
      const glow = options.glow ? `box-shadow: 0 0 ${size * 2}px ${color};` : '';
      el.style.cssText = `
        left: ${center.x}px;
        top:  ${center.y}px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        ${glow}
        transform: translate(-50%, -50%);
        transition: transform ${duration}ms ease-out, opacity ${duration * 0.9}ms ease-out;
      `;
    }

    overlay.appendChild(el);
    particles.push({ el, dx, dy });
  }

  // Force reflow so transition fires on the next frame
  overlay.getBoundingClientRect();

  particles.forEach(({ el, dx, dy }) => {
    el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    el.style.opacity   = '0';
  });

  return new Promise(resolve => {
    setTimeout(() => {
      particles.forEach(({ el }) => el.remove());
      resolve();
    }, duration + 50);
  });
}

// ── animFieldFlash ───────────────────────────────────────────────────────
// Brief color overlay over the entire battle field.
//
// options:
//   duration  ms         (default 200)
//   color     css color  (default '#ffffff')
//   opacity   0–1        peak opacity (default 0.5)

function animFieldFlash(options = {}) {
  const host = getFieldFlashHost();
  if (!host) return Promise.resolve();

  const duration = options.duration ?? 200;
  const color    = options.color   ?? '#ffffff';
  const opacity  = options.opacity ?? 0.5;

  const el = document.createElement('div');
  el.className = 'anim-field-flash';
  el.style.background = color;
  el.style.setProperty('--flash-opacity',  String(opacity));
  el.style.setProperty('--flash-duration', `${duration}ms`);

  host.appendChild(el);
  el.classList.add('anim-field-flash-in');

  return new Promise(resolve => {
    setTimeout(() => { el.remove(); resolve(); }, duration + 50);
  });
}

// ── animScreenShake ──────────────────────────────────────────────────────
// Jitters #battle-field. Does not affect the overlay or creature positions.
//
// options:
//   duration  ms           (default 300)
//   intensity px           max displacement (default 5)
//   style     'smooth'|'stutter'  smooth = sine wave, stutter = snap (lightning) (default 'smooth')

function animScreenShake(options = {}) {
  const field = document.getElementById('battle-field');
  if (!field) return Promise.resolve();

  const duration  = options.duration  ?? 300;
  const intensity = options.intensity ?? 5;
  const style     = options.style     ?? 'smooth';

  field.style.setProperty('--shake-intensity', `${intensity}px`);
  field.style.setProperty('--shake-duration',  `${duration}ms`);

  const cls = style === 'stutter' ? 'anim-shake-stutter' : 'anim-shake-smooth';
  field.classList.add(cls);

  return new Promise(resolve => {
    setTimeout(() => {
      field.classList.remove(cls);
      field.style.removeProperty('--shake-intensity');
      field.style.removeProperty('--shake-duration');
      resolve();
    }, duration + 50);
  });
}

// ── animCreatureShake ────────────────────────────────────────────────────
// Rapid position jitter on a single creature element.
//
// options:
//   duration  ms   (default 200)
//   intensity px   (default 4)

function animCreatureShake(el, options = {}) {
  if (!el) return Promise.resolve();

  const duration  = options.duration  ?? 200;
  const intensity = options.intensity ?? 4;

  el.style.setProperty('--shake-intensity', `${intensity}px`);
  el.style.setProperty('--shake-duration',  `${duration}ms`);
  el.classList.add('anim-creature-shake');

  return new Promise(resolve => {
    setTimeout(() => {
      el.classList.remove('anim-creature-shake');
      el.style.removeProperty('--shake-intensity');
      el.style.removeProperty('--shake-duration');
      resolve();
    }, duration + 50);
  });
}

// ── animWaveSweep ────────────────────────────────────────────────────────
// Spawns an expanding elliptical wave at fromEl that travels toward the
// target side of the field, growing as it goes. Used for AoE sweep moves.
//
// options:
//   direction  1 | -1     +1 = rightward (player→opponent), -1 = leftward (default 1)
//   duration   ms         total travel time (default 380)
//   color      css color  wave fill color (default '#d4c0a0')

function animWaveSweep(fromEl, options = {}) {
  const overlay = getAnimOverlay();
  if (!fromEl || !overlay) return Promise.resolve();

  const duration = options.duration  ?? 380;
  const color    = options.color     ?? '#d4c0a0';
  const dir      = options.direction ?? 1;

  const center  = getElementCenter(fromEl, overlay);
  const sweepTx = Math.round(overlay.offsetWidth * 0.38) * dir;

  const wave = document.createElement('div');
  wave.className = 'anim-sweep-wave';
  wave.style.cssText = `
    left: ${center.x}px;
    top:  ${center.y}px;
    background: radial-gradient(ellipse at center, ${color}cc 0%, ${color}66 45%, transparent 72%);
    box-shadow: 0 0 22px ${color}55;
    --sweep-tx: ${sweepTx}px;
    --sweep-duration: ${duration}ms;
  `;
  overlay.appendChild(wave);

  return new Promise(resolve => {
    setTimeout(() => { wave.remove(); resolve(); }, duration + 60);
  });
}

// ── animParticleStream ───────────────────────────────────────────────────
// Continuously emits particles from originEl for a set duration.
// Returns a { clear } controller — non-blocking. Engine fires and moves on;
// the stream runs in parallel with subsequent timeline events.
//
// options:
//   duration  ms          total stream time (required)
//   interval  ms          ms between emissions (default 80)
//   count     number      particles per emission (default 3)
//   color, spread, direction, size, glow — passed through to animParticleBurst

function animParticleStream(originEl, options = {}) {
  if (!originEl) return { clear: () => {} };

  const interval  = options.interval ?? 80;
  const duration  = options.duration ?? 600;
  const burstOpts = {
    count:     options.count     ?? 3,
    color:     options.color     ?? '#ffffff',
    spread:    options.spread    ?? 30,
    direction: options.direction ?? 'up',
    size:      options.size      ?? 4,
    glow:      options.glow      ?? false,
    content:   options.content,
    duration:  Math.min(interval * 3, 300),
  };

  const id = setInterval(() => animParticleBurst(originEl, burstOpts), interval);
  const timer = setTimeout(() => clearInterval(id), duration);

  return {
    clear() {
      clearInterval(id);
      clearTimeout(timer);
    },
  };
}

// ── animShockwave ────────────────────────────────────────────────────────
// Spawns an expanding ring at originEl's center that grows outward and fades.
// The canonical "kinetic impact" ring from fighting games.
//
// options:
//   size       px          max radius (default 60)
//   thickness  px          ring border thickness (default 4)
//   color      css color   (default '#ffffff')
//   opacity    0–1         peak opacity (default 0.7)
//   duration   ms          total expand + fade time (default 380)

function animShockwave(originEl, options = {}) {
  const overlay = getAnimOverlay();
  if (!originEl || !overlay) return Promise.resolve();

  const size      = options.size      ?? 60;
  const thickness = options.thickness ?? 4;
  const color     = options.color     ?? '#ffffff';
  const opacity   = options.opacity   ?? 0.7;
  const duration  = options.duration  ?? 380;

  const center = getElementCenter(originEl, overlay);

  const ring = document.createElement('div');
  ring.className = 'anim-shockwave';
  // --shock-scale: unitless; base div = 10px, so scale = (size * 2) / 10
  ring.style.cssText = `
    left: ${center.x}px;
    top:  ${center.y}px;
    border-color: ${color};
    border-width: ${thickness}px;
    --shock-scale: ${size * 2 / 10};
    --shock-opacity: ${opacity};
    --shock-duration: ${duration}ms;
  `;
  overlay.appendChild(ring);

  return new Promise(resolve => {
    setTimeout(() => { ring.remove(); resolve(); }, duration + 40);
  });
}

// ── animCreatureTint ─────────────────────────────────────────────────────
// Temporarily overlays a color on a creature sprite using mix-blend-mode.
// Targets the .creature-breathe-wrapper inside the creature element so the
// tint follows the sprite rather than the whole creature div.
//
// options:
//   color    css color   tint color
//   opacity  0–1         peak opacity (default 0.35)
//   duration ms          total fade-in hold fade-out time (default 500)
//   blend    string      CSS mix-blend-mode (default 'screen')

function animCreatureTint(el, options = {}) {
  if (!el) return Promise.resolve();

  const wrapper  = el.querySelector('.creature-breathe-wrapper') ?? el;
  const img      = wrapper.querySelector('img');
  const color    = options.color    ?? '#ffffff';
  const opacity  = options.opacity  ?? 0.35;
  const duration = options.duration ?? 500;
  const blend    = options.blend    ?? 'screen';

  const tint = document.createElement('div');
  tint.className = 'anim-creature-tint';
  tint.style.cssText = `
    background: ${color};
    mix-blend-mode: ${blend};
    --tint-opacity: ${opacity};
    --tint-duration: ${duration}ms;
  `;

  // Mask to the sprite's alpha channel so the tint follows the creature shape
  // rather than appearing as a solid rectangle over the transparent areas.
  if (img && img.src) {
    const maskUrl = `url('${img.src}')`;
    tint.style.maskImage         = maskUrl;
    tint.style.maskSize          = 'contain';
    tint.style.maskRepeat        = 'no-repeat';
    tint.style.maskPosition      = 'center';
    tint.style.webkitMaskImage   = maskUrl;
    tint.style.webkitMaskSize    = 'contain';
    tint.style.webkitMaskRepeat  = 'no-repeat';
    tint.style.webkitMaskPosition = 'center';
    // Match the opponent's horizontal flip so the mask aligns
    if (img.style.transform) tint.style.transform = img.style.transform;
  }

  wrapper.appendChild(tint);

  return new Promise(resolve => {
    setTimeout(() => { tint.remove(); resolve(); }, duration + 40);
  });
}

// ── animHitStop ──────────────────────────────────────────────────────────
// Briefly pauses all CSS animations in the battle field to create a
// freeze-frame on heavy impacts. The timeline scheduler continues via
// setTimeout so subsequent events still fire at their absolute timestamps.
//
// options:
//   duration  ms   freeze time (default 80)

function animHitStop(options = {}) {
  const duration = options.duration ?? 80;
  const field    = document.getElementById('battle-field');
  const overlay  = document.getElementById('battle-anim-overlay');

  const pause  = el => { if (el) el.style.animationPlayState = 'paused'; };
  const resume = el => { if (el) el.style.removeProperty('animation-play-state'); };

  pause(field);
  pause(overlay);

  return new Promise(resolve => {
    setTimeout(() => {
      resume(field);
      resume(overlay);
      resolve();
    }, duration);
  });
}

// ── getLungeVars ─────────────────────────────────────────────────────────
// Returns --anim-dx / --anim-dy CSS vars for a lunge from actorEl to targetEl.
// Used by both the timeline engine (lunge: true on creature_anim events) and
// the legacy CSS-class animation path in battle-animations.js.

function getLungeVars(actorEl, targetEl) {
  const ar    = actorEl.getBoundingClientRect();
  const tr    = targetEl.getBoundingClientRect();
  const scale = _getCanvasScale();
  return {
    '--anim-dx': `${Math.round(((tr.left + tr.width  / 2) - (ar.left + ar.width  / 2)) / scale)}px`,
    '--anim-dy': `${Math.round(((tr.top  + tr.height / 2) - (ar.top  + ar.height / 2)) / scale)}px`,
  };
}

// ── animStatusRing ───────────────────────────────────────────────────────
// Persistent pulsing glow on a creature while a status is active.
// Returns a controller { clear } — does NOT return a Promise.
// Call .clear() when the status expires to remove the effect.
//
// options:
//   color  css color  ring color (default '#ffffff')

function animStatusRing(el, options = {}) {
  if (!el) return { clear: () => {} };

  const color = options.color ?? '#ffffff';
  el.style.setProperty('--status-color', color);
  el.classList.add('anim-status-ring');

  return {
    clear() {
      el.classList.remove('anim-status-ring');
      el.style.removeProperty('--status-color');
    }
  };
}
