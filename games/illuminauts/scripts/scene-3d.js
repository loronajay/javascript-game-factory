import * as THREE from '../vendor/three.module.js';
import { buildMapLayout, gridToWorld, WORLD_3D } from './map-3d.js';
import { BASE_LIGHT_RADIUS, POWER_LIGHT_RADIUS } from './config.js';
import { createHazardScene } from './scene-hazards.js';

// Per-map GPU ownership: created once on map change, disposed together on exit/restart.
export function createMapScene(map, options, hazards) {
  const root = new THREE.Group();
  const hazardScene = createHazardScene(map, hazards);
  root.add(hazardScene.root);
  const layout = buildMapLayout(map, options);
  const { theme } = layout;
  const T = WORLD_3D.tileSize, H = WORLD_3D.wallHeight;
  const matrix = new THREE.Matrix4();
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.22 });
  const glow = color => new THREE.MeshBasicMaterial({ color });
  function instances(name, cells, geometry, mat, height) {
    const mesh = new THREE.InstancedMesh(geometry, mat, cells.length);
    mesh.name = name;
    cells.forEach((cell, i) => mesh.setMatrixAt(i, matrix.makeTranslation(cell.x, height, cell.z)));
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    return mesh;
  }
  function mesh(geometry, mat, x, y, z) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); root.add(object); return object;
  }
  instances('walls', layout.walls, new THREE.BoxGeometry(T, H, T), material(theme.wall), H / 2);
  instances('wall-footings', layout.walls, new THREE.BoxGeometry(T + 0.025, 0.16, T + 0.025), material(0x14252d), 0.09);
  instances('wall-caps', layout.walls, new THREE.BoxGeometry(T + 0.025, 0.09, T + 0.025), material(0x182c36), H - 0.18);
  instances('floor-panels', layout.floors, new THREE.BoxGeometry(T - 0.025, 0.06, T - 0.025), material(theme.floor), -0.035);
  mesh(new THREE.BoxGeometry(map.width * T, 0.06, map.height * T), material(theme.ceiling), 0, H + 0.03, 0);
  instances('ceiling-strips', layout.strips, new THREE.BoxGeometry(0.8, 0.025, 0.14), glow(0xc8f7ff), H - 0.025);

  const chipGeo = new THREE.OctahedronGeometry(0.24);
  const powerGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.5, 10);
  const coreGeo = new THREE.OctahedronGeometry(0.26);
  const pickupMats = { chip: glow(0xffd166), powerCell: glow(theme.accent), dataCore: glow(0x4dff91) };
  const pickupGeos = { chip: chipGeo, powerCell: powerGeo, dataCore: coreGeo };
  // Only allocate resources used by this map, including the geometry/material helpers above.
  const extraResources = new Set([...Object.values(pickupMats), ...Object.values(pickupGeos)]);
  const pickups = map.pickups.map(p => {
    const pos = gridToWorld(map, p.x + 0.5, p.y + 0.5);
    return { source: p, mesh: mesh(pickupGeos[p.type], pickupMats[p.type], pos.x, 0.76, pos.z) };
  });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xff4f8a, emissive: 0xcc174c, emissiveIntensity: 2, transparent: true, opacity: 0.65 });
  extraResources.add(doorMat);
  const doors = layout.doors.map(d => ({ source: map.doors.find(item => item.id === d.id),
    mesh: mesh(new THREE.BoxGeometry(d.alongX ? T : 0.12, H * 0.92, d.alongX ? 0.12 : T), doorMat, d.x, H * 0.46, d.z) }));
  const goalMat = glow(0x4dffc4);
  instances('beacon-floor', layout.goals, new THREE.BoxGeometry(T * 0.94, 0.035, T * 0.94), goalMat, 0.025);
  const center = layout.goals.reduce((sum, p) => ({ x: sum.x + p.x / layout.goals.length, z: sum.z + p.z / layout.goals.length }), { x: 0, z: 0 });
  mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.8, 12), material(0x16353e), center.x, 0.4, center.z);
  const beacon = mesh(new THREE.IcosahedronGeometry(0.5, 1), goalMat, center.x, 1.45, center.z);
  const beaconLight = new THREE.PointLight(0x65ffd1, 8, 14, 1.5);
  beaconLight.position.set(center.x, 1.8, center.z); root.add(beaconLight);

  const remote = new THREE.Group();
  const suitMat = material(0xff9c53);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 8), suitMat);
  body.position.y = 0.8;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), glow(0xbff8ff));
  helmet.position.set(0, 1.35, -0.02);
  remote.add(body, helmet); root.add(remote);

  return {
    root, theme,
    sync(state, now) {
      hazardScene.sync(now - (state.gameStartAt || 0));
      for (const p of pickups) {
        p.mesh.visible = p.source.active;
        p.mesh.rotation.y = now * 0.0013;
        p.mesh.position.y = 0.76 + Math.sin(now * 0.002 + p.source.x + p.source.y) * 0.07;
      }
      for (const d of doors) d.mesh.visible = !d.source.open;
      goalMat.color.setHex(state.solo?.beaconLocked ? 0x174639 : 0x4dffc4);
      beaconLight.intensity = state.solo?.beaconLocked ? 1 : 8;
      beacon.rotation.y = now * 0.0007;
      const radius = now < state.player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
      remote.visible = Boolean(state.online.enabled && state.remote.active && Math.hypot(state.remote.px - state.player.px, state.remote.py - state.player.py) <= radius);
      if (remote.visible) {
        const p = gridToWorld(map, state.remote.px, state.remote.py);
        remote.position.set(p.x, 0, p.z);
        remote.rotation.y = state.remote.yaw || 0;
        suitMat.color.setHex(state.remote.role === 'A' ? 0x76f4ff : 0xff9c53);
      }
    },
    dispose() {
      const resources = new Set(extraResources);
      root.traverse(object => {
        if (object.geometry) resources.add(object.geometry);
        if (object.material) resources.add(object.material);
        if (object.isInstancedMesh) resources.add(object);
      });
      resources.forEach(resource => resource.dispose());
      root.clear();
    },
  };
}
