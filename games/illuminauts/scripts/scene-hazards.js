import * as THREE from '../vendor/three.module.js';
import { gridToWorld, WORLD_3D } from './map-3d.js';
import { getAlienPose, getLaserGatePhase, getTurretPhase, getTurretBeamTiles } from './hazards.js';
import { isWall } from './map.js';

// Simple local models; replacing a model later does not change hazard timing or collision.
export function createHazardScene(map, hazards = { aliens: [], laserGates: [], turrets: [] }) {
  const root = new THREE.Group(); root.name = 'hazards';
  const T = WORLD_3D.tileSize;
  const metal = new THREE.MeshStandardMaterial({ color: 0x34434d, metalness: 0.65, roughness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x684f9b, emissive: 0x271239, emissiveIntensity: 0.5, roughness: 0.45 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb8ffcd });
  function part(parent, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  const aliens = hazards.aliens.map(alien => {
    const group = new THREE.Group(); group.name = 'patrol:' + alien.id;
    const body = part(group, new THREE.SphereGeometry(0.5, 12, 10), skin, 0, 1.1, 0);
    body.scale.set(1, 0.8, 0.85);
    for (const x of [-0.2, 0.2]) {
      const eye = part(group, new THREE.SphereGeometry(0.115, 8, 6), eyeMat, x, 1.19, -0.36);
      eye.scale.set(0.7, 1.4, 0.55);
    }
    const legs = [];
    for (const x of [-0.28, 0.28]) for (const z of [-0.2, 0.2]) {
      const leg = part(group, new THREE.ConeGeometry(0.11, 0.55, 6), skin, x, 0.58, z);
      leg.rotation.z = Math.PI; legs.push(leg);
    }
    root.add(group); return { alien, group, legs };
  });

  function laserTile(group, tile, alongX, mat, floorMat, cross = false) {
    const p = gridToWorld(map, tile.x + 0.5, tile.y + 0.5);
    const tileGroup = new THREE.Group(); tileGroup.position.set(p.x, 0, p.z); group.add(tileGroup);
    // The floor wash marks the entire dangerous cell, matching tile-based laser collision.
    part(tileGroup, new THREE.BoxGeometry(T * 0.96, 0.025, T * 0.96), floorMat, 0, 0.045, 0);
    const beams = new THREE.Group(); tileGroup.add(beams);
    for (const height of [0.4, 0.95, 1.5, 2.05]) {
      part(beams, new THREE.BoxGeometry(alongX ? T : 0.045, 0.045, alongX ? 0.045 : T), mat, 0, height, 0);
      if (cross) part(beams, new THREE.BoxGeometry(alongX ? 0.045 : T, 0.045, alongX ? T : 0.045), mat, 0, height, 0);
    }
    return { group: tileGroup, beams, tile };
  }
  function laserGroup(name) {
    const group = new THREE.Group(); group.name = name; root.add(group);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.7 });
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.12, depthWrite: false });
    return { group, mat, floorMat };
  }
  const gates = hazards.laserGates.map(gate => {
    const entry = laserGroup('gate:' + gate.id);
    const tiles = gate.tiles.map(tile => {
      const alongX = isWall(map, tile.x - 1, tile.y) && isWall(map, tile.x + 1, tile.y);
      const p = gridToWorld(map, tile.x + 0.5, tile.y + 0.5);
      for (const x of [-1, 1]) for (const z of [-1, 1]) part(entry.group, new THREE.BoxGeometry(0.12, 2.3, 0.12), metal,
        p.x + x * (T / 2 - 0.06), 1.15, p.z + z * (T / 2 - 0.06));
      return laserTile(entry.group, tile, alongX, entry.mat, entry.floorMat, true);
    });
    return { ...entry, source: gate, tiles };
  });
  const turrets = hazards.turrets.map(turret => {
    const entry = laserGroup('turret:' + turret.id);
    const p = gridToWorld(map, turret.x + 0.5, turret.y + 0.5);
    const mount = new THREE.Group();
    // Authored turret cells are often solid walls: push the muzzle onto the facing surface.
    const offset = isWall(map, turret.x, turret.y) ? T * 0.56 : 0;
    mount.position.set(p.x + turret.dx * offset, 1.25, p.z + turret.dy * offset);
    mount.rotation.y = Math.atan2(turret.dx, turret.dy);
    part(mount, new THREE.BoxGeometry(0.48, 0.5, 0.32), metal, 0, 0, 0);
    part(mount, new THREE.BoxGeometry(0.18, 0.18, 0.5), metal, 0, 0, 0.23);
    part(mount, new THREE.SphereGeometry(0.105, 8, 6), entry.mat, 0, 0, 0.49);
    entry.group.add(mount);
    const tiles = turret.beamTiles.map(tile => laserTile(entry.group, tile, turret.dx !== 0, entry.mat, entry.floorMat));
    return { ...entry, source: turret, tiles };
  });
  function syncLaser(entry, phase, elapsed, allowed = null) {
    entry.group.userData.phase = phase;
    const active = phase === 'active', warning = phase === 'warning';
    entry.mat.color.setHex(active ? 0xff315c : warning ? 0xffca54 : 0x365066);
    entry.mat.opacity = active ? 1 : warning ? 0.4 + Math.sin(elapsed * 0.02) * 0.2 : 1;
    entry.floorMat.color.copy(entry.mat.color);
    entry.floorMat.opacity = active ? 0.36 : warning ? 0.16 : 0.03;
    for (const tile of entry.tiles) {
      tile.group.visible = !allowed || allowed.some(p => p.x === tile.tile.x && p.y === tile.tile.y);
      tile.beams.visible = active || warning;
    }
  }
  return { root, sync(elapsed) {
    for (const entry of aliens) {
      const pose = getAlienPose(entry.alien, elapsed), p = gridToWorld(map, pose.px, pose.py);
      entry.group.position.set(p.x, Math.sin(elapsed * 0.006) * 0.045, p.z);
      entry.group.rotation.y = pose.yaw;
      entry.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(elapsed * 0.012 + i * Math.PI / 2) * 0.2; });
    }
    for (const entry of gates) syncLaser(entry, getLaserGatePhase(entry.source, elapsed), elapsed);
    for (const entry of turrets) syncLaser(entry, getTurretPhase(entry.source, elapsed), elapsed, getTurretBeamTiles(entry.source, map));
  } };
}
