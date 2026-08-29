export function createModelViewer({ THREE, scene, camera, renderer, subject, world, document, window }) {
  document.body.classList.add('model-viewer-mode');
  world.state.isLocked = false;
  scene.background.set(subject.background === undefined ? 0x010102 : subject.background);
  scene.fog = null;

  for (const child of scene.children) {
    if (child !== subject.root) child.visible = false;
  }

  const stage = new THREE.Group();
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.55, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9, metalness: 0.12 }),
  );
  pedestal.position.y = -0.12;
  stage.add(pedestal);
  const key = new THREE.DirectionalLight(0xabb0c5, 4.2); key.position.set(3, 4.5, 4);
  const rim = new THREE.DirectionalLight(subject.rimColor || 0xff0000, 2.5); rim.position.set(-3, 2.8, -3);
  const eyeLift = new THREE.PointLight(0x7f0000, 0.7, 5, 2); eyeLift.position.set(0, 2.15, 1.35);
  stage.add(key, rim, eyeLift);
  scene.add(stage);

  const panel = document.createElement('aside');
  panel.id = 'modelViewerPanel';
  panel.innerHTML = `
    <div class="viewerEyebrow">${subject.eyebrow || 'CREATURE WORKBENCH'}</div>
          <h1>${subject.title || 'The Bellhop'}</h1>
    <p>Drag to orbit · wheel to zoom</p>
    <label class="viewerLight">Viewer light <input type="range" min="1" max="8" step="0.1" value="4.2" data-viewer-light></label>
    <div class="viewerActions">
      <button type="button" data-viewer-action="motion">Play ${(subject.motions || ['idle', 'walk'])[1]}</button>
      <button type="button" data-viewer-action="turn">Auto turn</button>
      <button type="button" data-viewer-action="reset">Reset view</button>
    </div>
    <a href="./">Back to hotel</a>`;
  document.body.appendChild(panel);

  let yaw = 0;
  let pitch = 0.03;
  let radius = 3.55;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  const motions = subject.motions || ['idle', 'walk'];
  let motionIndex = 0;
  let autoTurn = false;
  const target = new THREE.Vector3(0, 1.35, 0);

  function resetView() { yaw = 0; pitch = 0.03; radius = 3.55; }
  function refreshCamera() {
    const horizontal = Math.cos(pitch) * radius;
    camera.position.set(Math.sin(yaw) * horizontal, target.y + Math.sin(pitch) * radius, Math.cos(yaw) * horizontal);
    camera.lookAt(target);
  }
  function press(event) {
    dragging = true; pointerId = event.pointerId; lastX = event.clientX; lastY = event.clientY;
    if (renderer.domElement.setPointerCapture) renderer.domElement.setPointerCapture(pointerId);
  }
  function move(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    yaw -= (event.clientX - lastX) * 0.008;
    pitch = Math.max(-0.28, Math.min(0.58, pitch + (event.clientY - lastY) * 0.006));
    lastX = event.clientX; lastY = event.clientY;
  }
  function release(event) { if (event.pointerId === pointerId) { dragging = false; pointerId = null; } }
  renderer.domElement.addEventListener('pointerdown', press);
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', release);
  renderer.domElement.addEventListener('pointercancel', release);
  renderer.domElement.addEventListener('wheel', (event) => { event.preventDefault(); radius = Math.max(2.8, Math.min(7.5, radius + event.deltaY * 0.004)); }, { passive: false });

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-viewer-action]');
    if (!button) return;
    if (button.dataset.viewerAction === 'motion') { motionIndex = (motionIndex + 1) % motions.length; subject.setInspectionAnimation(motions[motionIndex]); button.textContent = `Play ${motions[(motionIndex + 1) % motions.length]}`; }
    if (button.dataset.viewerAction === 'turn') { autoTurn = !autoTurn; button.classList.toggle('active', autoTurn); button.textContent = autoTurn ? 'Stop turn' : 'Auto turn'; }
    if (button.dataset.viewerAction === 'reset') resetView();
  });
  panel.addEventListener('input', (event) => { if (event.target.matches('[data-viewer-light]')) key.intensity = Number(event.target.value); });

  resetView();
  refreshCamera();
  return { update(delta) { if (subject.update) subject.update(delta); if (autoTurn && !dragging) yaw += delta * 0.42; refreshCamera(); } };
}
