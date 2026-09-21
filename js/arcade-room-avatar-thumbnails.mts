// Avatar thumbnails: a picture of the real model for every avatar card.
//
// The avatar pack is twelve GLBs with no card art, and a letter in a coloured
// box says nothing about the body a player is about to wear. This loads each
// model once, poses it the way the big preview does, renders one portrait
// frame into a small offscreen WebGL canvas and hands back a data URL for the
// card's `<img>`. The models are ~1.3 MB each, so nothing loads until a card
// asks, and the answer is cached per avatar id for the session. The panel
// stays free of THREE: it is handed a `(avatarId, onReady) => url | null` and
// paints the picture whenever it arrives.
//
// THE MODEL SOURCE IS INJECTABLE (2026-09-20). The farm's species cards want
// the same portrait of a different catalog whose GLBs carry one unnamed track
// instead of named clips, so `resolve` maps an id to `{ assetUrl, poseClip }`;
// the default is the avatar catalog and the idle clip by name, unchanged.

import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { findArcadeAvatar } from "./arcade-room-avatar-catalog.mjs";

type ThreeNamespace = Record<string, any>;

export type AvatarThumbnails = Readonly<{
  /**
   * The rendered portrait if it is already in hand, else null — and in that case
   * `onReady` is called with the URL once the model has loaded and rendered.
   * A model that fails to load never calls back; the card keeps its fallback.
   */
  get: (avatarId: string, onReady: (url: string) => void) => string | null;
  dispose: () => void;
}>;

export const AVATAR_THUMBNAIL_SIZE = Object.freeze({ width: 160, height: 200 });
/** How far into the idle clip the portrait is taken: past the first frame's stiff rest pose. */
const POSE_SECONDS = 0.6;

export type ThumbnailSubject = Readonly<{
  assetUrl: string;
  /** The clip to pose with, from the loaded GLB; null for the rest pose. */
  poseClip?: (gltf: any) => any | null;
  /** Portrait framing: how tall the model is made (world units) and the camera's aim height. */
  height?: number;
  lookAtY?: number;
}>;

export type ThumbnailOptions = Readonly<{
  resolve?: (id: string) => ThumbnailSubject | undefined;
}>;

function resolveAvatar(avatarId: string): ThumbnailSubject | undefined {
  const definition = findArcadeAvatar(avatarId);
  return definition ? { assetUrl: definition.assetUrl } : undefined;
}

export function createAvatarThumbnails(THREE: ThreeNamespace, options: ThumbnailOptions = {}): AvatarThumbnails {
  const resolveSubject = options.resolve ?? resolveAvatar;
  const cache = new Map<string, string>();
  const waiting = new Map<string, Array<(url: string) => void>>();
  const loader = new GLTFLoader();
  let renderer: any = null;
  let scene: any = null;
  let camera: any = null;
  let stage: any = null;

  function ensureRenderer(): boolean {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch {
      return false;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(AVATAR_THUMBNAIL_SIZE.width, AVATAR_THUMBNAIL_SIZE.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdff7ff, 0x161122, 2.3));
    const key = new THREE.DirectionalLight(0xffdfb5, 3.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x67dcff, 2.4);
    rim.position.set(-4, 2, -3);
    scene.add(rim);
    stage = new THREE.Group();
    scene.add(stage);
    camera = new THREE.PerspectiveCamera(26, AVATAR_THUMBNAIL_SIZE.width / AVATAR_THUMBNAIL_SIZE.height, 0.01, 30);
    camera.position.set(0.3, 1.1, 5.3);
    camera.lookAt(0, 1.0, 0);
    return true;
  }

  /** Stand the model on the origin at a common height and turn it a little towards the key light. */
  function fitModel(model: any, height: number): void {
    const initial = new THREE.Box3().setFromObject(model);
    const size = initial.getSize(new THREE.Vector3());
    model.scale.setScalar(size.y > 0 ? height / size.y : 1);
    const fitted = new THREE.Box3().setFromObject(model);
    const centre = fitted.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -fitted.min.y, -centre.z);
    model.rotation.y = -Math.PI * 0.12;
  }

  function render(gltf: any, subject: ThumbnailSubject): string {
    for (const child of [...stage.children]) stage.remove(child);
    fitModel(gltf.scene, subject.height ?? 2.0);
    stage.add(gltf.scene);
    const clip = subject.poseClip
      ? subject.poseClip(gltf)
      : (gltf.animations?.find((candidate: any) => /idle/i.test(candidate.name)) ?? gltf.animations?.[0] ?? null);
    if (clip) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      mixer.clipAction(clip).play();
      mixer.update(POSE_SECONDS);
    }
    camera.lookAt(0, subject.lookAtY ?? 1.0, 0);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    stage.remove(gltf.scene);
    return url;
  }

  function load(avatarId: string): void {
    const subject = resolveSubject(avatarId);
    if (!subject || !ensureRenderer()) {
      waiting.delete(avatarId);
      return;
    }
    loader.load(subject.assetUrl, (gltf: any) => {
      let url = "";
      try {
        url = render(gltf, subject);
      } catch {
        url = "";
      }
      const callbacks = waiting.get(avatarId) ?? [];
      waiting.delete(avatarId);
      if (!url) return;
      cache.set(avatarId, url);
      for (const callback of callbacks) callback(url);
    }, undefined, () => {
      waiting.delete(avatarId);
    });
  }

  return Object.freeze({
    get: (avatarId, onReady) => {
      const cached = cache.get(avatarId);
      if (cached) return cached;
      const queue = waiting.get(avatarId);
      if (queue) {
        queue.push(onReady);
        return null;
      }
      waiting.set(avatarId, [onReady]);
      load(avatarId);
      return null;
    },
    dispose: () => {
      cache.clear();
      waiting.clear();
      renderer?.dispose?.();
      renderer = null;
      scene = null;
      camera = null;
      stage = null;
    },
  });
}
