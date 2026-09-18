// One lightweight GLB stage shared by all avatar cards. The same normalized
// model-loading boundary can later be reused by multiplayer presence without
// teaching the editor panel about THREE.

import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { findArcadeAvatar } from "./arcade-room-avatar-catalog.mjs";

type ThreeNamespace = Record<string, any>;

export type ArcadeAvatarPreview = Readonly<{
  show: (avatarId: string) => void;
}>;

export function createArcadeAvatarPreview(THREE: ThreeNamespace, canvas: HTMLCanvasElement): ArcadeAvatarPreview {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 30);
  camera.position.set(0, 1.15, 4.3);
  camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xdff7ff, 0x161122, 2.3));
  const key = new THREE.DirectionalLight(0xffdfb5, 3.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x67dcff, 2.4);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const stage = new THREE.Group();
  scene.add(stage);
  const loader = new GLTFLoader();
  let request = 0;
  let shownAvatarId = "";
  let mixer: any = null;
  let previous = performance.now();

  function clearStage(): void {
    mixer = null;
    for (const child of [...stage.children]) stage.remove(child);
  }

  function fitModel(model: any): void {
    const initial = new THREE.Box3().setFromObject(model);
    const size = initial.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 2.2 / size.y : 1;
    model.scale.setScalar(scale);
    const fitted = new THREE.Box3().setFromObject(model);
    const centre = fitted.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -fitted.min.y, -centre.z);
    model.rotation.y = Math.PI * 0.08;
  }

  function show(avatarId: string): void {
    const definition = findArcadeAvatar(avatarId);
    if (!definition || definition.id === shownAvatarId) return;
    shownAvatarId = definition.id;
    const token = ++request;
    canvas.dataset.state = "loading";
    loader.load(definition.assetUrl, (gltf: any) => {
      if (token !== request) return;
      clearStage();
      fitModel(gltf.scene);
      stage.add(gltf.scene);
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        const idle = gltf.animations.find((clip: any) => /idle/i.test(clip.name)) ?? gltf.animations[0];
        mixer.clipAction(idle).play();
      }
      canvas.dataset.state = "ready";
    }, undefined, () => {
      if (token === request) canvas.dataset.state = "error";
    });
  }

  function frame(now: number): void {
    if (canvas.offsetParent === null) {
      previous = now;
      requestAnimationFrame(frame);
      return;
    }
    const width = Math.max(1, canvas.clientWidth || 280);
    const height = Math.max(1, canvas.clientHeight || 250);
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    mixer?.update(Math.min((now - previous) / 1000, 0.1));
    stage.rotation.y += Math.min((now - previous) / 1000, 0.1) * 0.18;
    previous = now;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return Object.freeze({ show });
}
