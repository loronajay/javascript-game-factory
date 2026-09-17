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
import { decorExtent } from "./arcade-room-catalog/decor.mjs";
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
const BUILDERS = {
    "strip": (THREE, group, size, color) => {
        box(THREE, group, [size.width, size.height * 0.7, size.depth * 0.7], [0, 0, -size.depth * 0.1], standard(THREE, "#1a1d24", 0.5, 0.4), false);
        box(THREE, group, [size.width, size.height, size.depth], [0, 0, 0], glow(THREE, color, 2.6), false);
    },
    "text-sign": (THREE, group, size, color, spec) => {
        box(THREE, group, [size.width, size.height, size.depth * 0.3], [0, 0, -size.depth * 0.3], standard(THREE, "#0b0d12", 0.6, 0.3), false);
        canvasPlane(THREE, group, size.width, size.height, [1024, Math.round(1024 * size.height / size.width)], (context, w, h) => {
            drawNeonText(context, w, h, spec.text, spec.font, color);
        }, [0, 0, size.depth * 0.2]);
    },
    "shape-sign": (THREE, group, size, color, spec) => {
        box(THREE, group, [size.width, size.height, size.depth * 0.3], [0, 0, -size.depth * 0.3], standard(THREE, "#0b0d12", 0.6, 0.3), false);
        canvasPlane(THREE, group, size.width, size.height, [512, Math.round(512 * size.height / size.width)], (context, w, h) => {
            drawNeonShape(context, w, h, spec.shape, color, 18);
        }, [0, 0, size.depth * 0.2]);
    },
    "poster": (THREE, group, size, _color, spec) => {
        box(THREE, group, [size.width, size.height, size.depth], [0, 0, 0], standard(THREE, spec.frame, 0.5, 0.2), false);
        const texture = new THREE.TextureLoader().load(spec.image);
        texture.colorSpace = THREE.SRGBColorSpace;
        const print = new THREE.Mesh(new THREE.PlaneGeometry(size.width - 0.08, size.height - 0.08), new THREE.MeshBasicMaterial({ map: texture }));
        print.position.set(0, 0, size.depth / 2 + 0.002);
        group.add(print);
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
                box(THREE, group, [w, h * 0.62, d], [0, bottom + h * 0.31, 0], standard(THREE, "#3a1e12", 0.55, 0.15));
                const dome = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 24, 1, false, 0, Math.PI), standard(THREE, "#3a1e12", 0.55, 0.15));
                dome.rotation.set(Math.PI / 2, 0, 0);
                dome.position.set(0, bottom + h * 0.62, 0);
                group.add(dome);
                const arch = new THREE.Mesh(new THREE.TorusGeometry(w * 0.42, 0.035, 8, 24, Math.PI), glow(THREE, color, 2));
                arch.position.set(0, bottom + h * 0.62, d / 2 + 0.01);
                group.add(arch);
                box(THREE, group, [w * 0.7, h * 0.22, 0.02], [0, bottom + h * 0.52, d / 2 + 0.005], glow(THREE, "#ffd8a8", 0.8), false);
                box(THREE, group, [w * 0.8, h * 0.16, 0.03], [0, bottom + h * 0.2, d / 2 + 0.01], standard(THREE, "#c9a24a", 0.3, 0.8), false);
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
                box(THREE, group, [w, h * 0.42, d], [0, bottom + h * 0.21, 0], tint);
                box(THREE, group, [w, h * 0.1, d], [0, bottom + h * 0.95, 0], tint);
                for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
                    for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) {
                        box(THREE, group, [0.05, h * 0.5, 0.05], [x, bottom + h * 0.67, z], metal);
                    }
                }
                const glass = box(THREE, group, [w - 0.1, h * 0.48, d - 0.1], [0, bottom + h * 0.66, 0], new THREE.MeshStandardMaterial({ color: "#9fd8ff", transparent: true, opacity: 0.22, roughness: 0.1 }), false);
                glass.castShadow = false;
                for (let index = 0; index < 5; index += 1) {
                    sphere(THREE, group, 0.07, [(index - 2) * 0.13, bottom + h * 0.49, (index % 2 ? 0.12 : -0.1)], standard(THREE, ["#ff5caf", "#ffd33d", "#7dff4d", "#22e5ff", "#a35bff"][index], 0.8));
                }
                box(THREE, group, [w * 0.8, 0.05, 0.02], [0, bottom + h * 0.92, d / 2 + 0.01], glow(THREE, color, 1.8), false);
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
                box(THREE, group, [w, h * 0.42, d], [0, bottom + h * 0.21, 0], standard(THREE, "#b3202c", 0.55));
                for (const x of [-w / 2 + 0.05, w / 2 - 0.05])
                    box(THREE, group, [0.04, h * 0.5, 0.04], [x, bottom + h * 0.66, d / 2 - 0.05], metal);
                for (const x of [-w / 2 + 0.05, w / 2 - 0.05])
                    box(THREE, group, [0.04, h * 0.5, 0.04], [x, bottom + h * 0.66, -d / 2 + 0.05], metal);
                const glass = box(THREE, group, [w - 0.06, h * 0.45, d - 0.06], [0, bottom + h * 0.64, 0], new THREE.MeshStandardMaterial({ color: "#ffe6a8", transparent: true, opacity: 0.28, roughness: 0.1 }), false);
                glass.castShadow = false;
                box(THREE, group, [w, h * 0.12, d], [0, bottom + h * 0.92, 0], standard(THREE, "#b3202c", 0.55));
                box(THREE, group, [w * 0.7, h * 0.08, 0.02], [0, bottom + h * 0.92, d / 2 + 0.01], glow(THREE, color, 1.5), false);
                for (const z of [-d * 0.3, d * 0.3]) {
                    const wheel = cylinder(THREE, group, 0.12, 0.12, 0.04, [w / 2 + 0.02, bottom + 0.12, z], dark, 16);
                    wheel.rotation.z = Math.PI / 2;
                }
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
export function createDecorModel(THREE, definition, item, lit) {
    const root = new THREE.Group();
    root.name = item.instanceId;
    root.userData = { decorInstanceId: item.instanceId, decorItemId: item.itemId };
    // The builder always works at catalog size (a stretched strip's length included) and
    // the group is scaled, so every builder's hard-coded thicknesses grow with the item.
    const base = decorExtent(definition, item.length, 1);
    const size = decorExtent(definition, item.length, item.scale);
    const factor = definition.scale.enabled ? size.height / base.height : 1;
    const color = item.color || definition.tint.default || "#ffffff";
    const centred = new THREE.Group();
    const offset = mountOffset(item.mount, size);
    centred.position.set(offset.x, offset.y, offset.z);
    centred.scale.setScalar(factor);
    BUILDERS[definition.model.kind](THREE, centred, base, color, definition.model);
    if (definition.light && lit) {
        const light = new THREE.PointLight(color, definition.light.intensity, definition.light.distance * Math.sqrt(factor), 2);
        light.position.set(...lightOffset(definition, item.mount, base));
        centred.add(light);
    }
    root.add(centred);
    return root;
}
/** Position and orientation from the layout row; the model itself is untouched. */
export function placeDecorModel(model, item) {
    model.position.set(item.x, item.y, item.z);
    model.rotation.set(0, item.rotationY, 0);
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
