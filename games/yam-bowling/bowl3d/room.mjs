import * as THREE from './vendor/three.module.min.js';
import { createWallMaterial, tileBoxUVs, tintWallMaterial } from './wall-material.mjs';
import { createRoomDressing } from './room-dressing.mjs';
import { LANE_THEMES, getLaneTheme } from './themes.mjs';
import { ROOM_BOXES, ROOM_LENGTH, ROOM_CENTER_Z, LANE_SURFACE_LENGTH, LANE_CENTER_Z,
  HEAD_Z, LANE_LENGTH, deckZ, worldZ } from './geometry.mjs';

// Room geometry remains shared with collision. Art direction and non-colliding
// furnishings live separately so selecting a house never alters gameplay.
export const THEMES = Object.freeze(Object.fromEntries(Object.entries(LANE_THEMES).map(([slug,theme])=>[slug,theme.colors])));

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  for (let board = 0; board < 39; board++) {
    const x = board * 26.3;
    // The heads are maple and the back end is pine, so the deck end of a real
    // lane is visibly paler and softer than the boards under the approach.
    const grad = ctx.createLinearGradient(0, 0, 0, 2048);
    const shade = ['#a9723f','#a06a38','#b07c47','#9c6634'][board % 4];
    grad.addColorStop(0, shade); grad.addColorStop(.62, shade);
    grad.addColorStop(1, ['#c99a5f','#c6975c','#cfa268','#c08f52'][board % 4]);
    ctx.fillStyle = grad; ctx.fillRect(x, 0, 26.3, 2048);
    ctx.fillStyle = 'rgba(40,20,6,.34)'; ctx.fillRect(x, 0, 1.6, 2048);
    ctx.fillStyle = 'rgba(255,226,176,.10)'; ctx.fillRect(x + 25, 0, 1.1, 2048);
    for (let row = 0; row < 22; row++) {
      const y = (row * 191 + board * 137) % 2048;
      ctx.fillStyle = 'rgba(58,31,10,.14)';
      ctx.fillRect(x + 3 + row % 18, y, 1.2, 210);
      ctx.fillStyle = 'rgba(255,231,186,.09)';
      ctx.fillRect(x + 12 + row % 11, y + 60, .9, 160);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The house reflected in the lane finish. An oiled lane is the shiniest thing
// in a bowling alley and the old room had nothing for it to reflect, which is
// most of why it read as flat pixel art: a procedural equirect standing in for
// the room buys the lane, the ball and the pins real specular highlights for
// one 256x128 canvas and one PMREM pass per theme change.
function environmentTexture(a, b, c) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const hex = v => `#${v.toString(16).padStart(6, '0')}`;
  const sky = ctx.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, '#fff3d8'); sky.addColorStop(.34, hex(c));
  sky.addColorStop(.55, hex(c)); sky.addColorStop(1, '#05060a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 8; i++) { // ceiling strips, the lane's brightest reflection
    ctx.fillStyle = 'rgba(255,244,222,.85)';
    ctx.fillRect(i * 32 + 6, 6, 20, 9);
  }
  for (const [x, color] of [[18, a], [96, b], [168, a], [232, b]]) {
    const glow = ctx.createRadialGradient(x, 58, 2, x, 58, 44);
    glow.addColorStop(0, hex(color)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 44, 14, 88, 88);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRoom(scene, gpu, { textureLoader, themeTextureFactory } = {}) {
  const dressing = createRoomDressing(scene,gpu,{ textureFactory:themeTextureFactory });
  const primary = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xf32e3f, emissiveIntensity: 1.3, toneMapped:false });
  const secondary = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffd66b, emissiveIntensity: 1.2, toneMapped:false });
  const wall = createWallMaterial(gpu, textureLoader);
  const floor = dressing.materials.floor;
  const ceiling = new THREE.MeshStandardMaterial({ color:0x11131b, roughness:.95 });
  const gutter = new THREE.MeshStandardMaterial({ color: 0x151824, roughness: .22, metalness: .78, envMapIntensity: 1.4 });
  const wood = woodTexture();
  wood.anisotropy = gpu?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const lane = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: wood, roughness: .42, metalness: .0,
    clearcoat: 1, clearcoatRoughness: .075, envMapIntensity: 1.35 });
  const materials = { wall, floor, gutter, lane };
  function box(size, pos, material, rotation = [0,0,0]) {
    const geometry = new THREE.BoxGeometry(...size);
    if (material === wall) tileBoxUVs(geometry);
    if (material === floor) tileBoxUVs(geometry,3);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...pos); mesh.rotation.set(...rotation);
    // The directional light is an indoor fill, not a sun outside the shell.
    // Pins/ball cast their own shadows; the shell must not eclipse the room.
    mesh.receiveShadow = true; mesh.castShadow = false;
    scene.add(mesh); return mesh;
  }
  for (const { size, pos, surface } of ROOM_BOXES) box(size, pos, materials[surface]);
  box([15.6,.22,ROOM_LENGTH],[0,8.35,ROOM_CENTER_Z],ceiling);
  box([7.05,1.1,.32],[0,3.35,deckZ(-4.95)],wall);
  box([6.35,.1,.18],[0,2.78,deckZ(-4.75)],secondary);
  box([7.2,3.4,.18],[0,4.9,deckZ(-8.67)],wall);
  const sweep = box([6.5,.1,.18],[0,2.4,deckZ(-4.81)],primary);
  for (const side of [-1,1]) {
    box([.065,.065,LANE_SURFACE_LENGTH-.5],[side*3.86,.8,LANE_CENTER_Z],primary);
    for (let z = 7; z > HEAD_Z - 2; z -= 12) {
      box([.06,5.7,.1],[side*7.55,3.65,z],primary);
    }
  }
  box([6,.02,.11],[0,.163,6.9],primary);
  const marking = new THREE.MeshBasicMaterial({ color: 0x4b3626 });
  for (const z of [5.4,4.4]) for (const x of [-1.35,-.45,.45,1.35]) {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(.06,12), marking);
    dot.rotation.x = -Math.PI / 2; dot.position.set(x,.168,z); scene.add(dot);
  }
  for (let i=-3; i<=3; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(-.1,-.15); shape.lineTo(0,.19); shape.lineTo(.1,-.15); shape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), marking);
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(i*.6,.17,worldZ(.215)+Math.abs(i)*.38); scene.add(arrow);
  }
  // Keep the light and environment reflections, without suspended cross-lane
  // meshes: those bars blocked the elevated aiming and follow cameras.
  const houseLights=[];
  for (let z = 7; z >= HEAD_Z; z -= 10) {
    const strip = new THREE.PointLight(0xfff1da,32,30,2);
    strip.position.set(0,6.55,z); scene.add(strip); houseLights.push(strip);
  }
  const ambient=new THREE.HemisphereLight(0xe7eeff,0x221514,1.15);scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff4dd,2.2);
  key.position.set(-4,12,LANE_CENTER_Z + 15); key.target.position.set(0,0,LANE_CENTER_Z);
  key.castShadow = true; key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: ROOM_LENGTH / 2, bottom: -ROOM_LENGTH / 2, far: ROOM_LENGTH + 30 });
  key.shadow.bias = -.0003; key.shadow.normalBias = .02;
  scene.add(key,key.target);
  // The rack is the thing the player is aiming at and it sat 40 units away in
  // the dark. A house lights its deck harder than anything else on the lane.
  const deck = new THREE.SpotLight(0xfff2d6,140,17,.62,.45,2);
  deck.position.set(0,8.2,deckZ(1.65)); deck.target.position.set(0,.9,deckZ(-2.35));
  deck.castShadow = true; deck.shadow.mapSize.set(1024,1024);
  deck.shadow.camera.near = 2; deck.shadow.camera.far = 20; deck.shadow.bias = -.0006;
  scene.add(deck,deck.target);
  const wash = new THREE.PointLight(0xf32e3f,22,20,2); wash.position.set(0,4.4,deckZ(-5.95)); scene.add(wash);
  const fill = new THREE.PointLight(0xffd66b,30,22,2); fill.position.set(0,6,4); scene.add(fill);
  const signCanvas = document.createElement('canvas'); signCanvas.width=1024; signCanvas.height=256;
  const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6,1.4),new THREE.MeshBasicMaterial({ map: signTexture, transparent: true }));
  sign.position.set(0,3.7,deckZ(-4.75)); scene.add(sign);
  let current = '', environment = null;
  const pmrem = gpu ? new THREE.PMREMGenerator(gpu) : null;
  return {
    sweep, dressing,
    setTheme(slug, name) {
      const theme=getLaneTheme(slug);
      if (current === theme.slug) return;
      current = theme.slug;
      const [a,b,c] = theme.colors;
      dressing.setTheme(theme);
      primary.emissive.setHex(a); secondary.emissive.setHex(b);
      tintWallMaterial(wall,theme.wall==='ivory'?0xc6bdaa:c);
      if(theme.wall!=='ivory')wall.color.multiplyScalar(theme.artGlow>.6?.35:.55);
      lane.color.setHex(theme.wood);
      key.color.setHex(theme.light);key.intensity=theme.artGlow>.6?1.65:2.2;
      ambient.intensity=theme.artGlow>.6?.8:1.05;
      for(const light of houseLights) { light.color.setHex(theme.light);light.intensity=theme.artGlow>.6?24:32; }
      wash.color.setHex(a); fill.color.setHex(b);
      if (pmrem) {
        const source = environmentTexture(a, b, c);
        environment?.dispose();
        environment = pmrem.fromEquirectangular(source);
        scene.environment = environment.texture;
        source.dispose();
      }
      scene.background = new THREE.Color(c).multiplyScalar(.35);
      // Start fog beyond the aiming camera's view of the pin deck.
      scene.fog = new THREE.Fog(scene.background,LANE_LENGTH + 25,LANE_LENGTH + 100);
      const ctx = signCanvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0,0,1024,256); ctx.textAlign='center';
      ctx.fillStyle=`#${theme.accent.toString(16).padStart(6,'0')}`;
      ctx.font='bold 27px Arial';ctx.fillText('Y A M   B O W L I N G',512,65);
      ctx.fillStyle='#fff4e0';ctx.font='bold 76px Georgia';
      ctx.fillText((name||theme.slug.replaceAll('-',' ')).toUpperCase(),512,157,960);
      ctx.fillStyle=`#${a.toString(16).padStart(6,'0')}`;ctx.fillRect(380,199,264,3);
      signTexture.needsUpdate = true;
    },
  };
}
