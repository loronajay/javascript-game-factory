// Human figures for the players. The textured Quaternius Base Character and its compatible
// locomotion library are each loaded once, then the body is cloned per player with its own skeleton.
// Everything decided here is presentation; pose selection stays in avatar-logic.js.
export function createAvatars({ THREE, GLTFLoader, scene, config: CONFIG, logic }) {
  const avatars = new Map();
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

  function spawn(id, { role = logic.ROLES.HIDER, seat = 0, pose = { x: 0, y: 0, z: 0 }, hideHead = false, name = '' } = {}) {
    remove(id);
    const tint = logic.avatarTint(role, seat);
    const root = new THREE.Group();
    root.name = `Avatar ${name || id}`;
    const body = new THREE.Group();
    root.add(body);
    const placeholder = createPlaceholder(tint);
    body.add(placeholder);
    root.position.set(pose.x || 0, pose.y || 0, pose.z || 0);
    scene.add(root);
    const avatar = {
      id, role, seat, tint, root, body, placeholder, hideHead, name,
      model: null, mixer: null, clips: new Map(), clipNames: [], actions: new Map(), activeAction: null,
      headBone: null, motion: logic.createAvatarMotion(pose), pendingPose: null, visible: true,
    };
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
    }
  }

  function get(id) { return avatars.get(id) || null; }
  function list() { return [...avatars.keys()]; }
  function describe(id) {
    const avatar = avatars.get(id);
    if (!avatar) return null;
    return { id, role: avatar.role, rig: avatar.model ? 'base-character' : 'placeholder', motion: avatar.motion.motionState, speed: Number(avatar.motion.speed.toFixed(2)), flashlightOn: avatar.motion.flashlightOn, flashlightCharge: avatar.motion.flashlightCharge, position: { ...avatar.motion.position } };
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

  return { spawn, setPose, setVisible, remove, update, get, list, describe, createShowcase, followCamera };
}
