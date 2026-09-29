// Other people's lines at the Cove, drawn: the rod in their hands, the line
// off its tip, the bobber on the water and the water breaking when a fish is
// on. The shape of it all is farm-cove-anglers.mts (pure); this only puts it in
// the scene, one rig per member whose pose carries a line.

import { findFishingRod } from "./farm-catalog/fish.mjs";
import { COVE_WATER_LEVEL } from "./farm-cove.mjs";
import { REMOTE_ROD_LENGTH, anglerRig } from "./farm-cove-anglers.mjs";
import { loadFishingProp } from "./farm-fish-models.mjs";
import type { PresenceRod } from "./arcade-room-presence.mjs";
import type { VisitorPlacement } from "./arcade-room-visitors.mjs";

type ThreeNamespace = Record<string, any>;

export type CoveAnglersView = Readonly<{
  /** Every frame, with where the visitors' bodies are drawn. */
  update: (dt: number, seconds: number, placements: readonly VisitorPlacement[]) => void;
  dispose: () => void;
}>;

const LINE_POINTS = 20;

type Rig = {
  root: any;
  pivot: any;
  rodModel: any;
  rodId: string;
  line: any;
  bobber: any;
  ring: any;
  phase: PresenceRod["phase"];
  since: number;
};

export function createCoveAnglersView(THREE: ThreeNamespace, scene: any): CoveAnglersView {
  const rigs = new Map<string, Rig>();
  const rodModels = new Map<string, Promise<any>>();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const lineMaterial = new THREE.LineBasicMaterial({ color: "#f1f5f2", transparent: true, opacity: 0.85 });
  const redMaterial = new THREE.MeshStandardMaterial({ color: "#e0412f", roughness: 0.4 });
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: "#f5f1e8", roughness: 0.4 });
  const stickMaterial = new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 0.7 });
  const ringGeometry = new THREE.RingGeometry(0.85, 1, 32);
  ringGeometry.rotateX(-Math.PI / 2);

  /** The rod's model, loaded once per rod and cloned for every hand holding one. */
  function rodModel(rodId: string): Promise<any> | null {
    const rod = findFishingRod(rodId);
    if (!rod) return null;
    let pending = rodModels.get(rod.file);
    if (!pending) {
      pending = loadFishingProp(rod.file).then((model) => {
        const box = new THREE.Box3().setFromObject(model);
        const height = Math.max(0.01, box.max.y - box.min.y);
        model.scale.setScalar(REMOTE_ROD_LENGTH / height);
        model.position.y = -box.min.y * (REMOTE_ROD_LENGTH / height);
        return model;
      });
      pending.catch(() => rodModels.delete(rod.file));
      rodModels.set(rod.file, pending);
    }
    return pending;
  }

  function setRod(rig: Rig, rodId: string): void {
    if (rig.rodId === rodId) return;
    rig.rodId = rodId;
    void rodModel(rodId)?.then((model) => {
      if (rig.rodId !== rodId || !rigs.has(rig.root.userData.clientId)) return;
      if (rig.rodModel) rig.pivot.remove(rig.rodModel);
      rig.rodModel = model.clone(true);
      rig.pivot.add(rig.rodModel);
    }).catch(() => undefined);
  }

  function createRig(clientId: string): Rig {
    const root = new THREE.Group();
    root.userData.clientId = clientId;
    const pivot = new THREE.Group();
    // Until the rod's model lands: a plain stick the same length.
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, REMOTE_ROD_LENGTH, 6), stickMaterial);
    stick.position.y = REMOTE_ROD_LENGTH / 2;
    pivot.add(stick);
    root.add(pivot);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
    const line = new THREE.Line(geometry, lineMaterial);
    line.frustumCulled = false;
    const bobber = new THREE.Group();
    bobber.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), redMaterial),
      new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), whiteMaterial),
    );
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: "#e8f7ff", transparent: true, opacity: 0, depthWrite: false }));
    ring.renderOrder = 3;
    root.add(line, bobber, ring);
    scene.add(root);
    const rig: Rig = { root, pivot, rodModel: stick, rodId: "", line, bobber, ring, phase: "charge", since: 0 };
    return rig;
  }

  function removeRig(clientId: string): void {
    const rig = rigs.get(clientId);
    if (!rig) return;
    rigs.delete(clientId);
    rig.root.removeFromParent();
    rig.line.geometry.dispose();
    rig.ring.material.dispose();
  }

  function drawLine(rig: Rig, from: Readonly<{ x: number; y: number; z: number }>, to: Readonly<{ x: number; y: number; z: number }>, sag: number): void {
    const positions = rig.line.geometry.attributes.position;
    for (let index = 0; index < LINE_POINTS; index += 1) {
      const t = index / (LINE_POINTS - 1);
      positions.setXYZ(index, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * sag, from.z + (to.z - from.z) * t);
    }
    positions.needsUpdate = true;
  }

  return Object.freeze({
    update(_dt, seconds, placements) {
      const present = new Set<string>();
      for (const placement of placements) {
        const rod = placement.member.pose.rod;
        if (!rod || placement.member.pose.mount) continue;
        present.add(placement.clientId);
        let rig = rigs.get(placement.clientId);
        if (!rig) {
          rig = createRig(placement.clientId);
          rigs.set(placement.clientId, rig);
          rig.phase = rod.phase;
          rig.since = seconds;
        }
        setRod(rig, rod.rodId);
        if (rig.phase !== rod.phase) {
          rig.phase = rod.phase;
          rig.since = seconds;
        }
        const shape = anglerRig(placement, rod, seconds - rig.since, seconds);
        rig.pivot.position.set(shape.hand.x, shape.hand.y, shape.hand.z);
        direction.set(shape.tip.x - shape.hand.x, shape.tip.y - shape.hand.y, shape.tip.z - shape.hand.z).normalize();
        rig.pivot.quaternion.setFromUnitVectors(up, direction);
        rig.line.visible = Boolean(shape.lure);
        rig.bobber.visible = Boolean(shape.lure) && !shape.thrashing;
        if (shape.lure) {
          rig.bobber.position.set(shape.lure.x, shape.lure.y, shape.lure.z);
          drawLine(rig, shape.tip, shape.lure, shape.thrashing ? 0.02 : 0.3);
        }
        // A fish on: the water breaks where it pulls, again and again.
        rig.ring.visible = shape.thrashing && Boolean(shape.lure);
        if (rig.ring.visible && shape.lure) {
          const pulse = (seconds * 1.6) % 1;
          rig.ring.position.set(shape.lure.x, COVE_WATER_LEVEL + 0.01, shape.lure.z);
          rig.ring.scale.setScalar(0.25 + pulse * 0.9);
          rig.ring.material.opacity = 0.75 * (1 - pulse);
        }
      }
      for (const clientId of [...rigs.keys()]) if (!present.has(clientId)) removeRig(clientId);
    },
    dispose() {
      for (const clientId of [...rigs.keys()]) removeRig(clientId);
      ringGeometry.dispose();
    },
  });
}
