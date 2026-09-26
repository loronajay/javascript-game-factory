// A tiny, dependency-free low-poly mesh kit for crop models in the style of the
// Grimnir farm pack: flat-shaded, non-indexed triangles whose UVs sample the
// pack's shared gradient palette (farm/assets/crops/Textures/Texture Map.png).
//
// Palette layout (512x512): 14 columns x 5 rows of 32 x 102.4 px cells. Even
// columns are flat colours; odd columns are top-light -> bottom-dark
// gradients, so a vertex's "shade" t in [0, 1] picks light (0) to dark (1).

// ------------------------------------------------------------------ vectors

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ matrices (column-major 4x4)

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = sum;
  }
  return out;
}
export const chain = (...matrices) => matrices.reduce((acc, m) => mul(acc, m), identity());
export const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export const scaleM = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
export function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
export function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
export function applyDir(m, d) {
  return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
}

/** A frame at `origin` whose local +Z points along `direction`, local +Y as close to world up as possible, rolled about Z. */
export function aim(origin, direction, roll = 0) {
  const z = normalize(direction);
  let x = cross([0, 1, 0], z);
  if (length(x) < 1e-5) x = [1, 0, 0];
  x = normalize(x);
  const y = cross(z, x);
  const basis = [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1];
  return mul(basis, rotZ(roll));
}

/** Direction from yaw (around Y, 0 = +Z) and pitch (up from horizontal). */
export const heading = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];

// ------------------------------------------------------------------ random

export function seeded(seed) {
  let a = typeof seed === "number" ? seed : [...String(seed)].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.jitter = (amount) => (next() * 2 - 1) * amount;
  return next;
}

// ------------------------------------------------------------------ palette

/** A palette paint: cell column/row, plus the slice of the gradient to use. */
export const paint = (c, r, lo = 0, hi = 1) => Object.freeze({ c, r, lo, hi });
export function paletteUV(material, t) {
  const shade = Math.min(1, Math.max(0, t));
  const k = material.lo + (material.hi - material.lo) * shade;
  const u = (material.c * 32 + 16) / 512;
  const v = (material.r * 102.4 + (0.08 + 0.84 * k) * 102.4) / 512;
  return [u, v];
}

// ------------------------------------------------------------------ builder

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.stack = [identity()];
  }
  get top() { return this.stack[this.stack.length - 1]; }
  push(matrix) { this.stack.push(mul(this.top, matrix)); return this; }
  pop() { this.stack.pop(); return this; }
  with(matrix, draw) { this.push(matrix); try { draw(); } finally { this.pop(); } }

  /**
   * Add a part: local vertices [{p, t}] and triangles [[i, j, k]]. Shading:
   * "param" uses each vertex's own t; "height" re-derives t from the part's
   * transformed world height (top light, bottom dark), blended with t.
   */
  addPart(part, material, options = {}) {
    const m = this.top;
    const world = part.verts.map((vert) => apply(m, vert.p));
    let shadeOf = (index) => part.verts[index].t;
    if (options.shade === "height") {
      const ys = world.map((p) => p[1]);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const mix = options.mix ?? 0.25;
      shadeOf = (index) => (1 - (world[index][1] - lo) / (hi - lo || 1)) * (1 - mix) + part.verts[index].t * mix;
    }
    for (const tri of part.tris) {
      const [a, b, c] = tri.map((i) => world[i]);
      const n = cross(sub(b, a), sub(c, a));
      if (length(n) < 1e-12) continue;
      const normal = normalize(n);
      const mat = tri.material ?? material;
      for (const i of tri) {
        const p = world[i];
        this.positions.push(p[0], p[1], p[2]);
        this.normals.push(normal[0], normal[1], normal[2]);
        const uv = paletteUV(mat, shadeOf(i));
        this.uvs.push(uv[0], uv[1]);
      }
    }
    return this;
  }

  get triangleCount() { return this.positions.length / 9; }
}

// ------------------------------------------------------------------ primitives (return parts)

const part = () => ({ verts: [], tris: [] });
const vert = (target, p, t) => { target.verts.push({ p, t }); return target.verts.length - 1; };
const quad = (target, a, b, c, d, material) => {
  const one = [a, b, c]; const two = [a, c, d];
  if (material) { one.material = material; two.material = material; }
  target.tris.push(one, two);
};

/**
 * Surface of revolution around local Y. profile: [[radius, y], ...] bottom to
 * top; radius 0 at either end closes it to a point. radial(theta, y, ring)
 * multiplies the radius (ribs, lobes, dents). materialFor(segment) lets a
 * lathe stripe itself.
 */
export function lathe(profile, { segments = 10, radial = () => 1, shade, materialFor, twist = 0 } = {}) {
  const out = part();
  const ys = profile.map(([, y]) => y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const rings = profile.map(([r, y], ring) => {
    const t = shade ? shade(ring, y) : 1 - (y - y0) / (y1 - y0 || 1);
    if (r === 0) return [vert(out, [0, y, 0], t)];
    const row = [];
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2 + twist * ring;
      const rr = r * radial(theta, y, ring);
      row.push(vert(out, [Math.cos(theta) * rr, y, Math.sin(theta) * rr], t));
    }
    return row;
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let s = 0; s < segments; s++) {
      const s2 = (s + 1) % segments;
      const material = materialFor?.(s, i);
      if (a.length === 1) { const tri = [a[0], b[s2], b[s]]; if (material) tri.material = material; out.tris.push(tri); }
      else if (b.length === 1) { const tri = [a[s], a[s2], b[0]]; if (material) tri.material = material; out.tris.push(tri); }
      else quad(out, a[s], a[s2], b[s2], b[s], material);
    }
  }
  return out;
}

/** A tube along a polyline with parallel-transported frames. radius(s) over s in [0, 1]. */
export function tube(points, { radius = () => 0.01, sides = 5, capEnd = true, shade } = {}) {
  const out = part();
  const count = points.length;
  const tangents = points.map((_, i) => normalize(sub(points[Math.min(count - 1, i + 1)], points[Math.max(0, i - 1)])));
  let normal = cross(tangents[0], Math.abs(tangents[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
  normal = normalize(normal);
  const rings = [];
  for (let i = 0; i < count; i++) {
    const tangent = tangents[i];
    normal = normalize(sub(normal, scale(tangent, dot(normal, tangent))));
    const binormal = cross(tangent, normal);
    const s = i / (count - 1);
    const r = radius(s);
    const t = shade ? shade(s) : 0.3 + 0.5 * s;
    const row = [];
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      const offset = add(scale(normal, Math.cos(angle) * r), scale(binormal, Math.sin(angle) * r));
      row.push(vert(out, add(points[i], offset), t));
    }
    rings.push(row);
  }
  for (let i = 0; i < count - 1; i++) for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    quad(out, rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]);
  }
  if (capEnd) {
    const tip = vert(out, add(points[count - 1], scale(tangents[count - 1], radius(1) * 0.6)), shade ? shade(1) : 0.8);
    for (let k = 0; k < sides; k++) out.tris.push([rings[count - 1][k], rings[count - 1][(k + 1) % sides], tip]);
  }
  return out;
}

/** Sample a quadratic/cubic-ish arc: from `start` heading `direction`, bending by `bend` (vector added along the length). */
export function arc(start, direction, lengthValue, { bend = [0, 0, 0], steps = 6 } = {}) {
  const points = [];
  const d = normalize(direction);
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    points.push(add(add(start, scale(d, lengthValue * s)), scale(bend, s * s)));
  }
  return points;
}

/**
 * A blade leaf in its local frame: base at origin, midrib along +Z, face up
 * (+Y). width(s) is the half-width profile; fold lifts the edges into a V;
 * lift/droop pitch the midrib up at the base and down toward the tip.
 */
export function leaf({
  length: L = 0.2, width = 0.05, profile = (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.02)), 0.75),
  fold = 0.35, lift = 0.35, droop = 0.9, steps = 6, serrate = 0, twist = 0, shadeBase = 0.85, shadeTip = 0.25, simple = false,
} = {}) {
  const out = part();
  let p = [0, 0, 0];
  let pitch = lift;
  const ds = L / steps;
  const spine = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    spine.push({ p, s, pitch });
    pitch -= (droop / steps) * (0.4 + 1.2 * s);
    p = add(p, [0, Math.sin(pitch) * ds, Math.cos(pitch) * ds]);
  }
  const rows = spine.map(({ p: point, s, pitch: pp }, i) => {
    const w = width * profile(s) * (serrate && i > 0 && i < steps ? (i % 2 ? 1 + serrate : 1 - serrate * 0.5) : 1);
    const roll = twist * s;
    const t = shadeBase + (shadeTip - shadeBase) * s;
    const up = [0, Math.cos(pp), -Math.sin(pp)];
    const side = (sign, fraction) => {
      const lateral = [Math.cos(roll) * sign * w * fraction, Math.sin(roll) * sign * w * fraction, 0];
      const raise = fold * w * fraction * fraction;
      return add(add(point, lateral), scale(up, raise));
    };
    const midT = Math.min(1, t + 0.12);
    if (simple) return [vert(out, side(-1, 1), t), vert(out, point, midT), vert(out, side(1, 1), t)];
    return [
      vert(out, side(-1, 1), t), vert(out, side(-1, 0.55), t),
      vert(out, point, midT),
      vert(out, side(1, 0.55), t), vert(out, side(1, 1), t),
    ];
  });
  for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < rows[i].length - 1; k++) {
    quad(out, rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
  }
  return out;
}

/**
 * A broad palmate leaf (pumpkin, melon): the petiole meets the blade at the
 * origin (the notch); the blade spreads along +Z. lobes/lobeDepth shape the
 * rim; cup raises the rim; droop bends the far side down.
 */
export function palmLeaf({ radius: R = 0.12, lobes = 5, lobeDepth = 0.3, cup = 0.25, droop = 0.2, segments = 22, sharp = 1.4, notch = 0.55 } = {}) {
  const out = part();
  const centre = [0, 0, R * 0.8];
  const lift = (x, z) => {
    const dz = z - centre[2];
    const r = Math.hypot(x, dz) / R;
    return cup * R * r * r - droop * R * Math.max(0, z / (R * 1.8)) ** 2;
  };
  const cv = vert(out, [centre[0], lift(0, centre[2]) + R * 0.04, centre[2]], 0.75);
  const rims = [0.45, 1].map((fraction) => {
    const row = [];
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2; // 0 = +Z (tip), PI = back (notch)
      const back = Math.cos(theta - Math.PI);
      const lobe = Math.pow(Math.abs(Math.cos((lobes * (theta + Math.PI)) / 2)), sharp);
      let r = R * (1 - lobeDepth * (1 - lobe));
      r *= 1 - notch * Math.exp(-(((theta - Math.PI) / 0.32) ** 2));
      if (back > 0) r *= 1 - 0.12 * back;
      const x = Math.sin(theta) * r * fraction;
      const z = centre[2] + Math.cos(theta) * r * fraction;
      row.push(vert(out, [x, lift(x, z), z], fraction === 1 ? 0.2 : 0.5));
    }
    return row;
  });
  for (let i = 0; i < segments; i++) {
    const i2 = (i + 1) % segments;
    out.tris.push([cv, rims[0][i2], rims[0][i]]);
    quad(out, rims[0][i], rims[0][i2], rims[1][i2], rims[1][i]);
  }
  return out;
}

/** A flat-ish disc fan (flower centres, calyx stars). */
export function disc({ radius: R = 0.03, segments = 8, dome = 0.3, points = 0, pointDepth = 0.4 } = {}) {
  const out = part();
  const c = vert(out, [0, R * dome, 0], 0.2);
  const rim = [];
  const n = points ? points * 2 : segments;
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const r = points ? (i % 2 ? R * (1 - pointDepth) : R) : R;
    rim.push(vert(out, [Math.cos(theta) * r, 0, Math.sin(theta) * r], 0.7));
  }
  for (let i = 0; i < n; i++) out.tris.push([c, rim[(i + 1) % n], rim[i]]);
  return out;
}

/** Octahedron-ish low sphere for seeds, berries seen from afar. */
export function gem(radius = 0.01, stretch = 1) {
  return lathe([[0, -radius * stretch], [radius, 0], [0, radius * stretch]], { segments: 4 });
}

// ------------------------------------------------------------------ GLB

export function writeGLB(builder, name, template) {
  const count = builder.positions.length / 3;
  const pos = new Float32Array(builder.positions);
  const nor = new Float32Array(builder.normals);
  const uv = new Float32Array(builder.uvs);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pos[i * 3 + k]);
    max[k] = Math.max(max[k], pos[i * 3 + k]);
  }
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(uv.buffer)]);
  const json = {
    asset: { generator: "farm crop-lab mesh-kit", version: "2.0" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] }],
    materials: template.materials,
    textures: template.textures,
    images: template.images,
    samplers: template.samplers,
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count, type: "VEC2" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength + nor.byteLength, byteLength: uv.byteLength, target: 34962 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  let jsonBuffer = Buffer.from(JSON.stringify(json));
  if (jsonBuffer.length % 4) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(4 - (jsonBuffer.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + bin.length, 8);
  const chunk = (buffer, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buffer.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buffer]); };
  return Buffer.concat([header, chunk(jsonBuffer, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}

/** Read the material/texture block of an existing pack GLB so ours match it exactly. */
export function readTemplate(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  return { materials: json.materials, textures: json.textures, images: json.images, samplers: json.samplers };
}
