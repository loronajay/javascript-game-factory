// Tabletop graphics for ONE half of the table.
//
// Deterministic: the same surface config always paints the same pixels, because
// the only randomness is a seeded generator with a fixed seed. Two clients
// drawing the same player's half get the same table.
//
// PAINTED ONLY WHEN SOMETHING CHANGES. `paintSurface` is called from the
// appearance applier when a surface parameter moves, never from a frame. A
// canvas texture rebuilt per frame is the classic way to turn a customization
// feature into a frame-rate bug.
//
// READABILITY IS A CONSTRAINT, NOT A PREFERENCE. Every pattern here declares
// the ZONES it may draw in (see `TABLE_PATTERNS` in the cosmetic catalog), and
// the busy ones are confined to the perimeter and the rear apron so the middle
// of the half — where a player actually reads the puck — stays quiet. This is
// why the prototype's full-field designs are not ported: a graffiti floor or a
// cracked-ice field is a surface you cannot play on.
//
// `paintSurface` takes a 2D context rather than making one, so the whole
// painter is exercisable in `tests/table-surface.test.js` against a recording
// stub with no browser.

/** Deterministic PRNG. Fixed seed: a design is a design, not a roll. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `y = 0` is the centre line, `y = 1` the rear rail behind the goal. Every
 * painter works in this space so a pattern's zones mean the same thing however
 * large the canvas is.
 */
const PERIMETER = 0.11;
const REAR = 0.63;

function withAlpha(ctx, alpha, draw) {
  ctx.save();
  ctx.globalAlpha = alpha;
  draw();
  ctx.restore();
}

function clipPerimeter(ctx, w, h) {
  const inset = Math.min(w, h) * PERIMETER;
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.clip("evenodd");
}

function clipRear(ctx, w, h) {
  ctx.beginPath();
  ctx.rect(0, h * REAR, w, h * (1 - REAR));
  ctx.clip();
}

// ---------------------------------------------------------------------------
// PATTERNS
// ---------------------------------------------------------------------------

const PAINTERS = {
  "table.pattern.none"() {},

  /** Fine tonal grain across the field. Reads as a material, not as a graphic. */
  "table.pattern.micro-grain"(ctx, w, h, { color, scale }) {
    const random = mulberry32(0x9e37);
    const step = Math.max(3, 5 * scale);
    ctx.fillStyle = color;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (random() > 0.55) continue;
        ctx.globalAlpha = 0.25 + random() * 0.5;
        ctx.fillRect(x + random() * step, y + random() * step, 1.2, 1.2);
      }
    }
    ctx.globalAlpha = 1;
  },

  /** Thin horizontal rules. The quietest way to say "this is a made object". */
  "table.pattern.fine-lines"(ctx, w, h, { color, scale }) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const gap = 22 / scale;
    for (let y = gap; y < h; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  },

  /** Traces and pads, held to the border and the goal apron. Never mid-field. */
  "table.pattern.circuit-trace"(ctx, w, h, { color, scale }) {
    const random = mulberry32(0x51ac);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2 / scale;
    const run = () => {
      for (let index = 0; index < 26; index += 1) {
        let x = random() * w;
        let y = random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let leg = 0; leg < 3; leg += 1) {
          if (random() > 0.5) x += (random() - 0.5) * 180 * scale;
          else y += (random() - 0.5) * 180 * scale;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4 / scale, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ctx.save(); clipPerimeter(ctx, w, h); run(); ctx.restore();
    ctx.save(); clipRear(ctx, w, h); run(); ctx.restore();
  },

  /** A precision grid that fades out of the puck-reading centre of the half. */
  "table.pattern.vector-grid"(ctx, w, h, { color, scale }) {
    const gap = 46 / scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += gap) {
      withAlpha(ctx, 0.35 + 0.65 * Math.min(1, Math.abs(x / w - 0.5) * 2.4), () => {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      });
    }
    for (let y = 0; y <= h; y += gap) {
      withAlpha(ctx, 0.35 + 0.65 * (y / h), () => {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      });
    }
  },

  /** Restrained gold: two pinstripes and corner brackets. Never a gold field. */
  "table.pattern.gold-pinstripe"(ctx, w, h, { color, scale }) {
    ctx.strokeStyle = color;
    const inset = Math.min(w, h) * 0.055;
    for (const [offset, width] of [[inset, 3 / scale], [inset * 1.9, 1.2 / scale]]) {
      ctx.lineWidth = width;
      ctx.strokeRect(offset, offset, w - offset * 2, h - offset * 2);
    }
    ctx.lineWidth = 5 / scale;
    const arm = Math.min(w, h) * 0.16;
    for (const [cx, sx] of [[inset * 1.9, 1], [w - inset * 1.9, -1]]) {
      for (const [cy, sy] of [[inset * 1.9, 1], [h - inset * 1.9, -1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * arm, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + sy * arm);
        ctx.stroke();
      }
    }
  },

  /** Drafting marks: edge ticks, dimension runs, a rear construction arc. */
  "table.pattern.blueprint-draft"(ctx, w, h, { color, scale }) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    const tick = Math.min(w, h) * 0.035;
    const gap = 26 / scale;
    for (let x = gap; x < w; x += gap) {
      const long = Math.round(x / gap) % 5 === 0;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, long ? tick * 1.8 : tick); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x, h - (long ? tick * 1.8 : tick)); ctx.stroke();
    }
    for (let y = gap; y < h; y += gap) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tick, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w, y); ctx.lineTo(w - tick, y); ctx.stroke();
    }
    ctx.save();
    clipRear(ctx, w, h);
    ctx.setLineDash([8, 6]);
    for (const radius of [w * 0.22, w * 0.34, w * 0.46]) {
      ctx.beginPath();
      ctx.arc(w / 2, h, radius, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** Large low-contrast hexes, with a few filled. Not a glowing honeycomb. */
  "table.pattern.hex-tessellation"(ctx, w, h, { color, scale }) {
    const random = mulberry32(0x2b17);
    const size = 46 * scale;
    const stepX = size * 1.5;
    const stepY = size * Math.sqrt(3);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4;
    for (let column = -1; column * stepX < w + size; column += 1) {
      for (let row = -1; row * stepY < h + size; row += 1) {
        const cx = column * stepX;
        const cy = row * stepY + (column % 2 ? stepY / 2 : 0);
        ctx.beginPath();
        for (let corner = 0; corner < 6; corner += 1) {
          const angle = (Math.PI / 3) * corner;
          const px = cx + size * Math.cos(angle);
          const py = cy + size * Math.sin(angle);
          if (corner === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (random() < 0.06) withAlpha(ctx, 0.5, () => ctx.fill());
        ctx.stroke();
      }
    }
  },

  /** Charcoal-on-charcoal facets: tonal variation rather than linework. */
  "table.pattern.prism-facets"(ctx, w, h, { color, scale }) {
    const random = mulberry32(0x77c1);
    const size = 92 * scale;
    ctx.fillStyle = color;
    for (let y = -size; y < h + size; y += size) {
      for (let x = -size; x < w + size; x += size) {
        for (const points of [[[0, 0], [1, 0], [0, 1]], [[1, 0], [1, 1], [0, 1]]]) {
          ctx.globalAlpha = 0.14 + random() * 0.5;
          ctx.beginPath();
          for (const [dx, dy] of points) ctx.lineTo(x + dx * size, y + dy * size);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  },

  /** Checker as trim: a border band and the rear apron. Not a race flag. */
  "table.pattern.checker-border"(ctx, w, h, { color, scale }) {
    const cell = 26 * scale;
    ctx.fillStyle = color;
    const run = () => {
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          if ((Math.round(x / cell) + Math.round(y / cell)) % 2) continue;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    };
    ctx.save(); clipPerimeter(ctx, w, h); run(); ctx.restore();
    ctx.save(); clipRear(ctx, w, h); withAlpha(ctx, 0.55, run); ctx.restore();
  },

  /** Hazard chevrons in the rear trim zone only. Never across live play. */
  "table.pattern.hazard-trim"(ctx, w, h, { color, scale }) {
    ctx.save();
    clipRear(ctx, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 16 * scale;
    const gap = 46 * scale;
    for (let x = -h; x < w + h; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** Printed vector geometry. A design colour, not a fake neon reflection. */
  "table.pattern.synth-vector"(ctx, w, h, { color, scale }) {
    const random = mulberry32(0x3f9d);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4 / scale;
    const run = () => {
      for (let index = 0; index < 22; index += 1) {
        const x = random() * w;
        const y = random() * h;
        const arm = (26 + random() * 60) * scale;
        ctx.beginPath();
        ctx.moveTo(x - arm, y + arm * 0.5);
        ctx.lineTo(x, y - arm * 0.5);
        ctx.lineTo(x + arm, y + arm * 0.5);
        ctx.stroke();
      }
    };
    ctx.save(); clipPerimeter(ctx, w, h); run(); ctx.restore();
    ctx.save(); clipRear(ctx, w, h); run(); ctx.restore();
  },

  /** Concentric technical rings around the goal point. Deliberately faint. */
  "table.pattern.precision-rings"(ctx, w, h, { color, scale }) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    for (let index = 1; index <= 9; index += 1) {
      withAlpha(ctx, index % 3 === 0 ? 1 : 0.45, () => {
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.88, index * 38 * scale, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  },
};

export const SURFACE_PAINTER_IDS = Object.freeze(Object.keys(PAINTERS));

/**
 * Paint one half's tabletop.
 *
 * `ctx` is a 2D context; `width`/`height` its pixel size. The rear rail is at
 * the BOTTOM of the canvas, so the caller flips the texture for the far half
 * rather than every painter learning about sides.
 */
export function paintSurface(ctx, width, height, surface) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = surface.baseColor;
  ctx.fillRect(0, 0, width, height);

  // A soft lift toward the rear so the half has depth without a printed
  // gradient competing with the puck in the middle.
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, surface.baseColor);
  wash.addColorStop(1, surface.secondaryColor);
  withAlpha(ctx, 0.85, () => {
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  });

  const painter = PAINTERS[surface.patternId];
  if (!painter || surface.patternOpacity <= 0) return;
  withAlpha(ctx, surface.patternOpacity, () => {
    painter(ctx, width, height, {
      color: surface.patternColor,
      scale: surface.patternScale,
    });
  });
}

/** Canvas size. Wider than tall, matching a half's real 9.68 x 7.29 metres. */
export const SURFACE_TEXTURE_SIZE = Object.freeze({ width: 768, height: 576 });

/**
 * A texture for one half, ready to hang on a material.
 *
 * `flip` mirrors the far half so both are painted rear-at-the-bottom and the
 * painters never learn which side they are on.
 */
export function createSurfaceTexture(THREE, surface, { flip = false, doc = document } = {}) {
  const canvas = doc.createElement("canvas");
  canvas.width = SURFACE_TEXTURE_SIZE.width;
  canvas.height = SURFACE_TEXTURE_SIZE.height;
  paintSurface(canvas.getContext("2d"), canvas.width, canvas.height, surface);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace ?? texture.colorSpace;
  texture.anisotropy = 4;
  if (flip) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI;
  }
  texture.needsUpdate = true;
  return texture;
}
