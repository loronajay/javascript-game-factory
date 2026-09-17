import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";

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

function drawCloud(context: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  context.fillStyle = "#f6fbff";
  context.fillRect(x, y + 8 * scale, 34 * scale, 9 * scale);
  context.fillRect(x + 7 * scale, y + 3 * scale, 20 * scale, 12 * scale);
  context.fillRect(x + 13 * scale, y, 10 * scale, 14 * scale);
}

function createMarqueeTexture(THREE: ThreeNamespace): any {
  return canvasTexture(THREE, 512, 160, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, "#9ce6ff");
    gradient.addColorStop(1, "#3a9fda");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 160);
    drawCloud(context, 28, 24, 2);
    drawCloud(context, 384, 86, 1.4);
    context.strokeStyle = "#18314e";
    context.lineWidth = 8;
    context.strokeRect(5, 5, 502, 150);
    context.font = "900 58px Arial Black, sans-serif";
    context.textAlign = "center";
    context.lineJoin = "round";
    context.strokeStyle = "#17314c";
    context.lineWidth = 13;
    context.strokeText("BIRD DUTY", 256, 102);
    context.fillStyle = "#fff6cf";
    context.fillText("BIRD DUTY", 256, 102);
    context.fillStyle = "#ffd33d";
    context.fillRect(72, 122, 368, 10);
  });
}

function createScreenTexture(THREE: ThreeNamespace): any {
  return canvasTexture(THREE, 384, 288, (context) => {
    context.fillStyle = "#55bee9";
    context.fillRect(0, 0, 384, 288);
    drawCloud(context, 34, 34, 1.4);
    drawCloud(context, 270, 72, 1.1);
    context.fillStyle = "#6dad45";
    context.fillRect(0, 220, 384, 68);
    context.fillStyle = "#36592d";
    for (let x = 0; x < 384; x += 24) context.fillRect(x, 216 + (x % 48 ? 4 : 0), 16, 10);
    context.strokeStyle = "#172433";
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(0, 119);
    context.lineTo(384, 119);
    context.stroke();
    context.fillStyle = "#f6fbff";
    context.fillRect(164, 79, 48, 28);
    context.fillStyle = "#26384d";
    context.fillRect(173, 72, 28, 20);
    context.fillStyle = "#ffd33d";
    context.beginPath();
    context.moveTo(212, 86);
    context.lineTo(236, 94);
    context.lineTo(212, 100);
    context.fill();
    context.fillStyle = "rgba(8, 20, 35, .82)";
    context.fillRect(67, 241, 250, 30);
    context.font = "700 16px monospace";
    context.textAlign = "center";
    context.fillStyle = "#ffffff";
    context.fillText("PRESS E TO PLAY", 192, 262);
  });
}

function createSideArtTexture(THREE: ThreeNamespace): any {
  return canvasTexture(THREE, 256, 512, (context) => {
    context.fillStyle = "#17314c";
    context.fillRect(0, 0, 256, 512);
    context.fillStyle = "#56bce8";
    context.fillRect(14, 14, 228, 484);
    drawCloud(context, 34, 58, 1.5);
    context.strokeStyle = "#172433";
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(0, 177);
    context.lineTo(256, 177);
    context.stroke();
    context.fillStyle = "#f8fbff";
    context.beginPath();
    context.ellipse(128, 142, 48, 33, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#2d4054";
    context.beginPath();
    context.arc(120, 119, 29, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffd33d";
    context.beginPath();
    context.moveTo(146, 119);
    context.lineTo(190, 132);
    context.lineTo(147, 141);
    context.fill();
    context.fillStyle = "#6dad45";
    context.fillRect(14, 369, 228, 129);
    context.fillStyle = "#fff6cf";
    context.font = "900 31px Arial Black, sans-serif";
    context.textAlign = "center";
    context.fillText("AIM HIGH", 128, 430);
    context.fillStyle = "#ffd33d";
    context.fillText("DROP LOW", 128, 468);
  });
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

  const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.102, 18, 12), standardMaterial(THREE, "#f5fbff"));
  birdBody.scale.set(1.18, 0.82, 0.78);
  birdBody.position.set(0.13, 2.052, 0);
  birdBody.castShadow = true;
  group.add(birdBody);
  const birdHead = new THREE.Mesh(new THREE.SphereGeometry(0.071, 16, 10), standardMaterial(THREE, palette.shell));
  birdHead.position.set(0.105, 2.105, 0.035);
  birdHead.castShadow = true;
  group.add(birdHead);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.10, 4), standardMaterial(THREE, palette.warning));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0.105, 2.102, 0.118);
  group.add(beak);
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
  addBox(THREE, root, "marquee-housing", [0.9, 0.28, 0.62], [0, 1.84, -0.055], trim);
  addBox(THREE, root, "base-trim", [0.91, 0.08, 0.8], [0, 0.04, 0], black);

  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.77, 0.225),
    new THREE.MeshStandardMaterial({ map: createMarqueeTexture(THREE), emissive: "#78cfff", emissiveIntensity: 0.62, roughness: 0.35 }),
  );
  marquee.name = "marquee";
  marquee.position.set(0, 1.84, 0.262);
  root.add(marquee);

  addBox(THREE, root, "screen-bezel", [0.73, 0.53, 0.055], [0, 1.47, 0.225], black);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.625, 0.42),
    new THREE.MeshStandardMaterial({ map: createScreenTexture(THREE), emissive: "#4caedd", emissiveIntensity: 0.48, roughness: 0.22 }),
  );
  screen.name = "screen";
  screen.position.set(0, 1.49, 0.255);
  root.add(screen);

  const deck = addBox(THREE, root, "control-deck", [0.9, 0.105, 0.42], [0, 1.105, 0.275], trim);
  deck.rotation.x = -0.105;
  addBox(THREE, root, "deck-face", [0.87, 0.19, 0.08], [0, 1.01, 0.47], shell);

  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 12), metal);
  stick.name = "joystick";
  stick.position.set(-0.19, 1.205, 0.31);
  stick.castShadow = true;
  root.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), yellow);
  ball.position.set(-0.19, 1.3, 0.31);
  ball.castShadow = true;
  root.add(ball);
  for (const [x, z, color] of [[0.1, 0.32, "#ffd33d"], [0.23, 0.29, "#f35a55"]] as const) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.026, 16), standardMaterial(THREE, color, 0.36));
    button.rotation.x = Math.PI / 2;
    button.position.set(x, 1.2, z);
    button.castShadow = true;
    root.add(button);
  }

  addBox(THREE, root, "coin-door", [0.39, 0.48, 0.035], [0, 0.53, 0.395], metal);
  addBox(THREE, root, "coin-slot-left", [0.075, 0.14, 0.025], [-0.105, 0.64, 0.423], black);
  addBox(THREE, root, "coin-slot-right", [0.075, 0.14, 0.025], [0.105, 0.64, 0.423], black);
  addBox(THREE, root, "coin-return", [0.18, 0.075, 0.025], [0, 0.4, 0.423], black);

  const sideTexture = createSideArtTexture(THREE);
  for (const side of [-1, 1]) {
    const sideArt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 1.54),
      new THREE.MeshStandardMaterial({ map: sideTexture, roughness: 0.62 }),
    );
    sideArt.name = side < 0 ? "side-art-left" : "side-art-right";
    sideArt.rotation.y = side * Math.PI / 2;
    sideArt.position.set(side * 0.433, 1.01, -0.03);
    root.add(sideArt);
  }

  addBirdTopper(THREE, root, definition.palette);
  return root;
}
