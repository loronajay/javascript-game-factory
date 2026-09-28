// A catch in 3D: the rod in the angler's hands, the line, the bobber, the
// shape of the fish on the end of it, and — once it is landed — the fish
// itself, held up at its real size, flopping.
//
// It draws what the controller's snapshot says and decides nothing. Until a
// fish is landed the view does not know what it is (the server has not said),
// so the thing on the line is a silhouette the size the bite hinted at.

import { COVE_WATER_LEVEL } from "./farm-cove.mjs";
import { findFishingRod } from "./farm-catalog/fish.mjs";
import { bobberDip, leapPending } from "./farm-fishing.mjs";
import { loadFish, loadFishingProp, type LoadedFish } from "./farm-fish-models.mjs";
import { SHADOW_LENGTH } from "./farm-fish-shadows-view.mjs";
import type { FishingSnapshot } from "./farm-fishing-controller.mjs";

type ThreeNamespace = Record<string, any>;

export type FishingView = Readonly<{
  /** Show the rod whenever the angler could cast, or is fishing. */
  setRodVisible: (visible: boolean) => void;
  setRod: (rodId: string) => void;
  /** Draw this frame of the catch. `seconds` is the page's clock. */
  update: (snapshot: FishingSnapshot, dt: number, seconds: number) => void;
  dispose: () => void;
}>;

const ROD_LENGTH = 1.45;
const LINE_POINTS = 28;

function silhouette(THREE: ThreeNamespace): any {
  const geometry = new THREE.SphereGeometry(0.5, 12, 8);
  geometry.scale(0.34, 0.26, 1);
  const tail = new THREE.ConeGeometry(0.22, 0.34, 4);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, 0.62);
  const material = new THREE.MeshBasicMaterial({ color: "#0b1820", transparent: true, opacity: 0.6, depthWrite: false });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(tail, material));
  group.renderOrder = 1;
  return group;
}

export function createFishingView(THREE: ThreeNamespace, scene: any, camera: any): FishingView {
  // The rod lives in the camera's frame: bottom right, leaning out over the water.
  const rodMount = new THREE.Group();
  rodMount.position.set(0.36, -0.42, -0.62);
  camera.add(rodMount);
  if (!camera.parent) scene.add(camera);
  const rodPivot = new THREE.Group();
  rodPivot.rotation.set(-0.95, 0.12, -0.18);
  rodMount.add(rodPivot);
  const rodTip = new THREE.Object3D();
  rodTip.position.set(0, ROD_LENGTH, 0);
  rodPivot.add(rodTip);
  let rodModel: any = null;
  let rodId = "";
  let rodVisible = false;

  function setRod(id: string): void {
    if (id === rodId) return;
    rodId = id;
    const rod = findFishingRod(id);
    if (!rod) return;
    void loadFishingProp(rod.file).then((model) => {
      if (rodId !== id) return;
      if (rodModel) rodPivot.remove(rodModel);
      const box = new THREE.Box3().setFromObject(model);
      const height = Math.max(0.01, box.max.y - box.min.y);
      model.scale.setScalar(ROD_LENGTH / height);
      model.position.y = -box.min.y * (ROD_LENGTH / height);
      model.traverse((node: any) => { if (node.isMesh) { node.castShadow = false; node.renderOrder = 5; } });
      rodModel = model;
      rodPivot.add(model);
    }).catch(() => undefined);
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: "#f1f5f2", transparent: true, opacity: 0.8 }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  const bobber = new THREE.Group();
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#e0412f", roughness: 0.4 }));
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f5f1e8", roughness: 0.4 }));
  bobber.add(red, white);
  bobber.visible = false;
  scene.add(bobber);

  // Rings on the water: the splash of the lure, the bite, a thrash.
  const rings: { mesh: any; age: number; life: number; grow: number }[] = [];
  const ringGeometry = new THREE.RingGeometry(0.85, 1, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  function splash(point: Readonly<{ x: number; z: number }>, size = 0.4, life = 0.9): void {
    const mesh = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: "#e8f7ff", transparent: true, opacity: 0.8, depthWrite: false }));
    mesh.position.set(point.x, COVE_WATER_LEVEL + 0.01, point.z);
    mesh.scale.setScalar(size * 0.3);
    mesh.renderOrder = 3;
    scene.add(mesh);
    rings.push({ mesh, age: 0, life, grow: size });
  }

  const hooked = silhouette(THREE);
  hooked.visible = false;
  scene.add(hooked);

  let reveal: LoadedFish | null = null;
  let revealFor = "";
  let lastPhase = "idle";
  let lastSplash = 0;
  const tip = new THREE.Vector3();
  // A soft light from over the angler's shoulder while a catch is held up, so it is never a silhouette against the sun.
  const showLight = new THREE.DirectionalLight(0xfff4e0, 0);
  showLight.position.set(0.6, 0.8, 0.4);
  const showTarget = new THREE.Object3D();
  showTarget.position.set(0, 0, -2);
  camera.add(showLight, showTarget);
  showLight.target = showTarget;

  function clearReveal(): void {
    reveal?.dispose();
    reveal = null;
    revealFor = "";
  }

  function drawLine(from: any, to: Readonly<{ x: number; y: number; z: number }>, sag: number, arc = 0): void {
    const positions = lineGeometry.attributes.position;
    for (let index = 0; index < LINE_POINTS; index += 1) {
      const t = index / (LINE_POINTS - 1);
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      const y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * sag + Math.sin(t * Math.PI) * arc;
      positions.setXYZ(index, x, y, z);
    }
    positions.needsUpdate = true;
    line.visible = true;
  }

  return Object.freeze({
    setRodVisible(visible) {
      rodVisible = visible;
    },
    setRod,
    update(snapshot, dt, seconds) {
      const phase = snapshot.phase;
      const fishing = phase !== "idle";
      rodMount.visible = (rodVisible || fishing) && phase !== "reveal";

      // The rod: drawn back while charging, flicked out on the cast, bent by the fish.
      let pitch = -0.95;
      let roll = -0.18;
      if (phase === "charging") pitch = -0.95 + snapshot.power * 1.15;
      else if (phase === "flight") pitch = -0.95 - Math.sin(Math.min(1, snapshot.flight * 2) * Math.PI) * 0.35;
      else if (phase === "fighting" || phase === "netting") {
        const fight = snapshot.fight!;
        pitch = -0.6 + fight.tension * 0.55 + Math.sin(seconds * 40) * fight.tension * 0.02;
        roll = -0.18 + fight.pullSide * 0.25 * fight.tension;
      } else if (phase === "waiting") pitch = -1.0 + Math.sin(seconds * 1.3) * 0.02;
      rodPivot.rotation.x += (pitch - rodPivot.rotation.x) * Math.min(1, dt * 14);
      rodPivot.rotation.z += (roll - rodPivot.rotation.z) * Math.min(1, dt * 10);
      camera.updateMatrixWorld(true);
      rodTip.getWorldPosition(tip);

      // The lure's flight and the bobber.
      const landing = snapshot.landing;
      if (phase !== lastPhase) {
        if (phase === "waiting" && landing) splash(landing, 0.5);
        if (phase === "fighting" && landing) splash(landing, 0.9, 1.1);
        if (lastPhase === "reveal" || phase === "idle") clearReveal();
      }
      lastPhase = phase;
      bobber.visible = false;
      hooked.visible = false;
      line.visible = false;
      if (phase === "flight" && landing) {
        const t = snapshot.flight;
        const point = { x: tip.x + (landing.x - tip.x) * t, y: tip.y + (COVE_WATER_LEVEL - tip.y) * t + Math.sin(t * Math.PI) * 2.2, z: tip.z + (landing.z - tip.z) * t };
        bobber.position.set(point.x, point.y, point.z);
        bobber.visible = true;
        drawLine(tip, point, 0.05);
      } else if ((phase === "waiting" || (phase === "flight" && snapshot.flight >= 1)) && landing) {
        const dip = snapshot.plan ? bobberDip(snapshot.plan, snapshot.waited) : 0;
        const y = COVE_WATER_LEVEL + 0.02 - dip * 0.12 + Math.sin(seconds * 2.2) * 0.012;
        bobber.position.set(landing.x, y, landing.z);
        bobber.visible = true;
        drawLine(tip, bobber.position, 0.35);
        if (dip >= 0.99 && seconds - lastSplash > 0.25) {
          splash(landing, 0.35, 0.5);
          lastSplash = seconds;
        }
      } else if ((phase === "fighting" || phase === "netting") && snapshot.fight && snapshot.from && landing) {
        // The fish runs where the fight says: out along the cast, off to the side it is pulling.
        const fight = snapshot.fight;
        const dx = landing.x - snapshot.from.x;
        const dz = landing.z - snapshot.from.z;
        const length = Math.hypot(dx, dz) || 1;
        const ux = dx / length;
        const uz = dz / length;
        const lateral = Math.min(2.5, fight.distance * 0.18) * Math.sin(fight.elapsed * 0.7 + fight.pullSide);
        const x = snapshot.from.x + ux * Math.max(0.8, fight.distance) + -uz * lateral;
        const z = snapshot.from.z + uz * Math.max(0.8, fight.distance) + ux * lateral;
        const leaping = fight.elapsed < fight.leapUntil;
        const leapT = leaping ? 1 - (fight.leapUntil - fight.elapsed) / 0.75 : 0;
        const y = leaping ? COVE_WATER_LEVEL + Math.sin(Math.max(0, Math.min(1, leapT)) * Math.PI) * 0.9 : COVE_WATER_LEVEL - 0.25;
        const size = SHADOW_LENGTH[(snapshot.hint as keyof typeof SHADOW_LENGTH)] ?? 0.55;
        hooked.scale.setScalar(size);
        hooked.position.set(x, y, z);
        hooked.rotation.y = Math.atan2(-(x - snapshot.from.x), -(z - snapshot.from.z)) + Math.PI + Math.sin(seconds * 9) * 0.25;
        hooked.visible = true;
        drawLine(tip, { x, y: Math.max(y, COVE_WATER_LEVEL), z }, Math.max(0, 0.35 - fight.tension * 0.4));
        if ((leapPending(fight) || fight.effort > 1.4 || phase === "netting") && seconds - lastSplash > 0.18) {
          splash({ x, z }, 0.25 + size * 0.4, 0.6);
          lastSplash = seconds;
        }
      }

      // The fish, landed: held up in front of the angler at its real size, flopping.
      if (phase === "reveal" && snapshot.fish && revealFor !== snapshot.fish.id) {
        const fish = snapshot.fish;
        revealFor = fish.id;
        const lengthM = fish.lengthMm / 1000;
        void loadFish(THREE, fish.speciesId, lengthM, fish.variant).then((loaded) => {
          if (revealFor !== fish.id) { loaded.dispose(); return; }
          reveal?.dispose();
          reveal = loaded;
          // Far enough back that a shark fits the view, close enough that a tetra is not a speck;
          // a little left of centre, clear of the catch card.
          const distance = Math.max(0.75, lengthM * 1.7);
          loaded.root.position.set(-distance * 0.18, -distance * 0.06, -distance);
          loaded.root.rotation.y = Math.PI / 2;
          camera.add(loaded.root);
          loaded.play("Out_Of_Water", 0);
        }).catch(() => undefined);
      }
      reveal?.update(dt);
      showLight.intensity += ((phase === "reveal" ? 2.2 : 0) - showLight.intensity) * Math.min(1, dt * 6);

      for (let index = rings.length - 1; index >= 0; index -= 1) {
        const ring = rings[index]!;
        ring.age += dt;
        const t = ring.age / ring.life;
        ring.mesh.scale.setScalar(ring.grow * (0.3 + t * 1.6));
        ring.mesh.material.opacity = 0.8 * (1 - t);
        if (t >= 1) {
          ring.mesh.removeFromParent();
          ring.mesh.material.dispose();
          rings.splice(index, 1);
        }
      }
    },
    dispose() {
      clearReveal();
      rodMount.removeFromParent();
      line.removeFromParent();
      bobber.removeFromParent();
      hooked.removeFromParent();
    },
  });
}
