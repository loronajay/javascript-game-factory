// Human figures for the players. The textured Quaternius Base Character and its compatible
// locomotion library are each loaded once, then the body is cloned per player with its own skeleton.
// Everything decided here is presentation; pose selection stays in avatar-logic.js.
export function createAvatars({ THREE, GLTFLoader, scene, config: CONFIG, logic }) {
  const avatars = new Map();
  const markerPoint = new THREE.Vector3();
  let sourceRequest = null;

  function loadGltf(path) {
    return new Promise((resolve, reject) => new GLTFLoader().load(path, resolve, undefined, reject));
  }

  function loadSources() {
    if (sourceRequest) return sourceRequest;
    if (!GLTFLoader) return Promise.reject(new Error('GLTFLoader unavailable'));
    sourceRequest = Promise.all([
      loadGltf('assets/quaternius-player/base-character.glb'),
      loadGltf('assets/quaternius-player/locomotion.glb'),
    ]).then(([character, animation]) => ({ character, animation }));
    return sourceRequest;
  }

  // three's Object3D.clone() rebuilds the hierarchy but leaves every SkinnedMesh bound to the
  // original skeleton, so every clone would animate as one body. This rebinds each clone to its own
  // bones (the SkeletonUtils.clone algorithm, inlined so we do not vendor another file).
  function cloneRig(source) {
    const sourceByClone = new Map();
    const cloneBySource = new Map();
    const clone = source.clone(true);
    (function pair(a, b) {
      sourceByClone.set(b, a); cloneBySource.set(a, b);
      for (let i = 0; i < a.children.length; i += 1) pair(a.children[i], b.children[i]);
    })(source, clone);
    clone.traverse((node) => {
      if (!node.isSkinnedMesh) return;
      const original = sourceByClone.get(node);
      node.skeleton = original.skeleton.clone();
      node.skeleton.bones = original.skeleton.bones.map((bone) => cloneBySource.get(bone));
      node.bindMatrix.copy(original.bindMatrix);
      node.bind(node.skeleton, node.bindMatrix);
    });
    return clone;
  }

  // Asset continuity: a figure exists the instant it is spawned, whether or not the rig has arrived.
  // The blocks are swapped out in place when it does.
  function createPlaceholder(tint) {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: tint.skin, roughness: 0.85 });
    const accent = new THREE.MeshStandardMaterial({ color: tint.accent, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.72, 4, 10), skin);
    torso.position.y = 1.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), accent);
    head.position.y = 1.72;
    group.add(torso, head);
    return group;
  }

  // The role marker: the uniform that tells a seeker from a guest at a glance. It is built from the
  // pure spec in `avatar-logic.avatarMarker` and added *beside* the rig, never over it — the base
  // character's authored textures stay exactly as they were shipped.
  //
  // It hangs off `avatar.body` rather than off the head bone, so it inherits the figure's facing
  // without inheriting a bone roll nobody authored for a hat. Only the head's height and lean are
  // sampled each frame (`trackMarker`), which is what carries the cap through a crouch.
  function createMarker(spec) {
    const group = new THREE.Group();
    group.name = `Role Marker (${spec.kind})`;
    const cloth = new THREE.MeshStandardMaterial({ color: spec.cloth, roughness: 0.72, metalness: 0.05 });
    const metal = new THREE.MeshStandardMaterial({ color: spec.metal, roughness: 0.34, metalness: 0.65, emissive: spec.lamp, emissiveIntensity: spec.glow * 0.35 });
    const lamp = new THREE.MeshStandardMaterial({ color: spec.lamp, roughness: 1, emissive: spec.lamp, emissiveIntensity: spec.glow });
    // Offsets are measured from the `Head` bone's origin, which sits at the base of the skull on the
    // Base Character: the crown is about 0.27 above it and the shoulders about 0.12 below.
    if (spec.cap) {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.108, 0.075, 14), cloth);
      crown.position.y = 0.238;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.111, 0.111, 0.024, 14), metal);
      band.position.y = 0.191;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.129, 0.129, 0.012, 16), cloth);
      brim.position.y = 0.171;
      group.add(crown, band, brim);
    }
    if (spec.epaulettes) {
      for (const side of [-1, 1]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.026, 0.11), metal);
        pad.position.set(side * 0.142, -0.078, -0.028);
        group.add(pad);
      }
      // The one warm light on the figure. It is emissive material, not a light: `numPointLights` is
      // part of every material's shader program key, so a lamp per player would recompile the hotel
      // each time somebody joined.
      const collar = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), lamp);
      collar.position.set(0, -0.086, 0.072);
      group.add(collar);
    }
    if (spec.scarf) {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.023, 8, 16), cloth);
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = -0.08;
      group.add(scarf);
    }
    for (const node of group.children) { node.castShadow = false; node.receiveShadow = false; node.frustumCulled = false; }
    return group;
  }

  // The marker sits where the head is. Sampling the bone in body space keeps it on the shoulders
  // through a crouch, a walk cycle and an idle sway without the marker itself being animated.
  function trackMarker(avatar) {
    if (!avatar.marker) return;
    if (!avatar.markerAnchor) { avatar.marker.position.set(0, CONFIG.eyeHeight, 0); return; }
    avatar.markerAnchor.getWorldPosition(markerPoint);
    avatar.body.worldToLocal(markerPoint);
    avatar.marker.position.copy(markerPoint);
  }

  function prepareModel(model) {
    model.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = false; node.receiveShadow = false;
      node.frustumCulled = false;
    });
  }

  function attachRig(avatar, sources) {
    const model = cloneRig(sources.character.scene);
    prepareModel(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = CONFIG.bodyHeight / (size.y || 1);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    model.position.y = -scaled.min.y;
    if (avatar.placeholder) { avatar.body.remove(avatar.placeholder); avatar.placeholder = null; }
    avatar.body.add(model);
    avatar.model = model;
    // Your own body is drawn so you cast a silhouette in the world; the head would be inside the
    // camera, so it is collapsed rather than the whole figure being hidden from its owner. The clips
    // carry scale tracks, so this has to be re-applied after the mixer runs, not once at load.
    avatar.headBone = avatar.hideHead ? model.getObjectByName('Head') : null;
    // Kept separately from `headBone`, which is only set when the head is being collapsed. The
    // marker has to follow the head whether or not its owner is looking through it.
    avatar.markerAnchor = model.getObjectByName('Head') || null;
    trackMarker(avatar);
    avatar.mixer = new THREE.AnimationMixer(model);
    avatar.clips = new Map(sources.animation.animations.map((clip) => [clip.name, clip]));
    avatar.clipNames = [...avatar.clips.keys()];
    playMotion(avatar, avatar.motion.motionState, true);
  }

  function playMotion(avatar, motionState, immediate = false) {
    if (!avatar.mixer) return;
    const clipName = logic.pickClipName(motionState, avatar.clipNames);
    if (!clipName) return;
    let action = avatar.actions.get(clipName);
    if (!action) { action = avatar.mixer.clipAction(avatar.clips.get(clipName)); avatar.actions.set(clipName, action); }
    action.timeScale = logic.clipTimeScale(motionState, avatar.motion.speed);
    if (avatar.activeAction === action) return;
    action.reset().fadeIn(immediate ? 0 : 0.2).play();
    if (avatar.activeAction) avatar.activeAction.fadeOut(immediate ? 0 : 0.2);
    avatar.activeAction = action;
  }

  function applyLocalOverrides(avatar) {
    if (!avatar.model) return;
    if (avatar.headBone) avatar.headBone.scale.setScalar(0.0001);
  }

  // Whoever is looking out of this body sees the marker from the inside — a cap brim across the top
  // of the screen. It goes wherever the head goes.
  function setMarkerHidden(avatar, hidden) {
    if (avatar.marker) avatar.marker.visible = !hidden;
  }

  function spawn(id, { role = logic.ROLES.HIDER, seat = 0, pose = { x: 0, y: 0, z: 0 }, hideHead = false, name = '' } = {}) {
    remove(id);
    const tint = logic.avatarTint(role, seat);
    const root = new THREE.Group();
    root.name = `Avatar ${name || id}`;
    const body = new THREE.Group();
    root.add(body);
    const placeholder = createPlaceholder(tint);
    body.add(placeholder);
    const marker = createMarker(logic.avatarMarker(role, seat));
    marker.position.set(0, CONFIG.eyeHeight, 0);
    body.add(marker);
    root.position.set(pose.x || 0, pose.y || 0, pose.z || 0);
    scene.add(root);
    const avatar = {
      id, role, seat, tint, root, body, placeholder, marker, markerAnchor: null, hideHead, name,
      model: null, mixer: null, clips: new Map(), clipNames: [], actions: new Map(), activeAction: null,
      headBone: null, motion: logic.createAvatarMotion(pose), pendingPose: null, visible: true,
    };
    setMarkerHidden(avatar, hideHead);
    avatars.set(id, avatar);
    loadSources().then((sources) => { if (avatars.get(id) === avatar) attachRig(avatar, sources); })
      .catch((error) => console.warn('Avatar rig could not load; using the block figure.', error));
    return avatar;
  }

  // The one call a network layer needs: hand it whatever the last snapshot said about a player.
  function setPose(id, pose) {
    const avatar = avatars.get(id);
    if (!avatar) return null;
    avatar.pendingPose = pose;
    return avatar;
  }

  function setVisible(id, visible) {
    const avatar = avatars.get(id);
    if (avatar) { avatar.visible = visible; avatar.root.visible = visible; }
  }

  function setHeadHidden(id, hidden) {
    const avatar = avatars.get(id);
    if (!avatar) return;
    avatar.hideHead = !!hidden;
    setMarkerHidden(avatar, !!hidden);
    avatar.headBone = avatar.hideHead && avatar.model ? avatar.model.getObjectByName('Head') : null;
    if (!hidden && avatar.model) {
      const head = avatar.model.getObjectByName('Head');
      if (head) head.scale.setScalar(1);
    }
  }

  function remove(id) {
    const avatar = avatars.get(id);
    if (!avatar) return;
    if (avatar.mixer) avatar.mixer.stopAllAction();
    scene.remove(avatar.root);
    avatars.delete(id);
  }

  function update(delta) {
    for (const avatar of avatars.values()) {
      const pose = avatar.pendingPose
        || { x: avatar.motion.position.x, y: avatar.motion.position.y, z: avatar.motion.position.z, yaw: avatar.motion.facing, crouching: avatar.motion.crouchBlend > 0.5, flashlightOn: avatar.motion.flashlightOn, flashlightCharge: avatar.motion.flashlightCharge };
      avatar.motion = logic.updateAvatarMotion(avatar.motion, pose, delta);
      avatar.root.position.set(avatar.motion.position.x, avatar.motion.position.y, avatar.motion.position.z);
      avatar.body.rotation.y = avatar.motion.facing;
      playMotion(avatar, avatar.motion.motionState);
      if (avatar.mixer) { avatar.mixer.update(delta); applyLocalOverrides(avatar); }
      trackMarker(avatar);
    }
  }

  function get(id) { return avatars.get(id) || null; }
  function list() { return [...avatars.keys()]; }
  function describe(id) {
    const avatar = avatars.get(id);
    if (!avatar) return null;
    return { id, role: avatar.role, rig: avatar.model ? 'base-character' : 'placeholder', marker: avatar.marker ? avatar.marker.name : null, motion: avatar.motion.motionState, speed: Number(avatar.motion.speed.toFixed(2)), flashlightOn: avatar.motion.flashlightOn, flashlightCharge: avatar.motion.flashlightCharge, position: { ...avatar.motion.position } };
  }

  // A single figure on the spot for `?inspect=avatar`, shaped like the demon's viewer subject so the
  // existing model workbench can drive it.
  function createShowcase() {
    const avatar = spawn('showcase', { role: logic.ROLES.HIDER, seat: 0, pose: { x: 0, y: 0, z: 0 } });
    let motion = 'idle';
    return {
      root: avatar.root,
      setInspectionAnimation(mode) {
        motion = mode;
        const crouching = mode === 'crouch';
        const speed = mode === 'walk' ? 4.2 : mode === 'run' ? 6.8 : 0;
        avatar.motion = { ...avatar.motion, speed, crouchBlend: crouching ? 1 : 0 };
        playMotion(avatar, logic.resolveMotionState({ speed, crouching }));
      },
      update(delta) {
        if (motion === 'crouch') avatar.motion = { ...avatar.motion, crouchBlend: Math.min(1, avatar.motion.crouchBlend + delta * 4) };
        else avatar.motion = { ...avatar.motion, crouchBlend: Math.max(0, avatar.motion.crouchBlend - delta * 4) };
        if (avatar.mixer) { avatar.mixer.update(delta); applyLocalOverrides(avatar); }
      },
    };
  }

  // The local player is a figure like everyone else, driven from the camera through the same
  // `setPose` a network snapshot uses — so a remote body and the local one can never become two
  // implementations. The rig's forward is +Z and the camera looks down -Z, hence the half turn.
  function followCamera(id, { camera, world, player }) {
    const view = player.getState();
    setPose(id, {
      x: camera.position.x,
      y: world.state.playerFeetY,
      z: camera.position.z,
      yaw: world.state.yaw + Math.PI,
      crouching: world.state.playerCrouching,
      flashlightOn: view.flashlightOn,
      flashlightCharge: view.flashlightCharge,
    });
  }

  return { spawn, setPose, setVisible, setHeadHidden, remove, update, get, list, describe, createShowcase, followCamera };
}
