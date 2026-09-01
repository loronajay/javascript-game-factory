import { ARENA_IDS } from '../config.js';
import { createTable } from './table.js';
import { createVenues } from './venues/index.js';

const CPU_COLOR = '#3f7194';

function disposeStage(stage) {
    const geometries = new Set(), materials = new Set();
    stage.scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material)
            for (const material of [object.material].flat()) materials.add(material);
        if (object.isInstancedMesh) object.dispose();
        if (object.shadow) object.shadow.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    stage.renderer.dispose();
}

function createPreviewStage(THREE, canvas, { preserveDrawingBuffer = false } = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05020d);
    scene.fog = new THREE.Fog(0x0b0615, 25, 48);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    const camera = new THREE.PerspectiveCamera(43, 16 / 9, .1, 80);
    camera.position.set(0, 14.2, 16.8);
    camera.lookAt(0, -.2, -1.2);
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x11151b, 1.85);
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-5, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const cool = new THREE.PointLight(0x3f7194, 22, 21, 2);
    cool.position.set(-5, 4, -6);
    const warm = new THREE.PointLight(0xa14848, 18, 19, 2);
    warm.position.set(5, 4, 6);
    scene.add(hemi, key, cool, warm);
    const stage = { scene, renderer, camera, hemi, key, cool, warm };
    const table = createTable(THREE, scene);
    const venues = createVenues(THREE, stage, table);
    const quaternion = new THREE.Quaternion();
    table.sync({
        puckBody: { position: new THREE.Vector3(0, .2, -.5), quaternion },
        player: { body: { position: new THREE.Vector3(1.15, .25, 5.6) } },
        cpu: { body: { position: new THREE.Vector3(-1.05, .25, -5.55) } },
    });
    function configure(arenaId, playerColor) {
        venues.applyArenaTheme(arenaId);
        table.applyColors(playerColor, CPU_COLOR);
        warm.color.set(playerColor);
        cool.color.set(CPU_COLOR);
    }
    return { ...stage, venues, configure, dispose: () => disposeStage(stage) };
}

function createThumbnails(THREE, doc, targets, playerColor) {
    if (!targets.length) return;
    const canvas = doc.createElement('canvas');
    const stage = createPreviewStage(THREE, canvas, { preserveDrawingBuffer: true });
    try {
        stage.renderer.setPixelRatio(1);
        stage.renderer.setSize(320, 180, false);
        stage.camera.aspect = 16 / 9;
        stage.camera.position.set(1.2, 14.8, 17.8);
        stage.camera.updateProjectionMatrix();
        for (const arenaId of ARENA_IDS) {
            const target = targets.find(node => node.closest('.arenaCard')?.dataset.arena === arenaId);
            if (!target) continue;
            stage.configure(arenaId, playerColor);
            stage.venues.updateArenaVisuals(1.7);
            stage.renderer.render(stage.scene, stage.camera);
            target.style.backgroundImage = `url("${canvas.toDataURL('image/jpeg', .82)}")`;
        }
    }
    finally {
        stage.dispose();
    }
}

// Setup-only renderer: the large selected venue stays live; card images are
// captured once from the same actual geometry to avoid four extra WebGL loops.
export function createVenuePreview({ THREE, canvas, container, thumbnailTargets = [] }) {
    const doc = canvas.ownerDocument, win = doc.defaultView;
    const stage = createPreviewStage(THREE, canvas);
    const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let width = 0, height = 0, configured = false, thumbnailsReady = false;
    function resize() {
        const rect = container.getBoundingClientRect();
        const nextWidth = Math.max(320, Math.floor(rect.width || 640));
        const nextHeight = Math.max(240, Math.floor(rect.height || 360));
        if (nextWidth === width && nextHeight === height) return;
        width = nextWidth;
        height = nextHeight;
        stage.renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 1.5));
        stage.renderer.setSize(width, height, false);
        stage.camera.aspect = width / height;
        stage.camera.updateProjectionMatrix();
    }
    function configure(config) {
        stage.configure(config.arenaId, config.playerColor);
        configured = true;
        if (!thumbnailsReady) {
            thumbnailsReady = true;
            try { createThumbnails(THREE, doc, thumbnailTargets, config.playerColor); }
            catch (error) { console.warn('Venue thumbnail previews unavailable:', error); }
        }
    }
    function render(time, visible) {
        if (!visible || !configured) return;
        resize();
        const drift = reducedMotion ? 0 : Math.sin(time * .00018) * 1.15;
        stage.camera.position.set(drift, 14.2, 16.8);
        stage.camera.lookAt(0, -.2, -1.2);
        stage.venues.updateArenaVisuals(time / 1000);
        stage.renderer.render(stage.scene, stage.camera);
    }
    return { configure, render, resize, dispose: stage.dispose };
}
