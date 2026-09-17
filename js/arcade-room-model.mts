import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";
import {
  BIRD_DUTY_CABINET_ART,
  CABINET_MARQUEE_GEOMETRY,
  CABINET_CONTROL_SURFACE,
  LOVERS_LOST_CABINET_ART,
  SUMORAI_CABINET_ART,
} from "./arcade-room-scene.mjs";

// Three is vendored by the repository without type declarations. Keeping it at this module boundary
// lets the cabinet definition and interaction logic remain typed and renderer-independent.
type ThreeNamespace = Record<string, any>;

function canvasTexture(THREE: ThreeNamespace, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): any {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is required to build cabinet artwork");
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load cabinet artwork: ${src}`));
    image.src = src;
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  const targetAspect = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  if (sourceAspect > targetAspect) {
    sourceWidth = image.naturalHeight * targetAspect;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetAspect;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function loadOriginalMarqueeLogo(): Promise<HTMLImageElement> {
  const [svgResponse, fontResponse] = await Promise.all([
    fetch(BIRD_DUTY_CABINET_ART.marqueeLogo),
    fetch(BIRD_DUTY_CABINET_ART.titleFont),
  ]);
  if (!svgResponse.ok || !fontResponse.ok) throw new Error("Unable to load original Bird Duty marquee art");
  let svg = await svgResponse.text();
  const font = arrayBufferToBase64(await fontResponse.arrayBuffer());
  const style = `<style>@font-face{font-family:"Moonlit Free";src:url("data:font/ttf;base64,${font}") format("truetype");}</style>`;
  svg = svg.replace(/<svg([^>]*)>/, `<svg$1><defs>${style}</defs>`);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return loadImage(dataUrl);
}

function createMarqueeTexture(THREE: ThreeNamespace): any {
  const texture = canvasTexture(THREE, 1024, 288, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, "#061c55");
    gradient.addColorStop(0.52, "#0868d8");
    gradient.addColorStop(1, "#00bff3");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 288);
    context.strokeStyle = "#ff315f";
    context.lineWidth = 18;
    context.strokeRect(9, 9, 1006, 270);
    context.fillStyle = "#ffffff";
    context.font = "800 26px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("ORIGINAL ARCADE CABINET", 512, 266);
  });
  void Promise.all([loadOriginalMarqueeLogo(), loadImage(BIRD_DUTY_CABINET_ART.birdSprite)]).then(([logo, bird]) => {
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(logo, 150, 42, 724, 197);
    context.imageSmoothingEnabled = false;
    context.drawImage(bird, 38, 82, 120, 64);
    context.save();
    context.translate(986, 0);
    context.scale(-1, 1);
    context.drawImage(bird, 0, 82, 120, 64);
    context.restore();
    texture.needsUpdate = true;
  });
  return texture;
}

function createScreenTexture(THREE: ThreeNamespace): any {
  const texture = canvasTexture(THREE, 768, 576, (context) => {
    context.fillStyle = "#07121e";
    context.fillRect(0, 0, 768, 576);
    context.fillStyle = "#8fd7ff";
    context.font = "700 26px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("BIRD DUTY · ATTRACT MODE", 384, 300);
  });
  void loadImage(BIRD_DUTY_CABINET_ART.keyArt).then((image) => {
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight * 0.75, 0, 0, 768, 576);
    texture.needsUpdate = true;
  });
  return texture;
}

function createSideArtTexture(THREE: ThreeNamespace, side: "left" | "right"): any {
  const texture = canvasTexture(THREE, 512, 1280, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 1280);
    gradient.addColorStop(0, "#087ee9");
    gradient.addColorStop(1, "#041a46");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 384, 288);
    context.fillRect(0, 0, 512, 1280);
  });
  void loadImage(BIRD_DUTY_CABINET_ART.sideArt).then((image) => {
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.save();
    if (side === "right") {
      context.translate(512, 0);
      context.scale(-1, 1);
    }
    drawImageCover(context, image, 512, 1280);
    context.restore();
    const shade = context.createLinearGradient(0, 0, 0, 1280);
    shade.addColorStop(0, "rgba(3, 12, 33, 0)");
    shade.addColorStop(0.72, "rgba(3, 12, 33, 0)");
    shade.addColorStop(1, "rgba(3, 12, 33, .68)");
    context.fillStyle = shade;
    context.fillRect(0, 0, 512, 1280);
    texture.needsUpdate = true;
  });
  return texture;
}

function createLoversMarqueeTexture(THREE: ThreeNamespace): any {
  const texture = canvasTexture(THREE, 1024, 288, (context) => {
    const gradient = context.createLinearGradient(0, 0, 1024, 0);
    gradient.addColorStop(0, "#100b4f");
    gradient.addColorStop(0.5, "#6a1d77");
    gradient.addColorStop(1, "#100b4f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 288);
    context.strokeStyle = "#ff8ebd";
    context.lineWidth = 18;
    context.strokeRect(9, 9, 1006, 270);
    context.textAlign = "center";
    context.fillStyle = "#fff0c4";
    context.font = "700 92px Georgia, serif";
    context.shadowColor = "#ff4fa7";
    context.shadowBlur = 22;
    context.fillText("LOVERS LOST", 512, 154);
    context.shadowBlur = 0;
    context.fillStyle = "#ffd166";
    context.font = "800 24px ui-monospace, monospace";
    context.fillText("TWO WORLDS · ONE FINISH", 512, 224);
  });
  void Promise.all([
    loadImage(LOVERS_LOST_CABINET_ART.boySprite),
    loadImage(LOVERS_LOST_CABINET_ART.girlSprite),
  ]).then(([boy, girl]) => {
    const context = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    const { frameWidth, frameHeight } = LOVERS_LOST_CABINET_ART.spriteSheet;
    context.drawImage(boy, 0, 0, frameWidth, frameHeight, 54, 72, 128, 128);
    context.drawImage(girl, 0, 0, frameWidth, frameHeight, 842, 72, 128, 128);
    texture.needsUpdate = true;
  });
  return texture;
}

function createLoversScreenTexture(THREE: ThreeNamespace): any {
  const texture = canvasTexture(THREE, 960, 540, (context) => {
    context.fillStyle = "#07040d";
    context.fillRect(0, 0, 960, 540);
    context.fillStyle = "#ff8ebd";
    context.font = "700 28px Georgia, serif";
    context.textAlign = "center";
    context.fillText("LOVERS LOST · ATTRACT MODE", 480, 280);
  });
  void loadImage(LOVERS_LOST_CABINET_ART.keyArt).then((image) => {
    const context = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    const cropY = image.naturalHeight * 0.17;
    const cropHeight = image.naturalHeight * 0.5625;
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, cropY, image.naturalWidth, cropHeight, 0, 0, 960, 540);
    texture.needsUpdate = true;
  });
  return texture;
}

function createLoversSideArtTexture(THREE: ThreeNamespace, side: "left" | "right"): any {
  const texture = canvasTexture(THREE, 512, 1280, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 1280);
    gradient.addColorStop(0, "#221058");
    gradient.addColorStop(0.55, "#4c1c72");
    gradient.addColorStop(1, "#09041a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 1280);
  });
  void loadImage(LOVERS_LOST_CABINET_ART.sideArt).then((image) => {
    const context = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    context.save();
    if (side === "right") {
      context.translate(512, 0);
      context.scale(-1, 1);
    }
    context.imageSmoothingEnabled = true;
    drawImageCover(context, image, 512, 1280);
    context.restore();
    const shade = context.createLinearGradient(0, 0, 0, 1280);
    shade.addColorStop(0, "rgba(7, 4, 25, .08)");
    shade.addColorStop(0.6, "rgba(7, 4, 25, .12)");
    shade.addColorStop(1, "rgba(7, 4, 25, .72)");
    context.fillStyle = shade;
    context.fillRect(0, 0, 512, 1280);
    texture.needsUpdate = true;
  });
  return texture;
}

function createSumoraiMarqueeTexture(THREE: ThreeNamespace): any {
  const texture = canvasTexture(THREE, 1024, 288, (context) => {
    context.fillStyle = "#090607";
    context.fillRect(0, 0, 1024, 288);
    context.strokeStyle = "#c63c32";
    context.lineWidth = 18;
    context.strokeRect(9, 9, 1006, 270);
  });
  void loadImage(SUMORAI_CABINET_ART.splashArt).then((image) => {
    const context = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    const sourceHeight = image.naturalHeight * 0.42;
    context.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, 0, 0, 1024, 288);
    context.strokeStyle = "#c63c32";
    context.lineWidth = 18;
    context.strokeRect(9, 9, 1006, 270);
    texture.needsUpdate = true;
  });
  return texture;
}

function createSumoraiScreenTexture(THREE: ThreeNamespace): any {
  const texture = canvasTexture(THREE, 960, 540, (context) => {
    context.fillStyle = "#080607";
    context.fillRect(0, 0, 960, 540);
    context.fillStyle = "#e6d5b8";
    context.font = "700 28px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("SUMORAI · ATTRACT MODE", 480, 280);
  });
  void loadImage(SUMORAI_CABINET_ART.keyArt).then((image) => {
    const context = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    drawImageCover(context, image, 960, 540);
    texture.needsUpdate = true;
  });
  return texture;
}

function createSumoraiSideArtTexture(THREE: ThreeNamespace, side: "left" | "right"): any {
  const texture = canvasTexture(THREE, 512, 1280, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 1280);
    gradient.addColorStop(0, "#142c4d");
    gradient.addColorStop(0.58, "#160d10");
    gradient.addColorStop(1, "#050304");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 1280);
  });
  void loadImage(SUMORAI_CABINET_ART.sideArt).then((image) => {
    const context = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    context.save();
    if (side === "right") {
      context.translate(512, 0);
      context.scale(-1, 1);
    }
    context.imageSmoothingEnabled = true;
    drawImageCover(context, image, 512, 1280);
    context.restore();
    const shade = context.createLinearGradient(0, 0, 0, 1280);
    shade.addColorStop(0, "rgba(5, 3, 4, 0)");
    shade.addColorStop(0.72, "rgba(5, 3, 4, .08)");
    shade.addColorStop(1, "rgba(5, 3, 4, .66)");
    context.fillStyle = shade;
    context.fillRect(0, 0, 512, 1280);
    texture.needsUpdate = true;
  });
  return texture;
}

function standardMaterial(THREE: ThreeNamespace, color: string, roughness = 0.68, metalness = 0.08): any {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addBox(THREE: ThreeNamespace, parent: any, name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: any): any {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBirdTopper(THREE: ThreeNamespace, parent: any, palette: CabinetDefinition["palette"]): any {
  const group = new THREE.Group();
  group.name = "topper";
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.76, 10),
    standardMaterial(THREE, "#172433", 0.42, 0.72),
  );
  wire.rotation.z = Math.PI / 2;
  wire.position.y = 1.995;
  group.add(wire);

  const birdTexture = new THREE.TextureLoader().load(BIRD_DUTY_CABINET_ART.birdSprite);
  birdTexture.colorSpace = THREE.SRGBColorSpace;
  birdTexture.magFilter = THREE.NearestFilter;
  const bird = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.2),
    new THREE.MeshBasicMaterial({ map: birdTexture, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide }),
  );
  bird.position.set(0.02, 2.10, 0.005);
  group.add(bird);
  parent.add(group);
  return group;
}

function addHeartTopper(THREE: ThreeNamespace, parent: any, palette: CabinetDefinition["palette"]): any {
  const group = new THREE.Group();
  group.name = "topper";
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.14);
  heart.bezierCurveTo(-0.28, 0.02, -0.25, 0.29, 0, 0.17);
  heart.bezierCurveTo(0.25, 0.29, 0.28, 0.02, 0, -0.14);
  const glow = new THREE.Mesh(
    new THREE.ShapeGeometry(heart, 8),
    new THREE.MeshBasicMaterial({
      color: palette.trim,
      side: THREE.DoubleSide,
    }),
  );
  glow.position.set(0, 2.17, 0.01);
  glow.scale.set(0.82, 0.82, 0.82);
  group.add(glow);
  const halo = new THREE.PointLight(palette.trim, 1.5, 2.2, 2);
  halo.position.set(0, 2.16, 0.08);
  group.add(halo);
  parent.add(group);
  return group;
}

function addEnsoTopper(THREE: ThreeNamespace, parent: any, palette: CabinetDefinition["palette"]): any {
  const group = new THREE.Group();
  group.name = "topper";
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.022, 10, 38, Math.PI * 1.72),
    new THREE.MeshBasicMaterial({ color: palette.trim }),
  );
  ring.position.set(0, 2.17, 0.01);
  ring.rotation.z = -0.42;
  group.add(ring);
  const halo = new THREE.PointLight(palette.trim, 1.35, 2.1, 2);
  halo.position.set(0, 2.17, 0.08);
  group.add(halo);
  parent.add(group);
  return group;
}

export function createBirdDutyCabinet(THREE: ThreeNamespace, definition: CabinetDefinition): any {
  const root = new THREE.Group();
  root.name = definition.id;
  root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };

  const shell = standardMaterial(THREE, definition.palette.shell, 0.58, 0.18);
  const trim = standardMaterial(THREE, definition.palette.trim, 0.45, 0.16);
  const black = standardMaterial(THREE, "#07121e", 0.48, 0.35);
  const yellow = standardMaterial(THREE, definition.palette.warning, 0.48, 0.08);
  const metal = standardMaterial(THREE, "#26313b", 0.28, 0.72);

  addBox(THREE, root, "shell", [0.86, 1.13, 0.75], [0, 0.565, 0], shell);
  addBox(THREE, root, "upper-shell", [0.86, 0.73, 0.57], [0, 1.44, -0.09], shell);
  const marqueeGeometry = CABINET_MARQUEE_GEOMETRY.birdDuty;
  addBox(THREE, root, "marquee-housing", [0.9, 0.28, marqueeGeometry.depth], [0, 1.84, marqueeGeometry.centerZ], trim);
  addBox(THREE, root, "base-trim", [0.91, 0.08, 0.8], [0, 0.04, 0], black);

  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.77, 0.225),
    new THREE.MeshBasicMaterial({ map: createMarqueeTexture(THREE) }),
  );
  marquee.name = "marquee";
  marquee.position.set(0, 1.84, marqueeGeometry.artZ);
  root.add(marquee);

  addBox(THREE, root, "screen-bezel", [0.73, 0.53, 0.055], [0, 1.47, 0.225], black);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.625, 0.42),
    new THREE.MeshBasicMaterial({ map: createScreenTexture(THREE) }),
  );
  screen.name = "screen";
  screen.position.set(0, 1.49, 0.255);
  root.add(screen);

  const singleDeck = CABINET_CONTROL_SURFACE.singleDeck;
  const deck = addBox(THREE, root, "control-deck", [singleDeck.width, 0.105, singleDeck.depth], [0, 1.105, singleDeck.centerZ], trim);
  deck.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
  addBox(THREE, root, "deck-face", [0.8, 0.17, 0.055], [0, 1.01, singleDeck.faceZ], shell);

  const joystick = CABINET_CONTROL_SURFACE.joystick;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, joystick.shaftHeight, 12), metal);
  stick.name = "joystick";
  stick.position.set(-0.19, joystick.shaftY, 0.31);
  stick.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
  stick.castShadow = true;
  root.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(joystick.ballRadius, 16, 12), yellow);
  ball.position.set(-0.19, joystick.ballY, 0.31);
  ball.castShadow = true;
  root.add(ball);
  for (const [x, z, color] of [[0.1, 0.32, "#ffd33d"], [0.23, 0.29, "#f35a55"]] as const) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.026, 16), standardMaterial(THREE, color, 0.36));
    button.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    button.position.set(x, 1.175, z);
    button.castShadow = true;
    root.add(button);
  }

  addBox(THREE, root, "coin-door", [0.39, 0.48, 0.035], [0, 0.53, 0.395], metal);
  addBox(THREE, root, "coin-slot-left", [0.075, 0.14, 0.025], [-0.105, 0.64, 0.423], black);
  addBox(THREE, root, "coin-slot-right", [0.075, 0.14, 0.025], [0.105, 0.64, 0.423], black);
  addBox(THREE, root, "coin-return", [0.18, 0.075, 0.025], [0, 0.4, 0.423], black);

  for (const side of [-1, 1]) {
    const sideTexture = createSideArtTexture(THREE, side < 0 ? "left" : "right");
    const sideArt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 1.54),
      new THREE.MeshBasicMaterial({ map: sideTexture }),
    );
    sideArt.name = side < 0 ? "side-art-left" : "side-art-right";
    sideArt.rotation.y = side * Math.PI / 2;
    sideArt.position.set(side * 0.433, 1.01, -0.03);
    root.add(sideArt);
  }

  addBirdTopper(THREE, root, definition.palette);
  return root;
}

export function createLoversLostCabinet(THREE: ThreeNamespace, definition: CabinetDefinition): any {
  const root = new THREE.Group();
  root.name = definition.id;
  root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };

  const shell = standardMaterial(THREE, definition.palette.shell, 0.5, 0.2);
  const trim = standardMaterial(THREE, definition.palette.trim, 0.38, 0.16);
  const violet = standardMaterial(THREE, definition.palette.grass, 0.42, 0.18);
  const black = standardMaterial(THREE, "#07040d", 0.46, 0.34);
  const gold = standardMaterial(THREE, definition.palette.warning, 0.36, 0.28);
  const metal = standardMaterial(THREE, "#2a2238", 0.25, 0.74);

  addBox(THREE, root, "shell", [0.92, 1.14, 0.79], [0, 0.57, 0], shell);
  addBox(THREE, root, "upper-shell", [0.92, 0.75, 0.61], [0, 1.49, -0.09], shell);
  const marqueeGeometry = CABINET_MARQUEE_GEOMETRY.loversLost;
  addBox(THREE, root, "marquee-housing", [0.97, 0.3, marqueeGeometry.depth], [0, 1.9, marqueeGeometry.centerZ], trim);
  addBox(THREE, root, "base-trim", [0.97, 0.085, 0.84], [0, 0.043, 0], black);
  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.235),
    new THREE.MeshBasicMaterial({ map: createLoversMarqueeTexture(THREE) }),
  );
  marquee.name = "marquee";
  marquee.position.set(0, 1.9, marqueeGeometry.artZ);
  root.add(marquee);

  addBox(THREE, root, "screen-bezel", [0.8, 0.51, 0.06], [0, 1.5, 0.25], black);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.3825),
    new THREE.MeshBasicMaterial({ map: createLoversScreenTexture(THREE) }),
  );
  screen.name = "screen";
  screen.position.set(0, 1.5, 0.285);
  root.add(screen);

  const dualDeck = CABINET_CONTROL_SURFACE.dualDeck;
  const deck = addBox(THREE, root, "control-deck", [dualDeck.width, 0.11, dualDeck.depth], [0, 1.105, dualDeck.centerZ], violet);
  deck.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
  addBox(THREE, root, "deck-face", [0.86, 0.18, 0.055], [0, 1.005, dualDeck.faceZ], shell);

  for (const side of [-1, 1]) {
    const stickX = side * 0.25;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.09, 12), metal);
    stick.name = side < 0 ? "joystick-left" : "joystick-right";
    stick.position.set(stickX, 1.165, 0.33);
    stick.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    stick.castShadow = true;
    root.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), side < 0 ? gold : trim);
    ball.position.set(stickX, 1.215, 0.33);
    ball.castShadow = true;
    root.add(ball);
    for (const [offsetX, z] of [[-0.055, 0.43], [0.055, 0.41]] as const) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.024, 16), side < 0 ? trim : gold);
      button.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
      button.position.set(stickX + offsetX, 1.17, z);
      button.castShadow = true;
      root.add(button);
    }
  }

  addBox(THREE, root, "coin-door", [0.42, 0.5, 0.038], [0, 0.52, 0.417], metal);
  addBox(THREE, root, "coin-slot-left", [0.075, 0.14, 0.025], [-0.11, 0.64, 0.447], black);
  addBox(THREE, root, "coin-slot-right", [0.075, 0.14, 0.025], [0.11, 0.64, 0.447], black);
  addBox(THREE, root, "coin-return", [0.19, 0.075, 0.025], [0, 0.39, 0.447], black);

  for (const side of [-1, 1]) {
    const sideTexture = createLoversSideArtTexture(THREE, side < 0 ? "left" : "right");
    const sideArt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 1.62),
      new THREE.MeshBasicMaterial({ map: sideTexture }),
    );
    sideArt.name = side < 0 ? "side-art-left" : "side-art-right";
    sideArt.rotation.y = side * Math.PI / 2;
    sideArt.position.set(side * 0.463, 1.05, -0.025);
    root.add(sideArt);
  }

  addHeartTopper(THREE, root, definition.palette);
  return root;
}

export function createSumoraiCabinet(THREE: ThreeNamespace, definition: CabinetDefinition): any {
  const root = new THREE.Group();
  root.name = definition.id;
  root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };

  const shell = standardMaterial(THREE, definition.palette.shell, 0.52, 0.2);
  const trim = standardMaterial(THREE, definition.palette.trim, 0.38, 0.18);
  const deckPaint = standardMaterial(THREE, definition.palette.sky, 0.42, 0.18);
  const black = standardMaterial(THREE, "#060405", 0.46, 0.34);
  const bone = standardMaterial(THREE, definition.palette.warning, 0.38, 0.2);
  const metal = standardMaterial(THREE, "#292629", 0.25, 0.74);

  addBox(THREE, root, "shell", [0.92, 1.14, 0.79], [0, 0.57, 0], shell);
  addBox(THREE, root, "upper-shell", [0.92, 0.75, 0.61], [0, 1.49, -0.09], shell);
  const marqueeGeometry = CABINET_MARQUEE_GEOMETRY.sumorai;
  addBox(THREE, root, "marquee-housing", [0.97, 0.3, marqueeGeometry.depth], [0, 1.9, marqueeGeometry.centerZ], trim);
  addBox(THREE, root, "base-trim", [0.97, 0.085, 0.84], [0, 0.043, 0], black);

  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.235),
    new THREE.MeshBasicMaterial({ map: createSumoraiMarqueeTexture(THREE) }),
  );
  marquee.name = "marquee";
  marquee.position.set(0, 1.9, marqueeGeometry.artZ);
  root.add(marquee);

  addBox(THREE, root, "screen-bezel", [0.8, 0.51, 0.06], [0, 1.5, 0.25], black);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.3825),
    new THREE.MeshBasicMaterial({ map: createSumoraiScreenTexture(THREE) }),
  );
  screen.name = "screen";
  screen.position.set(0, 1.5, 0.285);
  root.add(screen);

  const dualDeck = CABINET_CONTROL_SURFACE.dualDeck;
  const deck = addBox(THREE, root, "control-deck", [dualDeck.width, 0.11, dualDeck.depth], [0, 1.105, dualDeck.centerZ], deckPaint);
  deck.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
  addBox(THREE, root, "deck-face", [0.86, 0.18, 0.055], [0, 1.005, dualDeck.faceZ], shell);

  for (const side of [-1, 1]) {
    const stickX = side * 0.25;
    const playerMaterial = side < 0 ? trim : bone;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.09, 12), metal);
    stick.name = side < 0 ? "joystick-left" : "joystick-right";
    stick.position.set(stickX, 1.165, 0.33);
    stick.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    stick.castShadow = true;
    root.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), playerMaterial);
    ball.position.set(stickX, 1.215, 0.33);
    ball.castShadow = true;
    root.add(ball);
    for (const [offsetX, z] of [[-0.064, 0.43], [0, 0.405], [0.064, 0.43]] as const) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.022, 16), playerMaterial);
      button.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
      button.position.set(stickX + offsetX, 1.17, z);
      button.castShadow = true;
      root.add(button);
    }
  }

  addBox(THREE, root, "coin-door", [0.42, 0.5, 0.038], [0, 0.52, 0.417], metal);
  addBox(THREE, root, "coin-slot-left", [0.075, 0.14, 0.025], [-0.11, 0.64, 0.447], black);
  addBox(THREE, root, "coin-slot-right", [0.075, 0.14, 0.025], [0.11, 0.64, 0.447], black);
  addBox(THREE, root, "coin-return", [0.19, 0.075, 0.025], [0, 0.39, 0.447], black);

  for (const side of [-1, 1]) {
    const sideTexture = createSumoraiSideArtTexture(THREE, side < 0 ? "left" : "right");
    const sideArt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 1.62),
      new THREE.MeshBasicMaterial({ map: sideTexture }),
    );
    sideArt.name = side < 0 ? "side-art-left" : "side-art-right";
    sideArt.rotation.y = side * Math.PI / 2;
    sideArt.position.set(side * 0.463, 1.05, -0.025);
    root.add(sideArt);
  }

  addEnsoTopper(THREE, root, definition.palette);
  return root;
}

export function createCabinetModel(THREE: ThreeNamespace, definition: CabinetDefinition): any {
  if (definition.gameSlug === "bird-duty") return createBirdDutyCabinet(THREE, definition);
  if (definition.gameSlug === "lovers-lost") return createLoversLostCabinet(THREE, definition);
  if (definition.gameSlug === "sumorai") return createSumoraiCabinet(THREE, definition);
  throw new Error(`No 3D cabinet model is registered for ${definition.gameSlug}`);
}
