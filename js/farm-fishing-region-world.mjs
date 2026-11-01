import { createFernfallScenery } from "./farm-fernfall-scenery.mjs";
import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { normalizeFarmLayout } from "./farm-layout.mjs";
import { createTree, createWillow, createPine } from "./farm-props-plants.mjs";
import { REGION_BOUNDS, regionShoreTrees, regionGroundAt, regionWaterDistance, regionZoneAt } from "./farm-fishing-regions.mjs";
/** Water blockers use thin strips of the same ellipse as the visible bank. */
export function regionWaterObstacles(region) {
    const out = [];
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
export function fishingRegionScene(region) {
    const rail = `${region.id}-rail`;
    const side = region.id === "grotto" ? 1 : -1;
    const decor = [
        { instanceId: rail, itemId: "decor.prop.hitching-rail", x: side * 31, z: 29, rotationY: 0, length: 0 },
        { instanceId: `${region.id}-bench`, itemId: "decor.prop.bench", x: side * 10, z: 23, rotationY: 0, length: 0 },
        { instanceId: `${region.id}-lamp`, itemId: "decor.prop.lamp-post", x: side * 13, z: 24, rotationY: 0, length: 0 },
        { instanceId: `${region.id}-camp`, itemId: "decor.prop.campfire", x: side * 18, z: 24, rotationY: 0, length: 0 },
    ];
    if (region.id === "estate-lake")
        decor.push({ instanceId: "lake-pavilion", itemId: "decor.building.gazebo", x: -31.5, z: -1, rotationY: Math.PI / 2, length: 0 });
    const base = normalizeFarmLayout({ version: 3, pets: [], decor: [], ground: "ground.meadow" });
    return {
        COVE_BOUNDS: REGION_BOUNDS, COVE_SPAWN: region.spawn, COVE_PRESENCE_ROOM: `farm:fishing:${region.id}`,
        COVE_MARKET_GATE: "", COVE_RAIL_ID: rail, COVE_STALLS: [],
        coveLayout: () => ({ ...base, decor }), coveObstacles: () => regionWaterObstacles(region).concat(regionShoreTrees(region).map((tree, index) => ({ instanceId: `region-tree-${index}`, x: tree.x, z: tree.z, rotationY: 0, footprint: { width: 0.75, depth: 0.75 }, bottom: 0, top: Infinity }))),
        covePlatforms: () => [], coveGroundAt: (point) => regionGroundAt(region, point),
        coveWaterDepthAt: (point) => Math.max(0, -0.3 - regionGroundAt(region, point)),
        coveWaterDistance: (point) => regionWaterDistance(region, point),
        castOrigin: (pose) => {
            for (let distance = 0.4; distance < 4; distance += 0.2) {
                const point = { x: pose.x + pose.forward.x * distance, z: pose.z + pose.forward.z * distance };
                if (regionZoneAt(region, point))
                    return point;
            }
            return null;
        },
    };
}
export function destinationSign(THREE, root, text, x, z, rotationY = 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    context.fillStyle = "#1b302b";
    context.fillRect(0, 0, 768, 192);
    context.strokeStyle = "#c9d8ad";
    context.lineWidth = 8;
    context.strokeRect(8, 8, 752, 176);
    context.fillStyle = "#f8ecd2";
    context.font = "bold 45px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 384, 96, 710);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.16), new THREE.MeshStandardMaterial({ color: "#614c39", roughness: 1 }));
    board.position.y = 1.7;
    board.castShadow = true;
    group.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.54, 0.61), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
    face.position.set(0, 1.7, 0.081);
    group.add(face);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.65, 7), new THREE.MeshStandardMaterial({ color: "#614c39" }));
    post.position.set(0, 0.825, -0.12);
    group.add(post);
    root.add(group);
}
/** Visible trailheads at the Cove's western and eastern shore entrances. */
export function createCoveTrailheads(THREE, scene) {
    // Beyond the wall and records board, beside the trail rather than behind the board.
    destinationSign(THREE, scene, "← FERNFALL GROTTO", -23, 11.4, 0.2);
    destinationSign(THREE, scene, "EMBERGLASS LAGOON →", 23, 11.4, -0.2);
    for (const side of [-1, 1])
        bankTrail(THREE, scene, side * 24, 9.5, 16, () => 0);
}
/** Complete destinations: real banks, several pools, cliffs and animated scenery. */
export function createFishingRegionWorld(THREE, scene, region) {
    const root = new THREE.Group();
    root.name = `fishing-region-${region.id}`;
    scene.add(root);
    if (scene.fog) {
        scene.fog.near = 65;
        scene.fog.far = 190;
    }
    const volcanic = region.id === "volcanic";
    const grotto = region.id === "grotto";
    if (grotto && scene.fog) {
        scene.fog.near = 38;
        scene.fog.far = 115;
    }
    const ground = new THREE.PlaneGeometry(400, 400, 400, 400);
    ground.rotateX(-Math.PI / 2);
    const positions = ground.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index), z = positions.getZ(index);
        const outside = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - 39);
        const hills = grotto ? (1 - Math.exp(-outside / 16)) * (7 + Math.sin(x * .045 + z * .033) * 3) : 0;
        positions.setY(index, regionGroundAt(region, { x, z }) + hills);
    }
    ground.computeVertexNormals();
    const floor = new THREE.Mesh(ground, createSurfaceMaterial(THREE, { pattern: !volcanic ? "grass" : "dirt", colors: !volcanic ? (grotto ? ["#456348", "#405d43", "#647859", "#535b43"] : ["#487044", "#3c6139", "#75925b", "#5f573c"]) : ["#4a4850", "#383942", "#69616b", "#827079"], repeat: 7, roughness: 1, metalness: 0 }, { u: 400, v: 400 }));
    if (grotto) {
        const colors = [], color = new THREE.Color();
        const earth = new THREE.Color("#a7a18a"), green = new THREE.Color("#d6dfc5");
        for (let index = 0; index < positions.count; index++) {
            const x = positions.getX(index), z = positions.getZ(index);
            const patch = Math.sin(x * .28 + Math.sin(z * .17)) * Math.cos(z * .31 - x * .12);
            color.copy(earth).lerp(green, .5 + patch * .5);
            colors.push(color.r, color.g, color.b);
        }
        ground.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        floor.material.vertexColors = true;
    }
    floor.receiveShadow = true;
    root.add(floor);
    const waterTime = { value: 0 };
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: { daylight: { value: Math.min(1, scene.children.find((object) => object.isHemisphereLight)?.intensity ?? 1) }, grotto: { value: grotto ? 1 : 0 }, time: waterTime, tint: { value: new THREE.Color(grotto ? "#399b89" : region.water) } },
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
        vertexShader: `varying vec2 uvWater; void main(){ uvWater=(modelMatrix*vec4(position,1.)).xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform float time; uniform float grotto; uniform float daylight; uniform vec3 tint; varying vec2 uvWater;
      void main(){ float ripple=(sin(uvWater.x*2.4+uvWater.y*.8+time*.7)+sin(uvWater.y*3.1-uvWater.x*.6-time*.9)+sin(uvWater.x*1.2-uvWater.y*1.7+time*.4))/3.;
      float sparkle=pow(max(0.,ripple),18.); vec3 color=tint+vec3(ripple*.025+sparkle*.12);
      if(grotto>.5){ float reflection=sin(uvWater.x*.19+sin(uvWater.y*.24)+ripple*.15)*.5+.5;
        color=(mix(tint*.72,vec3(.24,.48,.40),reflection*.5)+vec3(sparkle*.14))*daylight; }
      gl_FragColor=vec4(color,grotto>.5?.9:.82); }`,
    });
    for (const pool of region.pools) {
        const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 96), waterMaterial);
        surface.rotation.x = -Math.PI / 2;
        surface.scale.set(pool.rx, pool.rz, 1);
        surface.position.set(pool.x, -0.3, pool.z);
        root.add(surface);
        if (grotto)
            continue;
        const shorePositions = [];
        for (let step = 0; step < 160; step += 1) {
            const angle = (step + 0.5) / 160 * Math.PI * 2;
            const outer = { x: pool.x + Math.cos(angle) * pool.rx * 1.025, z: pool.z + Math.sin(angle) * pool.rz * 1.025 };
            if (regionWaterDistance(region, outer) > 0)
                continue;
            const a = step / 160 * Math.PI * 2, b = (step + 1) / 160 * Math.PI * 2;
            const at = (angle, scale) => [pool.x + Math.cos(angle) * pool.rx * scale, 0.018, pool.z + Math.sin(angle) * pool.rz * scale];
            shorePositions.push(...at(a, 1), ...at(b, 1), ...at(a, 1.04), ...at(a, 1.04), ...at(b, 1), ...at(b, 1.04));
        }
        const shoreGeometry = new THREE.BufferGeometry();
        shoreGeometry.setAttribute("position", new THREE.Float32BufferAttribute(shorePositions, 3));
        shoreGeometry.computeVertexNormals();
        root.add(new THREE.Mesh(shoreGeometry, new THREE.MeshStandardMaterial({ color: volcanic ? "#92838b" : "#a1b28a", roughness: 1, side: THREE.DoubleSide })));
    }
    const rockMaterial = new THREE.MeshStandardMaterial({ color: region.rock, roughness: 0.95, flatShading: true });
    const moss = new THREE.MeshStandardMaterial({ color: volcanic ? "#66456c" : "#63915b", roughness: 1 });
    function rock(x, y, z, sx, sy, sz) {
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), rockMaterial);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.rotation.y = x * 0.31;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        return mesh;
    }
    // An enclosing skyline beyond the walkable boundary; pools remain fully accessible.
    for (let index = 0; index < (grotto ? 0 : 19); index += 1) {
        const x = -43 + index * 4.8;
        const height = volcanic ? 7 + (index % 5) * 2.3 : 9 + Math.sin(index * 1.7) * 3;
        rock(x, height / 2 - 1, -39 - (index % 3) * 1.4, 5, height, 5.5);
        if (!volcanic && index % 2 === 0) {
            const tree = createTree(THREE, index + 61);
            tree.position.set(x, height + 1, -40);
            tree.scale.setScalar(1.1);
            root.add(tree);
        }
    }
    for (let index = 0; index < (grotto ? 0 : 60); index += 1) {
        const pool = region.pools[index % region.pools.length];
        const angle = index * 2.399;
        const x = pool.x + Math.cos(angle) * pool.rx * 0.985, z = pool.z + Math.sin(angle) * pool.rz * 0.985;
        if (regionWaterDistance(region, { x, z }) > 0.65)
            continue;
        const size = 0.35 + index % 4 * 0.14;
        rock(x, -0.05, z, size * 1.3, size * 0.7, size);
    }
    // Dense vegetation outside the playable boundary frames the pools without blocking routes.
    for (let index = 0; index < (grotto ? 0 : 36); index += 1) {
        const angle = index / 36 * Math.PI * 2;
        const x = Math.cos(angle) * 45, z = Math.sin(angle) * 43;
        if (z < -30 || (Math.abs(z - 20) < 5))
            continue;
        const tree = createTree(THREE, index + 150);
        tree.position.set(x, 0, z);
        tree.scale.setScalar(volcanic ? 1.2 : 1.8);
        root.add(tree);
    }
    const animated = [];
    if (region.id === "grotto") {
        animated.push(createFernfallScenery(THREE, root, region, waterTime));
    }
    else if (volcanic) {
        // Palms are bank landmarks and have matching solid trunks in the scene data.
        const palmWood = new THREE.MeshStandardMaterial({ color: "#80664f", roughness: 0.95 });
        const palmLeaf = new THREE.MeshStandardMaterial({ color: "#52775d", roughness: 0.9, side: THREE.DoubleSide });
        for (const tree of regionShoreTrees(region)) {
            const palm = new THREE.Group();
            palm.position.set(tree.x, 0, tree.z);
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 5.5, 9), palmWood);
            trunk.position.y = 2.75;
            trunk.castShadow = true;
            palm.add(trunk);
            for (let frond = 0; frond < 7; frond += 1) {
                const angle = frond / 7 * Math.PI * 2 + tree.x;
                const vertices = [];
                const at = (step, side) => {
                    const t = step / 12, reach = t * 4.5, width = Math.sin(t * Math.PI) * 0.55 * side;
                    return [Math.cos(angle) * reach - Math.sin(angle) * width, 5.5 + Math.sin(t * Math.PI) * 0.8 - t * t * 2, Math.sin(angle) * reach + Math.cos(angle) * width];
                };
                for (let step = 0; step < 12; step += 1)
                    vertices.push(...at(step, -1), ...at(step + 1, -1), ...at(step, 1), ...at(step, 1), ...at(step + 1, -1), ...at(step + 1, 1));
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
                geometry.computeVertexNormals();
                const leaf = new THREE.Mesh(geometry, palmLeaf);
                leaf.castShadow = true;
                palm.add(leaf);
            }
            root.add(palm);
        }
        // Basalt organ pipes and luminous coral give this lagoon its own silhouette.
        for (let index = 0; index < 22; index += 1) {
            const height = 3 + (Math.sin(index * 3.1) + 1) * 3;
            const column = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, height, 6), rockMaterial);
            column.position.set(-29 + index * 2.7, height / 2, -32 - Math.sin(index) * 2);
            column.castShadow = true;
            root.add(column);
        }
        const glowColors = ["#a2e8d8", "#e88ab5", "#a691ed"];
        for (let index = 0; index < 42; index += 1) {
            const pool = region.pools[index % region.pools.length];
            const angle = index * 2.399;
            const x = pool.x + Math.cos(angle) * pool.rx * 0.75, z = pool.z + Math.sin(angle) * pool.rz * 0.75;
            const color = glowColors[index % 3];
            const coral = new THREE.Mesh(new THREE.ConeGeometry(0.18 + index % 3 * 0.08, 0.8 + index % 4 * 0.2, 5), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.5 }));
            coral.position.set(x, -0.9, z);
            coral.rotation.z = Math.sin(index) * 0.3;
            root.add(coral);
        }
    }
    if (region.requiredProperty) {
        for (const { x, z } of regionShoreTrees(region)) {
            const tree = region.id === "cedar-creek" ? createPine(THREE, Math.abs(x * 5 + z)) : createWillow(THREE, Math.abs(x + z * 3));
            tree.position.set(x, 0, z);
            tree.scale.setScalar(1.5);
            root.add(tree);
        }
    }
    // Low ferns / crystal clusters dress the shore without blocking casting routes.
    for (let index = 0; index < (grotto ? 0 : 80); index += 1) {
        const angle = index * 2.399;
        const radius = 24 + (index % 9) * 1.1;
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        if (regionWaterDistance(region, { x, z }) > -1.4 || Math.abs(z - 20) < 4)
            continue;
        const plant = new THREE.Group();
        plant.position.set(x, 0, z);
        for (let leaf = 0; leaf < 5; leaf += 1) {
            const mesh = new THREE.Mesh(new THREE.ConeGeometry(volcanic ? 0.15 : 0.3, volcanic ? 1.1 : 0.8, volcanic ? 4 : 3), moss);
            mesh.rotation.z = 0.6;
            mesh.rotation.y = leaf * Math.PI * 0.4;
            mesh.position.y = 0.35;
            plant.add(mesh);
        }
        root.add(plant);
    }
    // A broad dry path follows the southern bank to the Cove exit.
    bankTrail(THREE, root, region.exit.x > 0 ? 23 : -23, 20, 28, (point) => regionGroundAt(region, point));
    destinationSign(THREE, root, region.requiredProperty ? "YOUR FARM  /  RETURN PATH" : "THE COVE  / RETURN PATH", region.exit.x > 0 ? 32 : -32, 16, region.exit.x > 0 ? -0.2 : 0.2);
    // Arrival marker looks back toward the destination, away from the narrow exit.
    destinationSign(THREE, root, region.title.toUpperCase(), region.spawn.x * 0.72, 25);
    return {
        update(_dt, seconds) { waterTime.value = seconds; for (const animate of animated)
            animate(seconds); },
        dispose() {
            root.traverse((object) => { object.geometry?.dispose?.(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) {
                material?.map?.dispose?.();
                material?.dispose?.();
            } });
            root.removeFromParent();
        },
    };
}
/** Textured, gently winding trail with irregular edges and tapered ends. */
function bankTrail(THREE, root, centerX, centerZ, length, heightAt) {
    const vertices = [], uv = [];
    const steps = 48;
    const at = (step, side) => {
        const t = step / steps;
        const x = centerX + (t - 0.5) * length;
        const width = Math.pow(Math.sin(Math.PI * t), 0.35) * (1.15 + Math.sin(t * 13 + side) * 0.09 + Math.sin(t * 27) * 0.035);
        const z = centerZ + Math.sin(t * Math.PI * 2) * 0.3 + side * width;
        return [x, heightAt({ x, z }) + 0.018, z];
    };
    for (let step = 0; step < steps; step += 1) {
        for (const [index, side] of [[step, -1], [step, 1], [step + 1, -1], [step, 1], [step + 1, 1], [step + 1, -1]]) {
            vertices.push(...at(index, side));
            uv.push(index / steps, (side + 1) / 2);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const material = createSurfaceMaterial(THREE, { pattern: "dirt", colors: ["#968365", "#a39170", "#786c51", "#b3a17d"], repeat: 3, roughness: 1, metalness: 0 }, { u: length, v: 2.4 });
    const trail = new THREE.Mesh(geometry, material);
    trail.receiveShadow = true;
    root.add(trail);
}
