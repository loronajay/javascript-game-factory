export function createScene(THREE, canvas, gamewrap) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a0e);
    scene.fog = new THREE.Fog(0x070a0e, 22, 42);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 70);
    camera.position.set(0, 15.4, 15.8);
    camera.lookAt(0, 0, 0);
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x11151b, 1.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-5, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const cool = new THREE.PointLight(0x3f82a8, 22, 21, 2);
    cool.position.set(-5, 4, -6);
    scene.add(cool);
    const warm = new THREE.PointLight(0xa84747, 18, 19, 2);
    warm.position.set(5, 4, 6);
    scene.add(warm);
    // Camera modes. `match` is the framing a match is actually played at and is
    // the default everywhere; the two inspect modes are the Garage orbiting a
    // mallet or a half, on the SAME scene and the same camera, so what a player
    // lines up in the editor is what the match will show.
    const ORBIT_BOUNDS = { pitchMin: .12, pitchMax: 1.42, distanceMin: 2.2, distanceMax: 26 };
    // `target` is what the camera orbits; `look` is what it points at. They are
    // usually the same, and differ only when a subject has to be FRAMED away
    // from the centre — the phone drawer covers the bottom of the canvas, so the
    // player's own half is pushed into the visible upper band by looking at a
    // point nearer the camera than the half itself.
    const orbit = { yaw: 0, pitch: .62, distance: 5.4, target: new THREE.Vector3(), look: new THREE.Vector3() };
    let mode = 'match', matchFov = 40, matchPosition = [0, 15.4, 15.8];
    // How much of the canvas the scene is framed into, measured from the TOP.
    // The phone Garage is a drawer over the bottom of the canvas, so rendering
    // into the strip above it is what puts the player's own half where they can
    // see it — nudging the camera only slides the subject around inside a frame
    // that is still the wrong shape.
    let viewportBand = 1;

    function applyCamera() {
        if (mode === 'match') {
            camera.fov = matchFov;
            camera.position.set(...matchPosition);
            camera.lookAt(0, 0, 0);
        }
        else {
            camera.fov = 38;
            const horizontal = Math.cos(orbit.pitch) * orbit.distance;
            camera.position.set(
                orbit.target.x + Math.sin(orbit.yaw) * horizontal,
                orbit.target.y + Math.sin(orbit.pitch) * orbit.distance,
                orbit.target.z + Math.cos(orbit.yaw) * horizontal,
            );
            camera.lookAt(orbit.look);
        }
        camera.updateProjectionMatrix();
    }

    function resize() {
        const r = gamewrap.getBoundingClientRect();
        const w = Math.max(320, Math.floor(r.width)), h = Math.max(260, Math.floor(r.height));
        renderer.setSize(w, h, false);
        const bandHeight = Math.max(120, Math.round(h * viewportBand));
        // WebGL measures the viewport from the bottom, so a top-anchored band
        // starts at the height left over beneath it.
        renderer.setViewport(0, h - bandHeight, w, bandHeight);
        renderer.setScissor(0, h - bandHeight, w, bandHeight);
        renderer.setScissorTest(viewportBand < 1);
        camera.aspect = w / bandHeight;
        // Dynamically pull the camera back on narrow/tall cabinets so BOTH goal mouths stay visible.
        const aspect = w / h;
        if (aspect < 1.15) {
            matchFov = 47;
            matchPosition = [0, 18.6, 17.7];
        }
        else if (aspect < 1.45) {
            matchFov = 43;
            matchPosition = [0, 17.0, 16.7];
        }
        else {
            matchFov = 40;
            matchPosition = [0, 15.4, 15.8];
        }
        applyCamera();
    }

    /** `match`, or an inspect mode orbiting `target` from `distance` metres. */
    function setCameraMode(next, { target = [0, 0, 0], distance = orbit.distance, look = null } = {}) {
        mode = next === 'match' ? 'match' : 'inspect';
        orbit.target.set(...target);
        orbit.look.set(...(look ?? target));
        orbit.distance = Math.min(ORBIT_BOUNDS.distanceMax, Math.max(ORBIT_BOUNDS.distanceMin, distance));
        applyCamera();
    }

    function orbitBy(deltaYaw, deltaPitch) {
        if (mode === 'match') return;
        orbit.yaw += deltaYaw;
        orbit.pitch = Math.min(ORBIT_BOUNDS.pitchMax, Math.max(ORBIT_BOUNDS.pitchMin, orbit.pitch + deltaPitch));
        applyCamera();
    }

    /** Frame the scene into the top `fraction` of the canvas. 1 is the whole thing. */
    function setViewportBand(fraction) {
        const next = Math.min(1, Math.max(0.2, Number(fraction) || 1));
        if (next === viewportBand) return;
        viewportBand = next;
        renderer.clear();
        resize();
    }

    function zoomBy(factor) {
        if (mode === 'match') return;
        orbit.distance = Math.min(ORBIT_BOUNDS.distanceMax, Math.max(ORBIT_BOUNDS.distanceMin, orbit.distance * factor));
        applyCamera();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(gamewrap);
    window.addEventListener('resize', resize);
    resize();
    function dispose() {
        observer.disconnect();
        window.removeEventListener('resize', resize);
        // Shared geometries/materials (including instancing) dispose once.
        const geometries = new Set(), materials = new Set(), textures = new Set();
        scene.traverse(object => {
            if (object.geometry)
                geometries.add(object.geometry);
            if (object.material)
                for (const material of [object.material].flat())
                    materials.add(material);
            if (object.userData?.fieldMap)
                textures.add(object.userData.fieldMap);
            if (object.isInstancedMesh)
                object.dispose();
            if (object.shadow)
                object.shadow.dispose();
        });
        for (const geometry of geometries)
            geometry.dispose();
        for (const material of materials) {
            if (material.map) textures.add(material.map);
            material.dispose();
        }
        for (const texture of textures)
            texture.dispose();
        renderer.dispose();
    }
    return { scene, renderer, camera, hemi, key, cool, warm, resize, setCameraMode, setViewportBand, orbitBy, zoomBy, dispose };
}
