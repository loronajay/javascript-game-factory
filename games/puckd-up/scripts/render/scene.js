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
    function resize() {
        const r = gamewrap.getBoundingClientRect();
        const w = Math.max(320, Math.floor(r.width)), h = Math.max(260, Math.floor(r.height));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Dynamically pull the camera back on narrow/tall cabinets so BOTH goal mouths stay visible.
        const aspect = w / h;
        if (aspect < 1.15) {
            camera.fov = 47;
            camera.position.set(0, 18.6, 17.7);
        }
        else if (aspect < 1.45) {
            camera.fov = 43;
            camera.position.set(0, 17.0, 16.7);
        }
        else {
            camera.fov = 40;
            camera.position.set(0, 15.4, 15.8);
        }
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(gamewrap);
    window.addEventListener('resize', resize);
    resize();
    function dispose() {
        observer.disconnect();
        window.removeEventListener('resize', resize);
        // Shared geometries/materials (including instancing and the trail pool) dispose once.
        const geometries = new Set(), materials = new Set();
        scene.traverse(object => {
            if (object.geometry)
                geometries.add(object.geometry);
            if (object.material)
                for (const material of [object.material].flat())
                    materials.add(material);
            if (object.isInstancedMesh)
                object.dispose();
            if (object.shadow)
                object.shadow.dispose();
        });
        for (const geometry of geometries)
            geometry.dispose();
        for (const material of materials)
            material.dispose();
        renderer.dispose();
    }
    return { scene, renderer, camera, hemi, key, cool, warm, resize, dispose };
}
