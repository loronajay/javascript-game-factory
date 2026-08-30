export function createMonster({
  THREE, GLTFLoader, scene, camera, config: CONFIG, floorY, layout, world, player, logic, movement, sanity, document, window,
  name = 'The Bellhop', statusElementId = 'monsterStatus', takenSpawns = [], accentColor = 0x5c141a, eyeColor = 0xff1008,
}) {
  const { ENEMY_STATES } = logic;
  const root = new THREE.Group();
  root.name = name;
  scene.add(root);
  const facing = new THREE.Vector3(0, 0, 1);
  // A demon is 2.25m of body on a 0.32m footprint. Both numbers belong to the body, not to the mover.
  // Clearance, not stature: see `bodyHeight` in `demon-logic.js`. A door is 2.12m tall.
  const BODY = { height: 2.05, radius: 0.32 };
  const monsterStatus = document.getElementById(statusElementId);
  const caughtOverlay = document.getElementById('caughtOverlay');
  const doorRecords = [...world.collections.roomDoors.entries()].map(([roomNumber, item]) => {
    const room = world.collections.roomCenters.get(roomNumber);
    return {
      id: item.planId, item,
      x: item.hinge.position.x,
      y: floorY(room.floor),
      z: item.hinge.position.z + item.door.position.z,
      floor: room.floor,
    };
  });
  let awareness = logic.createAwareness();
  let route = [];
  let routePurpose = 'roam';
  let avoidance = null;
  let mixer = null;
  let activeAction = null;
  let idleAction = null;
  let walkAction = null;
  let fallback = null;
  let headBone = null;
  let headDetails = null;
  let moving = false;
  let detectionCooldown = 0;
  let chasePlanCooldown = 0;
  let plannedChaseFloor = null;
  let huntZone = null;
  let huntTargetId = null;
  let detectedTargetId = null;
  let playerProvider = () => [];
  let previousState = awareness.state;
  // Online this demon is a puppet: the server ticked the real one, and this only draws where it
  // ended up. Nothing below may decide a catch in that mode — there is one authority per hotel.
  let remotePose = null;
  let inspectionMotion = 'idle';
  const inspectionMode = new URLSearchParams(window.location.search).get('inspect') === 'monster';
  const navigator = logic.createNavigator(world.getPlan().navigation, { space: world.space });
  const headWorldPosition = new THREE.Vector3();
  const headOffset = new THREE.Vector3();
  const rootWorldQuaternion = new THREE.Quaternion();
  const headWorldQuaternion = new THREE.Quaternion();
  const inverseBindHeadQuaternion = new THREE.Quaternion();
  const rimPulses = [];
  const shroudStrips = [];
  const eyeParts = [];
  const skeleton = {};
  let jawGroup = null;
  // Created here rather than with the face it belongs to, and never removed. The face arrives with
  // the GLB a second or two after the round starts, and a light appearing then changes the scene's
  // point-light count — which is part of every material's shader program key, so it would recompile
  // the whole hotel mid-play. It is re-parented onto the head below; that costs nothing.
  const headHalo = new THREE.PointLight(0xb50006, 0.3, 3.4, 2);
  headHalo.name = 'Eye Bleed'; headHalo.castShadow = false; headHalo.position.set(0, 2.1, 0.3);
  root.add(headHalo);
  let mistDisc = null;
  let body = null;
  const bodyRest = new THREE.Vector3();
  let shroudGroup = null;
  let shroudAnchor = null;
  const shroudWorldPosition = new THREE.Vector3();
  let menaceTime = 0;
  let headTilt = 0;
  let faceScale = 1;

  function material(color, emissive = 0x000000) {
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.8 : 0, roughness: 0.88, metalness: 0.04 });
  }

  // Shadows are off and the hotel is nearly black, so the demon would read as a flat hole without a
  // rim term. This injects a fresnel edge into the standard shader so his silhouette is legible in the
  // dark, and exposes a pulse uniform the behaviour code drives from his awareness state.
  function withDreadRim(mat, { color, power, strength }) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.rimColor = { value: new THREE.Color(color) };
      shader.uniforms.rimPower = { value: power };
      shader.uniforms.rimStrength = { value: strength };
      shader.uniforms.rimPulse = { value: 0 };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;\nuniform float rimStrength;\nuniform float rimPulse;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tfloat rimFacing = 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );\n\tgl_FragColor.rgb += rimColor * pow( rimFacing, rimPower ) * ( rimStrength + rimPulse );');
      rimPulses.push(shader.uniforms.rimPulse);
    };
    mat.customProgramCacheKey = () => 'hotel-demon-rim-' + color.toString(16);
    return mat;
  }

  const demonSkin = withDreadRim(new THREE.MeshStandardMaterial({ color: 0x08070a, roughness: 0.99, metalness: 0.02 }), { color: accentColor, power: 2.6, strength: 0.75 });
  const demonBone = withDreadRim(new THREE.MeshStandardMaterial({ color: 0x030305, roughness: 0.94, metalness: 0.03 }), { color: 0x584c44, power: 3.1, strength: 0.5 });
  const shroudMaterial = new THREE.MeshStandardMaterial({ color: 0x040406, roughness: 1, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.93, depthWrite: false });
  const eyeCore = new THREE.MeshBasicMaterial({ color: eyeColor });
  const eyeGlow = new THREE.MeshBasicMaterial({ color: eyeColor, transparent: true, opacity: 0.24, depthWrite: false });
  const eyeSocket = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouthGlow = new THREE.MeshBasicMaterial({ color: 0x7d0000 });
  const gulletGlow = new THREE.MeshBasicMaterial({ color: 0x3a0000, transparent: true, opacity: 0.85, depthWrite: false });
  const fangMaterial = new THREE.MeshStandardMaterial({ color: 0x8d8580, roughness: 0.92 });

  function addEye(parent, x, y, z, radius = 0.027) {
    const glow = new THREE.Mesh(new THREE.BoxGeometry(radius * 3.6, radius * 1.35, radius * 0.5), eyeGlow);
    const core = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.65, radius * 0.78, radius * 0.65), eyeCore);
    const angle = x < 0 ? -0.22 : 0.22;
    glow.name = 'Slanted Eye Glow'; core.name = 'Slanted Eye';
    glow.rotation.z = angle; core.rotation.z = angle;
    glow.position.set(x, y, z - radius * 0.12); core.position.set(x, y, z);
    parent.add(glow, core);
    eyeParts.push({ glow, core });
  }

  function createHorn(height = 0.52) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.085, height, 9), demonBone);
    horn.castShadow = true;
    return horn;
  }

  // Rags hung on a hinge at the top edge so they can swing from the shoulder line rather than pivot
  // around their own middle. Scale-compensated when parented to a bone: the model is scaled
  // non-uniformly, and without the inverse the shroud would inherit that squash.
  function createShroud(radius, length, count) {
    const shroud = new THREE.Group();
    shroud.name = 'Tattered Shroud';
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const drop = length * (0.45 + Math.random() * 0.6);
      const geometry = new THREE.PlaneGeometry(radius * (0.28 + Math.random() * 0.42), drop, 1, 3);
      geometry.translate(0, -drop * 0.5, 0);
      const strip = new THREE.Mesh(geometry, shroudMaterial);
      strip.name = 'Shroud Rag';
      strip.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      strip.rotation.y = angle;
      strip.userData.phase = Math.random() * Math.PI * 2;
      shroud.add(strip);
      shroudStrips.push(strip);
    }
    return shroud;
  }

  function inverseBoneScale(object, bone) {
    const scale = bone.getWorldScale(new THREE.Vector3());
    object.scale.set(1 / (scale.x || 1), 1 / (scale.y || 1), 1 / (scale.z || 1));
  }

  function createTalonCluster() {
    const claws = new THREE.Group();
    claws.name = 'Talon Cluster';
    for (let finger = 0; finger < 4; finger += 1) {
      const length = 0.2 - finger * 0.026;
      const geometry = new THREE.ConeGeometry(0.016, length, 6);
      geometry.translate(0, length * 0.5, 0);
      const talon = new THREE.Mesh(geometry, demonBone);
      talon.name = 'Hand Talon';
      talon.position.set((finger - 1.5) * 0.033, 0.115, 0.012);
      talon.rotation.x = 0.34 + finger * 0.07;
      talon.rotation.z = (finger - 1.5) * 0.1;
      claws.add(talon);
    }
    return claws;
  }

  // A row of barbs down the back. The stock rig is a human being; these plus the reversed knees are
  // what stop the silhouette reading as a person in a mask.
  function createSpinalBarbs(count, length, lean) {
    const barbs = new THREE.Group();
    barbs.name = 'Spinal Barb Row';
    for (let i = 0; i < count; i += 1) {
      const size = length * (1 - i * 0.16);
      const geometry = new THREE.ConeGeometry(0.022, size, 5);
      geometry.translate(0, size * 0.5, 0);
      const barb = new THREE.Mesh(geometry, demonBone);
      barb.name = 'Spinal Barb';
      barb.position.set(0, i * 0.11, -0.1 - i * 0.012);
      barb.rotation.x = lean + i * 0.08;
      barb.rotation.z = (i % 2 ? 1 : -1) * 0.07;
      barbs.add(barb);
    }
    return barbs;
  }

  function boneList(model) {
    for (const name of [
      'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
      'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
      'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r',
      'index_01_l', 'index_01_r', 'middle_01_l', 'middle_01_r', 'ring_01_l', 'ring_01_r', 'pinky_01_l', 'pinky_01_r',
    ]) skeleton[name] = model.getObjectByName(name) || null;
  }

  function attachRigDressing(model) {
    boneList(model);
    root.updateMatrixWorld(true);
    const leftHand = model.getObjectByName('hand_l');
    const rightHand = model.getObjectByName('hand_r');
    for (const hand of [leftHand, rightHand]) {
      if (!hand) continue;
      const claws = createTalonCluster();
      inverseBoneScale(claws, hand);
      hand.add(claws);
    }
    for (const [bone, count, length, lean] of [[skeleton.spine_01, 4, 0.15, -0.5], [skeleton.spine_03, 3, 0.17, -0.62]]) {
      if (!bone) continue;
      const barbs = createSpinalBarbs(count, length, lean);
      inverseBoneScale(barbs, bone);
      bone.add(barbs);
    }
    // Parented to the root rather than the spine bone: the model is scaled non-uniformly, so a bone
    // child gets sheared. Tracking the bone's world position by hand also lets the rags hang with
    // gravity instead of tipping with the torso, which is what cloth actually does.
    shroudGroup = createShroud(0.19, 1.5, 22);
    shroudAnchor = skeleton.spine_02 || skeleton.spine_01;
    shroudGroup.position.set(0, 1.7, 0);
    root.add(shroudGroup);
  }

  // The demon has no shadow to ground him (shadow maps are off), so a faint unholy bloom on the floor
  // gives the silhouette something to stand on and grows as he closes in.
  function createFloorBloom() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    const bloom = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), color: 0x8e0007, transparent: true, opacity: 0.04, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    bloom.name = 'Dread Bloom';
    bloom.rotation.x = -Math.PI / 2;
    bloom.position.y = 0.04;
    return bloom;
  }

  function createFallbackDemon() {
    const demon = new THREE.Group();
    const flesh = demonSkin;
    const bone = demonBone;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 1.42, 10), flesh); torso.position.y = 1.45; torso.scale.z = 0.56; demon.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), flesh); head.position.set(0, 2.25, 0.04); head.scale.set(0.68, 1.18, 0.72); demon.add(head);
    for (const side of [-1, 1]) {
      const horn = createHorn(0.58); horn.position.set(side * 0.14, 2.6, 0); horn.rotation.z = side * -0.38; demon.add(horn);
      addEye(demon, side * 0.065, 2.3, 0.195, 0.027);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.34, 7), flesh); arm.position.set(side * 0.31, 1.38, 0); arm.rotation.z = side * -0.12; demon.add(arm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 1.18, 7), bone); leg.position.set(side * 0.12, 0.62, 0); demon.add(leg);
      for (let claw = -1; claw <= 1; claw += 1) { const talon = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.22, 6), bone); talon.position.set(side * 0.31 + claw * 0.035, 0.62, 0.08); talon.rotation.x = Math.PI; demon.add(talon); }
    }
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), flesh); jaw.position.set(0, 2.02, 0.09); jaw.rotation.x = Math.PI; demon.add(jaw);
    const shroud = createShroud(0.26, 1.25, 13); shroud.position.set(0, 1.72, 0); demon.add(shroud);
    demon.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    root.add(demon);
    const aura = new THREE.PointLight(0x9e0000, 0.52, 4.5, 2); aura.position.set(0, 1.7, 0.28); aura.castShadow = false; root.add(aura);
    return demon;
  }

  function createModelDetails() {
    const details = new THREE.Group(); details.name = 'Animated Demon Face';
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), demonSkin); skull.name = 'Demon Skull'; skull.scale.set(0.78, 1.08, 0.68); skull.position.set(0, 0.015, 0.075); details.add(skull);
    for (const side of [-1, 1]) {
      const horn = createHorn(0.34); horn.name = 'Crown Horn'; horn.position.set(side * 0.14, 0.25, 0.025); horn.rotation.z = side * -0.5; details.add(horn);
      const templeHorn = createHorn(0.19); templeHorn.name = 'Temple Horn'; templeHorn.position.set(side * 0.2, 0.055, 0.035); templeHorn.rotation.z = side * -1.16; details.add(templeHorn);
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), eyeSocket); socket.name = 'Recessed Eye Socket'; socket.scale.set(1.55, 0.7, 0.45); socket.position.set(side * 0.066, 0.04, 0.18); details.add(socket);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.055), demonBone); brow.name = 'Brow Ridge'; brow.position.set(side * 0.067, 0.085, 0.205); brow.rotation.z = side * 0.24; details.add(brow);
      addEye(details, side * 0.065, 0.035, 0.215, 0.028);
      const upperFang = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.11, 6), fangMaterial); upperFang.name = 'Upper Fang'; upperFang.position.set(side * 0.046, -0.09, 0.222); upperFang.rotation.x = Math.PI; details.add(upperFang);
    }
    for (let spike = 0; spike < 5; spike += 1) {
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.052 - spike * 0.006, 5), demonBone);
      ridge.name = 'Skull Ridge'; ridge.position.set(0, 0.185 - spike * 0.012, 0.03 - spike * 0.042); ridge.rotation.x = -0.42 - spike * 0.1; details.add(ridge);
    }
    // The jaw hangs off its own hinge so it can gape when he charges instead of sitting in one pose.
    jawGroup = new THREE.Group(); jawGroup.name = 'Demon Jaw Hinge'; jawGroup.position.set(0, -0.02, 0.16); details.add(jawGroup);
    const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), gulletGlow); gullet.name = 'Gullet Glow'; gullet.scale.set(1, 0.72, 0.5); gullet.position.set(0, -0.085, 0.028); jawGroup.add(gullet);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.38, 5), demonSkin); jaw.name = 'Demon Jaw'; jaw.position.set(0, -0.135, -0.055); jaw.rotation.x = Math.PI; jawGroup.add(jaw);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.027, 0.022), mouthGlow); mouth.name = 'Mouth Slit'; mouth.position.set(0, -0.095, 0.06); jawGroup.add(mouth);
    for (const side of [-1, 1]) {
      const lowerFang = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.075, 6), fangMaterial); lowerFang.name = 'Lower Fang'; lowerFang.position.set(side * 0.025, -0.125, 0.064); jawGroup.add(lowerFang);
      const gash = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), mouthGlow); gash.name = 'Cheek Gash'; gash.position.set(side * 0.115, -0.03, 0.145); gash.rotation.z = side * 0.4; details.add(gash);
    }
    headHalo.position.set(0, 0.02, 0.3); details.add(headHalo);
    details.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    return details;
  }

  function updateHeadDetails() {
    if (!headBone || !headDetails) return;
    headBone.getWorldPosition(headWorldPosition);
    root.worldToLocal(headWorldPosition);
    root.getWorldQuaternion(rootWorldQuaternion);
    headBone.getWorldQuaternion(headWorldQuaternion);
    headDetails.quaternion.copy(rootWorldQuaternion).invert().multiply(headWorldQuaternion).multiply(inverseBindHeadQuaternion);
    headDetails.rotateZ(headTilt);
    headOffset.set(0, 0.18 * faceScale, 0.11 * faceScale).applyQuaternion(headDetails.quaternion);
    headDetails.position.copy(headWorldPosition).add(headOffset);
  }

  function bindModelDetails(model) {
    headBone = model.getObjectByName('Head');
    headDetails = createModelDetails();
    headDetails.scale.set(faceScale * 0.93, faceScale, faceScale * 0.96);
    root.add(headDetails);
    if (!headBone) { headDetails.position.set(0, 2.08, 0.11); return; }
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootWorldQuaternion);
    headBone.getWorldQuaternion(headWorldQuaternion);
    inverseBindHeadQuaternion.copy(rootWorldQuaternion).invert().multiply(headWorldQuaternion).invert();
    updateHeadDetails();
  }

  function loadAnimatedBody() {
    if (!GLTFLoader) return;
    const loader = new GLTFLoader();
    loader.load('assets/UAL2_Standard.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true; object.receiveShadow = true;
        object.material = demonSkin;
        if (object.material.skinning !== undefined) object.material.skinning = true;
      });
      const targetHeight = 2.68;
      const initial = new THREE.Box3().setFromObject(model); const size = initial.getSize(new THREE.Vector3()); const scale = targetHeight / size.y;
      faceScale = targetHeight / 2.52;
      model.scale.set(scale * 0.62, scale, scale * 0.68); model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model); const center = bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      bodyRest.copy(model.position); body = model;
      root.remove(fallback); fallback = null; shroudStrips.length = 0; eyeParts.length = 0;
      root.add(model); attachRigDressing(model); bindModelDetails(model);
      mixer = new THREE.AnimationMixer(model);
      const idleClip = gltf.animations.find((clip) => clip.name === 'Zombie_Idle_Loop');
      const walkClip = gltf.animations.find((clip) => clip.name === 'Zombie_Walk_Fwd_Loop');
      if (idleClip) idleAction = mixer.clipAction(idleClip);
      if (walkClip) walkAction = mixer.clipAction(walkClip);
      setAnimation(idleAction, 1);
    }, undefined, (error) => console.warn(`${name} model could not load; using its shadow-form.`, error));
  }

  function setAnimation(action, speed) {
    if (!action) return;
    action.timeScale = speed;
    if (activeAction === action) return;
    action.reset().fadeIn(0.22).play();
    if (activeAction) activeAction.fadeOut(0.22);
    activeAction = action;
  }

  // The mixer rewrites every animated bone each frame, so these overrides are applied straight after
  // it and never accumulate. This is what turns a stock zombie walk into something hunched and wrong.
  function bend(bone, x = 0, y = 0, z = 0) {
    if (!bone) return;
    bone.rotation.x += x; bone.rotation.y += y; bone.rotation.z += z;
  }

  function stretch(bone, thin, along) {
    if (!bone) return;
    bone.scale.set(thin, along, thin);
  }

  // Deliberate asymmetry: the two sides are given different lengths and bends so nothing about the
  // pose mirrors, which is the cue that stops a human rig reading as a human being.
  const LIMB_TRIM = { l: { arm: 1.36, drop: 0.1, twist: 0.07 }, r: { arm: 1.5, drop: -0.16, twist: -0.13 } };

  // The mixer rewrites every animated bone each frame, so these overrides are applied straight after
  // it and never accumulate. Hunched spine, stretched neck, arms hanging past the knees, and reversed
  // digitigrade knees walking on the balls of the feet - the shins are lengthened by roughly what the
  // extra knee bend takes back, so the creature still stands on the floor it is pathing across.
  function applyPosture() {
    bend(skeleton.spine_01, 0.13, 0.1, 0.05);
    bend(skeleton.spine_02, 0.08, -0.06, -0.04);
    bend(skeleton.spine_03, -0.08, 0.05, 0.07);
    stretch(skeleton.neck_01, 0.7, 1.3);
    bend(skeleton.neck_01, -0.2, 0.06, 0);
    bend(skeleton.Head, 0.1, 0, headTilt);

    for (const side of ['l', 'r']) {
      const trim = LIMB_TRIM[side];
      const mirror = side === 'l' ? 1 : -1;
      stretch(skeleton['clavicle_' + side], 1, 1.3);
      bend(skeleton['clavicle_' + side], 0, 0, mirror * 0.18);
      stretch(skeleton['upperarm_' + side], 0.82, 1.18);
      bend(skeleton['upperarm_' + side], trim.drop, 0, trim.twist);
      stretch(skeleton['lowerarm_' + side], 0.78, trim.arm);
      stretch(skeleton['thigh_' + side], 0.88, 1.06);
      bend(skeleton['thigh_' + side], 0.2, 0, 0);
      stretch(skeleton['calf_' + side], 0.84, 1.3);
      bend(skeleton['calf_' + side], -0.34, 0, 0);
      bend(skeleton['foot_' + side], 0.3, 0, 0);
      for (const finger of ['index_01_', 'middle_01_', 'ring_01_', 'pinky_01_']) {
        stretch(skeleton[finger + side], 0.74, 1.35);
        bend(skeleton[finger + side], 0.22, 0, 0);
      }
    }
  }

  // Everything the player actually reads at a distance - eye heat, the gape of the jaw, the rim glow,
  // how hard the shroud is moving - is driven from awareness state here rather than baked into a pose.
  function updateMenace(delta) {
    menaceTime += delta;
    const chasing = awareness.state === ENEMY_STATES.CHASE;
    const searching = awareness.state === ENEMY_STATES.SEARCH;
    const beat = 0.5 + 0.5 * Math.sin(menaceTime * (chasing ? 7.6 : searching ? 3.4 : 1.9));
    const flicker = 0.82 + 0.18 * Math.sin(menaceTime * 27.3) * Math.sin(menaceTime * 11.7);
    const heat = (chasing ? 1 : searching ? 0.44 : 0.12) * flicker;
    headTilt = chasing ? 0 : (searching ? 0.09 : 0.17);

    eyeGlow.opacity = (0.18 + heat * 0.62) * (0.72 + beat * 0.46);
    eyeCore.color.setRGB(1, 0.05 + heat * 0.5, 0.02 + heat * 0.34);
    mouthGlow.color.setRGB(0.32 + heat * 0.68, 0.02, 0.02);
    gulletGlow.opacity = 0.35 + heat * 0.6 * beat;
    const flare = 1 + heat * 0.4 * beat;
    for (const eye of eyeParts) eye.glow.scale.set(flare, flare, 1);
    for (const pulse of rimPulses) pulse.value = 0.12 + heat * 1.45 * (0.45 + beat * 0.55);
    if (headHalo) headHalo.intensity = 0.22 + heat * 1.7 * (0.55 + beat * 0.5);

    const gape = chasing ? 0.6 + beat * 0.24 : searching ? 0.19 : 0.05 + beat * 0.05;
    if (jawGroup) jawGroup.rotation.x += (-gape - jawGroup.rotation.x) * Math.min(1, delta * 9);

    const sway = (moving ? 0.15 : 0.045) + heat * 0.2;
    for (const strip of shroudStrips) {
      strip.rotation.x = Math.sin(menaceTime * (2.1 + heat * 2.6) + strip.userData.phase) * sway;
      strip.rotation.z = Math.cos(menaceTime * 1.6 + strip.userData.phase) * sway * 0.55;
    }
    if (body) {
      const gait = moving ? 1 : 0.22;
      body.rotation.z = Math.sin(menaceTime * (moving ? 8.6 : 1.8)) * 0.052 * gait;
      body.rotation.x = Math.sin(menaceTime * (moving ? 4.3 : 0.9) + 0.7) * 0.03 * gait;
      body.position.y = bodyRest.y + Math.abs(Math.sin(menaceTime * (moving ? 8.6 : 1.4))) * 0.05 * gait;
    }
    if (mistDisc) {
      mistDisc.material.opacity = 0.035 + heat * 0.15 * (0.5 + beat * 0.5);
      const spread = 1 + heat * 0.35;
      mistDisc.scale.set(spread, spread, 1);
      mistDisc.rotation.z += delta * 0.24;
    }
  }

  function updateShroud() {
    if (!shroudGroup || !shroudAnchor) return;
    shroudAnchor.getWorldPosition(shroudWorldPosition);
    root.worldToLocal(shroudWorldPosition);
    shroudGroup.position.copy(shroudWorldPosition);
  }

  function advance(delta) {
    mixer.update(delta); applyPosture(); updateHeadDetails(); updateShroud();
  }

  function nearestFloor(y = root.position.y) {
    return Math.max(1, Math.min(world.state.floorCount, Math.round(y / CONFIG.floorHeight) + 1));
  }

  function floorPoint(floor, x, z, guided = false) {
    return { x, y: floorY(floor), z, floor, guided };
  }

  function isInStairwell(point) {
    return !!navigator.connectorContaining(point);
  }

  function planRoute(target, purpose = 'roam') {
    const fromFloor = nearestFloor();
    const toFloor = target.floor || Math.max(1, Math.min(world.state.floorCount, Math.round(target.y / CONFIG.floorHeight) + 1));
    if (target.inStairwell) {
      const connector = navigator.connectorContaining(target) || navigator.connectorBetween(fromFloor, toFloor, root.position);
      route = connector ? logic.createStairPursuitRoute({
        enemy: { x: root.position.x, y: root.position.y, z: root.position.z, floor: fromFloor, inStairwell: isInStairwell(root.position) },
        target,
        floorHeight: CONFIG.floorHeight,
        stairLayout: connector.layout,
        approach: connector.approach, approaches: connector.approaches,
      }) : [];
    } else {
      route = navigator.planFloorRoute({
        from: root.position, target, fromFloor, toFloor, floorHeight: CONFIG.floorHeight,
      });
    }
    routePurpose = purpose;
  }

  function choosePatrol() {
    // Where there is to walk is the building's answer, not a list of this hotel's corridor Z values.
    const hallTargets = (world.getPlan().navigation?.nodes || []).map((node) => floorPoint(node.floor, node.x, node.z));
    const roomTargets = [...world.collections.roomCenters.entries()]
      .filter(([roomNumber]) => !world.collections.roomDoors.get(roomNumber)?.locked)
      .map(([id, room]) => ({ id, ...room }));
    const target = logic.chooseRoamTarget({ hallTargets, roomTargets, roomChance: 0.24 }, Math.random);
    if (target) {
      if (target.room) logic.prepareRoamDoor(world.collections.roomDoors.get(target.id), CONFIG.doorOpenAngle);
      planRoute(target, 'roam');
    }
  }

  // Walking is a rule, so it lives in movement-logic.js and this only paints the result: the demon
  // uses the same mover the player and the hiders do.
  function openDoorAhead(target) {
    const closed = doorRecords.filter((entry) => !entry.item.open || entry.item.locked);
    const selected = window.HotelDemon.selectBlockingDoor(
      { x: root.position.x, y: root.position.y, z: root.position.z, floor: nearestFloor() },
      target,
      closed,
      CONFIG,
    );
    if (!selected) return;
    const force = routePurpose === 'hunt' || awareness.state === ENEMY_STATES.CHASE || awareness.state === ENEMY_STATES.SEARCH;
    if (force) logic.prepareHuntDoor(selected.item, CONFIG.doorOpenAngle);
    else logic.prepareRoamDoor(selected.item, CONFIG.doorOpenAngle);
  }

  function tryMove(target, speed, delta) {
    openDoorAhead(target);
    const step = movement.stepToward(world.space, BODY, root.position, target, {
      speed, delta, arriveRadius: 0.18, guided: !!target.guided, avoidance,
    });
    avoidance = step.avoidance || null;
    if (step.arrived) { root.position.set(step.x, step.y, step.z); route.shift(); moving = false; avoidance = null; return; }
    if (step.moved) root.position.set(step.x, step.y, step.z);
    if (step.moved && Math.hypot(step.dirX, step.dirZ) > 0.01) {
      const turn = Math.min(1, delta * 7); facing.x += (step.dirX - facing.x) * turn; facing.z += (step.dirZ - facing.z) * turn; facing.normalize(); root.rotation.y = Math.atan2(facing.x, facing.z); moving = true;
    } else moving = false;
  }

  // Line of sight against the same plain boxes that stop a body. This used to be a THREE.Raycaster
  // over `world.colliderData()`, which skipped every record whose `enabled` flag was merely absent —
  // and the plan's records do not carry one, so nothing ever occluded the demon.
  function rayIsBlocked(target) {
    const eyes = { x: root.position.x, y: root.position.y + 2.05, z: root.position.z };
    const targetEyes = { x: target.x, y: target.y + (target.crouching ? 0.9 : 1.55), z: target.z };
    return world.sightBlocked(eyes, targetEyes, { tolerance: 0.18 });
  }

  function playerCandidates() {
    const playerFeetY = camera.position.y - player.getEyeHeight();
    return [
      ...(world.state.playerEliminated ? [] : [{ id: 'local', x: camera.position.x, y: playerFeetY, z: camera.position.z, floor: world.state.playerFloor || nearestFloor(playerFeetY), crouching: player.isCrouching() }]),
      ...playerProvider(),
    ];
  }

  function visiblePlayer(candidates) {
    const enemy = { x: root.position.x, y: root.position.y, z: root.position.z, facingX: facing.x, facingZ: facing.z };
    return logic.selectDetectedTarget(candidates, enemy, { isOccluded: rayIsBlocked });
  }

  function updateAwareness(delta) {
    detectionCooldown -= delta;
    chasePlanCooldown -= delta;
    if (detectionCooldown > 0) return;
    detectionCooldown = 0.085;
    const candidates = playerCandidates();
    let visible = visiblePlayer(candidates);
    // Acquiring a target still requires the forward vision cone. During an active chase, however,
    // a nearby target with clear line of sight remains spatially tracked while the demon turns its
    // body through a doorway or around a route waypoint.
    if (!visible && awareness.state === ENEMY_STATES.CHASE && awareness.targetId) {
      const tracked = candidates.find((candidate) => candidate.id === awareness.targetId);
      if (tracked && logic.canDetectPlayer({
        enemy: { x: root.position.x, y: root.position.y, z: root.position.z, facingX: facing.x, facingZ: facing.z },
        player: tracked,
        occluded: rayIsBlocked(tracked),
        maxDistance: CONFIG.chaseAwarenessDistance,
        fieldOfView: Math.PI * 2,
      })) visible = tracked;
    }
    detectedTargetId = visible ? visible.id : null;
    const playerPosition = visible ? { ...visible, inStairwell: isInStairwell(visible) } : null;
    const remembered = !visible && awareness.targetId ? candidates.find((candidate) => candidate.id === awareness.targetId) : null;
    const pursuitClue = remembered ? { ...remembered, inStairwell: isInStairwell(remembered) } : null;
    awareness = logic.updateAwareness(awareness, { seesPlayer: !!visible, delta: 0.085, playerId: visible?.id, playerPosition, pursuitClue });
    if (awareness.state === ENEMY_STATES.CHASE) {
      const targetFloor = awareness.lastSeen.floor;
      const committedToStairs = route.some((point) => point.stair);
      if (previousState !== ENEMY_STATES.CHASE || !route.length || (!committedToStairs && chasePlanCooldown <= 0)) {
        planRoute(awareness.lastSeen, 'chase');
        plannedChaseFloor = targetFloor;
        chasePlanCooldown = 0.65;
      } else if (plannedChaseFloor !== targetFloor && !committedToStairs) {
        planRoute(awareness.lastSeen, 'chase');
        plannedChaseFloor = targetFloor;
      }
    }
    else if (awareness.state === ENEMY_STATES.SEARCH && awareness.lastSeen
      && (previousState === ENEMY_STATES.CHASE || (awareness.clueActive && chasePlanCooldown <= 0) || !route.length)) {
      planRoute(awareness.lastSeen, 'search');
      chasePlanCooldown = 0.65;
    }
    if (awareness.state !== previousState) {
      world.emit('demon-state', { demon: name, state: awareness.state });
      if (awareness.state === ENEMY_STATES.CHASE && detectedTargetId === 'local') world.notify(`${name.toUpperCase()} HAS SEEN YOU.`, 1600);
      previousState = awareness.state;
    }
  }

  // The sanity hunt. A player who has been still long enough stops being hidden: the demon walks to
  // the room they are camping in and prowls it until they move (which resets their meter and calls
  // it off) or it sees them (which is a chase, and chase always wins). It only fires from ROAM —
  // an active search is a better lead than a stale one, and stacking the two would double-plan.
  function updateHunt() {
    if (!sanity || awareness.state !== ENEMY_STATES.ROAM) {
      if (huntZone && awareness.state !== ENEMY_STATES.ROAM) { huntZone = null; huntTargetId = null; sanity?.setHunted(null); }
      return;
    }
    const target = sanity.getHuntTarget({ x: root.position.x, z: root.position.z, floor: nearestFloor() }, playerProvider());
    if (!target) {
      if (huntZone) { huntZone = null; huntTargetId = null; route = []; routePurpose = 'roam'; sanity.setHunted(null); }
      return;
    }
    const arrived = huntZone === target.zone && !route.length;
    if (huntZone !== target.zone || huntTargetId !== target.id) {
      const door = world.collections.roomDoors.get(target.zone);
      logic.prepareHuntDoor(door, CONFIG.doorOpenAngle);
      planRoute({ x: target.x, y: floorY(target.floor), z: target.z, floor: target.floor }, 'hunt');
      huntZone = target.zone;
      huntTargetId = target.id;
      sanity.setHunted(target);
      if (target.id === 'local') world.notify(`${name.toUpperCase()} HAS TURNED TOWARD YOU.`, 2400);
      world.emit('sanity-hunt', { demon: name, id: target.id, zone: target.zone, floor: target.floor });
    } else if (arrived) {
      // Reached the room and still cannot see them: prowl it rather than stand in the doorway.
      const angle = Math.random() * Math.PI * 2; const radius = 1.2 + Math.random() * 2.2;
      planRoute({ x: target.x + Math.cos(angle) * radius, y: floorY(target.floor), z: target.z + Math.sin(angle) * radius, floor: target.floor }, 'hunt');
    } else routePurpose = 'hunt';
  }

  function updateHud() {
    const hunting = awareness.state === ENEMY_STATES.CHASE;
    const stalking = !hunting && awareness.state === ENEMY_STATES.ROAM && routePurpose === 'hunt';
    if (monsterStatus) {
      const label = name.toUpperCase();
      monsterStatus.textContent = hunting ? `${label} IS IN PURSUIT` : awareness.state === ENEMY_STATES.SEARCH ? `${label} IS SEARCHING` : stalking ? `${label} IS HUNTING` : `${label} IS ROAMING`;
      monsterStatus.dataset.state = stalking ? 'hunt' : awareness.state;
    }
  }

  function caught() {
    if (world.state.gameOver || world.state.playerEliminated) return;
    if (world.state.localRole === 'hider') {
      // A hider taken by a demon is out, not necessarily over: the round goes on for whoever is left
      // and this player watches it. `roundOver: false` says so, because everything downstream of this
      // event � the menu above all � has to know the difference between an elimination and an ending.
      world.emit('caught', { demon: name, floor: nearestFloor(), x: root.position.x, z: root.position.z, roundOver: false });
      return;
    }
    world.state.gameOver = true; world.state.isLocked = false; caughtOverlay.classList.add('visible'); document.body.classList.add('caught');
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    world.emit('caught', { demon: name, floor: nearestFloor(), x: root.position.x, z: root.position.z, roundOver: true });
  }

  // A snapshot pose, applied the way a network avatar's is: walked toward rather than teleported
  // onto, so a body that arrives 15 times a second is still drawn smoothly at 60.
  function setRemotePose(pose) {
    remotePose = pose;
    if (!pose) return;
    awareness = { ...awareness, state: pose.state || ENEMY_STATES.ROAM };
    routePurpose = pose.routePurpose || 'roam';
  }

  function updateRemote(delta) {
    const blend = Math.min(1, delta * 12);
    root.position.x += (remotePose.x - root.position.x) * blend;
    root.position.y += (remotePose.y - root.position.y) * blend;
    root.position.z += (remotePose.z - root.position.z) * blend;
    let turn = remotePose.yaw - root.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    root.rotation.y += turn * blend;
    facing.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    moving = !!remotePose.moving;
    if (mixer) { setAnimation(moving ? walkAction : idleAction, awareness.state === ENEMY_STATES.CHASE ? 1.85 : 1); advance(delta); }
    updateHud();
  }

  function update(delta) {
    updateMenace(delta);
    // Online the local brain stands down completely: no detection, no routing, and above all no
    // catch. The server already decided all three.
    if (remotePose) { updateRemote(delta); return; }
    // Authority starts at match entry, even before the first demon pose arrives.
    if (world.state.remoteFixtures) return;
    if (world.state.gameOver) { if (mixer) advance(delta * 0.25); return; }
    if (inspectionMode) { if (mixer) { setAnimation(inspectionMotion === 'walk' ? walkAction : idleAction, 1); advance(delta); } updateHud(); return; }
    updateAwareness(delta);
    updateHunt();
    if (awareness.state === ENEMY_STATES.ROAM && !route.length) choosePatrol();
    if (awareness.state === ENEMY_STATES.SEARCH && !route.length && awareness.lastSeen) {
      const angle = Math.random() * Math.PI * 2; const radius = 2 + Math.random() * 3;
      planRoute({ ...awareness.lastSeen, x: awareness.lastSeen.x + Math.cos(angle) * radius, z: awareness.lastSeen.z + Math.sin(angle) * radius }, 'search');
    }
    const target = route[0]; const speed = awareness.state === ENEMY_STATES.CHASE ? CONFIG.enemyChaseSpeed : awareness.state === ENEMY_STATES.SEARCH ? CONFIG.enemyWalkSpeed * 1.22 : routePurpose === 'hunt' ? CONFIG.enemyHuntSpeed : CONFIG.enemyWalkSpeed;
    if (target) tryMove(target, speed, delta); else moving = false;
    if (mixer) { setAnimation(moving ? walkAction : idleAction, awareness.state === ENEMY_STATES.CHASE ? 1.85 : 1); advance(delta); }
    if (fallback) { const t = window.performance.now() * 0.001; fallback.position.y = Math.sin(t * 3.2) * 0.035; fallback.rotation.z = Math.sin(t * 1.7) * 0.018; }
    const playerFeetY = camera.position.y - player.getEyeHeight();
    if (!world.state.playerEliminated && Math.abs(playerFeetY - root.position.y) < 1.15 && Math.hypot(camera.position.x - root.position.x, camera.position.z - root.position.z) < CONFIG.enemyCatchDistance) caught();
    updateHud();
  }

  const navigation = world.getPlan().navigation;
  const spawns = (navigation?.spawnNodes || []).map((node) => floorPoint(node.floor, node.x, node.z));
  // Away from the demons already standing, measured as a distance rather than as a floor each: the
  // mall carries three demons on two levels, and "one per floor" has no answer there. This mirrors
  // `demon-logic.chooseDemonSpawn`, which is what the authoritative side uses.
  const separation = navigation?.minSpawnSeparation || 24;
  const clear = spawns.filter((candidate) => takenSpawns.every((other) => (
    candidate.floor !== other.floor || Math.hypot(candidate.x - other.x, candidate.z - other.z) >= separation
  )));
  const pool = clear.length ? clear : spawns;
  const spawn = logic.chooseSpawn(pool, { x: camera.position.x, z: camera.position.z, floor: world.state.playerFloor }, Math.random, separation, []);
  mistDisc = createFloorBloom(); if (mistDisc) root.add(mistDisc);
  fallback = createFallbackDemon();
  root.position.set(spawn.x, spawn.y, spawn.z); if (inspectionMode) root.position.set(0, 0, 0); else choosePatrol(); loadAnimatedBody(); updateHud();
  return {
    update,
    setRemotePose,
    root,
    setPlayers: (provider) => { playerProvider = typeof provider === 'function' ? provider : () => []; },
    setInspectionAnimation: (motion) => { inspectionMotion = motion === 'walk' ? 'walk' : 'idle'; },
    getState: () => ({ name, ...awareness, floor: nearestFloor(), position: root.position.clone(), routePurpose, huntZone, huntTargetId, detectedTargetId }),
  };
}
