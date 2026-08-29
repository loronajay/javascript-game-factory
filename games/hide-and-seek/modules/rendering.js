function makeCanvasTexture(THREE, renderer, document, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  draw(context, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function createMaterials(THREE, renderer, document) {
  const carpet1 = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#4a2022'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(224,180,112,.17)'; ctx.lineWidth = 4;
    for (let y = 12; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + 16); ctx.stroke(); }
    for (let i = 0; i < 900; i += 1) { ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, 4, 24);
  const carpet2 = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#203846'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(165,205,220,.15)'; ctx.lineWidth = 5;
    for (let y = -40; y < h + 40; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + 74); ctx.stroke(); }
  }, 4, 24);
  const carpet3 = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#332f39'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(180,150,205,.14)'; ctx.lineWidth = 4;
    for (let x = -30; x < w + 30; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 24, h); ctx.stroke(); }
  }, 4, 24);
  const carpet4 = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#30352f'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(175,155,105,.12)'; ctx.lineWidth = 3;
    for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let i = 0; i < 180; i += 1) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(Math.random() * w, Math.random() * h, 10 + Math.random() * 25, 2); }
  }, 4, 24);
  const wall = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#ddd9ce'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { ctx.fillStyle = y % 32 === 0 ? 'rgba(0,0,0,.022)' : 'rgba(255,255,255,.025)'; ctx.fillRect(0, y, w, 8); }
  }, 2, 1.2);
  const ceiling = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#e7e5df'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(0,0,0,.055)'; ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, 5, 24);
  const wood = makeCanvasTexture(THREE, renderer, document, (ctx, w, h) => {
    ctx.fillStyle = '#704d34'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i += 1) { const y = i * 14 + Math.random() * 6; ctx.strokeStyle = `rgba(48,23,13,${0.12 + Math.random() * 0.14})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + 8, w * 0.7, y - 8, w, y + 3); ctx.stroke(); }
  });

  return {
    floor1: new THREE.MeshStandardMaterial({ map: carpet1, roughness: 0.96 }), floor2: new THREE.MeshStandardMaterial({ map: carpet2, roughness: 0.96 }),
    floor3: new THREE.MeshStandardMaterial({ map: carpet3, roughness: 0.96 }), floor4: new THREE.MeshStandardMaterial({ map: carpet4, roughness: 0.98 }),
    wall: new THREE.MeshStandardMaterial({ map: wall, roughness: 0.96 }), ceiling: new THREE.MeshStandardMaterial({ map: ceiling, roughness: 0.92 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82 }), brass: new THREE.MeshStandardMaterial({ color: 0xb59857, metalness: 0.58, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.9 }), darker: new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8b8f95, metalness: 0.62, roughness: 0.28 }), elevatorInterior: new THREE.MeshStandardMaterial({ color: 0x5f615f, metalness: 0.18, roughness: 0.7 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x496173, roughness: 0.78 }), linen: new THREE.MeshStandardMaterial({ color: 0xe5e1d8, roughness: 0.97 }),
    bed: new THREE.MeshStandardMaterial({ color: 0x5d6d82, roughness: 0.93 }), green: new THREE.MeshStandardMaterial({ color: 0x3b6840, roughness: 0.9 }),
    shade: new THREE.MeshStandardMaterial({ color: 0x260304, emissive: 0xb00000, emissiveIntensity: 1.1, roughness: 0.8 }), black: new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 }),
    redLight: new THREE.MeshStandardMaterial({ color: 0x3b0305, emissive: 0xb00000, emissiveIntensity: 1.15, roughness: 0.5 }),
  };
}

export function createRendering({ THREE, document, window, config }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020205);
  scene.fog = new THREE.Fog(0x020205, 17, 72);
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, config.eyeHeight, 32);
  camera.rotation.order = 'YXZ';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  const nativePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(nativePixelRatio);
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);
  const materials = createMaterials(THREE, renderer, document);
  scene.add(new THREE.AmbientLight(0x350509, 0.16));
  scene.add(new THREE.HemisphereLight(0x3b0609, 0x010102, 0.1));
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  // Compile every material in the built scene up front. Without this the first frame a material is
  // ever visible pays for its GLSL compile and link, which is a stall in the middle of a round
  // rather than on the loading screen. It is only honest once the light count is fixed — the pool in
  // hotel.js — because a program is compiled against the light counts in force when it is built.
  function warmUp() {
    try { renderer.compile(scene, camera); } catch (error) { console.warn('Shader warm-up skipped', error); }
  }
  return { scene, camera, renderer, materials, warmUp, setRenderScale: (scale) => renderer.setPixelRatio(nativePixelRatio * scale) };
}
