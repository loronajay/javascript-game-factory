import * as THREE from './vendor/three.module.min.js';
import { LANE_TOP, RELEASE_Z, LANE_LENGTH } from './geometry.mjs';
import { createAimPreview } from './shot-path.mjs';

// Ribbons keep the guide readable on WebGL implementations that only support
// one-pixel lines. Buffers are reused while the spin/power meters move.
function ribbon(color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(190 * 18), 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color, opacity, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  return mesh;
}

function writeRibbon(mesh, points, dashed) {
  const attribute = mesh.geometry.attributes.position;
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (dashed && Math.floor((RELEASE_Z - (a.z + b.z) / 2) / .85) % 2) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const width = .035 + (RELEASE_Z - b.z) / LANE_LENGTH * .13;
    const length = Math.hypot(dx, dz) || 1;
    const ox = -dz / length * width, oz = dx / length * width;
    for (const [p, sign] of [[a,-1],[a,1],[b,-1],[a,1],[b,1],[b,-1]]) {
      attribute.setXYZ(count++, p.x + ox * sign, LANE_TOP + .045, p.z + oz * sign);
    }
  }
  attribute.needsUpdate = true;
  mesh.geometry.setDrawRange(0, count);
}

function marker(geometry, color) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: .95, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = 5;
  return mesh;
}

export class AimGuide {
  constructor(scene, physics) {
    this.physics = physics;
    this.group = new THREE.Group();
    this.skid = ribbon(0xf6f6ff, .65);
    this.hook = ribbon(0xffd666, .95);
    this.breakpoint = marker(new THREE.CircleGeometry(.17, 24), 0x4fb4ff);
    this.target = marker(new THREE.RingGeometry(.40, .48, 40), 0xffd666);
    this.gutter = marker(new THREE.RingGeometry(.18, .28, 4), 0xff5e65);
    this.group.add(this.skid, this.hook, this.breakpoint, this.target, this.gutter);
    scene.add(this.group);
    this.key = '';
  }

  update(scene, camera, height) {
    this.group.visible = ['ready', 'spin', 'charging'].includes(scene.phase);
    if (!this.group.visible) return;
    const shot = scene.liveShot;
    const key = [shot.position, shot.aim, shot.hook, shot.power, shot.release,
      shot.hookScale, shot.speedScale, shot.massScale, shot.ballIndex,
      scene.pins.filter(p => p.standing).map(p => p.id).join(',')].join(':');
    if (key !== this.key) {
      this.key = key;
      this.preview = createAimPreview(this.physics, shot, scene.pins);
      writeRibbon(this.skid, this.preview.skid, true);
      writeRibbon(this.hook, this.preview.hook, false);
    }
    for (const [name, pixels, radius] of [['breakpoint', 5, .17], ['target', 12, .48], ['gutter', 9, .28]]) {
      const mesh = this[name], point = this.preview[name];
      mesh.visible = Boolean(point);
      if (!point) continue;
      mesh.position.set(point.x, LANE_TOP + .07, point.z);
      mesh.quaternion.copy(camera.quaternion);
      const worldPerPixel = 2 * mesh.position.distanceTo(camera.position)
        * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, height);
      mesh.scale.setScalar(worldPerPixel * pixels / radius);
    }
  }
}
