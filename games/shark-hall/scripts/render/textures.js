// Every texture in the cabinet, drawn at runtime onto a 2D canvas.
//
// There is not a single image file in the render layer, and that is the repo's
// PlaceholderGenerator rule taken all the way: a felt is noise over a colour and
// a ball is a stripe and a number, so shipping them as PNGs would be shipping
// megabytes to say what forty lines say. It also means a retheme is a hex code.
//
// THREE IS PASSED IN, never imported. The module that boots the cabinet pulls it
// off the CDN once and hands it down, so nothing under `render/` carries its own
// copy of the import URL and the version is pinned in exactly one place.
//
// Colours here follow `assets/splashes/menu.png`: navy cloth, brass, dark
// walnut, a low warm room. The demo's green table was a different hall.

/**
 * The cloth. Navy, with per-pixel noise so it is not a flat plane of colour.
 *
 * The colour is a MID navy rather than the near-black one the splash appears to
 * show, and that is a rendering fact rather than a taste one: a dielectric in
 * three.js has a specular floor around 0.04 linear, and this base was originally
 * set darker than that in red and green. The white sheen off the pendant then
 * outweighed the cloth's own colour and the table rendered as pale grey-blue.
 * Cloth needs an albedo above its own specular floor to look like cloth. The
 * material in `table-view.js` pulls that sheen down as well; both were needed.
 */
export function feltTexture(THREE, { color = "#2a4666", noise = 12, repeat = [5, 3] } = {}) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);

  const image = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noise;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);

  return wrap(THREE, canvas, repeat);
}

/** Dark walnut for the rails and the cabinet, with drawn grain. */
export function woodTexture(THREE, { repeat = [2, 1] } = {}) {
  const canvas = makeCanvas(512, 128);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "#6b4026");
  gradient.addColorStop(0.45, "#432616");
  gradient.addColorStop(1, "#26150d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 128);

  // Grain: sine-perturbed horizontal strokes, alternating light and dark. Cheap,
  // and at the distance a rail is ever seen it reads exactly like figured wood.
  ctx.globalAlpha = 0.26;
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = i % 2 ? "#a4663a" : "#20110b";
    ctx.lineWidth = Math.random() * 2 + 1;
    ctx.beginPath();
    const y = Math.random() * 128;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.04 + Math.random()) * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return wrap(THREE, canvas, repeat);
}

/** Herringbone parquet, like the floor in the splash. */
export function floorTexture(THREE, { repeat = [8, 8] } = {}) {
  const canvas = makeCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1d1713";
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 64) {
      const offset = (y / 32) % 2 ? 32 : 0;
      ctx.fillStyle = (x + y) % 128 === 0 ? "#291f18" : "#231b15";
      ctx.fillRect(x + offset, y, 60, 29);
    }
  }

  return wrap(THREE, canvas, repeat);
}

/**
 * A ball's skin, as an equirectangular map.
 *
 * The layout is what makes the number readable from anywhere: the canvas is
 * mapped around the sphere, so the two number circles at a quarter and
 * three-quarters across land on opposite sides of the ball and one of them is
 * always facing the camera. A stripe is a band across the middle of the map,
 * which becomes a band around the equator.
 */
const BALL_COLORS = Object.freeze({
  0: "#f5f4ef",
  1: "#f2c500",
  2: "#1f4ea8",
  3: "#b62028",
  4: "#62227c",
  5: "#db6715",
  6: "#126f39",
  7: "#6e1b25",
  8: "#111111",
  9: "#f2c500",
  10: "#1f4ea8",
  11: "#b62028",
  12: "#62227c",
  13: "#db6715",
  14: "#126f39",
  15: "#6e1b25",
});

/**
 * A ball's colour as CSS.
 *
 * The palette above is the only place these sixteen colours exist, and the
 * hover readout wants the same swatch the ball is actually painted with. Handed
 * out as a string rather than a texture so nothing outside this file needs THREE
 * to ask the question.
 */
export function ballColor(n) {
  return BALL_COLORS[n] || "#f5f4ef";
}

export function ballTexture(THREE, n, anisotropy = 1) {
  const canvas = makeCanvas(512, 256);
  const ctx = canvas.getContext("2d");
  const color = BALL_COLORS[n] || "#f5f4ef";
  const striped = n >= 9;

  ctx.fillStyle = striped ? "#f5f4ef" : color;
  ctx.fillRect(0, 0, 512, 256);
  if (striped) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 76, 512, 104);
  }

  if (n !== 0) {
    for (const x of [128, 384]) {
      ctx.fillStyle = "#f5f4ef";
      ctx.beginPath();
      ctx.arc(x, 128, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = "bold 50px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), x, 131);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function wrap(THREE, canvas, [u, v]) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(u, v);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
