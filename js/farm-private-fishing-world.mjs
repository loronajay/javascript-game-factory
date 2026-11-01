import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { createPine, createBirch, createWillow } from "./farm-props-plants.mjs";
import { regionGroundAt, regionWaterDistance, regionShoreTrees } from "./farm-fishing-regions.mjs";
import { privateFishingLayout } from "./farm-private-fishing-layout.mjs";
/** Private destinations have their own terrain and water, never farm props. */
export function createPrivateFishingWorld(THREE, scene, region) {
    const creek = region.id === "cedar-creek";
    const root = new THREE.Group();
    root.name = `private-fishing-${region.id}`;
    scene.add(root);
    scene.fog.near = creek ? 35 : 50;
    scene.fog.far = creek ? 115 : 160;
    const sun = scene.children.find((object) => object.isDirectionalLight && object.castShadow);
    if (sun) {
        Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, far: 150 });
        sun.shadow.camera.updateProjectionMatrix();
    }
    const ground = new THREE.PlaneGeometry(280, 280, 280, 280);
    ground.rotateX(-Math.PI / 2);
    const positions = ground.attributes.position;
    const colors = [], color = new THREE.Color();
    for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), z = positions.getZ(index);
        const outside = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - 38);
        const hills = (1 - Math.exp(-outside / 16)) * (creek ? 5 + Math.sin(x * .1) * 2 : 3 + Math.sin(x * .04 + z * .08));
        positions.setY(index, regionGroundAt(region, { x, z }) + hills);
        const bank = Math.max(0, Math.min(1, (regionWaterDistance(region, { x, z }) + 2) / 3));
        color.set(creek ? "#c5d0b6" : "#e1dfbe").lerp(new THREE.Color("#9b8b69"), bank * .8);
        color.multiplyScalar(.94 + Math.sin(x * .35 + z * .21) * .06);
        colors.push(color.r, color.g, color.b);
    }
    ground.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    const landMaterial = createSurfaceMaterial(THREE, { pattern: "grass", colors: creek ? ["#456544", "#526c45", "#71805a", "#5d654a"] : ["#73854e", "#839956", "#9b9e67", "#7c8051"], repeat: 6, roughness: 1, metalness: 0 }, { u: 280, v: 280 });
    landMaterial.vertexColors = true;
    const land = new THREE.Mesh(ground, landMaterial);
    land.receiveShadow = true;
    root.add(land);
    const time = { value: 0 };
    const daylight = Math.min(1, scene.children.find((object) => object.isHemisphereLight)?.intensity ?? 1);
    const pools = Array.from({ length: 3 }, (_, i) => { const p = region.pools[i]; return p ? new THREE.Vector4(p.x, p.z, p.rx, p.rz) : new THREE.Vector4(0, 0, .001, .001); });
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: { time, daylight: { value: daylight }, poolCount: { value: region.pools.length }, pools: { value: pools }, tint: { value: new THREE.Color(region.water) } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `varying vec2 worldXZ; void main() { vec4 p = modelMatrix * vec4(position, 1.); worldXZ = p.xz; gl_Position = projectionMatrix * viewMatrix * p; }`,
        fragmentShader: `uniform float time; uniform float daylight; uniform int poolCount; uniform vec4 pools[3]; uniform vec3 tint; varying vec2 worldXZ;
      void main() { float bank = -100.; for(int i=0;i<3;i++) { if(i>=poolCount) break; vec4 p=pools[i]; bank=max(bank,(1.-length((worldXZ-p.xy)/p.zw))*min(p.z,p.w)); }
      if(bank<0.) discard;
      float waves=sin(worldXZ.x*1.6+time*.65)*sin(worldXZ.y*1.1-time*.45);
      float reflection=sin(worldXZ.x*.18+sin(worldXZ.y*.13)+waves*.12)*.5+.5;
      vec3 shallow=mix(vec3(.32,.40,.25),tint,.55); vec3 deep=mix(tint*.63,vec3(.15,.32,.30),.25);
      vec3 water=mix(shallow,deep,smoothstep(0.,7.,bank)); water+=vec3(.13,.17,.15)*reflection+vec3(.035)*waves;
      gl_FragColor=vec4(water*daylight,.68+smoothstep(0.,5.,bank)*.08); }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(76, 74), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -.3;
    water.name = "private-fishing-water";
    root.add(water);
    // The actual playable trunks come from the same data as collision.
    for (const [index, point] of regionShoreTrees(region).entries()) {
        const tree = creek ? (index % 3 ? createPine(THREE, index + 300) : createBirch(THREE, index + 300)) : createWillow(THREE, index + 300);
        tree.position.set(point.x, 0, point.z);
        tree.scale.setScalar(creek ? 1.35 : 1.1);
        root.add(tree);
    }
    // Layered woodland beyond the walking boundary closes the horizon naturally.
    for (let index = 0; index < (creek ? 84 : 48); index++) {
        const angle = index * 2.399, radius = 44 + index % 4 * 7;
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        if (Math.abs(x - region.exit.x) < 5 && Math.abs(z - region.exit.z) < 14)
            continue;
        const tree = creek ? createPine(THREE, index + 700) : (index % 3 ? createBirch(THREE, index + 700) : createWillow(THREE, index + 700));
        tree.position.set(x, Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - 38) * .09, z);
        tree.scale.setScalar((creek ? 1.8 : 1.5) + index % 3 * .2);
        root.add(tree);
    }
    const stone = new THREE.MeshStandardMaterial({ color: region.rock, roughness: 1, flatShading: true });
    // Submerged stones and reeds give depth without blocking the casting banks.
    for (let index = 0; index < 55; index++) {
        const pool = region.pools[index % region.pools.length];
        const angle = index * 2.399, radius = .72 + (Math.sin(index * 17.31) * .5 + .5) * .23;
        const x = pool.x + Math.cos(angle) * pool.rx * radius, z = pool.z + Math.sin(angle) * pool.rz * radius;
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(.35 + index % 3 * .12, 1), stone);
        rock.position.set(x, regionGroundAt(region, { x, z }) - .08, z);
        rock.scale.set(1.4, .55, 1);
        root.add(rock);
    }
    const reedMaterial = new THREE.MeshStandardMaterial({ color: creek ? "#718451" : "#869259", roughness: 1, side: THREE.DoubleSide });
    for (let index = 0; index < 80; index++) {
        const pool = region.pools[index % region.pools.length], angle = index * 2.399;
        const x = pool.x + Math.cos(angle) * pool.rx * 1.01, z = pool.z + Math.sin(angle) * pool.rz * 1.01;
        if (Math.hypot(x - region.fishingSpot.x, z - region.fishingSpot.z) < 5 || regionWaterDistance(region, { x, z }) > 0)
            continue;
        for (let blade = 0; blade < 3; blade++) {
            const reed = new THREE.Mesh(new THREE.PlaneGeometry(.08, .6 + blade * .16), reedMaterial);
            reed.position.set(x + blade * .12, .25 + blade * .08, z);
            reed.rotation.y = blade * 2.1 + index;
            reed.rotation.z = .15;
            root.add(reed);
        }
    }
    // The entrance path continues all the way to the casting bank.
    const shore = privateFishingLayout(region).path.at(-1);
    const dx = region.exit.x - shore.x, dz = region.exit.z - shore.z;
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(2, Math.hypot(dx, dz)), createSurfaceMaterial(THREE, { pattern: "dirt", colors: ["#9d8d70", "#aa9a7d", "#8e8064", "#b4a88b"], repeat: 3, roughness: 1, metalness: 0 }, { u: 2, v: 18 }));
    trail.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
    trail.position.set((region.exit.x + shore.x) / 2, .012, (region.exit.z + shore.z) / 2);
    trail.receiveShadow = true;
    root.add(trail);
    return {
        update(_dt, seconds) { time.value = seconds; },
        dispose() { root.traverse((object) => { object.geometry?.dispose?.(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            material?.map?.dispose?.();
            material?.dispose?.();
        } }); root.removeFromParent(); },
    };
}
