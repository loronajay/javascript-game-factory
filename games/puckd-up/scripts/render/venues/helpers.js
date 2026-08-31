// Geometry helpers are visual only; venues never add physics bodies.
export function createVenueHelpers(THREE) {
    function makeStd(color, { roughness = .55, metalness = .05, emissive = 0x000000, emissiveIntensity = 0, transparent = false, opacity = 1 } = {}) {
        return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity, transparent, opacity });
    }
    function addBox(group, size, pos, material, rotation = [0, 0, 0]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.position.set(...pos);
        mesh.rotation.set(...rotation);
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    }
    function addCylinder(group, radius, height, pos, material, segments = 16) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
        mesh.position.set(...pos);
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    }
    function addInstancedBoxes(group, transforms, material, base = [1, 1, 1]) {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...base), material, transforms.length);
        const dummy = new THREE.Object3D();
        transforms.forEach((t, i) => {
            dummy.position.set(t.x, t.y, t.z);
            dummy.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
            dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    }
    function makePoints(group, count, color, spread, center, size = .06, seed = 1) {
        let state = seed >>> 0;
        const rand = () => {
            state = (1664525 * state + 1013904223) >>> 0;
            return state / 4294967296;
        };
        const a = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            a[i * 3] = center[0] + (rand() - .5) * spread[0];
            a[i * 3 + 1] = center[1] + (rand() - .5) * spread[1];
            a[i * 3 + 2] = center[2] + (rand() - .5) * spread[2];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: .8, depthWrite: false });
        const pts = new THREE.Points(g, m);
        group.add(pts);
        return pts;
    }
    function addSkyDome(group, { top = 0x07122b, bottom = 0x304b72, horizon = 0x172942, radius = 46, y = 6, z = -5 } = {}) {
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, fog: false,
            uniforms: { topColor: { value: new THREE.Color(top) }, bottomColor: { value: new THREE.Color(bottom) }, horizonColor: { value: new THREE.Color(horizon) } },
            vertexShader: `varying float vY; void main(){vY=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
            fragmentShader: `uniform vec3 topColor;uniform vec3 bottomColor;uniform vec3 horizonColor;varying float vY;void main(){float low=smoothstep(-0.18,0.26,vY);float high=smoothstep(0.15,0.78,vY);vec3 c=mix(bottomColor,horizonColor,low);c=mix(c,topColor,high);gl_FragColor=vec4(c,1.0);}`
        });
        const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 18), mat);
        sky.position.set(0, y, z);
        sky.renderOrder = -10;
        group.add(sky);
        return sky;
    }
    function addNeonStrip(group, size, pos, color, intensity = 1.5, rotation = [0, 0, 0]) {
        const mat = new THREE.MeshStandardMaterial({ color, roughness: .18, metalness: .35, emissive: color, emissiveIntensity: intensity });
        const mesh = addBox(group, size, pos, mat, rotation);
        return { mesh, mat };
    }
    function addLampPost(group, x, z, color = 0xffe1a8) {
        const pole = makeStd(0x2b3035, { roughness: .55, metalness: .65 });
        addBox(group, [.10, 3.6, .10], [x, 1.25, z], pole);
        const head = makeStd(color, { roughness: .15, metalness: .2, emissive: color, emissiveIntensity: 1.8 });
        addBox(group, [.55, .10, .25], [x, 3.0, z], head);
    }
    return { makeStd, addBox, addCylinder, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip, addLampPost };
}
