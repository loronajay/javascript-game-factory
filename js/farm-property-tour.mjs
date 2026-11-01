// A standalone sample world: no account client, wallet, layout store or saves.
import * as THREE_VENDOR from "./vendor/three.module.js";
import { FARM_LOTS } from "./farm-catalog/lots.mjs";
import { createDefaultFarmLayout, expandFarmLot, farmLotBounds } from "./farm-layout.mjs";
import { createFarmWorld } from "./farm-world.mjs";
import { doorRows, farmObstacles, farmPlatforms, EYE_HEIGHT } from "./farm-scene.mjs";
import { propertyObstacles, propertyPlatforms, propertyGroundHeight, propertyWalkBounds, propertyRoutes } from "./farm-property-scene.mjs";
import { createFarmBody, stepFarmBody, eyeHeight } from "./farm-body.mjs";
import { lookWalker } from "./arcade-room-walker.mjs";
import { gatewayAt } from "./farm-gateway.mjs";
const THREE = THREE_VENDOR;
const property = FARM_LOTS.find((entry) => entry.id === new URLSearchParams(location.search).get("property")) ?? FARM_LOTS[0];
const layout = expandFarmLot(createDefaultFarmLayout(() => 0.5), property.id);
const half = farmLotBounds(layout).width / 2;
const canvas = document.querySelector("#tourCanvas");
const status = document.querySelector("#tourStatus");
const walk = document.querySelector("#walk");
const routes = propertyRoutes(layout);
for (const route of routes) {
    if (!route.horse) {
        const link = document.createElement("a");
        link.href = `cove/index.html?area=${route.target}&preview=1`;
        link.textContent = `Fish at ${route.title}`;
        document.querySelector('[aria-label="Viewpoints"]').append(link);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = route.target;
    button.textContent = route.horse ? "Show Downs gate" : "Show fishing gate";
    document.querySelector('[aria-label="Viewpoints"]').append(button);
}
document.title = `${property.title} · Free walkthrough`;
document.querySelector("#propertyTitle").textContent = `${property.title} · ${property.size} × ${property.size} m`;
document.querySelector("#propertyDescription").textContent = property.description;
for (const entry of FARM_LOTS) {
    const link = document.createElement("a");
    link.href = `?property=${encodeURIComponent(entry.id)}`;
    link.textContent = `${entry.title} · ${entry.size} × ${entry.size} m`;
    if (entry.id === property.id)
        link.setAttribute("aria-current", "page");
    document.querySelector("#properties").append(link);
}
try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 350);
    camera.rotation.order = "YXZ";
    const world = createFarmWorld(THREE, scene, { propertyId: property.id, clouds: false });
    world.applyGround(layout.ground);
    world.sync(layout);
    world.setTime(10 * 60);
    // Match the live farm: open a destination gate with E, then walk through it.
    const openDoors = new Set(doorRows(layout).filter(door => !routes.some(route => route.gateId === door.doorId)).map(door => door.doorId));
    for (const id of openDoors)
        world.doorsFor(id)?.setOpen(true);
    const bounds = propertyWalkBounds(layout);
    const solids = {
        bounds: { halfWidth: bounds.width / 2, halfDepth: bounds.depth / 2, margin: bounds.wallInset },
        obstacles: farmObstacles(layout, { openDoors }).concat(propertyObstacles(layout)),
        platforms: farmPlatforms(layout).concat(propertyPlatforms(layout)),
        ladders: [],
        ground: (point) => propertyGroundHeight(layout, point) ?? 0,
    };
    let pose = { x: 0, z: half - 3, yaw: 0, pitch: -0.03 };
    let body = createFarmBody();
    let overview = false;
    const keys = new Set();
    const hint = "WASD / arrows to move · Shift to run · Mouse to look · Esc for property controls";
    function setView(view, returning = false) {
        document.exitPointerLock?.();
        keys.clear();
        body = createFarmBody();
        overview = view === "overview";
        pose = view === "grounds"
            ? { ...routes[0].returnPoint, yaw: -Math.PI / 2, pitch: -0.03 }
            : { x: 0, z: half - 3, yaw: 0, pitch: -0.03 };
        const route = routes.find((entry) => entry.target === view);
        if (route)
            pose = { ...route.returnPoint, yaw: returning ? route.returnPoint.yaw : Math.atan2(route.returnPoint.x - route.x, route.returnPoint.z - route.z), pitch: -0.03 };
        if (overview) {
            camera.position.set(half * 1.6, property.size * 1.25, property.size * 1.4);
            camera.lookAt(0, 0, 0);
        }
        for (const button of document.querySelectorAll("[data-view]"))
            button.setAttribute("aria-pressed", String(button.dataset.view === view));
        status.textContent = returning && route ? "Back at your farm. The fishing gate is behind you." : overview ? "Sample layout at full scale. Choose a walking view to explore." : route ? `${route.title}: E opens the gate; walk through${route.horse ? " on your horse in the live farm" : " to try fishing"}.` : hint;
        if (returning && route)
            document.querySelector("#tourControls").open = false;
    }
    for (const button of document.querySelectorAll("[data-view]"))
        button.addEventListener("click", () => setView(button.dataset.view));
    const capture = () => {
        if (overview)
            setView("field");
        document.querySelector("#tourControls").open = false;
        canvas.requestPointerLock?.().catch(() => { status.textContent = "Mouse capture unavailable. Drag on the scene to look; use WASD to walk."; });
    };
    walk.addEventListener("click", capture);
    canvas.addEventListener("click", capture);
    document.addEventListener("pointerlockchange", () => {
        document.body.classList.toggle("walking", document.pointerLockElement === canvas);
        keys.clear();
    });
    document.addEventListener("mousemove", (event) => {
        if (!overview && (document.pointerLockElement === canvas || (event.buttons === 1 && event.target === canvas)))
            pose = lookWalker(pose, event.movementX, event.movementY);
    });
    const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
    document.addEventListener("keydown", (event) => {
        if (event.code === "KeyE" && !event.repeat && !overview) {
            const door = doorRows(layout).filter(door => Math.hypot(door.door.x - pose.x, door.door.z - pose.z) < 3).sort((a, b) => Math.hypot(a.door.x - pose.x, a.door.z - pose.z) - Math.hypot(b.door.x - pose.x, b.door.z - pose.z))[0];
            if (door) {
                const open = !openDoors.has(door.doorId);
                if (open)
                    openDoors.add(door.doorId);
                else
                    openDoors.delete(door.doorId);
                world.doorsFor(door.doorId)?.setOpen(open);
                solids.obstacles = farmObstacles(layout, { openDoors }).concat(propertyObstacles(layout));
                status.textContent = open ? "Gate open. Walk through to enter the fishing area." : "Gate closed. E opens it.";
            }
            event.preventDefault();
            return;
        }
        if (overview || !movement.has(event.code) || event.ctrlKey || event.metaKey || event.altKey)
            return;
        event.preventDefault();
        keys.add(event.code);
    });
    document.addEventListener("keyup", (event) => keys.delete(event.code));
    window.addEventListener("blur", () => keys.clear());
    const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", resize);
    resize();
    setView(new URLSearchParams(location.search).get("from") ?? "field", true);
    globalThis.__farmTour = Object.freeze({ pose: () => ({ ...pose }) });
    let leaving = false;
    let previous = performance.now();
    let accumulator = 0;
    function frame(now) {
        const dt = Math.min(Math.max(0, (now - previous) / 1000), 0.1);
        previous = now;
        if (!overview) {
            accumulator += dt;
            while (accumulator >= 1 / 60) {
                const next = stepFarmBody(pose, body, keys, 1 / 60, solids);
                pose = next.pose;
                body = next.body;
                accumulator -= 1 / 60;
                const gate = gatewayAt(layout.decor, openDoors, pose, farmLotBounds(layout));
                const destination = gate ? routes.find(route => route.gateId === gate.instanceId) : null;
                if (destination && !destination.horse && !leaving) {
                    leaving = true;
                    location.href = `cove/index.html?area=${destination.target}&preview=1`;
                }
            }
            camera.position.set(pose.x, eyeHeight(body, EYE_HEIGHT), pose.z);
            camera.rotation.set(pose.pitch, pose.yaw, 0);
        }
        else
            accumulator = 0;
        world.update(dt);
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
catch (error) {
    status.textContent = "This walkthrough needs WebGL. Enable hardware acceleration and reload to explore.";
    walk.disabled = true;
    console.error(error);
}
