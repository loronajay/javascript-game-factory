// One mallet's cosmetic presentation.
//
// THIS IS THE ONLY MALLET RENDERER. The Garage preview and a live match both
// build their mallets here, from the same garage document, so a design cannot
// look like one thing in the editor and another on the table. There is no
// editor-only path.
//
// IT DRAWS. IT DOES NOT PLAY. Nothing in this file is read by the simulation:
// the group's position is copied from the physics body every frame and the
// physics body's radius is a constant in `physics/world.js` that no garage
// field can reach. `showCollision()` exists to make that visible — it draws the
// TRUE gameplay footprint over whatever cosmetic shape is equipped, so a player
// can see for themselves that a wide design and a narrow one have identical
// reach.
//
// REBUILDS ARE RARE ON PURPOSE. Geometry is rebuilt only when a number that
// changes geometry changes; colours, roughness and decal placement are written
// straight onto the existing materials and transforms. Nothing here allocates
// per frame, and everything replaced is disposed.

import { MALLET_HARDWARE_BY_ID, PHYSICS_MALLET_RADIUS } from "../cosmetics/catalog.js";
import { DECAL_BY_ID } from "../cosmetics/decal-catalog.js";

/** Geometry is only as smooth as it needs to be at the size a mallet is drawn. */
const RADIAL = 40;
const CONNECTOR_MIN = 0.006;

/**
 * The stack, in the mallet's own space. `y` is the CENTRE of each piece, which
 * is what the `capLift` / `crownLift` sliders set, and the connectors below are
 * what keep a lifted piece attached rather than floating.
 */
function stack(geometry) {
  const shoulderTop = geometry.shoulderHeight / 2;
  const capBottom = geometry.capLift - geometry.capHeight / 2;
  const capTop = geometry.capLift + geometry.capHeight / 2;
  const crownBottom = geometry.crownLift - geometry.crownHeight / 2;
  const crownTop = geometry.crownLift + geometry.crownHeight / 2;
  return { shoulderTop, capBottom, capTop, crownBottom, crownTop };
}

/** The face a decal sits on: the topmost piece actually being drawn. */
export function decalSurface(geometry) {
  const { capTop, crownTop } = stack(geometry);
  return geometry.crownEnabled
    ? { y: crownTop, radius: geometry.crownTopRadius }
    : { y: capTop, radius: geometry.capTopRadius };
}

function disposeDeep(object) {
  object.traverse?.((node) => {
    if (node.geometry) node.geometry.dispose();
  });
}

export function createMalletAppearance(THREE, { textureLoader = new THREE.TextureLoader() } = {}) {
  const group = new THREE.Group();

  // Three materials, three roles: the shoulder identifies the player, the cap
  // and crown carry the accent, the connectors and rings are the hardware.
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff });
  const hardwareMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x000000 });
  bodyMat.castShadow = true;

  const shapeGroup = new THREE.Group();
  const hardwareGroup = new THREE.Group();
  group.add(shapeGroup, hardwareGroup);

  // The decal is its own plane held just off the top face and offset in depth,
  // rather than composited into the body material. That is what lets it be
  // moved, scaled and rotated live, and what stops it z-fighting the cap.
  const decalMat = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat);
  decalMesh.rotation.x = -Math.PI / 2;
  decalMesh.visible = false;
  group.add(decalMesh);

  // The true gameplay footprint, drawn over the cosmetic. Hidden by default.
  const collisionGroup = new THREE.Group();
  const collisionRing = new THREE.Mesh(
    new THREE.TorusGeometry(PHYSICS_MALLET_RADIUS, 0.012, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x5ce8ff, transparent: true, opacity: 0.9, depthTest: false }),
  );
  collisionRing.rotation.x = Math.PI / 2;
  const collisionDisc = new THREE.Mesh(
    new THREE.CircleGeometry(PHYSICS_MALLET_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color: 0x5ce8ff, transparent: true, opacity: 0.12, depthTest: false }),
  );
  collisionDisc.rotation.x = -Math.PI / 2;
  collisionGroup.add(collisionRing, collisionDisc);
  collisionGroup.position.y = -0.22;
  collisionGroup.visible = false;
  collisionGroup.renderOrder = 10;
  group.add(collisionGroup);

  const textures = new Map();
  let geometryKey = "";
  let decalKey = "";

  function loadTexture(url) {
    if (textures.has(url)) return textures.get(url);
    const texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace ?? texture.colorSpace;
    texture.anisotropy = 4;
    textures.set(url, texture);
    return texture;
  }

  function cylinder(topRadius, bottomRadius, height, y, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, RADIAL), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    shapeGroup.add(mesh);
    return mesh;
  }

  /** A stem bridging a gap the lift sliders opened. Nothing floats. */
  function connector(fromY, toY, radius) {
    const height = toY - fromY;
    if (height <= CONNECTOR_MIN) return;
    cylinder(radius, radius, height, fromY + height / 2, hardwareMat);
  }

  function buildShape(geometry) {
    disposeDeep(shapeGroup);
    shapeGroup.clear();
    const { shoulderTop, capBottom, capTop, crownBottom } = stack(geometry);

    cylinder(geometry.shoulderRadius, geometry.shoulderRadius, geometry.shoulderHeight, 0, bodyMat);
    connector(shoulderTop, capBottom, Math.max(0.06, geometry.capBottomRadius * 0.55));
    cylinder(geometry.capTopRadius, geometry.capBottomRadius, geometry.capHeight, geometry.capLift, accentMat);

    if (geometry.crownEnabled) {
      connector(capTop, crownBottom, Math.max(0.05, geometry.crownBottomRadius * 0.6));
      cylinder(geometry.crownTopRadius, geometry.crownBottomRadius, geometry.crownHeight, geometry.crownLift, accentMat);
    }
  }

  /**
   * Hardware is real mesh: a ring is a torus, a segmented ring is N torus arcs,
   * a reactor adds radial posts. `style` chooses how many of each; the sliders
   * choose where and how big. No style is a shader flag.
   */
  function buildHardware(hardware, geometry) {
    disposeDeep(hardwareGroup);
    hardwareGroup.clear();
    const style = MALLET_HARDWARE_BY_ID.get(hardware.style);
    if (!style || style.segments === 0) return;

    const baseY = style.underglow ? -geometry.shoulderHeight / 2 - hardware.thickness : hardware.height;
    const gap = hardware.thickness * 3.2;

    for (let ring = 0; ring < style.rings; ring += 1) {
      const y = baseY + (style.rings === 1 ? 0 : ring * gap - (gap * (style.rings - 1)) / 2);
      if (style.segments === 1) {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(hardware.radius, hardware.thickness, 10, 48),
          hardwareMat,
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = y;
        hardwareGroup.add(mesh);
        continue;
      }
      const arc = (Math.PI * 2) / style.segments;
      for (let index = 0; index < style.segments; index += 1) {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(hardware.radius, hardware.thickness, 8, 14, arc * 0.62),
          hardwareMat,
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.z = -arc * index;
        mesh.position.y = y;
        hardwareGroup.add(mesh);
      }
    }

    if (style.posts) {
      const postCount = Math.max(3, Math.min(8, style.segments));
      for (let index = 0; index < postCount; index += 1) {
        const angle = ((Math.PI * 2) / postCount) * index;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(hardware.thickness * 1.6, hardware.thickness * 4.2, hardware.thickness * 1.6),
          hardwareMat,
        );
        post.position.set(
          Math.cos(angle) * hardware.radius,
          baseY + hardware.thickness * 2.4,
          Math.sin(angle) * hardware.radius,
        );
        hardwareGroup.add(post);
      }
    }
  }

  function applyDecal(decal, geometry) {
    const url = decal.type === "builtin"
      ? DECAL_BY_ID.get(decal.id)?.asset ?? ""
      : decal.type === "custom" ? decal.customAssetUrl || "" : "";
    if (!url) {
      decalMesh.visible = false;
      decalMat.opacity = 0;
      return;
    }
    if (decalKey !== url) {
      decalKey = url;
      decalMat.map = loadTexture(url);
      decalMat.needsUpdate = true;
    }
    // Placement is in CAP RADII, so the decal keeps its position on the face
    // when a shape slider resizes that face instead of sliding off it.
    const surface = decalSurface(geometry);
    const size = surface.radius * 2 * decal.scale;
    decalMesh.visible = true;
    decalMesh.scale.set(size, size, 1);
    decalMesh.position.set(decal.x * surface.radius, surface.y + 0.006, -decal.y * surface.radius);
    decalMesh.rotation.z = (-decal.rotation * Math.PI) / 180;
    decalMat.opacity = decal.opacity;
  }

  return {
    group,

    /**
     * Draw this mallet. Safe to call every time anything changes — the
     * expensive half only runs when the numbers that build meshes move.
     */
    apply(mallet) {
      const { geometry, material, colors, hardware, decal } = mallet;
      const nextKey = JSON.stringify([geometry, hardware.style, hardware.radius, hardware.thickness, hardware.height]);
      if (nextKey !== geometryKey) {
        geometryKey = nextKey;
        buildShape(geometry);
        buildHardware(hardware, geometry);
      }

      for (const [target, color] of [[bodyMat, colors.primary], [accentMat, colors.accent], [hardwareMat, colors.hardware]]) {
        target.color.set(color);
        target.roughness = material.roughness;
        target.metalness = material.metalness;
        target.clearcoat = material.clearcoat;
        target.clearcoatRoughness = material.clearcoatRoughness;
      }
      const style = MALLET_HARDWARE_BY_ID.get(hardware.style);
      hardwareMat.emissive.set(style?.emissive ? colors.hardware : "#000000");
      hardwareMat.emissiveIntensity = style?.emissive ? hardware.glowIntensity : 0;

      applyDecal(decal, geometry);
    },

    /** The developer overlay: the real collision footprint, over the cosmetic. */
    showCollision(visible) {
      collisionGroup.visible = Boolean(visible);
    },

    dispose() {
      disposeDeep(group);
      for (const material of [bodyMat, accentMat, hardwareMat, decalMat, collisionRing.material, collisionDisc.material]) {
        material.dispose();
      }
      for (const texture of textures.values()) texture.dispose();
      textures.clear();
    },
  };
}
