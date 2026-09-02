// Geometry helpers are visual only; venues never add physics bodies.
export const SURFACE_RECIPES = Object.freeze({
    rubber: { roughness: .74, metalness: .03 },
    arcadeCarpet: { roughness: .92, metalness: 0 },
    acrylic: { roughness: .24, metalness: .16 },
    tournamentComposite: { roughness: .30, metalness: .24 },
    outdoorComposite: { roughness: .48, metalness: .05 },
    rooftopResin: { roughness: .38, metalness: .12 },
    garageLaminate: { roughness: .34, metalness: .10 },
    boardwalkComposite: { roughness: .40, metalness: .08 },
    yardComposite: { roughness: .46, metalness: .10 },
    zeroGComposite: { roughness: .28, metalness: .24 },
    arenaFloor: { roughness: .52, metalness: .10 },
    grass: { roughness: .96, metalness: 0 },
    roofing: { roughness: .72, metalness: .16 },
    concrete: { roughness: .9, metalness: .02 },
    wood: { roughness: .84, metalness: .01 },
    asphalt: { roughness: .94, metalness: .01 },
    spacePanels: { roughness: .34, metalness: .62 },
    corrugated: { roughness: .64, metalness: .38 },
    paintedMetal: { roughness: .5, metalness: .45 },
    water: { roughness: .26, metalness: .12 },
});

function rgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function hash(x, y, seed) {
    let value = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y + seed * 29, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function mixColor(base, accent, amount, light = 1) {
    return base.map((channel, i) => Math.max(0, Math.min(255, Math.round((channel + (accent[i] - channel) * amount) * light))));
}

function sampleSurface(kind, x, y, size, seed) {
    const grain = hash(x, y, seed);
    const coarse = hash(Math.floor(x / 4), Math.floor(y / 4), seed + 41);
    let accent = 0;
    let light = .88 + grain * .22;
    if (kind === 'rubber') {
        const seam = x % 32 < 2 || y % 32 < 2;
        accent = seam ? .62 : (grain > .965 ? .32 : 0);
        light = seam ? .60 : .89 + coarse * .14;
    }
    else if (kind === 'arcadeCarpet') {
        const cellX = (x + seed * 3) % 32, cellY = (y + seed * 5) % 32;
        const slash = cellX > 4 && cellX < 14 && Math.abs(cellY - (cellX * 1.45 - 3)) < 1.5;
        const chevron = cellX > 19 && Math.abs(cellY - Math.abs(cellX - 25) * 1.35 - 8) < 1.4;
        const confetti = grain > .982;
        accent = confetti ? .90 : (slash || chevron ? .62 : 0);
        light = .78 + grain * .16;
    }
    else if (kind === 'acrylic') {
        const frost = grain > .965 || grain < .025;
        accent = frost ? .24 : 0;
        light = .97 + grain * .06;
    }
    else if (kind === 'tournamentComposite') {
        const weaveA = (x + y + seed) % 10 < 2;
        const weaveB = (x - y + size * 2 + seed) % 10 < 2;
        const fleck = grain > .985;
        accent = fleck ? .34 : (weaveA && weaveB ? .18 : (weaveA || weaveB ? .07 : 0));
        light = .91 + grain * .09;
    }
    else if (kind === 'outdoorComposite') {
        const fleck = grain > .965 || grain < .028;
        const scuff = Math.sin(x * .22 + y * .13 + seed) > .94 && coarse > .72;
        accent = fleck ? .22 : (scuff ? .10 : 0);
        light = .88 + grain * .13;
    }
    else if (kind === 'rooftopResin') {
        const aggregate = grain > .955 || grain < .025;
        const rollerMark = Math.sin(x * .16 + y * .07 + seed) > .965;
        accent = aggregate ? .24 : (rollerMark ? .08 : 0);
        light = .90 + grain * .11;
    }
    else if (kind === 'garageLaminate') {
        const flake = grain > .97 || grain < .02;
        const buffMark = Math.sin(x * .11 + y * .19 + seed) > .975;
        accent = flake ? .20 : (buffMark ? .07 : 0);
        light = .91 + grain * .10;
    }
    else if (kind === 'boardwalkComposite') {
        const saltFleck = grain > .965 || grain < .018;
        const brushed = Math.sin(x * .18 + y * .05 + seed) > .97;
        accent = saltFleck ? .22 : (brushed ? .08 : 0);
        light = .90 + grain * .11;
    }
    else if (kind === 'yardComposite') {
        const mineral = grain > .96 || grain < .02;
        const drag = Math.sin(x * .09 + y * .21 + seed) > .975;
        accent = mineral ? .23 : (drag ? .08 : 0);
        light = .89 + grain * .12;
    }
    else if (kind === 'zeroGComposite') {
        const microPanel = x % 48 < 1 || y % 48 < 1;
        const sparkle = grain > .978;
        accent = microPanel ? .18 : (sparkle ? .26 : 0);
        light = .93 + grain * .09;
    }
    else if (kind === 'arenaFloor') {
        const weave = (x + y) % 12 < 2 || (x - y + size) % 12 < 2;
        accent = weave ? .14 : (grain > .985 ? .28 : 0);
        light = .91 + coarse * .13;
    }
    else if (kind === 'grass') {
        const blade = (x * 7 + y * 13 + seed) % 19 < 3;
        accent = blade ? .24 : 0;
        light = .76 + grain * .34 + (Math.floor(x / 16) % 2 ? .025 : -.025);
    }
    else if (kind === 'roofing') {
        const seam = x % 40 < 2 || y % 40 < 2;
        accent = seam ? .52 : (grain > .97 ? .18 : 0);
        light = seam ? .65 : .82 + grain * .23;
    }
    else if (kind === 'concrete') {
        const aggregate = grain > .96;
        const crack = Math.abs(y - ((x * 5 + seed * 7) % size)) < 1 && coarse > .62;
        accent = crack ? .76 : (aggregate ? .38 : 0);
        light = .82 + grain * .24;
    }
    else if (kind === 'wood') {
        const seam = y % 24 < 2;
        const grainLine = Math.sin(x * .38 + y * .08 + coarse * 5) > .82;
        const nail = (x % 48 < 2 || x % 48 > 46) && (y % 24 < 4);
        accent = nail ? .82 : (seam ? .68 : (grainLine ? .24 : 0));
        light = seam ? .66 : .82 + grain * .24;
    }
    else if (kind === 'asphalt') {
        const pebble = grain > .93 || grain < .035;
        const crack = Math.abs(y - ((x * 3 + seed * 11) % size)) < 1 && coarse > .72;
        accent = crack ? .74 : (pebble ? .30 : 0);
        light = .75 + grain * .28;
    }
    else if (kind === 'spacePanels') {
        const seam = x % 32 < 2 || y % 32 < 2;
        const hatch = (x + y) % 32 < 2 && x % 32 > 18;
        accent = seam ? .64 : (hatch ? .25 : 0);
        light = seam ? .62 : .88 + coarse * .15;
    }
    else if (kind === 'corrugated') {
        const rib = x % 12;
        light = .72 + Math.sin(rib / 12 * Math.PI) * .32;
        accent = grain > .985 ? .5 : 0;
    }
    else if (kind === 'paintedMetal') {
        const scratch = (x * 3 + y * 11 + seed) % 97 < 2;
        accent = scratch ? .42 : (grain > .985 ? .22 : 0);
        light = .84 + coarse * .20;
    }
    else if (kind === 'water') {
        const wave = Math.sin(y * .42 + Math.sin(x * .16) * 2.4);
        accent = wave > .76 ? .18 : 0;
        light = .82 + (wave + 1) * .10;
    }
    return { accent, light };
}

function createSurfaceTexture(THREE, kind, color, accentColor, { size = 96, repeat = [4, 4], seed = 1 } = {}) {
    if (!THREE.DataTexture || !THREE.RGBAFormat)
        return null;
    const base = rgb(color), accent = rgb(accentColor);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const sample = sampleSurface(kind, x, y, size, seed);
            const pixel = mixColor(base, accent, sample.accent, sample.light);
            const offset = (y * size + x) * 4;
            data[offset] = pixel[0];
            data[offset + 1] = pixel[1];
            data[offset + 2] = pixel[2];
            data[offset + 3] = 255;
        }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (THREE.LinearFilter) texture.magFilter = THREE.LinearFilter;
    if (THREE.LinearMipmapLinearFilter) texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

export function createVenueHelpers(THREE) {
    function makeStd(color, { roughness = .55, metalness = .05, emissive = 0x000000, emissiveIntensity = 0, transparent = false, opacity = 1 } = {}) {
        return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity, transparent, opacity });
    }
    function makeSurface(kind, color, { accent = 0x151515, repeat = [4, 4], size = 96, seed = 1, ...options } = {}) {
        const recipe = SURFACE_RECIPES[kind] || {};
        const map = createSurfaceTexture(THREE, kind, color, accent, { repeat, size, seed });
        const material = makeStd(map ? 0xffffff : color, { ...recipe, ...options });
        if (map) material.map = map;
        material.userData.surfaceKind = kind;
        return material;
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
    return { makeStd, makeSurface, addBox, addCylinder, addInstancedBoxes, makePoints, addSkyDome, addNeonStrip, addLampPost };
}
