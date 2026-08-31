import * as THREE from './vendor/three.module.min.js';

// One shared, locally bundled PBR set for the house. Only albedo is sRGB;
// normals and roughness encode data and must stay in linear space.
export const WALL_MAPS = {
  map: '../assets/textures/walls/painted-plaster-color.webp',
  normalMap: '../assets/textures/walls/painted-plaster-normal.webp',
  roughnessMap: '../assets/textures/walls/painted-plaster-roughness.webp',
};

export function createWallMaterial(gpu, loader = new THREE.TextureLoader()) {
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(.85, .85), envMapIntensity: .65 });
  tintWallMaterial(material, 0x1b1018);
  const anisotropy = Math.min(8, gpu?.capabilities?.getMaxAnisotropy?.() ?? 1);
  for (const [slot, path] of Object.entries(WALL_MAPS)) {
    const texture = loader.load(new URL(path, import.meta.url).href, undefined, undefined, () => {
      // A missing image must not stop a match; retain the painted-wall fallback.
      material[slot] = null;
      material.needsUpdate = true;
    });
    texture.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    material[slot] = texture;
  }
  return material;
}

export function tintWallMaterial(material, color) {
  // Near-black theme colors used to erase all surface detail. Preserve their
  // hue in the paint while the brighter neon accents supply the house color.
  material.color.setHex(color).lerp(new THREE.Color(0xffffff), .3);
}

export function tileBoxUVs(geometry, tileWorldSize = 6) {
  const { width, height, depth } = geometry.parameters;
  const { normal, uv } = geometry.attributes;
  for (let i = 0; i < uv.count; i++) {
    const uSize = Math.abs(normal.getX(i)) > .5 ? depth : width;
    const vSize = Math.abs(normal.getY(i)) > .5 ? depth : height;
    uv.setXY(i, uv.getX(i) * uSize / tileWorldSize, uv.getY(i) * vSize / tileWorldSize);
  }
  uv.needsUpdate = true;
  return geometry;
}
