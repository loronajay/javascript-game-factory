// Building decor meshes from catalog definitions.
//
// Every model is procedural — boxes, cylinders and canvas-drawn planes — and
// is built CENTRED on its bounding box, so one wrapper places it for any
// mount: a floor item's centre sits half its height up, a wall item's half its
// depth off the wall, a ceiling item's half its height below the ceiling. The
// builders never know which mount they are on.
//
// `userData.decorInstanceId` on the root is what the editor's raycast reads
// to know which layout row a click landed on.
import { decorExtent, decorSignText } from "./arcade-room-catalog/decor.mjs";
import { drawNeonShape, drawNeonText } from "./arcade-room-neon-art.mjs";
function standard(THREE, color, roughness = 0.6, metalness = 0.1) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function glow(THREE, color, intensity = 2.4) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
}
function box(THREE, group, size, position, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
    return mesh;
}
function cylinder(THREE, group, radiusTop, radiusBottom, height, position, material, segments = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
}
function sphere(THREE, group, radius, position, material) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
}
function canvasPlane(THREE, group, width, height, pixels, draw, position, transparent = true) {
    const canvas = document.createElement("canvas");
    canvas.width = pixels[0];
    canvas.height = pixels[1];
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("Canvas 2D is required to draw decor");
    draw(context, pixels[0], pixels[1]);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent, side: THREE.DoubleSide }));
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
}
function withAlpha(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
function rugPattern(context, w, h, color, pattern, round) {
    if (round) {
        context.beginPath();
        context.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
        context.clip();
    }
    context.fillStyle = color;
    context.fillRect(0, 0, w, h);
    context.fillStyle = "rgba(255,255,255,.16)";
    if (pattern === "border") {
        context.lineWidth = 18;
        context.strokeStyle = "rgba(255,255,255,.22)";
        if (round) {
            context.beginPath();
            context.arc(w / 2, h / 2, w / 2 - 34, 0, Math.PI * 2);
            context.stroke();
        }
        else {
            context.strokeRect(30, 30, w - 60, h - 60);
        }
    }
    else if (pattern === "stripes") {
        for (let x = 0; x < w; x += 64)
            context.fillRect(x, 0, 24, h);
    }
    else if (pattern === "checker") {
        context.fillStyle = "rgba(0,0,0,.55)";
        const cell = 64;
        for (let y = 0; y < h; y += cell) {
            for (let x = 0; x < w; x += cell) {
                if (((x + y) / cell) % 2 === 0)
                    context.fillRect(x, y, cell, cell);
            }
        }
    }
    // Fibre speckle so it reads as fabric.
    context.fillStyle = "rgba(0,0,0,.12)";
    let seed = 9;
    for (let index = 0; index < 1200; index += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const x = (seed / 0x100000000) * w;
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const y = (seed / 0x100000000) * h;
        context.fillRect(x, y, 2, 2);
    }
}
/**
 * A 1950s bubbler jukebox: a wood body, a domed top with the tinted bubble tubes
 * running up and over it, a lit title window with a record on the turntable, a
 * slatted speaker grille, chrome pilasters and a row of selector keys. The arch
 * tubes carry `userData.jukeboxGlow` so the room can pulse them while a record
 * plays; nothing else here knows the box makes sound.
 */
function buildJukebox(THREE, group, size, color) {
    const w = size.width;
    const h = size.height;
    const d = size.depth;
    const bottom = -h / 2;
    const wood = standard(THREE, "#4a2416", 0.5, 0.15);
    const darkWood = standard(THREE, "#2b140c", 0.6, 0.1);
    const chrome = standard(THREE, "#d8dde4", 0.18, 0.95);
    const domeY = bottom + h * 0.68;
    const domeRadius = w / 2;
    // Body up to where the dome starts, plus a plinth so it sits on the floor.
    box(THREE, group, [w, h * 0.06, d], [0, bottom + h * 0.03, 0], darkWood);
    box(THREE, group, [w, h * 0.62, d], [0, bottom + h * 0.06 + h * 0.31, 0], wood);
    // The dome: a half cylinder whose flat face is the body top, arching over the front-to-back
    // axis. CylinderGeometry's arc runs around its own Y from +Z, so a half arc starting a
    // quarter-turn back covers the +Z side, and tipping it back a quarter-turn puts that side UP.
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(domeRadius, domeRadius, d, 32, 1, false, -Math.PI / 2, Math.PI), wood);
    dome.rotation.x = -Math.PI / 2;
    dome.position.set(0, domeY, 0);
    dome.castShadow = true;
    dome.receiveShadow = true;
    group.add(dome);
    // Chrome pilasters down each front edge, meeting the dome.
    for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) {
        box(THREE, group, [0.05, h * 0.62, 0.04], [x, bottom + h * 0.06 + h * 0.31, d / 2 - 0.01], chrome, false);
    }
    // Bubble tubes: two arches over the dome and a straight run down each pilaster, all in the tint.
    const frontZ = d / 2 + 0.012;
    for (const [radius, tube] of [[domeRadius - 0.045, 0.028], [domeRadius - 0.13, 0.02]]) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 40, Math.PI), glow(THREE, color, 2.2));
        arch.position.set(0, domeY, frontZ);
        arch.userData.jukeboxGlow = true;
        group.add(arch);
        const legMaterial = glow(THREE, color, 2.2);
        for (const sign of [-1, 1]) {
            const leg = box(THREE, group, [tube * 2, h * 0.58, tube * 2], [sign * radius, bottom + h * 0.06 + h * 0.33, frontZ], legMaterial, false);
            leg.userData.jukeboxGlow = true;
        }
    }
    // The lit title window under the dome, with a spinning-record graphic on it.
    canvasPlane(THREE, group, w * 0.66, h * 0.22, [512, 176], (context, cw, ch) => {
        const gradient = context.createLinearGradient(0, 0, 0, ch);
        gradient.addColorStop(0, "#fff1d6");
        gradient.addColorStop(1, "#ffcf8a");
        context.fillStyle = gradient;
        context.fillRect(0, 0, cw, ch);
        context.fillStyle = "#151515";
        context.beginPath();
        context.arc(cw * 0.3, ch * 0.5, ch * 0.36, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = color;
        context.beginPath();
        context.arc(cw * 0.3, ch * 0.5, ch * 0.13, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,.35)";
        context.lineWidth = 2;
        for (const r of [0.2, 0.26, 0.32]) {
            context.beginPath();
            context.arc(cw * 0.3, ch * 0.5, ch * r, 0, Math.PI * 2);
            context.stroke();
        }
        context.fillStyle = "#3a1e12";
        context.font = "900 54px 'Arial Black', Impact, sans-serif";
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText("JAY", cw * 0.55, ch * 0.36);
        context.font = "700 30px 'Arial', sans-serif";
        context.fillText("ARCADE", cw * 0.55, ch * 0.7);
    }, [0, bottom + h * 0.6, frontZ], false);
    box(THREE, group, [w * 0.66, h * 0.22, 0.01], [0, bottom + h * 0.6, frontZ - 0.006], glow(THREE, "#ffd8a8", 0.5), false);
    // The selector keys: a chrome ledge and a row of round buttons.
    box(THREE, group, [w * 0.7, 0.03, 0.05], [0, bottom + h * 0.44, frontZ + 0.02], chrome, false);
    for (let index = 0; index < 8; index += 1) {
        const key = cylinder(THREE, group, 0.016, 0.016, 0.02, [(index - 3.5) * (w * 0.62 / 7), bottom + h * 0.465, frontZ + 0.02], index % 2 ? standard(THREE, "#f0f0f0", 0.4, 0.2) : standard(THREE, color, 0.4, 0.2), 10);
        key.rotation.x = Math.PI / 2;
    }
    // The speaker grille: a warm cloth panel behind chrome slats.
    canvasPlane(THREE, group, w * 0.72, h * 0.28, [512, 220], (context, cw, ch) => {
        context.fillStyle = "#6b3d22";
        context.fillRect(0, 0, cw, ch);
        context.fillStyle = "rgba(0,0,0,.35)";
        for (let y = 0; y < ch; y += 8) {
            for (let x = (y / 8) % 2 ? 4 : 0; x < cw; x += 8)
                context.fillRect(x, y, 3, 3);
        }
        context.fillStyle = "#d8dde4";
        for (let y = 10; y < ch; y += 34)
            context.fillRect(0, y, cw, 6);
    }, [0, bottom + h * 0.23, frontZ], false);
    // A chrome band across the bottom of the front.
    box(THREE, group, [w, 0.035, 0.03], [0, bottom + h * 0.08, d / 2 + 0.005], chrome, false);
}
/**
 * A claw machine: a cabinet with a control deck and prize chute, a glass case
 * on chrome posts full of plush balls with the claw hanging over them from its
 * gantry, and a lit marquee ringed with bulbs. Front is +Z; the tint is the
 * cabinet body and the marquee glow.
 */
function buildClawMachine(THREE, group, size, color) {
    const w = size.width;
    const h = size.height;
    const d = size.depth;
    const bottom = -h / 2;
    const body = standard(THREE, color, 0.5, 0.15);
    const dark = standard(THREE, "#1a1d24", 0.5, 0.35);
    const chrome = standard(THREE, "#d8dde4", 0.2, 0.9);
    const glass = new THREE.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
    const baseH = h * 0.36;
    const caseH = h * 0.46;
    const headH = h * 0.14;
    const caseBottom = bottom + baseH;
    const caseTop = caseBottom + caseH;
    const front = d / 2;
    // Base cabinet on a dark kick plate.
    box(THREE, group, [w, h * 0.04, d], [0, bottom + h * 0.02, 0], dark);
    box(THREE, group, [w, baseH - h * 0.04, d], [0, bottom + h * 0.04 + (baseH - h * 0.04) / 2, 0], body);
    // Prize chute: a dark opening with a chrome flap, lower left of the front.
    box(THREE, group, [w * 0.36, h * 0.15, 0.02], [-w * 0.22, bottom + h * 0.13, front + 0.01], chrome, false);
    box(THREE, group, [w * 0.32, h * 0.11, 0.012], [-w * 0.22, bottom + h * 0.125, front + 0.024], standard(THREE, "#07090d", 0.95), false);
    // Coin slot and a return cup on the right.
    box(THREE, group, [0.06, 0.1, 0.012], [w * 0.3, bottom + h * 0.28, front + 0.006], chrome, false);
    box(THREE, group, [0.08, 0.05, 0.03], [w * 0.3, bottom + h * 0.2, front + 0.015], dark, false);
    // Control deck: a slanted panel on the front lip of the base with a joystick and a big button.
    const deckDepth = d * 0.34;
    const deck = box(THREE, group, [w * 0.92, 0.05, deckDepth], [0, caseBottom - 0.01, front - deckDepth / 2], dark);
    deck.rotation.x = 0.28;
    const deckY = caseBottom + 0.02;
    const deckZ = front - deckDepth * 0.5;
    cylinder(THREE, group, 0.012, 0.014, 0.13, [w * 0.16, deckY + 0.06, deckZ], chrome, 8);
    sphere(THREE, group, 0.032, [w * 0.16, deckY + 0.13, deckZ], standard(THREE, "#ff3b3b", 0.35, 0.1));
    cylinder(THREE, group, 0.04, 0.04, 0.022, [-w * 0.16, deckY + 0.008, deckZ], glow(THREE, color, 1.4), 18);
    cylinder(THREE, group, 0.048, 0.048, 0.012, [-w * 0.16, deckY, deckZ], chrome, 18);
    // The glass case: four chrome posts and a pane on each side, over a lit back panel.
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
        for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) {
            box(THREE, group, [0.05, caseH, 0.05], [x, caseBottom + caseH / 2, z], chrome);
        }
    }
    for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) {
        const pane = box(THREE, group, [w - 0.1, caseH - 0.02, 0.01], [0, caseBottom + caseH / 2, z], glass, false);
        pane.castShadow = false;
    }
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) {
        const pane = box(THREE, group, [0.01, caseH - 0.02, d - 0.1], [x, caseBottom + caseH / 2, 0], glass, false);
        pane.castShadow = false;
    }
    canvasPlane(THREE, group, w - 0.14, caseH - 0.04, [256, 256], (context, cw, ch) => {
        const gradient = context.createLinearGradient(0, 0, 0, ch);
        gradient.addColorStop(0, "#1b1030");
        gradient.addColorStop(1, "#0a0714");
        context.fillStyle = gradient;
        context.fillRect(0, 0, cw, ch);
        context.fillStyle = withAlpha(color, 0.55);
        for (let index = 0; index < 28; index += 1) {
            const x = ((index * 97) % cw);
            const y = ((index * 61 + 17) % ch);
            const r = 2 + (index % 3);
            context.beginPath();
            context.arc(x, y, r, 0, Math.PI * 2);
            context.fill();
        }
        context.strokeStyle = withAlpha(color, 0.35);
        context.lineWidth = 3;
        context.strokeRect(10, 10, cw - 20, ch - 20);
    }, [0, caseBottom + caseH / 2, -d / 2 + 0.06], false);
    // A tray of plush prizes: a packed lower layer and a few tumbled on top.
    const plush = ["#ff5caf", "#ffd33d", "#7dff4d", "#22e5ff", "#a35bff", "#ff7a1a", "#f4f8ff"];
    const radius = Math.min(w, d) * 0.085;
    let index = 0;
    for (let row = -1; row <= 1; row += 1) {
        for (let column = -1; column <= 1; column += 1) {
            const jitter = ((index * 7) % 5 - 2) * 0.01;
            sphere(THREE, group, radius, [column * radius * 2.05 + jitter, caseBottom + radius + 0.02, row * radius * 2.05 - jitter], standard(THREE, plush[index % plush.length], 0.9, 0));
            index += 1;
        }
    }
    for (const [x, z] of [[-radius, -radius * 0.6], [radius * 1.1, radius * 0.4], [0, radius * 1.4], [-radius * 0.4, radius * 1.9]]) {
        sphere(THREE, group, radius * 0.95, [x, caseBottom + radius * 2.6, z], standard(THREE, plush[index % plush.length], 0.9, 0));
        index += 1;
    }
    // The gantry: two rails, a crossbar, the carriage, and the claw on its cable.
    const railY = caseTop - 0.06;
    for (const x of [-w * 0.3, w * 0.3])
        box(THREE, group, [0.03, 0.03, d - 0.16], [x, railY, 0], chrome, false);
    const carriageZ = d * 0.12;
    box(THREE, group, [w * 0.6 + 0.06, 0.03, 0.03], [0, railY, carriageZ], chrome, false);
    box(THREE, group, [0.13, 0.09, 0.13], [0.05, railY - 0.06, carriageZ], dark, false);
    const cableLength = caseH * 0.36;
    cylinder(THREE, group, 0.005, 0.005, cableLength, [0.05, railY - 0.1 - cableLength / 2, carriageZ], chrome, 6);
    const hubY = railY - 0.1 - cableLength;
    sphere(THREE, group, 0.032, [0.05, hubY, carriageZ], chrome);
    for (let prong = 0; prong < 3; prong += 1) {
        const angle = prong * Math.PI * 2 / 3;
        const finger = cylinder(THREE, group, 0.007, 0.01, 0.13, [0.05 + Math.cos(angle) * 0.04, hubY - 0.06, carriageZ + Math.sin(angle) * 0.04], chrome, 6);
        finger.rotation.set(Math.sin(angle) * 0.55, 0, -Math.cos(angle) * 0.55);
    }
    // The marquee: body-coloured header with a lit sign and a ring of bulbs.
    box(THREE, group, [w, headH, d], [0, caseTop + headH / 2, 0], body);
    canvasPlane(THREE, group, w * 0.9, headH * 0.68, [512, 128], (context, cw, ch) => {
        context.fillStyle = "#0b0d14";
        context.fillRect(0, 0, cw, ch);
        context.font = "900 78px 'Arial Black', Impact, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = color;
        context.shadowBlur = 28;
        context.fillStyle = color;
        context.fillText("CLAW", cw / 2, ch / 2 + 4);
        context.shadowBlur = 0;
        context.fillStyle = "#fff6fb";
        context.font = "900 66px 'Arial Black', Impact, sans-serif";
        context.fillText("CLAW", cw / 2, ch / 2 + 4);
    }, [0, caseTop + headH / 2, front + 0.006], false);
    box(THREE, group, [w * 0.9, headH * 0.68, 0.01], [0, caseTop + headH / 2, front - 0.001], glow(THREE, color, 0.5), false);
    const bulbs = 9;
    for (let bulb = 0; bulb < bulbs; bulb += 1) {
        const x = (bulb - (bulbs - 1) / 2) * (w * 0.9 / (bulbs - 1));
        sphere(THREE, group, 0.018, [x, caseTop + headH - 0.03, front + 0.012], glow(THREE, bulb % 2 ? "#fff4d6" : color, 2.4));
    }
    box(THREE, group, [w + 0.04, 0.03, d + 0.04], [0, caseTop + headH + 0.015, 0], dark);
}
/**
 * A popcorn cart: a red cabinet on two big spoked wheels with a push handle,
 * a brass-posted glass case with the kettle hanging over a heap of popcorn,
 * a warmer light, and a striped valance under the roof with the sign on it.
 * Front is +Z; the tint is the sign's neon.
 */
function buildPopcornCart(THREE, group, size, color) {
    const w = size.width;
    const h = size.height;
    const d = size.depth;
    const bottom = -h / 2;
    const red = standard(THREE, "#c8202d", 0.55, 0.05);
    const cream = standard(THREE, "#f3e9d2", 0.7, 0);
    const brass = standard(THREE, "#d4a64a", 0.3, 0.85);
    const dark = standard(THREE, "#1a1d24", 0.5, 0.35);
    const glass = new THREE.MeshStandardMaterial({ color: "#ffe6b0", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.05, side: THREE.DoubleSide });
    const wheelRadius = Math.min(0.17, h * 0.11);
    const cabinetBottom = bottom + wheelRadius * 0.7;
    const counterY = bottom + h * 0.55;
    const cabinetH = counterY - cabinetBottom;
    const cabinetW = w * 0.92;
    const cabinetD = d * 0.9;
    const stripes = (context, cw, ch) => {
        for (let x = 0; x < cw; x += 32) {
            context.fillStyle = (x / 32) % 2 ? "#c8202d" : "#f7f1e4";
            context.fillRect(x, 0, 32, ch);
        }
    };
    // The cabinet: red box, striped skirt on every side, brass trim.
    box(THREE, group, [cabinetW, cabinetH, cabinetD], [0, cabinetBottom + cabinetH / 2, 0], red);
    const skirtH = cabinetH * 0.72;
    const skirtY = cabinetBottom + cabinetH * 0.42;
    canvasPlane(THREE, group, cabinetW * 0.94, skirtH, [256, 256], stripes, [0, skirtY, cabinetD / 2 + 0.006], false);
    const back = canvasPlane(THREE, group, cabinetW * 0.94, skirtH, [256, 256], stripes, [0, skirtY, -cabinetD / 2 - 0.006], false);
    back.rotation.y = Math.PI;
    for (const sign of [-1, 1]) {
        const side = canvasPlane(THREE, group, cabinetD * 0.94, skirtH, [256, 256], stripes, [sign * (cabinetW / 2 + 0.006), skirtY, 0], false);
        side.rotation.y = sign * Math.PI / 2;
    }
    box(THREE, group, [cabinetW + 0.02, 0.025, cabinetD + 0.02], [0, cabinetBottom + cabinetH * 0.06, 0], brass, false);
    box(THREE, group, [cabinetW + 0.02, 0.025, cabinetD + 0.02], [0, cabinetBottom + cabinetH * 0.8, 0], brass, false);
    // A bag dispenser and a scoop hanging on the front, above the skirt.
    box(THREE, group, [w * 0.22, cabinetH * 0.14, 0.03], [-w * 0.22, cabinetBottom + cabinetH * 0.9, cabinetD / 2 + 0.015], cream, false);
    box(THREE, group, [0.05, 0.11, 0.02], [w * 0.24, cabinetBottom + cabinetH * 0.9, cabinetD / 2 + 0.012], brass, false);
    // The counter: a cream slab with a brass edge.
    box(THREE, group, [w, 0.04, d], [0, counterY + 0.02, 0], cream);
    box(THREE, group, [w + 0.02, 0.012, d + 0.02], [0, counterY + 0.046, 0], brass, false);
    // The case: brass posts, warm glass, and a serving hatch cut low in the front pane.
    const caseBottom = counterY + 0.05;
    const roofY = bottom + h * 0.86;
    const caseH = roofY - caseBottom;
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) {
        for (const z of [-d / 2 + 0.04, d / 2 - 0.04]) {
            cylinder(THREE, group, 0.018, 0.018, caseH, [x, caseBottom + caseH / 2, z], brass, 10);
        }
    }
    const hatchH = caseH * 0.3;
    const frontPane = box(THREE, group, [w - 0.1, caseH - hatchH, 0.01], [0, caseBottom + hatchH + (caseH - hatchH) / 2, d / 2 - 0.03], glass, false);
    frontPane.castShadow = false;
    const backPane = box(THREE, group, [w - 0.1, caseH, 0.01], [0, caseBottom + caseH / 2, -d / 2 + 0.03], glass, false);
    backPane.castShadow = false;
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
        const pane = box(THREE, group, [0.01, caseH, d - 0.1], [x, caseBottom + caseH / 2, 0], glass, false);
        pane.castShadow = false;
    }
    // The heap of popcorn: a mound and loose kernels on top.
    const mound = sphere(THREE, group, Math.min(w, d) * 0.4, [0, caseBottom + 0.02, 0], standard(THREE, "#f6e7b4", 0.95, 0));
    mound.scale.set(1, 0.38, 0.9);
    const kernels = ["#fff6d8", "#f6e7b4", "#ffd97a", "#fffbe9"];
    for (let index = 0; index < 16; index += 1) {
        const angle = index * 2.4;
        const reach = ((index * 37) % 10) / 10 * Math.min(w, d) * 0.34;
        sphere(THREE, group, 0.022 + (index % 3) * 0.004, [Math.cos(angle) * reach, caseBottom + 0.04 + Math.max(0, 0.12 - reach * 0.3), Math.sin(angle) * reach * 0.9], standard(THREE, kernels[index % kernels.length], 0.95, 0));
    }
    // The kettle: a hanging pot with a lid, a crank, and its hanger bar across the case.
    const kettleRadius = Math.min(w, d) * 0.15;
    const kettleY = caseBottom + caseH * 0.6;
    cylinder(THREE, group, 0.01, 0.01, w - 0.12, [0, roofY - 0.05, -d * 0.05], brass, 8).rotation.z = Math.PI / 2;
    cylinder(THREE, group, 0.006, 0.006, roofY - 0.05 - (kettleY + kettleRadius * 0.7), [0, (roofY - 0.05 + kettleY + kettleRadius * 0.7) / 2, -d * 0.05], brass, 6);
    cylinder(THREE, group, kettleRadius, kettleRadius * 0.85, kettleRadius * 1.3, [0, kettleY, -d * 0.05], standard(THREE, "#3b3f47", 0.35, 0.9), 20);
    cylinder(THREE, group, kettleRadius * 1.05, kettleRadius * 1.05, 0.015, [0, kettleY + kettleRadius * 0.66, -d * 0.05], brass, 20);
    const crank = cylinder(THREE, group, 0.006, 0.006, kettleRadius * 1.2, [kettleRadius * 0.6, kettleY + kettleRadius * 0.8, -d * 0.05], brass, 6);
    crank.rotation.z = Math.PI / 2;
    cylinder(THREE, group, 0.012, 0.012, 0.05, [kettleRadius * 1.2, kettleY + kettleRadius * 0.8, -d * 0.05], dark, 8);
    // The warmer: a glowing tube under the roof.
    box(THREE, group, [w * 0.6, 0.03, 0.05], [0, roofY - 0.03, d * 0.2], glow(THREE, "#ffb347", 2.2), false);
    // The roof: a red cap with a striped, scalloped valance and the sign on the front.
    const roofH = h - (roofY - bottom);
    box(THREE, group, [w + 0.06, roofH * 0.5, d + 0.06], [0, roofY + roofH * 0.75, 0], red);
    box(THREE, group, [w + 0.1, 0.02, d + 0.1], [0, roofY + roofH * 0.5, 0], brass, false);
    const valance = (context, cw, ch) => {
        context.clearRect(0, 0, cw, ch);
        context.save();
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(cw, 0);
        context.lineTo(cw, ch * 0.62);
        const scallops = 8;
        for (let index = scallops; index > 0; index -= 1) {
            context.arc((index - 0.5) * (cw / scallops), ch * 0.62, cw / scallops / 2, 0, Math.PI, false);
        }
        context.closePath();
        context.clip();
        stripes(context, cw, ch);
        context.restore();
    };
    const valanceH = roofH * 0.9;
    const valanceY = roofY + roofH * 0.5 - valanceH * 0.28;
    canvasPlane(THREE, group, w + 0.1, valanceH, [512, 128], valance, [0, valanceY, d / 2 + 0.05]);
    const rear = canvasPlane(THREE, group, w + 0.1, valanceH, [512, 128], valance, [0, valanceY, -d / 2 - 0.05]);
    rear.rotation.y = Math.PI;
    for (const sign of [-1, 1]) {
        const side = canvasPlane(THREE, group, d + 0.1, valanceH, [512, 128], valance, [sign * (w / 2 + 0.05), valanceY, 0]);
        side.rotation.y = sign * Math.PI / 2;
    }
    canvasPlane(THREE, group, w * 0.8, roofH * 0.42, [512, 96], (context, cw, ch) => {
        context.fillStyle = "#2a0b10";
        context.fillRect(0, 0, cw, ch);
        context.font = "900 62px 'Arial Black', Impact, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = color;
        context.shadowBlur = 24;
        context.fillStyle = color;
        context.fillText("POPCORN", cw / 2, ch / 2 + 3);
        context.shadowBlur = 0;
        context.fillStyle = "#fff8e6";
        context.font = "900 54px 'Arial Black', Impact, sans-serif";
        context.fillText("POPCORN", cw / 2, ch / 2 + 3);
    }, [0, roofY + roofH * 0.75, d / 2 + 0.036], false);
    // Wheels: two big spoked wheels on a rear axle, a caster at the front, and the push handle behind.
    const axleZ = -d * 0.26;
    const axleY = bottom + wheelRadius;
    cylinder(THREE, group, 0.012, 0.012, w + 0.1, [0, axleY, axleZ], dark, 8).rotation.z = Math.PI / 2;
    for (const sign of [-1, 1]) {
        const x = sign * (w / 2 + 0.03);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius - 0.02, 0.02, 10, 32), standard(THREE, "#2b2f38", 0.5, 0.4));
        rim.position.set(x, axleY, axleZ);
        rim.rotation.y = Math.PI / 2;
        rim.castShadow = true;
        group.add(rim);
        const hub = cylinder(THREE, group, 0.035, 0.035, 0.04, [x, axleY, axleZ], brass, 12);
        hub.rotation.z = Math.PI / 2;
        for (let spoke = 0; spoke < 6; spoke += 1) {
            const bar = box(THREE, group, [0.012, (wheelRadius - 0.02) * 2, 0.012], [x, axleY, axleZ], brass, false);
            bar.rotation.x = spoke * Math.PI / 6;
        }
    }
    const caster = cylinder(THREE, group, wheelRadius * 0.35, wheelRadius * 0.35, 0.04, [0, bottom + wheelRadius * 0.35, d * 0.3], dark, 14);
    caster.rotation.z = Math.PI / 2;
    cylinder(THREE, group, 0.012, 0.012, cabinetBottom - (bottom + wheelRadius * 0.35), [0, (cabinetBottom + bottom + wheelRadius * 0.35) / 2, d * 0.3], dark, 6);
    const handleLength = 0.5;
    for (const sign of [-1, 1]) {
        const rod = cylinder(THREE, group, 0.014, 0.014, handleLength, [sign * w * 0.36, counterY - 0.1 + handleLength * 0.3, -d / 2 - handleLength * 0.35], brass, 8);
        rod.rotation.x = -0.75;
    }
    const grip = cylinder(THREE, group, 0.018, 0.018, w * 0.72 + 0.03, [0, counterY - 0.1 + handleLength * 0.6, -d / 2 - handleLength * 0.7], standard(THREE, "#3b2a1c", 0.8, 0), 10);
    grip.rotation.z = Math.PI / 2;
}
const BUILDERS = {
    "strip": (THREE, group, size, color) => {
        box(THREE, group, [size.width, size.height * 0.7, size.depth * 0.7], [0, 0, -size.depth * 0.1], standard(THREE, "#1a1d24", 0.5, 0.4), false);
        box(THREE, group, [size.width, size.height, size.depth], [0, 0, 0], glow(THREE, color, 2.6), false);
    },
    "text-sign": (THREE, group, size, color, spec) => {
        box(THREE, group, [size.width, size.height, size.depth * 0.3], [0, 0, -size.depth * 0.3], standard(THREE, "#0b0d12", 0.6, 0.3), false);
        // Pixels follow the height, not the width, so a long custom line is as crisp as a short word.
        const pixelHeight = 320;
        canvasPlane(THREE, group, size.width, size.height, [Math.min(4096, Math.round(pixelHeight * size.width / size.height)), pixelHeight], (context, w, h) => {
            drawNeonText(context, w, h, spec.text, spec.font, color);
        }, [0, 0, size.depth * 0.2]);
    },
    "shape-sign": (THREE, group, size, color, spec) => {
        box(THREE, group, [size.width, size.height, size.depth * 0.3], [0, 0, -size.depth * 0.3], standard(THREE, "#0b0d12", 0.6, 0.3), false);
        canvasPlane(THREE, group, size.width, size.height, [512, Math.round(512 * size.height / size.width)], (context, w, h) => {
            drawNeonShape(context, w, h, spec.shape, color, 18);
        }, [0, 0, size.depth * 0.2]);
    },
    // The frame is the item's extent, which already has the picture's shape (`decorExtent`),
    // so the print fills it edge to edge without stretching. No picture yet — a custom poster
    // waiting for an upload — draws an empty mount with a hint instead.
    "poster": (THREE, group, size, _color, spec) => {
        box(THREE, group, [size.width, size.height, size.depth], [0, 0, 0], standard(THREE, spec.frame, 0.5, 0.2), false);
        const printWidth = size.width - 0.08;
        const printHeight = size.height - 0.08;
        if (!spec.image) {
            canvasPlane(THREE, group, printWidth, printHeight, [512, Math.round(512 * printHeight / printWidth)], (context, w, h) => {
                context.fillStyle = "#1c2230";
                context.fillRect(0, 0, w, h);
                context.setLineDash([18, 12]);
                context.lineWidth = 6;
                context.strokeStyle = "rgba(255,255,255,.35)";
                context.strokeRect(24, 24, w - 48, h - 48);
                context.setLineDash([]);
                context.fillStyle = "rgba(255,255,255,.7)";
                context.font = `800 ${Math.round(Math.min(w, h) * 0.09)}px ui-monospace, monospace`;
                context.textAlign = "center";
                context.textBaseline = "middle";
                context.fillText("YOUR PICTURE", w / 2, h / 2 - Math.min(w, h) * 0.05);
                context.font = `600 ${Math.round(Math.min(w, h) * 0.055)}px ui-monospace, monospace`;
                context.fillStyle = "rgba(255,255,255,.45)";
                context.fillText("choose one in the inspector", w / 2, h / 2 + Math.min(w, h) * 0.06);
            }, [0, 0, size.depth / 2 + 0.002], false);
            return;
        }
        const texture = new THREE.TextureLoader().load(spec.image);
        texture.colorSpace = THREE.SRGBColorSpace;
        const print = new THREE.Mesh(new THREE.PlaneGeometry(printWidth, printHeight), new THREE.MeshBasicMaterial({ map: texture }));
        print.position.set(0, 0, size.depth / 2 + 0.002);
        group.add(print);
    },
    // A closed wall calendar: a stack of pages a hair thicker than the cover, the cover print
    // on the face, a wire binding across the top edge and the hook it hangs from. The print
    // is the product's real cover, so the wall shows what arrives in the box.
    "calendar": (THREE, group, size, _color, spec) => {
        const paper = standard(THREE, "#f7f4ef", 0.85, 0);
        const wire = standard(THREE, "#c7ccd3", 0.3, 0.85);
        const stack = box(THREE, group, [size.width, size.height, size.depth], [0, 0, 0], paper, false);
        stack.castShadow = true;
        // Page edges read as many sheets: a few thin darker lines along the bottom edge.
        box(THREE, group, [size.width * 0.98, size.depth * 0.5, size.depth * 0.9], [0, -size.height / 2 + size.depth * 0.25, 0], standard(THREE, "#d9d4c8", 0.9, 0), false);
        const texture = new THREE.TextureLoader().load(spec.cover);
        texture.colorSpace = THREE.SRGBColorSpace;
        const print = new THREE.Mesh(new THREE.PlaneGeometry(size.width * 0.985, size.height * 0.985), new THREE.MeshBasicMaterial({ map: texture }));
        print.position.set(0, 0, size.depth / 2 + 0.002);
        group.add(print);
        // Wire-o binding: a bar along the top with loops over it.
        const binding = box(THREE, group, [size.width * 0.98, size.depth * 0.7, size.depth * 1.3], [0, size.height / 2 - size.depth * 0.2, 0], wire, false);
        binding.castShadow = false;
        const loops = 18;
        for (let index = 0; index < loops; index += 1) {
            const x = -size.width * 0.46 + (size.width * 0.92 * index) / (loops - 1);
            const loop = new THREE.Mesh(new THREE.TorusGeometry(size.depth * 0.9, size.depth * 0.12, 6, 14), wire);
            loop.position.set(x, size.height / 2, 0);
            loop.rotation.y = Math.PI / 2;
            group.add(loop);
        }
        // The hook: a short loop of wire rising from the middle of the binding to a wall pin.
        const hook = new THREE.Mesh(new THREE.TorusGeometry(size.height * 0.05, size.depth * 0.12, 6, 14, Math.PI), wire);
        hook.position.set(0, size.height / 2 + size.height * 0.05, -size.depth * 0.3);
        group.add(hook);
        cylinder(THREE, group, size.depth * 0.25, size.depth * 0.25, size.depth * 0.6, [0, size.height / 2 + size.height * 0.1, -size.depth * 0.4], wire, 8).rotation.x = Math.PI / 2;
    },
    "rug": (THREE, group, size, color, spec) => {
        const round = spec.shape === "round";
        const pixels = [512, Math.max(64, Math.round(512 * size.depth / size.width))];
        const rug = canvasPlane(THREE, group, size.width, size.depth, pixels, (context, w, h) => rugPattern(context, w, h, color, spec.pattern, round), [0, 0.004, 0], true);
        rug.rotation.x = -Math.PI / 2;
        rug.material.roughness = 1;
        rug.receiveShadow = true;
    },
    "ceiling-light": (THREE, group, size, color, spec) => {
        const top = size.height / 2;
        const dark = standard(THREE, "#1a1d24", 0.45, 0.6);
        if (spec.style === "spot") {
            cylinder(THREE, group, size.width / 2, size.width / 2, size.height, [0, 0, 0], dark);
            const lens = cylinder(THREE, group, size.width * 0.36, size.width * 0.36, 0.02, [0, -top + 0.005, 0], glow(THREE, color, 2));
            lens.castShadow = false;
        }
        else if (spec.style === "pendant") {
            cylinder(THREE, group, 0.01, 0.01, size.height * 0.6, [0, top - size.height * 0.3, 0], dark, 6);
            cylinder(THREE, group, size.width * 0.16, size.width * 0.5, size.height * 0.34, [0, -top + size.height * 0.2, 0], standard(THREE, "#2b2f38", 0.5, 0.5));
            sphere(THREE, group, size.width * 0.14, [0, -top + size.height * 0.08, 0], glow(THREE, color, 2.2));
        }
        else if (spec.style === "disco") {
            cylinder(THREE, group, 0.01, 0.01, size.height * 0.4, [0, top - size.height * 0.2, 0], dark, 6);
            sphere(THREE, group, size.width / 2, [0, -top + size.width / 2, 0], new THREE.MeshStandardMaterial({ color: "#dfe6f0", roughness: 0.15, metalness: 1, emissive: color, emissiveIntensity: 0.35, flatShading: true }));
        }
        else {
            box(THREE, group, [size.width, size.height * 0.5, size.depth], [0, top - size.height * 0.25, 0], dark);
            box(THREE, group, [size.width * 0.96, size.height * 0.4, size.depth * 0.5], [0, -top + size.height * 0.2, 0], glow(THREE, color, 2.2), false);
        }
    },
    "prop": (THREE, group, size, color, spec) => {
        const bottom = -size.height / 2;
        const tint = standard(THREE, color, 0.55, 0.12);
        const dark = standard(THREE, "#1a1d24", 0.5, 0.35);
        const metal = standard(THREE, "#8a9099", 0.3, 0.8);
        const w = size.width;
        const h = size.height;
        const d = size.depth;
        switch (spec.prop) {
            case "plant": {
                cylinder(THREE, group, w * 0.3, w * 0.24, h * 0.3, [0, bottom + h * 0.15, 0], standard(THREE, "#8a4b2a", 0.8));
                cylinder(THREE, group, w * 0.26, w * 0.26, 0.03, [0, bottom + h * 0.3, 0], standard(THREE, "#3b2a1c", 0.95));
                for (let index = 0; index < 6; index += 1) {
                    const angle = index * Math.PI / 3;
                    const leaf = box(THREE, group, [w * 0.18, h * 0.55, 0.02], [Math.cos(angle) * w * 0.14, bottom + h * 0.58, Math.sin(angle) * w * 0.14], tint);
                    leaf.rotation.set(0.35, -angle, 0.25);
                }
                break;
            }
            case "bench": {
                box(THREE, group, [w, 0.08, d], [0, bottom + h * 0.6, 0], tint);
                box(THREE, group, [w, 0.3, 0.06], [0, bottom + h * 0.85, -d / 2 + 0.03], tint);
                for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
                    box(THREE, group, [0.06, h * 0.56, d * 0.8], [x, bottom + h * 0.28, 0], dark);
                }
                break;
            }
            case "stool": {
                cylinder(THREE, group, w / 2, w / 2, 0.08, [0, bottom + h - 0.04, 0], tint);
                cylinder(THREE, group, 0.03, 0.03, h - 0.12, [0, bottom + (h - 0.12) / 2, 0], metal, 10);
                cylinder(THREE, group, w * 0.45, w * 0.45, 0.03, [0, bottom + 0.015, 0], metal);
                break;
            }
            case "table": {
                cylinder(THREE, group, w / 2, w / 2, 0.05, [0, bottom + h - 0.025, 0], tint, 24);
                cylinder(THREE, group, 0.04, 0.04, h - 0.1, [0, bottom + (h - 0.1) / 2, 0], metal, 10);
                cylinder(THREE, group, w * 0.35, w * 0.35, 0.04, [0, bottom + 0.02, 0], metal, 24);
                break;
            }
            case "beanbag": {
                const bag = sphere(THREE, group, w / 2, [0, bottom + h * 0.45, 0], standard(THREE, color, 0.95, 0));
                bag.scale.set(1, h / w, 1);
                break;
            }
            case "floor-lamp": {
                cylinder(THREE, group, w * 0.4, w * 0.4, 0.03, [0, bottom + 0.015, 0], dark);
                cylinder(THREE, group, 0.02, 0.02, h * 0.75, [0, bottom + h * 0.4, 0], metal, 8);
                cylinder(THREE, group, w * 0.3, w * 0.5, h * 0.22, [0, bottom + h * 0.88, 0], standard(THREE, "#e9dfc6", 0.9, 0), 20);
                sphere(THREE, group, 0.05, [0, bottom + h * 0.82, 0], glow(THREE, color, 1.8));
                break;
            }
            case "trash-can": {
                cylinder(THREE, group, w / 2, w * 0.42, h * 0.9, [0, bottom + h * 0.45, 0], tint, 18);
                cylinder(THREE, group, w * 0.52, w * 0.52, h * 0.1, [0, bottom + h * 0.95, 0], dark, 18);
                cylinder(THREE, group, w * 0.2, w * 0.2, h * 0.11, [0, bottom + h * 0.95, 0], standard(THREE, "#050608", 1), 18);
                break;
            }
            case "stanchion": {
                cylinder(THREE, group, w / 2, w / 2, 0.03, [0, bottom + 0.015, 0], tint, 20);
                cylinder(THREE, group, 0.025, 0.025, h - 0.1, [0, bottom + (h - 0.1) / 2, 0], tint, 12);
                sphere(THREE, group, 0.045, [0, bottom + h - 0.04, 0], tint);
                // A velvet rope loop draped off the front.
                const rope = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24, Math.PI), standard(THREE, "#7a1626", 0.9));
                rope.position.set(0.22, bottom + h - 0.08, 0.03);
                rope.rotation.z = Math.PI;
                group.add(rope);
                break;
            }
            case "jukebox": {
                buildJukebox(THREE, group, size, color);
                break;
            }
            case "vending": {
                box(THREE, group, [w, h, d], [0, 0, 0], tint);
                box(THREE, group, [w * 0.62, h * 0.62, 0.02], [-w * 0.12, h * 0.1, d / 2 + 0.005], glow(THREE, "#cfe8ff", 0.7), false);
                box(THREE, group, [w * 0.18, h * 0.5, 0.02], [w * 0.36, h * 0.15, d / 2 + 0.005], dark, false);
                box(THREE, group, [w * 0.7, h * 0.14, 0.03], [-w * 0.1, -h * 0.36, d / 2 + 0.01], dark, false);
                for (let row = 0; row < 4; row += 1) {
                    box(THREE, group, [w * 0.56, 0.015, 0.03], [-w * 0.12, -h * 0.16 + row * h * 0.16, d / 2 + 0.01], metal, false);
                }
                break;
            }
            case "claw": {
                buildClawMachine(THREE, group, size, color);
                break;
            }
            case "pinball": {
                const body = box(THREE, group, [w, 0.22, d], [0, bottom + 0.82, 0], tint);
                body.rotation.x = 0.1;
                for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
                    for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) {
                        box(THREE, group, [0.06, 0.7, 0.06], [x, bottom + 0.35, z], dark);
                    }
                }
                box(THREE, group, [w, h * 0.42, 0.16], [0, bottom + h * 0.72, -d / 2 + 0.08], tint);
                box(THREE, group, [w * 0.86, h * 0.32, 0.02], [0, bottom + h * 0.73, -d / 2 + 0.17], glow(THREE, "#ffe9b8", 0.9), false);
                const playfield = box(THREE, group, [w * 0.9, 0.01, d * 0.9], [0, bottom + 0.94, 0], glow(THREE, "#2b1a44", 0.35), false);
                playfield.rotation.x = 0.1;
                break;
            }
            case "popcorn": {
                buildPopcornCart(THREE, group, size, color);
                break;
            }
            case "counter": {
                box(THREE, group, [w, h * 0.9, d], [0, bottom + h * 0.45, 0], standard(THREE, "#26313b", 0.6, 0.2));
                box(THREE, group, [w + 0.08, 0.06, d + 0.08], [0, bottom + h * 0.93, 0], standard(THREE, "#c7ccd3", 0.3, 0.6));
                box(THREE, group, [w * 0.96, 0.04, 0.02], [0, bottom + h * 0.2, d / 2 + 0.01], glow(THREE, color, 2), false);
                box(THREE, group, [w * 0.9, h * 0.45, 0.02], [0, bottom + h * 0.55, d / 2 + 0.01], glow(THREE, "#0d1b28", 0.6), false);
                for (let index = 0; index < 4; index += 1) {
                    sphere(THREE, group, 0.07, [(index - 1.5) * w * 0.2, bottom + h * 0.55, d / 2 + 0.03], standard(THREE, ["#ff5caf", "#ffd33d", "#7dff4d", "#22e5ff"][index], 0.8));
                }
                break;
            }
            case "speaker-stack": {
                box(THREE, group, [w, h * 0.55, d], [0, bottom + h * 0.275, 0], tint);
                box(THREE, group, [w * 0.9, h * 0.42, d * 0.9], [0, bottom + h * 0.78, 0], tint);
                const cone = standard(THREE, "#3a3e46", 0.9);
                const woofer = cylinder(THREE, group, w * 0.34, w * 0.34, 0.02, [0, bottom + h * 0.28, d / 2], cone, 24);
                woofer.rotation.x = Math.PI / 2;
                const tweeter = cylinder(THREE, group, w * 0.2, w * 0.2, 0.02, [0, bottom + h * 0.78, d / 2 * 0.9], cone, 20);
                tweeter.rotation.x = Math.PI / 2;
                break;
            }
            default:
                box(THREE, group, [w, h, d], [0, 0, 0], tint);
        }
    },
    "wall-prop": (THREE, group, size, color, spec) => {
        const tint = standard(THREE, color, 0.55, 0.15);
        const dark = standard(THREE, "#1a1d24", 0.5, 0.35);
        const w = size.width;
        const h = size.height;
        const d = size.depth;
        switch (spec.prop) {
            case "clock": {
                const rim = cylinder(THREE, group, w / 2, w / 2, d * 0.6, [0, 0, 0], dark, 32);
                rim.rotation.x = Math.PI / 2;
                canvasPlane(THREE, group, w * 0.9, h * 0.9, [256, 256], (context, cw, ch) => {
                    context.fillStyle = color;
                    context.beginPath();
                    context.arc(cw / 2, ch / 2, cw / 2, 0, Math.PI * 2);
                    context.fill();
                    context.strokeStyle = "#111318";
                    context.lineWidth = 6;
                    for (let index = 0; index < 12; index += 1) {
                        const angle = index * Math.PI / 6;
                        context.beginPath();
                        context.moveTo(cw / 2 + Math.cos(angle) * cw * 0.4, ch / 2 + Math.sin(angle) * ch * 0.4);
                        context.lineTo(cw / 2 + Math.cos(angle) * cw * 0.46, ch / 2 + Math.sin(angle) * ch * 0.46);
                        context.stroke();
                    }
                    context.lineWidth = 8;
                    context.beginPath();
                    context.moveTo(cw / 2, ch / 2);
                    context.lineTo(cw / 2 + cw * 0.28, ch / 2 - ch * 0.1);
                    context.moveTo(cw / 2, ch / 2);
                    context.lineTo(cw / 2 - cw * 0.05, ch / 2 - ch * 0.36);
                    context.stroke();
                }, [0, 0, d * 0.31], false);
                break;
            }
            case "shelf": {
                box(THREE, group, [w, 0.04, d], [0, h * 0.1, 0], tint);
                for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
                    box(THREE, group, [0.03, h * 0.7, d * 0.8], [x, -h * 0.28, -d * 0.1], dark);
                }
                // A few things on the shelf so it is not an empty plank.
                box(THREE, group, [0.12, 0.16, 0.1], [-w * 0.3, h * 0.1 + 0.1, 0], standard(THREE, "#22e5ff", 0.5));
                box(THREE, group, [0.09, 0.2, 0.1], [-w * 0.15, h * 0.1 + 0.12, 0], standard(THREE, "#ff5caf", 0.5));
                cylinder(THREE, group, 0.06, 0.05, 0.14, [w * 0.25, h * 0.1 + 0.09, 0], standard(THREE, "#ffd33d", 0.5), 12);
                break;
            }
            case "speaker": {
                box(THREE, group, [w, h, d], [0, 0, 0], tint);
                const cone = cylinder(THREE, group, w * 0.34, w * 0.34, 0.02, [0, -h * 0.18, d / 2], standard(THREE, "#3a3e46", 0.9), 20);
                cone.rotation.x = Math.PI / 2;
                const tweeter = cylinder(THREE, group, w * 0.15, w * 0.15, 0.02, [0, h * 0.28, d / 2], standard(THREE, "#3a3e46", 0.9), 16);
                tweeter.rotation.x = Math.PI / 2;
                break;
            }
            case "tv": {
                box(THREE, group, [w, h, d], [0, 0, 0], dark);
                box(THREE, group, [w * 0.94, h * 0.9, 0.01], [0, 0, d / 2 + 0.003], glow(THREE, color, 0.9), false);
                break;
            }
            case "mirror": {
                box(THREE, group, [w, h, d], [0, 0, 0], tint);
                box(THREE, group, [w * 0.86, h * 0.9, 0.01], [0, 0, d / 2 + 0.003], new THREE.MeshStandardMaterial({ color: "#cfd8e6", roughness: 0.05, metalness: 1 }), false);
                break;
            }
            case "exit-sign": {
                box(THREE, group, [w, h, d], [0, 0, 0], dark);
                canvasPlane(THREE, group, w * 0.94, h * 0.85, [512, 256], (context, cw, ch) => {
                    context.fillStyle = color;
                    context.fillRect(0, 0, cw, ch);
                    context.fillStyle = "#0b0d12";
                    context.font = "900 170px 'Arial Black', Impact, sans-serif";
                    context.textAlign = "center";
                    context.textBaseline = "middle";
                    context.fillText("EXIT", cw / 2, ch / 2 + 8);
                }, [0, 0, d / 2 + 0.003], false);
                break;
            }
            case "coat-hook": {
                box(THREE, group, [w, h * 0.5, 0.03], [0, h * 0.1, 0.015], standard(THREE, "#5a3d24", 0.7));
                for (let index = 0; index < 3; index += 1) {
                    const hook = cylinder(THREE, group, 0.012, 0.012, d, [(index - 1) * w * 0.3, -h * 0.1, d / 2], tint, 8);
                    hook.rotation.x = Math.PI / 2;
                    sphere(THREE, group, 0.02, [(index - 1) * w * 0.3, -h * 0.1, d], tint);
                }
                break;
            }
            default:
                box(THREE, group, [w, h, d], [0, 0, 0], tint);
        }
    },
};
/** Where the centred model sits relative to the stored point, per mount. */
export function mountOffset(mount, size) {
    if (mount === "wall")
        return { x: 0, y: 0, z: size.depth / 2 };
    if (mount === "ceiling")
        return { x: 0, y: -size.height / 2, z: 0 };
    return { x: 0, y: size.height / 2, z: 0 };
}
/** Where a lit item's light source goes, in the centred frame: just off the emitting face. */
function lightOffset(definition, mount, size) {
    if (mount === "wall")
        return [0, 0, size.depth / 2 + 0.18];
    if (mount === "ceiling")
        return [0, -size.height / 2 - 0.2, 0];
    if (definition.model.kind === "strip")
        return [0, size.height / 2 + 0.15, 0];
    return [0, size.height * 0.4, size.depth / 2 + 0.1];
}
/**
 * The spec a builder gets: the catalog's, with the row's own words or picture
 * written over it for the items built to carry them. Builders never read the row.
 */
function modelSpecFor(definition, item) {
    const spec = definition.model;
    if (spec.kind === "text-sign" && definition.text.enabled)
        return { ...spec, text: decorSignText(definition, item) };
    if (spec.kind === "poster" && definition.image.enabled)
        return { ...spec, image: item.image };
    return spec;
}
export function createDecorModel(THREE, definition, item, lit) {
    const root = new THREE.Group();
    root.name = item.instanceId;
    root.userData = { decorInstanceId: item.instanceId, decorItemId: item.itemId };
    // The builder always works at catalog size (a stretched strip's length included) and
    // the group is scaled, so every builder's hard-coded thicknesses grow with the item.
    const base = decorExtent(definition, { ...item, scale: 1 });
    const size = decorExtent(definition, item);
    const factor = definition.scale.enabled ? size.height / base.height : 1;
    const color = item.color || definition.tint.default || "#ffffff";
    const centred = new THREE.Group();
    const offset = mountOffset(item.mount, size);
    centred.position.set(offset.x, offset.y, offset.z);
    centred.scale.setScalar(factor);
    BUILDERS[definition.model.kind](THREE, centred, base, color, modelSpecFor(definition, item));
    if (definition.light && lit) {
        const light = new THREE.PointLight(color, definition.light.intensity, definition.light.distance * Math.sqrt(factor), 2);
        light.position.set(...lightOffset(definition, item.mount, base));
        centred.add(light);
    }
    root.add(centred);
    return root;
}
/**
 * Position and orientation from the layout row; the model itself is untouched.
 * The spin is applied first (Euler XYZ turns about Z before Y), so a wall item
 * turns in its wall's plane and then faces the room, and its stand-off from
 * the wall — along that same Z — is unchanged by the turn.
 */
export function placeDecorModel(model, item) {
    model.position.set(item.x, item.y, item.z);
    model.rotation.set(0, item.rotationY, item.mount === "wall" ? item.spin : 0);
}
/**
 * Breathe the jukebox's bubble tubes while a record plays: `pulse` is 0–1 from the room's
 * clock, 0 meaning silent, and only meshes the builder tagged are touched.
 */
export function pulseJukeboxGlow(model, pulse) {
    if (!model)
        return;
    const intensity = 2.2 + pulse * 1.8;
    model.traverse((object) => {
        if (object.userData?.jukeboxGlow && object.material)
            object.material.emissiveIntensity = intensity;
    });
}
export function disposeDecorModel(model) {
    model.traverse((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        for (const material of materials) {
            material.map?.dispose?.();
            material.dispose?.();
        }
    });
    model.parent?.remove(model);
}
