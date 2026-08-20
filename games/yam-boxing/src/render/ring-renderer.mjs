const NEAR = 0.08;
const ROPE_HEIGHTS = [0.52, 0.94, 1.36];
const ROPE_COLORS = ["#f8eee5", "#dd6678", "#f8eee5"];

function cameraPoint(point, camera) {
  const yaw = camera.yaw * Math.PI / 180;
  const dx = point.x - camera.x;
  const dz = point.z - camera.z;
  return {
    x: dx * Math.cos(yaw) - dz * Math.sin(yaw),
    y: point.height ?? 0,
    z: dx * Math.sin(yaw) + dz * Math.cos(yaw),
  };
}

function projectCamera(point, camera, view) {
  const scale = view.focal / point.z;
  return {
    x: view.width / 2 + point.x * scale,
    y: view.horizon + (camera.height - point.y) * scale,
    depth: point.z,
    scale,
  };
}

function clipLine(a, b) {
  if (a.z < NEAR && b.z < NEAR) return null;
  if (a.z >= NEAR && b.z >= NEAR) return [a, b];
  const front = a.z >= NEAR ? a : b;
  const back = a.z >= NEAR ? b : a;
  const amount = (NEAR - back.z) / (front.z - back.z);
  const cut = {
    x: back.x + (front.x - back.x) * amount,
    y: back.y + (front.y - back.y) * amount,
    z: NEAR,
  };
  return a.z >= NEAR ? [a, cut] : [cut, b];
}

function clipPolygon(points) {
  const result = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentInside = current.z >= NEAR;
    const nextInside = next.z >= NEAR;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const amount = (NEAR - current.z) / (next.z - current.z);
      result.push({
        x: current.x + (next.x - current.x) * amount,
        y: current.y + (next.y - current.y) * amount,
        z: NEAR,
      });
    }
  }
  return result;
}

function worldLine(ctx, a, b, camera, view, color, width, alpha = 1) {
  const clipped = clipLine(cameraPoint(a, camera), cameraPoint(b, camera));
  if (!clipped) return;
  const start = projectCamera(clipped[0], camera, view);
  const end = projectCamera(clipped[1], camera, view);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

function worldPolygon(ctx, points, camera, view, fill) {
  const clipped = clipPolygon(points.map((point) => cameraPoint(point, camera)));
  if (clipped.length < 3) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  clipped.forEach((point, index) => {
    const projected = projectCamera(point, camera, view);
    if (index) ctx.lineTo(projected.x, projected.y);
    else ctx.moveTo(projected.x, projected.y);
  });
  ctx.closePath();
  ctx.fill();
}

function drawBackground(ctx, view) {
  const sky = ctx.createLinearGradient(0, 0, 0, view.horizon + 120);
  sky.addColorStop(0, "#110f19");
  sky.addColorStop(0.55, "#281e32");
  sky.addColorStop(1, "#503340");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);

  const glow = ctx.createRadialGradient(
    view.width / 2,
    view.horizon - 90,
    10,
    view.width / 2,
    view.horizon - 40,
    view.width * 0.55,
  );
  glow.addColorStop(0, "rgba(255,225,194,.34)");
  glow.addColorStop(1, "rgba(255,225,194,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, view.width, view.horizon + 150);

  ctx.fillStyle = "rgba(4,3,8,.76)";
  ctx.fillRect(0, view.horizon - 24, view.width, 70);
  for (let x = 8; x < view.width; x += 18) {
    const height = 10 + ((x * 17) % 23);
    ctx.fillStyle = x % 36 ? "#221827" : "#4b2938";
    ctx.beginPath();
    ctx.arc(x, view.horizon + 11 - height, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFloor(ctx, camera, view, ring) {
  const half = ring.halfSize;
  worldPolygon(ctx, [
    { x: -half, z: -half },
    { x: half, z: -half },
    { x: half, z: half },
    { x: -half, z: half },
  ], camera, view, "#d8c9bf");

  for (let step = -4; step <= 4; step += 1) {
    worldLine(ctx, { x: step, z: -half }, { x: step, z: half }, camera, view, "#b9a7a1", 1, 0.45);
    worldLine(ctx, { x: -half, z: step }, { x: half, z: step }, camera, view, "#b9a7a1", 1, 0.45);
  }
  worldPolygon(ctx, [
    { x: -1.45, z: -0.18 },
    { x: 1.45, z: -0.18 },
    { x: 1.45, z: 0.18 },
    { x: -1.45, z: 0.18 },
  ], camera, view, "rgba(164,77,98,.16)");
}

function ropeSegments(ring) {
  const h = ring.halfSize;
  const corners = [
    { x: -h, z: -h },
    { x: h, z: -h },
    { x: h, z: h },
    { x: -h, z: h },
  ];
  const segments = [];
  ROPE_HEIGHTS.forEach((height, ropeIndex) => {
    corners.forEach((corner, index) => {
      const next = corners[(index + 1) % corners.length];
      segments.push({
        a: { ...corner, height },
        b: { ...next, height },
        color: ROPE_COLORS[ropeIndex],
      });
    });
  });
  return segments;
}

function segmentDepth(segment, camera) {
  return (cameraPoint(segment.a, camera).z + cameraPoint(segment.b, camera).z) / 2;
}

function drawRopes(ctx, segments, camera, view) {
  for (const segment of segments) {
    worldLine(ctx, segment.a, segment.b, camera, view, segment.color, 5, 0.96);
  }
}

function drawPosts(ctx, camera, view, ring) {
  const h = ring.halfSize;
  const posts = [
    { x: -h, z: -h },
    { x: h, z: -h },
    { x: h, z: h },
    { x: -h, z: h },
  ].sort((a, b) => cameraPoint(b, camera).z - cameraPoint(a, camera).z);
  for (const post of posts) {
    worldLine(ctx, post, { ...post, height: 1.72 }, camera, view, "#f2e8df", 12);
    worldLine(ctx, post, { ...post, height: 1.72 }, camera, view, "#b54f64", 5);
  }
}

function drawOpponent(ctx, image, previousImage, imageBlend, fighter, camera, view) {
  const baseCamera = cameraPoint({ x: fighter.x, z: fighter.z, height: 0 }, camera);
  const topCamera = cameraPoint({ x: fighter.x, z: fighter.z, height: 1.94 }, camera);
  if (baseCamera.z < NEAR || topCamera.z < NEAR || !image?.complete) return null;
  const base = projectCamera(baseCamera, camera, view);
  const top = projectCamera(topCamera, camera, view);
  const height = Math.max(1, base.y - top.y);
  const width = height * image.naturalWidth / image.naturalHeight;

  ctx.save();
  ctx.fillStyle = "rgba(50,24,35,.24)";
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + 3, width * 0.31, Math.max(3, height * 0.025), 0, 0, Math.PI * 2);
  ctx.fill();
  if (previousImage?.complete && imageBlend < 1) {
    ctx.globalAlpha = 1 - imageBlend;
    ctx.drawImage(previousImage, base.x - width / 2, base.y - height, width, height);
  }
  ctx.globalAlpha = imageBlend;
  ctx.drawImage(image, base.x - width / 2, base.y - height, width, height);
  ctx.restore();
  return baseCamera.z;
}

function drawMiniMap(ctx, player, fighter, view, ring) {
  const size = Math.min(132, view.width * 0.19);
  const x = view.width - size - 18;
  const y = view.height - size - 18;
  const inset = 12;
  const scale = (size - inset * 2) / (ring.halfSize * 2);
  const mapPoint = (point) => ({
    x: x + size / 2 + point.x * scale,
    y: y + size / 2 + point.z * scale,
  });

  ctx.save();
  ctx.fillStyle = "rgba(13,10,17,.76)";
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 14);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(239,165,180,.48)";
  ctx.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);

  const enemy = mapPoint(fighter);
  ctx.fillStyle = "#f0a3b2";
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffd5dc";
  ctx.beginPath();
  ctx.moveTo(enemy.x, enemy.y);
  ctx.lineTo(enemy.x, enemy.y + 13);
  ctx.stroke();

  const you = mapPoint(player);
  const yaw = player.yaw * Math.PI / 180;
  ctx.fillStyle = "#fff8ec";
  ctx.beginPath();
  ctx.moveTo(you.x + Math.sin(yaw) * 9, you.y + Math.cos(yaw) * 9);
  ctx.lineTo(you.x + Math.sin(yaw + 2.45) * 7, you.y + Math.cos(yaw + 2.45) * 7);
  ctx.lineTo(you.x + Math.sin(yaw - 2.45) * 7, you.y + Math.cos(yaw - 2.45) * 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function renderMatch(ctx, scene) {
  const { camera, fighter, image, previousImage = null, imageBlend = 1, player, ring, view } = scene;
  ctx.clearRect(0, 0, view.width, view.height);
  drawBackground(ctx, view);
  drawFloor(ctx, camera, view, ring);

  const opponentDepth = cameraPoint(fighter, camera).z;
  const segments = ropeSegments(ring).sort((a, b) => segmentDepth(b, camera) - segmentDepth(a, camera));
  const farRopes = segments.filter((segment) => segmentDepth(segment, camera) > opponentDepth);
  const nearRopes = segments.filter((segment) => segmentDepth(segment, camera) <= opponentDepth);
  drawRopes(ctx, farRopes, camera, view);
  drawPosts(ctx, camera, view, ring);
  drawOpponent(ctx, image, previousImage, imageBlend, fighter, camera, view);
  drawRopes(ctx, nearRopes, camera, view);
  drawMiniMap(ctx, player, fighter, view, ring);

  const vignette = ctx.createRadialGradient(
    view.width / 2,
    view.height / 2,
    view.height * 0.2,
    view.width / 2,
    view.height / 2,
    view.width * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.width, view.height);
}
