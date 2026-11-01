import { createTree, createWillow } from "./farm-props-plants.mjs";
import { regionWaterDistance, regionShoreTrees } from "./farm-fishing-regions.mjs";
/** Fernfall's scenery stays outside the walking banks; the shared pool/cast geometry is unchanged. */
export function createFernfallScenery(THREE, root, region, time) {
    const daylight = Math.min(1, root.parent?.children.find((object) => object.isHemisphereLight)?.intensity ?? 1);
    let seed = 781;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const stone = ["#526862", "#617770", "#435b57", "#71817a"].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    const moss = new THREE.MeshStandardMaterial({ color: "#698656", roughness: 1 });
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    function boulder(x, y, z, sx, sy, sz, green = false) {
        const mesh = new THREE.Mesh(geometry, green ? moss : stone[Math.floor(random() * stone.length)]);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.rotation.set(random() * .16, random() * 6.28, random() * .12);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        return mesh;
    }
    // A continuous, terraced rock face gives the water an actual ravine to descend.
    const cliffVertices = [], cliffColors = [];
    const cliffTone = new THREE.Color();
    const heightAt = (x) => 11 + Math.exp(-(((x + 9) / 18) ** 2)) * 4.5 + Math.sin(x * .21) * 1.1 + Math.sin(x * .57) * .55;
    const face = (column, row) => {
        const x = -58 + column * 3.2;
        const t = row / 10, y = -.7 + t * heightAt(x);
        const channel = Math.exp(-(((x + 9) / 6) ** 4));
        const z = -34.5 - t * 3 + Math.sin(x * .35) * 1.2 + Math.sin(row * 2.3 + x * .4) * .45
            + channel * (5.3 + Math.exp(-(((y - 5) / 1.5) ** 2)) * 1.4);
        return [x + Math.sin(row * 1.9 + column) * .4, y, z];
    };
    for (let column = 0; column < 36; column++)
        for (let row = 0; row < 10; row++) {
            for (const [c, r] of [[column, row], [column + 1, row], [column, row + 1], [column, row + 1], [column + 1, row], [column + 1, row + 1]]) {
                cliffVertices.push(...face(c, r));
                const green = r >= 9;
                cliffTone.set(green ? "#617b50" : row % 3 === 0 ? "#74857a" : "#63786f");
                cliffTone.multiplyScalar(.9 + Math.sin(c * 3 + r * 7) * .08);
                cliffColors.push(cliffTone.r, cliffTone.g, cliffTone.b);
            }
        }
    const cliffGeo = new THREE.BufferGeometry();
    cliffGeo.setAttribute("position", new THREE.Float32BufferAttribute(cliffVertices, 3));
    cliffGeo.setAttribute("color", new THREE.Float32BufferAttribute(cliffColors, 3));
    cliffGeo.computeVertexNormals();
    const cliff = new THREE.Mesh(cliffGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, flatShading: true }));
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    root.add(cliff);
    for (let i = 0; i < 25; i++) {
        const x = -54 + i * 4.4, z = -35 + Math.sin(x * .35);
        if (Math.abs(x + 9) > 6)
            boulder(x, .8, z + 1, 2.3 + random(), 1.3 + random(), 2);
        if (i % 3 === 0) {
            const tree = createTree(THREE, 810 + i);
            tree.position.set(x, heightAt(x) - 1.8, -41);
            tree.scale.setScalar(1 + random() * .7);
            root.add(tree);
        }
    }
    // A shelf is rooted in the ravine, rather than floating in front of the water.
    boulder(-9, 5, -29.6, 4.2, .7, 2.3);
    boulder(-13, 5.1, -29.8, 1.4, .4, 1.7, true);
    const cascade = new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time, daylight: { value: daylight } }, transparent: true, side: THREE.DoubleSide, depthWrite: false,
        vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
        fragmentShader: `uniform float time; uniform float daylight; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        float edge=smoothstep(0.,.13,vUv.x)*smoothstep(0.,.13,1.-vUv.x)*smoothstep(0.,.035,1.-vUv.y);
        float threads=sin(vUv.x*119.+sin(vUv.y*12.-time*4.)*.8)*.5+.5;
        float flow=sin(vUv.y*65.+time*12.+sin(vUv.x*36.))* .5+.5;
        float foam=pow(1.-vUv.y,5.);
        vec3 color=mix(vec3(.29,.64,.61),vec3(.85,.96,.90),.38+threads*.3+foam*.3);
        gl_FragColor=vec4(color*daylight,edge*(.38+threads*.26+flow*.12+foam*.2));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`, fog: true,
    });
    function fall(top, bottom, z, width, flare) {
        const geo = new THREE.PlaneGeometry(width, top - bottom, 24, 32);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const t = (.5 - pos.getY(i) / (top - bottom));
            pos.setX(i, pos.getX(i) * (1 + flare * t) + Math.sin(t * 7) * .12);
            pos.setZ(i, t * t * 1.15 + Math.sin(pos.getX(i) * 5 + t * 8) * .08);
        }
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, cascade);
        mesh.position.set(-9, (top + bottom) / 2, z);
        root.add(mesh);
    }
    fall(12.8, 5.6, -29.1, 3.8, .16);
    fall(5.8, -.24, -26.6, 5.2, .36);
    // A soft radial texture serves both drifting spray and the low impact cloud.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(220,244,231,.6)");
    gradient.addColorStop(.4, "rgba(220,244,231,.22)");
    gradient.addColorStop(1, "rgba(220,244,231,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const sprayMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: .32 * daylight, depthWrite: false });
    const spray = [];
    for (let i = 0; i < 22; i++) {
        const sprite = new THREE.Sprite(sprayMaterial);
        sprite.userData.phase = random();
        sprite.userData.x = -9 + (random() - .5) * 7;
        sprite.userData.z = -25.2 + random() * 2;
        const size = 2 + random() * 3;
        sprite.scale.set(size, size * .65, 1);
        root.add(sprite);
        spray.push(sprite);
    }
    const rings = [];
    for (let i = 0; i < 5; i++) {
        const material = new THREE.MeshBasicMaterial({ color: "#d6eee0", transparent: true, opacity: .2, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 64), material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-9, -.275 + i * .001, -24.7);
        root.add(mesh);
        rings.push(mesh);
    }
    // A feathered, muted bank replaces the pale, perfectly solid ellipse border.
    for (const pool of region.pools) {
        const vertices = [], colors = [];
        const tones = ["#6e8270", "#87927a", "#52714e"].map(c => new THREE.Color(c));
        function vertex(step, band) {
            const a = step / 192 * Math.PI * 2;
            const offset = [0, .32, 1.05 + Math.sin(a * 17) * .22 + Math.sin(a * 9) * .15][band];
            const x = pool.x + Math.cos(a) * (pool.rx + offset), z = pool.z + Math.sin(a) * (pool.rz + offset);
            vertices.push(x, [.012, .025, .012][band], z);
            colors.push(tones[band].r, tones[band].g, tones[band].b);
        }
        for (let i = 0; i < 192; i++) {
            const a = (i + .5) / 192 * Math.PI * 2;
            if (regionWaterDistance(region, { x: pool.x + Math.cos(a) * (pool.rx + .15), z: pool.z + Math.sin(a) * (pool.rz + .15) }) > 0)
                continue;
            for (let band = 0; band < 2; band++)
                for (const [s, b] of [[i, band], [i + 1, band], [i, band + 1], [i, band + 1], [i + 1, band], [i + 1, band + 1]])
                    vertex(s, b);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
    }
    // One detailed fern mesh, instanced across natural clusters rather than cone-shaped weeds.
    const leaves = [];
    const triangle = (a, b, c) => leaves.push(...a, ...b, ...c);
    for (let frond = 0; frond < 8; frond++) {
        const a = frond / 8 * Math.PI * 2;
        const at = (t, side) => [Math.cos(a) * t * 1.05 - Math.sin(a) * side, Math.sin(t * Math.PI * .8) * .8 + .05, Math.sin(a) * t * 1.05 + Math.cos(a) * side];
        for (let j = 1; j < 10; j++) {
            const t = j / 11, w = Math.sin(t * Math.PI) * .23;
            for (const side of [-1, 1])
                triangle(at(t - .06, 0), at(t + .12, w * side), at(t + .055, 0));
        }
    }
    const fernGeo = new THREE.BufferGeometry();
    fernGeo.setAttribute("position", new THREE.Float32BufferAttribute(leaves, 3));
    fernGeo.computeVertexNormals();
    const fernMaterial = new THREE.MeshStandardMaterial({ color: "#729d59", roughness: 1, side: THREE.DoubleSide });
    const fern = new THREE.InstancedMesh(fernGeo, fernMaterial, 420);
    const dummy = new THREE.Object3D();
    let count = 0;
    for (let i = 0; i < 800 && count < 420; i++) {
        const x = (random() - .5) * 80, z = (random() - .5) * 76;
        const distance = regionWaterDistance(region, { x, z });
        if (distance > -1.2 || (Math.abs(z - 20) < 2.3 && x > 8) || distance < -12)
            continue;
        const cluster = Math.sin(x * .46 + z * .21) + Math.cos(z * .6 - x * .3);
        if (cluster < -.3)
            continue;
        dummy.position.set(x, 0, z);
        dummy.rotation.y = random() * 6.28;
        dummy.scale.setScalar(.45 + random() * .65);
        dummy.updateMatrix();
        fern.setMatrixAt(count, dummy.matrix);
        fern.setColorAt(count, new THREE.Color().setHSL(.24 + random() * .06, .3, .3 + random() * .16));
        count++;
        if (i % 7 === 0)
            boulder(x, .04, z, .5 + random(), .3 + random() * .3, .5 + random(), true);
    }
    fern.count = count;
    fern.receiveShadow = true;
    root.add(fern);
    // Irregular forest layers: keep trunks off playable routes and vary scale and silhouette.
    for (let i = 0; i < 45; i++) {
        const a = i / 45 * Math.PI * 2;
        const x = Math.cos(a) * (43 + random() * 8), z = Math.sin(a) * (43 + random() * 8);
        if (z < -33 || (x > 30 && Math.abs(z - 20) < 6))
            continue;
        const tree = i % 4 === 0 ? createWillow(THREE, i + 940) : createTree(THREE, i + 940);
        tree.position.set(x, -.1, z);
        tree.rotation.y = random() * 6.28;
        tree.scale.setScalar(1.4 + random() * 1.3);
        root.add(tree);
    }
    for (const [i, point] of regionShoreTrees(region).entries()) {
        const tree = i % 2 === 0 ? createWillow(THREE, 730 + i) : createTree(THREE, 730 + i);
        tree.position.set(point.x, 0, point.z);
        tree.rotation.y = random() * 6.28;
        tree.scale.setScalar(1.2 + random() * .45);
        root.add(tree);
    }
    // Beyond the exit trigger, the return trail disappears into forest rather than an empty horizon.
    for (let i = 0; i < 12; i++) {
        const x = 55 + random() * 14, z = -1 + i * 3.6;
        const y = (1 - Math.exp(-(x - 39) / 16)) * (7 + Math.sin(x * .045 + z * .033) * 3);
        const tree = createTree(THREE, i + 1150);
        tree.position.set(x, y, z);
        tree.scale.setScalar(1.8 + random() * .8);
        root.add(tree);
    }
    // Broken shoreline stones sit in little groups, leaving open casting banks.
    for (let i = 0; i < 85; i++) {
        const pool = region.pools[i % region.pools.length], a = random() * Math.PI * 2;
        const x = pool.x + Math.cos(a) * (pool.rx + .15), z = pool.z + Math.sin(a) * (pool.rz + .15);
        if (regionWaterDistance(region, { x, z }) > .1 || Math.sin(a * 5) < -.2)
            continue;
        const size = .25 + random() * .65;
        boulder(x, .02, z, size * 1.5, size * .55, size);
    }
    return (seconds) => {
        for (const sprite of spray) {
            const t = (seconds * .12 + sprite.userData.phase) % 1;
            sprite.position.set(sprite.userData.x + Math.sin(t * 5) * .6, .3 + t * 2.2, sprite.userData.z + t * 1.6);
        }
        for (const [i, ring] of rings.entries()) {
            const t = (seconds * .18 + i / rings.length) % 1;
            ring.scale.set(1 + t * 5, .65 + t * 3, 1);
            ring.material.opacity = (1 - t) * .23;
        }
    };
}
