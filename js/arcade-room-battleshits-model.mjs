import { BATTLESHITS_CABINET_ART, CABINET_CONTROL_SURFACE, CABINET_MARQUEE_GEOMETRY } from "./arcade-room-scene.mjs";
function canvasTexture(THREE, width, height, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("Canvas 2D is required to build Battleshits cabinet artwork");
    draw(context);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
}
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load Battleshits cabinet artwork: ${src}`));
        image.src = src;
    });
}
function drawImageCover(context, image, width, height) {
    const sourceAspect = image.naturalWidth / image.naturalHeight;
    const targetAspect = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    if (sourceAspect > targetAspect) {
        sourceWidth = image.naturalHeight * targetAspect;
        sourceX = (image.naturalWidth - sourceWidth) / 2;
    }
    else {
        sourceHeight = image.naturalWidth / targetAspect;
        sourceY = (image.naturalHeight - sourceHeight) / 2;
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}
function standardMaterial(THREE, color, roughness = 0.68, metalness = 0.08) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function addBox(THREE, parent, name, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
function createMarqueeTexture(THREE) {
    return canvasTexture(THREE, 1024, 288, (context) => {
        const gradient = context.createLinearGradient(0, 0, 1024, 0);
        gradient.addColorStop(0, "#041528");
        gradient.addColorStop(0.5, "#0b4b73");
        gradient.addColorStop(1, "#041528");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1024, 288);
        context.strokeStyle = "#c89a42";
        context.lineWidth = 18;
        context.strokeRect(9, 9, 1006, 270);
        context.textAlign = "center";
        context.shadowColor = "#54d8ff";
        context.shadowBlur = 24;
        context.fillStyle = "#f8f2df";
        context.font = "900 104px Impact, Haettenschweiler, sans-serif";
        context.fillText("BATTLESHITS", 512, 158);
        context.shadowBlur = 0;
        context.fillStyle = "#e1b85d";
        context.font = "800 25px ui-monospace, monospace";
        context.fillText("SINK THEIR FLEET · HOLD YOUR NOSE", 512, 224);
    });
}
function createScreenTexture(THREE) {
    const texture = canvasTexture(THREE, 960, 540, (context) => {
        context.fillStyle = "#03111f";
        context.fillRect(0, 0, 960, 540);
        context.fillStyle = "#d9b35a";
        context.font = "800 28px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText("BATTLESHITS · ATTRACT MODE", 480, 280);
    });
    void Promise.all([loadImage(BATTLESHITS_CABINET_ART.keyArt), loadImage(BATTLESHITS_CABINET_ART.heroArt)]).then(([room, toilet]) => {
        const context = texture.image.getContext("2d");
        if (!context)
            return;
        drawImageCover(context, room, 960, 540);
        const heroHeight = 480;
        const heroWidth = heroHeight * toilet.naturalWidth / toilet.naturalHeight;
        context.drawImage(toilet, 0, 0, toilet.naturalWidth, toilet.naturalHeight, 480 - heroWidth / 2, 54, heroWidth, heroHeight);
        const vignette = context.createLinearGradient(0, 0, 960, 0);
        vignette.addColorStop(0, "rgba(1, 8, 16, .52)");
        vignette.addColorStop(0.3, "rgba(1, 8, 16, 0)");
        vignette.addColorStop(0.7, "rgba(1, 8, 16, 0)");
        vignette.addColorStop(1, "rgba(1, 8, 16, .52)");
        context.fillStyle = vignette;
        context.fillRect(0, 0, 960, 540);
        texture.needsUpdate = true;
    });
    return texture;
}
function createSideArtTexture(THREE, side) {
    const texture = canvasTexture(THREE, 512, 1280, (context) => {
        context.fillStyle = "#04172a";
        context.fillRect(0, 0, 512, 1280);
    });
    void loadImage(BATTLESHITS_CABINET_ART.sideArt).then((image) => {
        const context = texture.image.getContext("2d");
        if (!context)
            return;
        context.save();
        if (side === "right") {
            context.translate(512, 0);
            context.scale(-1, 1);
        }
        drawImageCover(context, image, 512, 1280);
        context.restore();
        const shade = context.createLinearGradient(0, 0, 0, 1280);
        shade.addColorStop(0, "rgba(2, 12, 24, .03)");
        shade.addColorStop(0.72, "rgba(2, 12, 24, .08)");
        shade.addColorStop(1, "rgba(2, 12, 24, .68)");
        context.fillStyle = shade;
        context.fillRect(0, 0, 512, 1280);
        texture.needsUpdate = true;
    });
    return texture;
}
function addPoopTopper(THREE, parent, palette) {
    const group = new THREE.Group();
    group.name = "poop-topper";
    const poop = new THREE.MeshStandardMaterial({ color: "#7a431d", roughness: 0.5, metalness: 0.08 });
    const highlight = new THREE.MeshStandardMaterial({ color: "#a86627", roughness: 0.42, metalness: 0.06 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.045, 24), new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.28, metalness: 0.68 }));
    plinth.name = "poop-topper-plinth";
    plinth.position.set(0, 2.065, 0.01);
    plinth.castShadow = true;
    group.add(plinth);
    const layers = [
        { name: "poop-swirl-base", radius: 0.19, y: 2.115, x: 0 },
        { name: "poop-swirl-middle", radius: 0.145, y: 2.22, x: 0.018 },
        { name: "poop-swirl-crown", radius: 0.095, y: 2.305, x: -0.012 },
    ];
    for (const [index, layer] of layers.entries()) {
        const swirl = new THREE.Mesh(new THREE.SphereGeometry(layer.radius, 20, 14), index === 1 ? highlight : poop);
        swirl.name = layer.name;
        swirl.scale.set(1.18, 0.62, 0.86);
        swirl.position.set(layer.x, layer.y, 0.01);
        swirl.castShadow = true;
        group.add(swirl);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 20), highlight);
    tip.name = "poop-swirl-tip";
    tip.position.set(0.035, 2.405, 0.01);
    tip.rotation.z = -0.32;
    tip.castShadow = true;
    group.add(tip);
    const glow = new THREE.PointLight("#f0a23a", 0.72, 1.6, 2);
    glow.position.set(0, 2.24, 0.16);
    group.add(glow);
    parent.add(group);
}
export function createBattleshitsCabinet(THREE, definition) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };
    const shell = standardMaterial(THREE, definition.palette.shell, 0.42, 0.28);
    const brass = standardMaterial(THREE, definition.palette.trim, 0.3, 0.72);
    const deckPaint = standardMaterial(THREE, definition.palette.sky, 0.35, 0.24);
    const black = standardMaterial(THREE, "#020913", 0.46, 0.34);
    const porcelain = standardMaterial(THREE, definition.palette.warning, 0.25, 0.08);
    const metal = standardMaterial(THREE, "#263746", 0.22, 0.78);
    addBox(THREE, root, "shell", [0.92, 1.14, 0.79], [0, 0.57, 0], shell);
    addBox(THREE, root, "upper-shell", [0.92, 0.75, 0.61], [0, 1.49, -0.09], shell);
    const marqueeGeometry = CABINET_MARQUEE_GEOMETRY.battleshits;
    addBox(THREE, root, "marquee-housing", [0.97, 0.3, marqueeGeometry.depth], [0, 1.9, marqueeGeometry.centerZ], brass);
    addBox(THREE, root, "base-trim", [0.97, 0.085, 0.84], [0, 0.043, 0], black);
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.235), new THREE.MeshBasicMaterial({ map: createMarqueeTexture(THREE) }));
    marquee.name = "marquee";
    marquee.position.set(0, 1.9, marqueeGeometry.artZ);
    root.add(marquee);
    addBox(THREE, root, "screen-bezel", [0.8, 0.51, 0.06], [0, 1.5, 0.25], black);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.3825), new THREE.MeshBasicMaterial({ map: createScreenTexture(THREE) }));
    screen.name = "screen";
    screen.position.set(0, 1.5, 0.285);
    root.add(screen);
    const dualDeck = CABINET_CONTROL_SURFACE.dualDeck;
    const deck = addBox(THREE, root, "control-deck", [dualDeck.width, 0.11, dualDeck.depth], [0, 1.105, dualDeck.centerZ], deckPaint);
    deck.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
    addBox(THREE, root, "deck-face", [0.86, 0.18, 0.055], [0, 1.005, dualDeck.faceZ], shell);
    for (const side of [-1, 1]) {
        const stickX = side * 0.25;
        const playerMaterial = side < 0 ? porcelain : brass;
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.09, 12), metal);
        stick.name = side < 0 ? "joystick-left" : "joystick-right";
        stick.position.set(stickX, 1.165, 0.33);
        stick.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
        stick.castShadow = true;
        root.add(stick);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), playerMaterial);
        ball.position.set(stickX, 1.215, 0.33);
        ball.castShadow = true;
        root.add(ball);
        for (const [offsetX, z] of [[-0.064, 0.43], [0, 0.405], [0.064, 0.43]]) {
            const button = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.022, 16), playerMaterial);
            button.rotation.x = CABINET_CONTROL_SURFACE.tiltRadians;
            button.position.set(stickX + offsetX, 1.17, z);
            button.castShadow = true;
            root.add(button);
        }
    }
    addBox(THREE, root, "coin-door", [0.42, 0.5, 0.038], [0, 0.52, 0.417], metal);
    addBox(THREE, root, "coin-slot-left", [0.075, 0.14, 0.025], [-0.11, 0.64, 0.447], black);
    addBox(THREE, root, "coin-slot-right", [0.075, 0.14, 0.025], [0.11, 0.64, 0.447], black);
    addBox(THREE, root, "coin-return", [0.19, 0.075, 0.025], [0, 0.39, 0.447], black);
    for (const side of [-1, 1]) {
        const sideArt = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.62), new THREE.MeshBasicMaterial({ map: createSideArtTexture(THREE, side < 0 ? "left" : "right") }));
        sideArt.name = side < 0 ? "side-art-left" : "side-art-right";
        sideArt.rotation.y = side * Math.PI / 2;
        sideArt.position.set(side * 0.463, 1.05, -0.025);
        root.add(sideArt);
    }
    addPoopTopper(THREE, root, definition.palette);
    return root;
}
