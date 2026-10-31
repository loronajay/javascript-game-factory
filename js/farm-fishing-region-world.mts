import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { normalizeFarmLayout, type FarmDecorRow } from "./farm-layout.mjs";
import type { FarmObstacle } from "./farm-body.mjs";
import { createTree, createWillow, createPine } from "./farm-props-plants.mjs";
import { REGION_BOUNDS, regionShoreTrees, regionGroundAt, regionWaterDistance, regionZoneAt, type FishingRegion } from "./farm-fishing-regions.mjs";
import type { MarketStall } from "./farm-market-square.mjs";

type Three = Record<string, any>;
type Point = Readonly<{ x: number; z: number }>;

/** Water blockers use thin strips of the same ellipse as the visible bank. */
export function regionWaterObstacles(region: FishingRegion): FarmObstacle[] {
  const out: FarmObstacle[] = [];
  for (const [poolIndex, pool] of region.pools.entries()) {
    const steps = Math.ceil(pool.rx * 4);
    const width = pool.rx * 2 / steps;
    for (let index = 0; index < steps; index += 1) {
      const x = -pool.rx + (index + 0.5) * width;
      const depth = 2 * pool.rz * Math.sqrt(Math.max(0, 1 - (x / pool.rx) ** 2));
      out.push({ instanceId: `${region.id}-water-${poolIndex}-${index}`, x: pool.x + x, z: pool.z,
        rotationY: 0, footprint: { width, depth }, bottom: -Infinity, top: Infinity });
    }
  }
  return out;
}

export function fishingRegionScene(region: FishingRegion) {
  const rail = `${region.id}-rail`;
  const side = region.id === "grotto" ? 1 : -1;
  const decor: FarmDecorRow[] = [
    { instanceId: rail, itemId: "decor.prop.hitching-rail", x: side * 31, z: 29, rotationY: 0, length: 0 },
    { instanceId: `${region.id}-bench`, itemId: "decor.prop.bench", x: side * 10, z: 23, rotationY: 0, length: 0 },
    { instanceId: `${region.id}-lamp`, itemId: "decor.prop.lamp-post", x: side * 13, z: 24, rotationY: 0, length: 0 },
    { instanceId: `${region.id}-camp`, itemId: "decor.prop.campfire", x: side * 18, z: 24, rotationY: 0, length: 0 },
  ];
  if (region.id === "estate-lake") decor.push({ instanceId: "lake-pavilion", itemId: "decor.building.gazebo", x: -31.5, z: -1, rotationY: Math.PI / 2, length: 0 });
  const base = normalizeFarmLayout({ version: 3, pets: [], decor: [], ground: "ground.meadow" });
  return {
    COVE_BOUNDS: REGION_BOUNDS, COVE_SPAWN: region.spawn, COVE_PRESENCE_ROOM: `farm:fishing:${region.id}`,
    COVE_MARKET_GATE: "", COVE_RAIL_ID: rail, COVE_STALLS: [] as readonly MarketStall[],
    coveLayout: () => ({ ...base, decor }), coveObstacles: () => regionWaterObstacles(region).concat(regionShoreTrees(region).map((tree, index) => ({ instanceId: `region-tree-${index}`, x: tree.x, z: tree.z, rotationY: 0, footprint: { width: 0.75, depth: 0.75 }, bottom: 0, top: Infinity }))),
    covePlatforms: () => [], coveGroundAt: (point: Point) => regionGroundAt(region, point),
    coveWaterDepthAt: (point: Point) => Math.max(0, -0.3 - regionGroundAt(region, point)),
    coveWaterDistance: (point: Point) => regionWaterDistance(region, point),
    castOrigin: (pose: Point & { forward: Point }): Point | null => {
      for (let distance = 0.4; distance < 4; distance += 0.2) {
        const point = { x: pose.x + pose.forward.x * distance, z: pose.z + pose.forward.z * distance };
        if (regionZoneAt(region, point)) return point;
      }
      return null;
    },
  };
}

export function destinationSign(THREE: Three, root: any, text: string, x: number, z: number, rotationY = 0): void {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 192;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#1b302b"; context.fillRect(0, 0, 768, 192);
  context.strokeStyle = "#c9d8ad"; context.lineWidth = 8; context.strokeRect(8, 8, 752, 176);
  context.fillStyle = "#f8ecd2"; context.font = "bold 45px system-ui"; context.textAlign = "center";
  context.textBaseline = "middle"; context.fillText(text, 384, 96, 710);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotationY;
  const board = new THREE.Mesh(new THREE.BoxGeometry(5, 1.25, 0.16), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
  board.position.y = 2.1; group.add(board);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.2, 7), new THREE.MeshStandardMaterial({ color: "#614c39" }));
  post.position.y = 1.1; group.add(post); root.add(group);
}

/** Visible trailheads at the Cove's western and eastern shore entrances. */
export function createCoveTrailheads(THREE: Three, scene: any): void {
  destinationSign(THREE, scene, "WEST  /  FERNFALL GROTTO", -17.5, 7.2, 0.2);
  destinationSign(THREE, scene, "EAST  /  EMBERGLASS LAGOON", 17.5, 7.2, -0.2);
  const material = new THREE.MeshStandardMaterial({ color: "#bba681", roughness: 1 });
  for (const side of [-1, 1]) {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.6), material);
    path.rotation.x = -Math.PI / 2; path.position.set(side * 24, 0.025, 9.5); scene.add(path);
  }
}

/** Complete destinations: real banks, several pools, cliffs and animated scenery. */
export function createFishingRegionWorld(THREE: Three, scene: any, region: FishingRegion) {
  const root = new THREE.Group(); root.name = `fishing-region-${region.id}`; scene.add(root);
  if (scene.fog) { scene.fog.near = 65; scene.fog.far = 190; }
  const volcanic = region.id === "volcanic";
  const ground = new THREE.PlaneGeometry(400, 400, 400, 400); ground.rotateX(-Math.PI / 2);
  const positions = ground.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, regionGroundAt(region, { x: positions.getX(index), z: positions.getZ(index) }));
  }
  ground.computeVertexNormals();
  const floor = new THREE.Mesh(ground, createSurfaceMaterial(THREE, { pattern: !volcanic ? "grass" : "dirt", colors: !volcanic ? ["#487044", "#3c6139", "#75925b", "#5f573c"] : ["#4a4850", "#383942", "#69616b", "#827079"], repeat: 7, roughness: 1, metalness: 0 }, { u: 400, v: 400 }));
  floor.receiveShadow = true; root.add(floor);
  const waterTime = { value: 0 };
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: waterTime, tint: { value: new THREE.Color(region.water) } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `varying vec2 uvWater; void main(){ uvWater=(modelMatrix*vec4(position,1.)).xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float time; uniform vec3 tint; varying vec2 uvWater;
      void main(){ float ripple=(sin(uvWater.x*2.4+uvWater.y*.8+time*.7)+sin(uvWater.y*3.1-uvWater.x*.6-time*.9)+sin(uvWater.x*1.2-uvWater.y*1.7+time*.4))/3.;
      float sparkle=pow(max(0.,ripple),18.); gl_FragColor=vec4(tint+vec3(ripple*.025+sparkle*.12),.82); }`,
  });
  for (const pool of region.pools) {
    const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 96), waterMaterial);
    surface.rotation.x = -Math.PI / 2; surface.scale.set(pool.rx, pool.rz, 1); surface.position.set(pool.x, -0.3, pool.z); root.add(surface);
    const shorePositions: number[] = [];
    for (let step = 0; step < 160; step += 1) {
      const angle = (step + 0.5) / 160 * Math.PI * 2;
      const outer = { x: pool.x + Math.cos(angle) * pool.rx * 1.025, z: pool.z + Math.sin(angle) * pool.rz * 1.025 };
      if (regionWaterDistance(region, outer) > 0) continue;
      const a = step / 160 * Math.PI * 2, b = (step + 1) / 160 * Math.PI * 2;
      const at = (angle: number, scale: number): number[] => [pool.x + Math.cos(angle) * pool.rx * scale, 0.018, pool.z + Math.sin(angle) * pool.rz * scale];
      shorePositions.push(...at(a, 1), ...at(b, 1), ...at(a, 1.04), ...at(a, 1.04), ...at(b, 1), ...at(b, 1.04));
    }
    const shoreGeometry = new THREE.BufferGeometry(); shoreGeometry.setAttribute("position", new THREE.Float32BufferAttribute(shorePositions, 3)); shoreGeometry.computeVertexNormals();
    root.add(new THREE.Mesh(shoreGeometry, new THREE.MeshStandardMaterial({ color: volcanic ? "#92838b" : "#a1b28a", roughness: 1, side: THREE.DoubleSide })));
  }
  const rockMaterial = new THREE.MeshStandardMaterial({ color: region.rock, roughness: 0.95, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: volcanic ? "#66456c" : "#63915b", roughness: 1 });
  function rock(x: number, y: number, z: number, sx: number, sy: number, sz: number): any {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), rockMaterial);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = x * 0.31; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  // An enclosing skyline beyond the walkable boundary; pools remain fully accessible.
  for (let index = 0; index < 19; index += 1) {
    const x = -43 + index * 4.8; const height = volcanic ? 7 + (index % 5) * 2.3 : 9 + Math.sin(index * 1.7) * 3;
    rock(x, height / 2 - 1, -39 - (index % 3) * 1.4, 5, height, 5.5);
    if (!volcanic && index % 2 === 0) {
      const tree = createTree(THREE, index + 61); tree.position.set(x, height + 1, -40); tree.scale.setScalar(1.1); root.add(tree);
    }
  }
  for (let index = 0; index < 60; index += 1) {
    const pool = region.pools[index % region.pools.length]!;
    const angle = index * 2.399;
    const x = pool.x + Math.cos(angle) * pool.rx * 0.985, z = pool.z + Math.sin(angle) * pool.rz * 0.985;
    if (regionWaterDistance(region, {x,z}) > 0.65) continue;
    const size = 0.35 + index % 4 * 0.14;
    rock(x, -0.05, z, size * 1.3, size * 0.7, size);
  }
  // Dense vegetation outside the playable boundary frames the pools without blocking routes.
  for (let index = 0; index < 36; index += 1) {
    const angle = index / 36 * Math.PI * 2;
    const x = Math.cos(angle) * 45, z = Math.sin(angle) * 43;
    if (z < -30 || (Math.abs(z - 20) < 5)) continue;
    const tree = createTree(THREE, index + 150); tree.position.set(x, 0, z); tree.scale.setScalar(volcanic ? 1.2 : 1.8); root.add(tree);
  }
  const animated: Array<(seconds: number) => void> = [];
  if (region.id === "grotto") {
    // Water descends from the north cliff directly into the main pool.
    const cascade = new THREE.ShaderMaterial({
      uniforms: { time: waterTime }, transparent: true, side: THREE.DoubleSide,
      vertexShader: `varying vec2 flowUv; void main(){flowUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 flowUv; uniform float time; void main(){float streak=sin(flowUv.x*90.+sin(flowUv.x*23.+flowUv.y*4.-time*3.))*.035;
        float drops=sin(flowUv.y*120.+time*14.+sin(flowUv.x*49.))*.025; gl_FragColor=vec4(vec3(.66,.91,.9)+streak+drops,.82);}`,
    });
    rock(-16, 5, -32, 5, 9, 5); rock(-2, 6, -33, 5, 10, 5);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(9, 2.5, 8), rockMaterial); ledge.position.set(-9, 15.5, -31); ledge.castShadow = true; root.add(ledge);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 16, 12, 24), cascade);
    fall.position.set(-9, 7.7, -26.9); root.add(fall);
    const foamMaterial = new THREE.MeshBasicMaterial({ color: "#def9eb", transparent: true, opacity: 0.65, depthWrite: false });
    for (let index = 0; index < 12; index += 1) {
      const foam = new THREE.Mesh(new THREE.TorusGeometry(0.8 + index * 0.12, 0.06, 5, 28), foamMaterial);
      foam.rotation.x = -Math.PI / 2; foam.position.set(-9 + Math.sin(index * 2.4) * 2, -0.26, -28 + (index % 3) * 1.2); root.add(foam);
      animated.push((seconds) => foam.scale.setScalar(0.7 + ((seconds * 0.25 + index / 12) % 1) * 1.5));
    }
    for (const {x, z} of regionShoreTrees(region)) {
      const tree = createWillow(THREE, Math.abs(x * 7 + z)); tree.position.set(x, 0, z); tree.scale.setScalar(1.3); root.add(tree);
    }
  } else if (volcanic) {
    // Palms are bank landmarks and have matching solid trunks in the scene data.
    const palmWood = new THREE.MeshStandardMaterial({ color: "#80664f", roughness: 0.95 });
    const palmLeaf = new THREE.MeshStandardMaterial({ color: "#52775d", roughness: 0.9, side: THREE.DoubleSide });
    for (const tree of regionShoreTrees(region)) {
      const palm = new THREE.Group(); palm.position.set(tree.x, 0, tree.z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 5.5, 9), palmWood); trunk.position.y = 2.75; trunk.castShadow = true; palm.add(trunk);
      for (let frond = 0; frond < 7; frond += 1) {
        const angle = frond / 7 * Math.PI * 2 + tree.x;
        const vertices: number[] = [];
        const at = (step: number, side: number): number[] => {
          const t = step / 12, reach = t * 4.5, width = Math.sin(t * Math.PI) * 0.55 * side;
          return [Math.cos(angle) * reach - Math.sin(angle) * width, 5.5 + Math.sin(t * Math.PI) * 0.8 - t * t * 2, Math.sin(angle) * reach + Math.cos(angle) * width];
        };
        for (let step = 0; step < 12; step += 1) vertices.push(...at(step, -1), ...at(step + 1, -1), ...at(step, 1), ...at(step, 1), ...at(step + 1, -1), ...at(step + 1, 1));
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
        const leaf = new THREE.Mesh(geometry, palmLeaf); leaf.castShadow = true; palm.add(leaf);
      }
      root.add(palm);
    }
    // Basalt organ pipes and luminous coral give this lagoon its own silhouette.
    for (let index = 0; index < 22; index += 1) {
      const height = 3 + (Math.sin(index * 3.1) + 1) * 3;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, height, 6), rockMaterial);
      column.position.set(-29 + index * 2.7, height / 2, -32 - Math.sin(index) * 2); column.castShadow = true; root.add(column);
    }
    const glowColors = ["#a2e8d8", "#e88ab5", "#a691ed"];
    for (let index = 0; index < 42; index += 1) {
      const pool = region.pools[index % region.pools.length]!;
      const angle = index * 2.399;
      const x = pool.x + Math.cos(angle) * pool.rx * 0.75, z = pool.z + Math.sin(angle) * pool.rz * 0.75;
      const color = glowColors[index % 3]!;
      const coral = new THREE.Mesh(new THREE.ConeGeometry(0.18 + index % 3 * 0.08, 0.8 + index % 4 * 0.2, 5), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.5 }));
      coral.position.set(x, -0.9, z); coral.rotation.z = Math.sin(index) * 0.3; root.add(coral);
    }
  }
  if (region.requiredProperty) {
    for (const {x,z} of regionShoreTrees(region)) {
      const tree = region.id === "cedar-creek" ? createPine(THREE, Math.abs(x * 5 + z)) : createWillow(THREE, Math.abs(x + z * 3));
      tree.position.set(x, 0, z); tree.scale.setScalar(1.5); root.add(tree);
    }
  }
  // Low ferns / crystal clusters dress the shore without blocking casting routes.
  for (let index = 0; index < 80; index += 1) {
    const angle = index * 2.399; const radius = 24 + (index % 9) * 1.1;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (regionWaterDistance(region, { x, z }) > -1.4 || Math.abs(z - 20) < 4) continue;
    const plant = new THREE.Group(); plant.position.set(x, 0, z);
    for (let leaf = 0; leaf < 5; leaf += 1) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(volcanic ? 0.15 : 0.3, volcanic ? 1.1 : 0.8, volcanic ? 4 : 3), moss);
      mesh.rotation.z = 0.6; mesh.rotation.y = leaf * Math.PI * 0.4; mesh.position.y = 0.35; plant.add(mesh);
    }
    root.add(plant);
  }
  // A broad dry path follows the southern bank to the Cove exit.
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(28, 3.2), new THREE.MeshStandardMaterial({ color: volcanic ? "#b89b87" : "#b9b58c", roughness: 1 }));
  trail.rotation.x = -Math.PI / 2; trail.position.set(region.exit.x > 0 ? 23 : -23, 0.025, 20); root.add(trail);
  destinationSign(THREE, root, region.requiredProperty ? "YOUR FARM  /  RETURN PATH" : "THE COVE  / RETURN PATH", region.exit.x > 0 ? 32 : -32, 16, region.exit.x > 0 ? -0.2 : 0.2);
  // Arrival marker looks back toward the destination, away from the narrow exit.
  destinationSign(THREE, root, region.title.toUpperCase(), region.spawn.x * 0.72, 25);
  return {
    update(_dt: number, seconds: number) { waterTime.value = seconds; for (const animate of animated) animate(seconds); },
    dispose() {
      root.traverse((object: any) => { object.geometry?.dispose?.(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material?.map?.dispose?.(); material?.dispose?.(); } });
      root.removeFromParent();
    },
  };
}
