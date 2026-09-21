// The mesh primitives every decor builder is made of: a box, a cylinder, a
// sphere, a canvas-drawn plane, and the two materials (a lit standard and a
// self-lit glow). Builders live in `arcade-room-decor-model.mts` and
// `arcade-room-decor-props.mts`; both draw with exactly these, so a prop is
// always the same handful of shapes and never an asset.

export type ThreeNamespace = Record<string, any>;
export type Size = Readonly<{ width: number; height: number; depth: number }>;
export type Build = (THREE: ThreeNamespace, group: any, size: Size, color: string, spec: any) => void;

export function standard(THREE: ThreeNamespace, color: string, roughness = 0.6, metalness = 0.1): any {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function glow(THREE: ThreeNamespace, color: string, intensity = 2.4): any {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
}

export function box(THREE: ThreeNamespace, group: any, size: readonly [number, number, number], position: readonly [number, number, number], material: any, shadow = true): any {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  group.add(mesh);
  return mesh;
}

export function cylinder(THREE: ThreeNamespace, group: any, radiusTop: number, radiusBottom: number, height: number, position: readonly [number, number, number], material: any, segments = 16, shadow = true): any {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = shadow;
  group.add(mesh);
  return mesh;
}

export function sphere(THREE: ThreeNamespace, group: any, radius: number, position: readonly [number, number, number], material: any): any {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

export function canvasPlane(THREE: ThreeNamespace, group: any, width: number, height: number, pixels: readonly [number, number], draw: (context: CanvasRenderingContext2D, w: number, h: number) => void, position: readonly [number, number, number], transparent = true): any {
  const canvas = document.createElement("canvas");
  canvas.width = pixels[0];
  canvas.height = pixels[1];
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is required to draw decor");
  draw(context, pixels[0], pixels[1]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent, side: THREE.DoubleSide }),
  );
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** `hex` moved `amount` of the way to white: the white-hot core of a lit tube. */
export function lighten(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): string => Math.round(((value >> shift) & 255) + (255 - ((value >> shift) & 255)) * amount).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
