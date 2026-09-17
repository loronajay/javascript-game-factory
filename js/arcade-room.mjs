import * as THREE_VENDOR from "./vendor/three.module.js";
import { BIRD_DUTY_CABINET, getCabinetLaunchUrl } from "./arcade-room-cabinet.mjs";
import { canInteractWithCabinet, closeCabinetSession, createCabinetSession, getCabinetPrompt, openCabinetSession, } from "./arcade-room-interaction.mjs";
import { createBirdDutyCabinet } from "./arcade-room-model.mjs";
const THREE = THREE_VENDOR;
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Arcade room is missing ${selector}`);
    return element;
}
const canvas = requiredElement("#roomCanvas");
const prompt = requiredElement("#cabinetPrompt");
const startGate = requiredElement("#startGate");
const playLayer = requiredElement("#cabinetPlayLayer");
const gameFrame = requiredElement("#cabinetGame");
const leaveButton = requiredElement("#leaveCabinet");
const enterButton = requiredElement("#enterShowroom");
const status = requiredElement("#roomStatus");
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch {
    status.textContent = "This room needs WebGL to render the cabinet.";
    startGate.dataset.state = "error";
    throw new Error("WebGL is unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07101b);
scene.fog = new THREE.Fog(0x07101b, 8, 18);
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 40);
camera.rotation.order = "YXZ";
const player = { x: 0, y: 1.68, z: -0.8, yaw: 0, pitch: -0.03 };
const hemisphere = new THREE.HemisphereLight(0x8fd7ff, 0x101018, 1.8);
scene.add(hemisphere);
const keyLight = new THREE.DirectionalLight(0xfff2d1, 2.6);
keyLight.position.set(3.5, 6.8, 4.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const marqueeGlow = new THREE.PointLight(0x65cfff, 2.7, 5.5, 2);
marqueeGlow.position.set(0, 2.05, -1.65);
scene.add(marqueeGlow);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x151c29, roughness: 0.7, metalness: 0.18 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12, 12, 12), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(12, 24, 0x297697, 0x1d3447);
grid.position.y = 0.004;
scene.add(grid);
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x101a2a, roughness: 0.82 });
const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.2), wallMaterial);
backWall.position.set(0, 2, -4.5);
backWall.receiveShadow = true;
scene.add(backWall);
for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 9), wallMaterial);
    wall.position.set(side * 6, 2, 0);
    wall.receiveShadow = true;
    scene.add(wall);
}
function neonBar(x, y, width, color) {
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.25 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, 0.035), material);
    bar.position.set(x, y, -4.37);
    scene.add(bar);
}
neonBar(-3.1, 2.8, 2.4, 0xff4d91);
neonBar(3.1, 2.8, 2.4, 0x53d8ff);
neonBar(0, 3.35, 1.8, 0xffd33d);
const cabinetPosition = new THREE.Vector3(0, 0, -2.3);
const cabinetModel = createBirdDutyCabinet(THREE, BIRD_DUTY_CABINET);
cabinetModel.position.copy(cabinetPosition);
scene.add(cabinetModel);
const keys = new Set();
let session = createCabinetSession(BIRD_DUTY_CABINET.id);
let interactionReady = false;
let playing = false;
let roomEntered = false;
let draggingLook = false;
function applyCamera() {
    camera.position.set(player.x, player.y, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
}
function forwardVector() {
    return { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
}
function updateInteraction() {
    interactionReady = canInteractWithCabinet({ x: player.x, z: player.z, forward: forwardVector() }, {
        position: { x: cabinetPosition.x, z: cabinetPosition.z },
        forward: { x: 0, z: 1 },
        radius: BIRD_DUTY_CABINET.interaction.radius,
        facingThreshold: BIRD_DUTY_CABINET.interaction.facingThreshold,
    });
    prompt.textContent = roomEntered ? getCabinetPrompt(interactionReady, BIRD_DUTY_CABINET.title) : "";
    prompt.classList.toggle("is-visible", interactionReady && !playing);
}
function openCabinet() {
    if (!interactionReady || playing)
        return;
    session = openCabinetSession(session);
    playing = true;
    document.exitPointerLock?.();
    gameFrame.src = getCabinetLaunchUrl(BIRD_DUTY_CABINET, location.href);
    playLayer.hidden = false;
    playLayer.setAttribute("aria-hidden", "false");
    leaveButton.focus();
    prompt.classList.remove("is-visible");
}
function closeCabinet() {
    if (!playing)
        return;
    session = closeCabinetSession(session);
    playing = false;
    gameFrame.src = "about:blank";
    playLayer.hidden = true;
    playLayer.setAttribute("aria-hidden", "true");
    canvas.focus();
    status.textContent = "Click the room to look around again";
}
leaveButton.addEventListener("click", closeCabinet);
window.addEventListener("keydown", (event) => {
    if (playing) {
        if (event.code === "Escape")
            closeCabinet();
        return;
    }
    keys.add(event.code);
    if (event.code === "KeyE" && interactionReady) {
        event.preventDefault();
        openCabinet();
    }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
canvas.addEventListener("click", () => {
    if (!playing && roomEntered)
        canvas.requestPointerLock?.().catch(() => undefined);
});
enterButton.addEventListener("click", () => {
    if (playing)
        return;
    roomEntered = true;
    startGate.classList.add("is-hidden");
    canvas.focus();
    status.textContent = "WASD to move · Drag to look · Click for mouse capture";
});
document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    startGate.classList.toggle("is-hidden", roomEntered);
    status.textContent = locked
        ? "WASD to move · Mouse to look · E to interact"
        : "WASD to move · Drag to look · Click for mouse capture";
});
canvas.addEventListener("pointerdown", () => { draggingLook = true; });
window.addEventListener("pointerup", () => { draggingLook = false; });
document.addEventListener("mousemove", (event) => {
    if ((document.pointerLockElement !== canvas && !draggingLook) || playing)
        return;
    player.yaw -= event.movementX * 0.0022;
    player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.0018, -1.1, 1.05);
});
function updatePlayer(dt) {
    if (playing || !roomEntered)
        return;
    const forward = forwardVector();
    const right = { x: -forward.z, z: forward.x };
    let moveX = 0;
    let moveZ = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) {
        moveX += forward.x;
        moveZ += forward.z;
    }
    if (keys.has("KeyS") || keys.has("ArrowDown")) {
        moveX -= forward.x;
        moveZ -= forward.z;
    }
    if (keys.has("KeyD") || keys.has("ArrowRight")) {
        moveX += right.x;
        moveZ += right.z;
    }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) {
        moveX -= right.x;
        moveZ -= right.z;
    }
    const length = Math.hypot(moveX, moveZ);
    if (!length)
        return;
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4.3 : 2.65;
    const nextX = THREE.MathUtils.clamp(player.x + (moveX / length) * speed * dt, -5.45, 5.45);
    const nextZ = THREE.MathUtils.clamp(player.z + (moveZ / length) * speed * dt, -4.0, 5.45);
    const cabinetDx = nextX - cabinetPosition.x;
    const cabinetDz = nextZ - cabinetPosition.z;
    const blockedByCabinet = Math.abs(cabinetDx) < 0.63 && Math.abs(cabinetDz) < 0.73;
    if (!blockedByCabinet) {
        player.x = nextX;
        player.z = nextZ;
    }
}
function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
}
const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now) {
    accumulator += Math.min((now - previous) / 1000, 0.1);
    previous = now;
    while (accumulator >= TICK_SECONDS) {
        updatePlayer(TICK_SECONDS);
        updateInteraction();
        accumulator -= TICK_SECONDS;
    }
    applyCamera();
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
applyCamera();
updateInteraction();
requestAnimationFrame(frame);
