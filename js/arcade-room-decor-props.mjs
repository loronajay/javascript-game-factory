// The second shelf of procedural decor: tables and seating, arcade-floor
// props, wall fittings, ceiling fittings and the lit fixtures that hang from
// the ceiling. Same rules as the builders in `arcade-room-decor-model.mts`:
// every model is boxes, cylinders, spheres and canvas-drawn planes from
// `arcade-room-decor-primitives.mts`, built CENTRED on its bounding box with
// the front on +Z, so one wrapper places it on any mount. The tables keyed by
// prop name are what the model file falls through to when its own switch does
// not know a prop, which keeps each new item a catalog row plus one entry here.
import { box, canvasPlane, cylinder, glow, lighten, sphere, standard, withAlpha } from "./arcade-room-decor-primitives.mjs";
/** A few cheerful colours for the small things on shelves: game boxes, prizes, gumballs. */
const PARTY = ["#ff5caf", "#ffd33d", "#7dff4d", "#22e5ff", "#a35bff", "#ff7a1a", "#f4f8ff", "#ff3b3b"];
function chrome(THREE) {
    return standard(THREE, "#d8dde4", 0.2, 0.9);
}
function dark(THREE) {
    return standard(THREE, "#1a1d24", 0.5, 0.35);
}
function wood(THREE, color = "#5a3a22") {
    return standard(THREE, color, 0.55, 0.08);
}
function glass(THREE, tint = "#bfe6ff") {
    return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28 });
}
/** Four straight legs inside the corners of a `w` × `d` top, `height` tall, standing on `bottom`. */
function legs(THREE, group, w, d, height, bottom, material, thickness = 0.05, inset = 0.08) {
    for (const x of [-w / 2 + inset, w / 2 - inset]) {
        for (const z of [-d / 2 + inset, d / 2 - inset]) {
            box(THREE, group, [thickness, height, thickness], [x, bottom + height / 2, z], material);
        }
    }
}
/** Block letters centred on a canvas, shrunk until the line fits. */
function fitText(context, text, cw, ch, fill, weight = "900", family = "'Arial Black', Impact, sans-serif") {
    let px = Math.round(ch * 0.62);
    context.textAlign = "center";
    context.textBaseline = "middle";
    do {
        context.font = `${weight} ${px}px ${family}`;
        px -= 4;
    } while (px > 12 && context.measureText(text).width > cw * 0.9);
    context.fillStyle = fill;
    context.fillText(text, cw / 2, ch / 2 + ch * 0.03);
}
// ————————————————————————————————————————————————————————————————————————————
// Furniture
const FURNITURE = {
    // A pedestal table for four, with four stools tucked round it: one item, one drag.
    "round-table": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        const top = wood(THREE, color);
        cylinder(THREE, group, w * 0.38, w * 0.38, 0.05, [0, bottom + h - 0.025, 0], top, 28);
        cylinder(THREE, group, 0.05, 0.05, h - 0.1, [0, bottom + (h - 0.1) / 2, 0], chrome(THREE), 10);
        cylinder(THREE, group, w * 0.2, w * 0.2, 0.04, [0, bottom + 0.02, 0], chrome(THREE), 24);
        for (let index = 0; index < 4; index += 1) {
            const angle = index * Math.PI / 2 + Math.PI / 4;
            const x = Math.cos(angle) * w * 0.42;
            const z = Math.sin(angle) * w * 0.42;
            cylinder(THREE, group, 0.15, 0.15, 0.06, [x, bottom + h * 0.6, z], standard(THREE, "#ff3b3b", 0.6), 16);
            cylinder(THREE, group, 0.025, 0.025, h * 0.57, [x, bottom + h * 0.285, z], chrome(THREE), 8);
            cylinder(THREE, group, 0.12, 0.12, 0.02, [x, bottom + 0.01, z], chrome(THREE), 16);
        }
    },
    // A trestle table: a plank top on two A-frame ends, so stretching it only lengthens the plank.
    "long-table": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        box(THREE, group, [w, 0.06, d], [0, bottom + h - 0.03, 0], wood(THREE, color));
        box(THREE, group, [w - 0.3, 0.05, 0.08], [0, bottom + h - 0.1, 0], dark(THREE));
        for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) {
            for (const sign of [-1, 1]) {
                const leg = box(THREE, group, [0.06, h - 0.08, 0.06], [x, bottom + (h - 0.08) / 2, sign * d * 0.3], dark(THREE));
                leg.rotation.x = -sign * 0.22;
            }
            box(THREE, group, [0.06, 0.05, d * 0.8], [x, bottom + 0.025, 0], dark(THREE));
        }
    },
    // A glass top over a frame in the tint, with a lower shelf and a magazine on it.
    "coffee-table": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const frame = standard(THREE, color, 0.45, 0.4);
        const top = box(THREE, group, [w, 0.02, d], [0, bottom + h - 0.01, 0], glass(THREE), false);
        top.castShadow = false;
        box(THREE, group, [w * 0.9, 0.03, d * 0.85], [0, bottom + h * 0.35, 0], frame);
        legs(THREE, group, w, d, h - 0.02, bottom, frame, 0.04, 0.05);
        box(THREE, group, [0.22, 0.01, 0.3], [-w * 0.2, bottom + h * 0.37, 0], standard(THREE, "#ff5caf", 0.7));
        box(THREE, group, [0.16, 0.01, 0.24], [w * 0.22, bottom + h * 0.37, d * 0.1], standard(THREE, "#22e5ff", 0.7));
    },
    // Bar height: a round top on a chrome pole with a foot ring.
    "high-top": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        cylinder(THREE, group, w / 2, w / 2, 0.04, [0, bottom + h - 0.02, 0], standard(THREE, color, 0.35, 0.2), 28);
        cylinder(THREE, group, 0.035, 0.035, h - 0.08, [0, bottom + (h - 0.08) / 2, 0], chrome(THREE), 10);
        cylinder(THREE, group, w * 0.32, w * 0.32, 0.03, [0, bottom + 0.015, 0], chrome(THREE), 24);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.26, 0.012, 8, 28), chrome(THREE));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, bottom + h * 0.3, 0);
        group.add(ring);
    },
    // Three cushions on a base, a back and two arms, all in the tint fabric; the feet are dark.
    "sofa": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const fabric = standard(THREE, color, 0.95, 0);
        const deep = standard(THREE, color, 0.95, 0);
        box(THREE, group, [w, h * 0.3, d], [0, bottom + h * 0.2, 0], deep);
        const seats = Math.max(1, Math.round(w / 0.66));
        const seatW = (w - 0.3) / seats;
        for (let index = 0; index < seats; index += 1) {
            box(THREE, group, [seatW - 0.03, h * 0.16, d * 0.7], [-w / 2 + 0.15 + seatW * (index + 0.5), bottom + h * 0.43, d * 0.1], fabric);
        }
        box(THREE, group, [w - 0.3, h * 0.6, d * 0.22], [0, bottom + h * 0.62, -d / 2 + d * 0.11], fabric);
        for (const sign of [-1, 1])
            box(THREE, group, [0.15, h * 0.7, d], [sign * (w / 2 - 0.075), bottom + h * 0.4, 0], fabric);
        legs(THREE, group, w, d, 0.06, bottom, dark(THREE), 0.05, 0.1);
    },
    "armchair": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const fabric = standard(THREE, color, 0.95, 0);
        box(THREE, group, [w, h * 0.3, d], [0, bottom + h * 0.2, 0], fabric);
        box(THREE, group, [w - 0.3, h * 0.16, d * 0.7], [0, bottom + h * 0.43, d * 0.1], fabric);
        box(THREE, group, [w - 0.3, h * 0.6, d * 0.22], [0, bottom + h * 0.62, -d / 2 + d * 0.11], fabric);
        for (const sign of [-1, 1])
            box(THREE, group, [0.15, h * 0.7, d], [sign * (w / 2 - 0.075), bottom + h * 0.4, 0], fabric);
        legs(THREE, group, w, d, 0.06, bottom, dark(THREE), 0.05, 0.1);
    },
    // A bar: dark body, a lit strip under the top on the front, a back shelf of bottles and a foot rail.
    // The front is +Z; a stretched bar is more counter and more bottles.
    "bar": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const body = standard(THREE, "#14161c", 0.55, 0.25);
        box(THREE, group, [w, h * 0.92, d * 0.62], [0, bottom + h * 0.46, d * 0.19], body);
        box(THREE, group, [w + 0.06, 0.05, d * 0.7], [0, bottom + h - 0.025, d * 0.15], standard(THREE, "#2b1a0e", 0.35, 0.2));
        box(THREE, group, [w * 0.96, 0.02, 0.015], [0, bottom + h * 0.86, d / 2 + 0.008], glow(THREE, color, 2.2), false);
        const rail = cylinder(THREE, group, 0.02, 0.02, w * 0.96, [0, bottom + 0.22, d / 2 + 0.1], chrome(THREE), 10);
        rail.rotation.z = Math.PI / 2;
        // The back shelf: a step behind the counter with bottles along it.
        box(THREE, group, [w, h * 0.5, d * 0.3], [0, bottom + h * 0.25, -d / 2 + d * 0.15], body);
        box(THREE, group, [w, 0.03, d * 0.3], [0, bottom + h * 0.52, -d / 2 + d * 0.15], glow(THREE, color, 0.6), false);
        const bottles = Math.max(2, Math.round(w / 0.28));
        for (let index = 0; index < bottles; index += 1) {
            const x = -w / 2 + 0.14 + (w - 0.28) * (index / Math.max(1, bottles - 1));
            const shade = PARTY[index % PARTY.length];
            cylinder(THREE, group, 0.035, 0.04, 0.22, [x, bottom + h * 0.52 + 0.11, -d / 2 + d * 0.15], new THREE.MeshStandardMaterial({ color: shade, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.8 }), 10);
            cylinder(THREE, group, 0.012, 0.012, 0.08, [x, bottom + h * 0.52 + 0.26, -d / 2 + d * 0.15], dark(THREE), 8);
        }
    },
    // A tall case full of game boxes in party colours: the tint is the timber.
    "bookcase": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const timber = wood(THREE, color);
        box(THREE, group, [w, h, 0.02], [0, 0, -d / 2 + 0.01], timber);
        for (const sign of [-1, 1])
            box(THREE, group, [0.03, h, d], [sign * (w / 2 - 0.015), 0, 0], timber);
        const shelves = 5;
        let seed = 3;
        for (let index = 0; index <= shelves; index += 1) {
            const y = bottom + (h / shelves) * index;
            box(THREE, group, [w - 0.06, 0.03, d], [0, Math.min(h / 2 - 0.015, Math.max(bottom + 0.015, y)), 0], timber);
            if (index === shelves)
                break;
            let x = -w / 2 + 0.06;
            while (x < w / 2 - 0.12) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const boxW = 0.04 + (seed % 5) * 0.012;
                const boxH = (h / shelves) * (0.55 + ((seed >> 8) % 4) * 0.08);
                box(THREE, group, [boxW, boxH, d * 0.7], [x + boxW / 2, y + 0.03 + boxH / 2, -d * 0.05], standard(THREE, PARTY[(seed >> 4) % PARTY.length], 0.6), false);
                x += boxW + 0.008;
            }
        }
    },
    // A diner booth: two facing vinyl benches with a table between, open on the front.
    "booth": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const vinyl = standard(THREE, color, 0.45, 0.05);
        const benchW = w * 0.28;
        for (const sign of [-1, 1]) {
            const x = sign * (w / 2 - benchW / 2);
            box(THREE, group, [benchW, h * 0.42, d], [x, bottom + h * 0.21, 0], vinyl);
            box(THREE, group, [benchW * 0.4, h, d], [x + sign * benchW * 0.3, 0, 0], vinyl);
            box(THREE, group, [benchW, 0.05, d], [x, bottom + h * 0.42, 0], standard(THREE, lighten(color, 0.25), 0.4));
        }
        box(THREE, group, [w * 0.4, 0.05, d * 0.7], [0, bottom + h * 0.66, -d * 0.1], standard(THREE, "#e9e4d6", 0.4, 0.1));
        cylinder(THREE, group, 0.04, 0.04, h * 0.64, [0, bottom + h * 0.32, -d * 0.1], chrome(THREE), 10);
        cylinder(THREE, group, 0.16, 0.16, 0.03, [0, bottom + 0.015, -d * 0.1], chrome(THREE), 20);
    },
    // A bank of three lockers in the tint, each with a vent, a handle and a number.
    "lockers": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const paint = standard(THREE, color, 0.4, 0.5);
        box(THREE, group, [w, h, d], [0, 0, 0], paint);
        const doors = 3;
        const doorW = w / doors;
        for (let index = 0; index < doors; index += 1) {
            const x = -w / 2 + doorW * (index + 0.5);
            box(THREE, group, [doorW - 0.03, h - 0.06, 0.01], [x, 0, d / 2 + 0.005], standard(THREE, lighten(color, 0.08), 0.4, 0.5), false);
            for (let slat = 0; slat < 5; slat += 1)
                box(THREE, group, [doorW * 0.5, 0.012, 0.01], [x, bottom + h * 0.82 - slat * 0.035, d / 2 + 0.012], dark(THREE), false);
            box(THREE, group, [0.03, 0.09, 0.02], [x + doorW * 0.32, bottom + h * 0.5, d / 2 + 0.02], chrome(THREE), false);
            canvasPlane(THREE, group, doorW * 0.4, 0.09, [128, 40], (context, cw, ch) => {
                context.fillStyle = "#f4f8ff";
                context.fillRect(0, 0, cw, ch);
                fitText(context, String(index + 1).padStart(2, "0"), cw, ch, "#111318", "700");
            }, [x, bottom + h * 0.92, d / 2 + 0.012], false);
        }
        box(THREE, group, [w, 0.08, d], [0, bottom + 0.04, 0], dark(THREE));
    },
};
// ————————————————————————————————————————————————————————————————————————————
// Props
const PROPS = {
    "gumball": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        const paint = standard(THREE, color, 0.35, 0.2);
        cylinder(THREE, group, w * 0.42, w / 2, h * 0.45, [0, bottom + h * 0.225, 0], paint, 20);
        box(THREE, group, [w * 0.5, 0.06, 0.02], [0, bottom + h * 0.3, w / 2 - 0.02], chrome(THREE), false);
        const globe = sphere(THREE, group, w * 0.46, [0, bottom + h * 0.7, 0], glass(THREE, "#eaf6ff"));
        globe.castShadow = false;
        let seed = 11;
        for (let index = 0; index < 22; index += 1) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const angle = (seed % 360) * Math.PI / 180;
            const radius = ((seed >> 8) % 100) / 100 * w * 0.32;
            const y = bottom + h * 0.52 + ((seed >> 16) % 100) / 100 * w * 0.3;
            sphere(THREE, group, w * 0.06, [Math.cos(angle) * radius, y, Math.sin(angle) * radius], standard(THREE, PARTY[index % PARTY.length], 0.4)).castShadow = false;
        }
        cylinder(THREE, group, w * 0.16, w * 0.16, h * 0.08, [0, bottom + h * 0.96, 0], chrome(THREE), 16);
    },
    // A coin change machine: a tall box, a lit face with CHANGE across it, a note slot and a coin tray.
    "change-machine": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, "#2b2f38", 0.5, 0.4));
        canvasPlane(THREE, group, w * 0.86, h * 0.2, [512, 128], (context, cw, ch) => {
            context.fillStyle = color;
            context.fillRect(0, 0, cw, ch);
            fitText(context, "CHANGE", cw, ch, "#111318");
        }, [0, bottom + h * 0.84, d / 2 + 0.003], false);
        box(THREE, group, [w * 0.86, h * 0.2, 0.01], [0, bottom + h * 0.84, d / 2 - 0.003], glow(THREE, color, 0.8), false);
        box(THREE, group, [w * 0.5, 0.03, 0.02], [0, bottom + h * 0.62, d / 2 + 0.01], dark(THREE), false);
        box(THREE, group, [w * 0.7, h * 0.12, 0.05], [0, bottom + h * 0.22, d / 2 + 0.02], dark(THREE), false);
        box(THREE, group, [w * 0.6, h * 0.03, 0.02], [0, bottom + h * 0.45, d / 2 + 0.01], chrome(THREE), false);
        for (let index = 0; index < 3; index += 1)
            box(THREE, group, [w * 0.6, 0.012, 0.01], [0, bottom + h * 0.36 - index * 0.03, d / 2 + 0.008], dark(THREE), false);
    },
    // A carnival wheel on a stand: wedges in party colours, a pointer, bulbs round the rim in the tint.
    "prize-wheel": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const radius = w * 0.48;
        const hub = bottom + h - radius - 0.05;
        box(THREE, group, [w * 0.5, 0.06, d], [0, bottom + 0.03, 0], dark(THREE));
        for (const sign of [-1, 1]) {
            const leg = box(THREE, group, [0.05, hub - bottom, 0.05], [sign * w * 0.12, bottom + (hub - bottom) / 2, sign * 0], dark(THREE));
            leg.rotation.z = -sign * 0.12;
        }
        const wheel = canvasPlane(THREE, group, radius * 2, radius * 2, [512, 512], (context, cw, ch) => {
            const wedges = 12;
            for (let index = 0; index < wedges; index += 1) {
                context.fillStyle = PARTY[index % PARTY.length];
                context.beginPath();
                context.moveTo(cw / 2, ch / 2);
                context.arc(cw / 2, ch / 2, cw / 2 - 4, index * Math.PI * 2 / wedges, (index + 1) * Math.PI * 2 / wedges);
                context.closePath();
                context.fill();
            }
            context.strokeStyle = "#111318";
            context.lineWidth = 6;
            for (let index = 0; index < wedges; index += 1) {
                const angle = index * Math.PI * 2 / wedges;
                context.beginPath();
                context.moveTo(cw / 2, ch / 2);
                context.lineTo(cw / 2 + Math.cos(angle) * cw / 2, ch / 2 + Math.sin(angle) * ch / 2);
                context.stroke();
            }
            context.fillStyle = "#111318";
            context.beginPath();
            context.arc(cw / 2, ch / 2, cw * 0.08, 0, Math.PI * 2);
            context.fill();
        }, [0, hub, d * 0.2], false);
        wheel.castShadow = true;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.02, 8, 40), dark(THREE));
        rim.position.set(0, hub, d * 0.2);
        group.add(rim);
        for (let index = 0; index < 12; index += 1) {
            const angle = index * Math.PI / 6;
            sphere(THREE, group, 0.02, [Math.cos(angle) * radius, hub + Math.sin(angle) * radius, d * 0.2 + 0.02], glow(THREE, color, 2)).castShadow = false;
        }
        const pointer = box(THREE, group, [0.06, 0.12, 0.02], [0, hub + radius + 0.02, d * 0.2 + 0.03], glow(THREE, color, 1.2), false);
        pointer.rotation.z = Math.PI;
    },
    // A photo booth: a box with a curtain across the front in the tint and a lit PHOTOS sign on top.
    "photo-booth": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        box(THREE, group, [w, h * 0.9, d], [0, bottom + h * 0.45, 0], standard(THREE, "#1f2230", 0.5, 0.3));
        const curtain = canvasPlane(THREE, group, w * 0.84, h * 0.76, [256, 512], (context, cw, ch) => {
            context.fillStyle = color;
            context.fillRect(0, 0, cw, ch);
            context.fillStyle = "rgba(0,0,0,.28)";
            for (let x = 0; x < cw; x += 32)
                context.fillRect(x, 0, 12, ch);
        }, [0, bottom + h * 0.42, d / 2 + 0.004], false);
        curtain.castShadow = false;
        box(THREE, group, [w * 0.9, 0.03, 0.03], [0, bottom + h * 0.81, d / 2 + 0.01], chrome(THREE), false);
        canvasPlane(THREE, group, w * 0.9, h * 0.1, [512, 96], (context, cw, ch) => {
            context.fillStyle = "#fff4d6";
            context.fillRect(0, 0, cw, ch);
            fitText(context, "PHOTOS", cw, ch, color);
        }, [0, bottom + h * 0.95, d / 2 + 0.003], false);
        box(THREE, group, [w, h * 0.1, d], [0, bottom + h * 0.95, 0], glow(THREE, "#fff4d6", 0.5));
    },
    // A foosball table: a green pitch in a tinted body on legs, with the rods and little men across it.
    "foosball": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const bodyH = h * 0.28;
        box(THREE, group, [w, bodyH, d], [0, bottom + h - bodyH / 2, 0], standard(THREE, color, 0.5, 0.1));
        box(THREE, group, [w - 0.08, 0.01, d - 0.08], [0, bottom + h - bodyH + 0.03, 0], standard(THREE, "#2f8f4a", 0.9), false);
        legs(THREE, group, w, d, h - bodyH, bottom, dark(THREE), 0.06, 0.1);
        const rods = 6;
        for (let index = 0; index < rods; index += 1) {
            const x = -w / 2 + (w / (rods + 1)) * (index + 1);
            const rod = cylinder(THREE, group, 0.01, 0.01, d + 0.3, [x, bottom + h - bodyH * 0.35, 0], chrome(THREE), 8);
            rod.rotation.x = Math.PI / 2;
            sphere(THREE, group, 0.03, [x, bottom + h - bodyH * 0.35, d / 2 + 0.16], standard(THREE, "#111318", 0.6)).castShadow = false;
            for (let man = 0; man < 3; man += 1) {
                box(THREE, group, [0.03, 0.09, 0.03], [x, bottom + h - bodyH * 0.35 - 0.05, -d * 0.3 + man * d * 0.3], standard(THREE, index % 2 ? "#ff3b3b" : "#3d7bff", 0.6), false);
            }
        }
    },
    // A dance pad: a nine-panel mat with lit arrows in the tint; flat, so the player can stand on it.
    "dance-pad": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const pad = canvasPlane(THREE, group, w, d, [512, 512], (context, cw, ch) => {
            context.fillStyle = "#14161c";
            context.fillRect(0, 0, cw, ch);
            const cell = cw / 3;
            context.strokeStyle = "#2b2f38";
            context.lineWidth = 6;
            for (let index = 0; index <= 3; index += 1) {
                context.beginPath();
                context.moveTo(index * cell, 0);
                context.lineTo(index * cell, ch);
                context.moveTo(0, index * cell);
                context.lineTo(cw, index * cell);
                context.stroke();
            }
            context.fillStyle = color;
            const arrow = (cx, cy, angle) => {
                context.save();
                context.translate(cx, cy);
                context.rotate(angle);
                context.beginPath();
                context.moveTo(0, -cell * 0.32);
                context.lineTo(cell * 0.3, 0);
                context.lineTo(cell * 0.12, 0);
                context.lineTo(cell * 0.12, cell * 0.3);
                context.lineTo(-cell * 0.12, cell * 0.3);
                context.lineTo(-cell * 0.12, 0);
                context.lineTo(-cell * 0.3, 0);
                context.closePath();
                context.fill();
                context.restore();
            };
            arrow(cell * 1.5, cell * 0.5, 0);
            arrow(cell * 1.5, cell * 2.5, Math.PI);
            arrow(cell * 0.5, cell * 1.5, -Math.PI / 2);
            arrow(cell * 2.5, cell * 1.5, Math.PI / 2);
            context.fillStyle = withAlpha(color, 0.25);
            context.beginPath();
            context.arc(cell * 1.5, cell * 1.5, cell * 0.28, 0, Math.PI * 2);
            context.fill();
        }, [0, h / 2 + 0.002, 0], false);
        pad.rotation.x = -Math.PI / 2;
        pad.receiveShadow = true;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, "#1a1d24", 0.6, 0.2));
    },
    // Three timber crates stacked two-and-one.
    "crates": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const timber = wood(THREE, color);
        const crate = (cw, ch, position, turn) => {
            const body = box(THREE, group, [cw, ch, cw], position, timber);
            body.rotation.y = turn;
            for (const y of [-ch * 0.34, ch * 0.34]) {
                const band = box(THREE, group, [cw + 0.01, ch * 0.12, cw + 0.01], [position[0], position[1] + y, position[2]], standard(THREE, color, 0.7), false);
                band.rotation.y = turn;
            }
        };
        crate(w * 0.5, h * 0.42, [-w * 0.24, bottom + h * 0.21, 0.05], 0.05);
        crate(w * 0.46, h * 0.4, [w * 0.26, bottom + h * 0.2, -0.04], -0.12);
        crate(w * 0.48, h * 0.44, [0, bottom + h * 0.42 + h * 0.22, 0], 0.3);
    },
    "barrel": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        cylinder(THREE, group, w * 0.46, w * 0.46, h, [0, 0, 0], standard(THREE, color, 0.55, 0.4), 20);
        for (const y of [0.2, 0.5, 0.8])
            cylinder(THREE, group, w * 0.5, w * 0.5, 0.04, [0, bottom + h * y, 0], chrome(THREE), 20).castShadow = false;
        cylinder(THREE, group, w * 0.42, w * 0.42, 0.02, [0, bottom + h - 0.005, 0], dark(THREE), 20).castShadow = false;
    },
    // A neon palm: a dark trunk with rings and a crown of glowing fronds in the tint, a bar-sign classic.
    "neon-palm": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        cylinder(THREE, group, w * 0.3, w * 0.3, 0.04, [0, bottom + 0.02, 0], dark(THREE), 20);
        const trunkH = h * 0.62;
        cylinder(THREE, group, 0.05, 0.07, trunkH, [0, bottom + trunkH / 2, 0], standard(THREE, "#2b1a0e", 0.7), 10);
        for (let index = 0; index < 6; index += 1) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 6, 16), glow(THREE, lighten(color, 0.3), 1.6));
            ring.rotation.x = Math.PI / 2;
            ring.position.set(0, bottom + 0.1 + index * (trunkH / 6), 0);
            group.add(ring);
        }
        const fronds = 7;
        for (let index = 0; index < fronds; index += 1) {
            const angle = index * Math.PI * 2 / fronds;
            const frond = new THREE.Mesh(new THREE.TorusGeometry(w * 0.32, 0.018, 8, 20, Math.PI * 0.55), glow(THREE, color, 2.4));
            frond.position.set(Math.cos(angle) * w * 0.08, bottom + trunkH - w * 0.12, Math.sin(angle) * w * 0.08);
            frond.rotation.set(0, -angle, Math.PI * 0.62);
            frond.castShadow = false;
            group.add(frond);
        }
        sphere(THREE, group, 0.06, [0, bottom + trunkH, 0], glow(THREE, color, 2.2)).castShadow = false;
    },
    "lava-lamp": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        cylinder(THREE, group, w * 0.3, w * 0.5, h * 0.22, [0, bottom + h * 0.11, 0], chrome(THREE), 16);
        const body = cylinder(THREE, group, w * 0.24, w * 0.34, h * 0.64, [0, bottom + h * 0.54, 0], new THREE.MeshStandardMaterial({ color: lighten(color, 0.5), emissive: color, emissiveIntensity: 0.7, roughness: 0.1, transparent: true, opacity: 0.75 }), 16);
        body.castShadow = false;
        for (const [y, r] of [[0.3, 0.12], [0.55, 0.09], [0.72, 0.07]]) {
            sphere(THREE, group, w * r, [w * (r - 0.09), bottom + h * y, 0], glow(THREE, color, 1.8)).castShadow = false;
        }
        cylinder(THREE, group, w * 0.2, w * 0.24, h * 0.12, [0, bottom + h * 0.92, 0], chrome(THREE), 16);
    },
    // A glass trophy case with three lit shelves of cups; the tint is the gold.
    "trophy-case": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        const frame = standard(THREE, "#1f2230", 0.45, 0.4);
        box(THREE, group, [w, h * 0.12, d], [0, bottom + h * 0.06, 0], frame);
        box(THREE, group, [w, h * 0.06, d], [0, bottom + h * 0.97, 0], frame);
        box(THREE, group, [w, h * 0.82, 0.02], [0, bottom + h * 0.53, -d / 2 + 0.01], standard(THREE, "#10121a", 0.6));
        for (const sign of [-1, 1])
            box(THREE, group, [0.03, h * 0.82, d], [sign * (w / 2 - 0.015), bottom + h * 0.53, 0], frame);
        const pane = box(THREE, group, [w - 0.06, h * 0.82, 0.01], [0, bottom + h * 0.53, d / 2 - 0.005], glass(THREE), false);
        pane.castShadow = false;
        const gold = standard(THREE, color, 0.25, 0.9);
        for (let shelf = 0; shelf < 3; shelf += 1) {
            const y = bottom + h * 0.14 + shelf * h * 0.27;
            box(THREE, group, [w - 0.08, 0.02, d - 0.06], [0, y, 0], glow(THREE, "#fff4d6", 0.5), false);
            for (let index = 0; index < 3; index += 1) {
                const x = -w * 0.3 + index * w * 0.3;
                const cupH = 0.1 + ((shelf + index) % 3) * 0.03;
                cylinder(THREE, group, 0.03, 0.03, 0.02, [x, y + 0.02, 0], dark(THREE), 10).castShadow = false;
                cylinder(THREE, group, 0.008, 0.008, cupH * 0.4, [x, y + 0.03 + cupH * 0.2, 0], gold, 6).castShadow = false;
                cylinder(THREE, group, 0.04, 0.02, cupH * 0.6, [x, y + 0.03 + cupH * 0.7, 0], gold, 12).castShadow = false;
            }
        }
    },
    // A bunch of helium balloons on strings tied to a weight: the tint plus a couple of its neighbours.
    "balloons": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        box(THREE, group, [0.12, 0.08, 0.12], [0, bottom + 0.04, 0], standard(THREE, "#c7ccd3", 0.5, 0.6));
        const shades = [color, lighten(color, 0.35), PARTY[1], PARTY[3], color, PARTY[4]];
        const radius = w * 0.2;
        for (let index = 0; index < 6; index += 1) {
            const angle = index * Math.PI / 3;
            const spread = index % 2 ? w * 0.28 : w * 0.16;
            const x = Math.cos(angle) * spread;
            const z = Math.sin(angle) * spread;
            const y = bottom + h - radius - (index % 3) * 0.12;
            const balloon = sphere(THREE, group, radius, [x, y, z], standard(THREE, shades[index], 0.25, 0.05));
            balloon.scale.set(1, 1.18, 1);
            balloon.castShadow = false;
            const string = cylinder(THREE, group, 0.003, 0.003, y - radius - bottom - 0.08, [x / 2, bottom + 0.08 + (y - radius - bottom - 0.08) / 2, z / 2], standard(THREE, "#e6e8ea", 0.8), 4);
            string.rotation.z = -Math.atan2(x, y - bottom);
            string.rotation.x = Math.atan2(z, y - bottom);
            string.castShadow = false;
        }
    },
    "cone": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const bottom = -h / 2;
        box(THREE, group, [w, 0.03, w], [0, bottom + 0.015, 0], standard(THREE, "#1a1d24", 0.8));
        cylinder(THREE, group, 0.03, w * 0.32, h - 0.03, [0, bottom + 0.03 + (h - 0.03) / 2, 0], standard(THREE, color, 0.5), 16);
        cylinder(THREE, group, w * 0.16, w * 0.21, h * 0.14, [0, bottom + h * 0.55, 0], standard(THREE, "#f4f8ff", 0.5), 16).castShadow = false;
    },
    "water-cooler": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const bottom = -h / 2;
        box(THREE, group, [w, h * 0.62, d], [0, bottom + h * 0.31, 0], standard(THREE, "#e6e8ea", 0.5, 0.1));
        box(THREE, group, [w * 0.7, h * 0.12, 0.03], [0, bottom + h * 0.5, d / 2 + 0.015], dark(THREE), false);
        box(THREE, group, [0.03, 0.05, 0.04], [-w * 0.18, bottom + h * 0.44, d / 2 + 0.03], standard(THREE, "#3d7bff", 0.5), false);
        box(THREE, group, [0.03, 0.05, 0.04], [w * 0.18, bottom + h * 0.44, d / 2 + 0.03], standard(THREE, "#ff3b3b", 0.5), false);
        const bottle = cylinder(THREE, group, w * 0.34, w * 0.34, h * 0.32, [0, bottom + h * 0.8, 0], new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }), 18);
        bottle.castShadow = false;
        cylinder(THREE, group, w * 0.12, w * 0.34, h * 0.06, [0, bottom + h * 0.61, 0], new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }), 18).castShadow = false;
    },
};
// ————————————————————————————————————————————————————————————————————————————
// Wall fittings (back against the wall at -Z, face on +Z)
const WALL = {
    "dartboard": (THREE, group, size, color) => {
        const { width: w, depth: d } = size;
        const rim = cylinder(THREE, group, w / 2, w / 2, d * 0.7, [0, 0, 0], dark(THREE), 32);
        rim.rotation.x = Math.PI / 2;
        canvasPlane(THREE, group, w * 0.92, w * 0.92, [512, 512], (context, cw, ch) => {
            const c = cw / 2;
            for (let index = 0; index < 20; index += 1) {
                context.fillStyle = index % 2 ? "#111318" : "#f4ead2";
                context.beginPath();
                context.moveTo(c, c);
                context.arc(c, c, c, index * Math.PI / 10, (index + 1) * Math.PI / 10);
                context.closePath();
                context.fill();
            }
            for (const [inner, outer] of [[0.94, 1], [0.58, 0.64]]) {
                for (let index = 0; index < 20; index += 1) {
                    context.fillStyle = index % 2 ? color : "#ff3b3b";
                    context.beginPath();
                    context.arc(c, c, c * outer, index * Math.PI / 10, (index + 1) * Math.PI / 10);
                    context.arc(c, c, c * inner, (index + 1) * Math.PI / 10, index * Math.PI / 10, true);
                    context.closePath();
                    context.fill();
                }
            }
            context.fillStyle = color;
            context.beginPath();
            context.arc(c, c, c * 0.08, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#ff3b3b";
            context.beginPath();
            context.arc(c, c, c * 0.035, 0, Math.PI * 2);
            context.fill();
        }, [0, 0, d * 0.36], false);
        for (const [x, y] of [[0.02, 0.1], [-0.06, 0.03], [0.05, -0.05]]) {
            const dart = cylinder(THREE, group, 0.004, 0.004, 0.12, [x * w, y * w, d * 0.36 + 0.06], chrome(THREE), 6);
            dart.rotation.x = Math.PI / 2;
            dart.castShadow = false;
        }
    },
    "extinguisher": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w * 0.5, h * 0.4, 0.02], [0, 0, -d / 2 + 0.01], dark(THREE), false);
        const body = cylinder(THREE, group, w * 0.34, w * 0.34, h * 0.72, [0, -h * 0.08, d * 0.08], standard(THREE, color, 0.35, 0.2), 16);
        body.castShadow = true;
        cylinder(THREE, group, w * 0.34, w * 0.34, 0.01, [0, -h * 0.08, d * 0.08], standard(THREE, "#f4f8ff", 0.4), 16).castShadow = false;
        cylinder(THREE, group, w * 0.12, w * 0.12, h * 0.1, [0, h * 0.33, d * 0.08], dark(THREE), 10);
        box(THREE, group, [w * 0.5, 0.02, 0.03], [w * 0.1, h * 0.4, d * 0.08], dark(THREE), false);
        const hose = cylinder(THREE, group, 0.01, 0.01, h * 0.5, [w * 0.36, h * 0.05, d * 0.12], dark(THREE), 6);
        hose.rotation.z = 0.1;
        hose.castShadow = false;
    },
    // A cork board with a few pinned notes; the tint is the cork.
    "cork-board": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h, d], [0, 0, 0], wood(THREE, "#3b2a1c"), false);
        canvasPlane(THREE, group, w - 0.06, h - 0.06, [512, 360], (context, cw, ch) => {
            context.fillStyle = color;
            context.fillRect(0, 0, cw, ch);
            context.fillStyle = "rgba(0,0,0,.14)";
            let seed = 5;
            for (let index = 0; index < 900; index += 1) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                context.fillRect((seed % cw), ((seed >> 10) % ch), 2, 2);
            }
            const notes = [["#fff7a8", 40, 40, -0.08], ["#bfe6ff", 210, 60, 0.05], ["#ffd6ec", 360, 150, -0.03], ["#dfffd0", 120, 200, 0.07]];
            for (const [paper, x, y, tilt] of notes) {
                context.save();
                context.translate(x + 60, y + 50);
                context.rotate(tilt);
                context.fillStyle = "rgba(0,0,0,.25)";
                context.fillRect(-56, -46, 120, 100);
                context.fillStyle = paper;
                context.fillRect(-60, -50, 120, 100);
                context.fillStyle = "rgba(0,0,0,.35)";
                for (let line = 0; line < 4; line += 1)
                    context.fillRect(-44, -28 + line * 18, 70 + (line % 2) * 16, 4);
                context.fillStyle = "#ff3b3b";
                context.beginPath();
                context.arc(0, -42, 6, 0, Math.PI * 2);
                context.fill();
                context.restore();
            }
        }, [0, 0, d / 2 + 0.002], false);
    },
    // A whiteboard with a marker tray and a scribble in the tint.
    "whiteboard": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, "#c7ccd3", 0.4, 0.7), false);
        canvasPlane(THREE, group, w - 0.05, h - 0.05, [512, 340], (context, cw, ch) => {
            context.fillStyle = "#f7f9fb";
            context.fillRect(0, 0, cw, ch);
            context.strokeStyle = color;
            context.lineWidth = 8;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(60, 90);
            context.bezierCurveTo(140, 20, 220, 160, 300, 80);
            context.bezierCurveTo(360, 30, 420, 120, 460, 70);
            context.stroke();
            context.strokeStyle = "#111318";
            context.lineWidth = 6;
            for (let line = 0; line < 3; line += 1) {
                context.beginPath();
                context.moveTo(70, 180 + line * 40);
                context.lineTo(70 + 180 + line * 60, 180 + line * 40);
                context.stroke();
            }
            context.strokeStyle = "#ff3b3b";
            context.beginPath();
            context.arc(400, 230, 50, 0, Math.PI * 2);
            context.stroke();
        }, [0, 0, d / 2 + 0.002], false);
        box(THREE, group, [w * 0.6, 0.025, 0.06], [0, -h / 2 + 0.01, d / 2 + 0.03], standard(THREE, "#c7ccd3", 0.4, 0.7), false);
        for (const [index, shade] of [color, "#111318", "#ff3b3b"].entries()) {
            const marker = cylinder(THREE, group, 0.008, 0.008, 0.12, [-0.15 + index * 0.15, -h / 2 + 0.03, d / 2 + 0.03], standard(THREE, shade, 0.5), 8);
            marker.rotation.z = Math.PI / 2;
            marker.castShadow = false;
        }
    },
    // A dome-less security camera on a bracket, nosing down into the room with a red recording LED.
    "camera": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w * 0.5, h * 0.6, 0.02], [0, h * 0.15, -d / 2 + 0.01], standard(THREE, color, 0.4, 0.6), false);
        const arm = cylinder(THREE, group, 0.012, 0.012, d * 0.5, [0, h * 0.1, -d / 2 + d * 0.25], standard(THREE, color, 0.4, 0.6), 8);
        arm.rotation.x = Math.PI / 2;
        const body = box(THREE, group, [w * 0.6, h * 0.5, d * 0.55], [0, -h * 0.05, d * 0.12], standard(THREE, color, 0.4, 0.6));
        body.rotation.x = 0.35;
        const lens = cylinder(THREE, group, h * 0.2, h * 0.24, 0.05, [0, -h * 0.16, d * 0.42], dark(THREE), 12);
        lens.rotation.x = Math.PI / 2 + 0.35;
        sphere(THREE, group, 0.012, [w * 0.2, h * 0.12, d * 0.36], glow(THREE, "#ff3b3b", 2.5)).castShadow = false;
    },
    "ac-unit": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, color, 0.45, 0.15));
        for (let index = 0; index < 4; index += 1)
            box(THREE, group, [w * 0.9, 0.012, 0.01], [0, -h * 0.3 + index * 0.03, d / 2 + 0.005], dark(THREE), false);
        box(THREE, group, [w * 0.16, h * 0.18, 0.01], [w * 0.36, h * 0.2, d / 2 + 0.005], glow(THREE, "#22e5ff", 0.9), false);
        sphere(THREE, group, 0.01, [w * 0.24, h * 0.2, d / 2 + 0.006], glow(THREE, "#7dff4d", 2)).castShadow = false;
    },
    // A window onto a night city: a lit skyline print behind mullions, so a room with no windows gets one.
    "window": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const frame = standard(THREE, "#e6e8ea", 0.5, 0.1);
        // The frame is four bars round an open middle so the print behind them is the view.
        for (const sign of [-1, 1]) {
            box(THREE, group, [w, 0.05, d], [0, sign * (h / 2 - 0.025), 0], frame, false);
            box(THREE, group, [0.05, h, d], [sign * (w / 2 - 0.025), 0, 0], frame, false);
        }
        canvasPlane(THREE, group, w - 0.08, h - 0.08, [512, 366], (context, cw, ch) => {
            const sky = context.createLinearGradient(0, 0, 0, ch);
            sky.addColorStop(0, "#050914");
            sky.addColorStop(0.7, "#14204a");
            sky.addColorStop(1, color);
            context.fillStyle = sky;
            context.fillRect(0, 0, cw, ch);
            let seed = 17;
            context.fillStyle = "#f4f8ff";
            for (let index = 0; index < 60; index += 1) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                context.fillRect(seed % cw, (seed >> 9) % Math.round(ch * 0.5), 2, 2);
            }
            context.fillStyle = "#fff0b3";
            context.beginPath();
            context.arc(cw * 0.78, ch * 0.2, 22, 0, Math.PI * 2);
            context.fill();
            let x = 0;
            while (x < cw) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const bw = 24 + (seed % 40);
                const bh = ch * 0.25 + ((seed >> 8) % Math.round(ch * 0.4));
                context.fillStyle = "#0a0c16";
                context.fillRect(x, ch - bh, bw, bh);
                context.fillStyle = withAlpha("#ffd33d", 0.8);
                for (let wy = ch - bh + 8; wy < ch - 6; wy += 12) {
                    for (let wx = x + 4; wx < x + bw - 6; wx += 10) {
                        seed = (seed * 1664525 + 1013904223) >>> 0;
                        if (seed % 3 === 0)
                            context.fillRect(wx, wy, 5, 6);
                    }
                }
                x += bw + 3;
            }
        }, [0, 0, -d / 2 + 0.01], false);
        box(THREE, group, [0.03, h - 0.08, 0.02], [0, 0, d / 2 - 0.01], frame, false);
        box(THREE, group, [w - 0.08, 0.03, 0.02], [0, 0, d / 2 - 0.01], frame, false);
        box(THREE, group, [w + 0.06, 0.05, d + 0.06], [0, -h / 2 - 0.02, 0], frame);
    },
    // A shelf of gold cups, one every third of a metre, so a stretched shelf holds more.
    "trophy-shelf": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, 0.03, d], [0, -h * 0.3, 0], wood(THREE, "#3b2a1c"));
        for (const x of [-w / 2 + 0.06, w / 2 - 0.06])
            box(THREE, group, [0.03, h * 0.35, d * 0.7], [x, -h * 0.47, -d * 0.15], dark(THREE));
        const gold = standard(THREE, color, 0.25, 0.9);
        const cups = Math.max(1, Math.round(w / 0.33));
        for (let index = 0; index < cups; index += 1) {
            const x = cups === 1 ? 0 : -w / 2 + 0.16 + (w - 0.32) * (index / (cups - 1));
            const cupH = h * (0.4 + (index % 2) * 0.15);
            cylinder(THREE, group, 0.035, 0.035, 0.02, [x, -h * 0.28, 0], dark(THREE), 10).castShadow = false;
            cylinder(THREE, group, 0.009, 0.009, cupH * 0.35, [x, -h * 0.27 + cupH * 0.17, 0], gold, 6).castShadow = false;
            cylinder(THREE, group, 0.045, 0.02, cupH * 0.6, [x, -h * 0.27 + cupH * 0.65, 0], gold, 12).castShadow = false;
        }
    },
    "switch": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, color, 0.5, 0.1), false);
        box(THREE, group, [w * 0.3, h * 0.34, d], [0, h * 0.06, d * 0.6], standard(THREE, color, 0.5, 0.1), false).rotation.x = -0.35;
    },
    "vent": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, color, 0.45, 0.6), false);
        for (let index = 0; index < 5; index += 1) {
            const slat = box(THREE, group, [w * 0.88, 0.02, d], [0, -h * 0.36 + index * h * 0.18, d / 2], dark(THREE), false);
            slat.rotation.x = -0.6;
        }
    },
    // A sconce: a half-shade in the tint throwing light up the wall, on a small plate.
    "sconce": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w * 0.5, h * 0.35, 0.02], [0, -h * 0.2, -d / 2 + 0.01], chrome(THREE), false);
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.24, h * 0.55, 20, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: lighten(color, 0.4), emissive: color, emissiveIntensity: 0.6, roughness: 0.6, side: THREE.DoubleSide }));
        shade.position.set(0, h * 0.1, 0);
        shade.castShadow = false;
        group.add(shade);
        sphere(THREE, group, w * 0.16, [0, h * 0.2, d * 0.05], glow(THREE, lighten(color, 0.5), 2.4)).castShadow = false;
    },
};
// ————————————————————————————————————————————————————————————————————————————
// Ceiling fittings (hung from +Y)
const CEILING = {
    // A flush ceiling speaker: a white ring and a perforated grille.
    "speaker": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const top = h / 2;
        cylinder(THREE, group, w / 2, w * 0.46, h, [0, 0, 0], standard(THREE, color, 0.5, 0.1), 28);
        const grille = canvasPlane(THREE, group, w * 0.8, w * 0.8, [256, 256], (context, cw, ch) => {
            context.fillStyle = "#c7ccd3";
            context.beginPath();
            context.arc(cw / 2, ch / 2, cw / 2, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#3a3e46";
            for (let y = 8; y < ch; y += 12) {
                for (let x = ((y / 12) % 2) * 6 + 8; x < cw; x += 12) {
                    if (Math.hypot(x - cw / 2, y - ch / 2) < cw * 0.46) {
                        context.beginPath();
                        context.arc(x, y, 3, 0, Math.PI * 2);
                        context.fill();
                    }
                }
            }
        }, [0, -top - 0.002, 0], true);
        grille.rotation.x = Math.PI / 2;
    },
    // A ceiling fan: rod, motor housing, four timber blades in the tint and a pull chain.
    "fan": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const top = h / 2;
        cylinder(THREE, group, 0.012, 0.012, h * 0.45, [0, top - h * 0.225, 0], chrome(THREE), 8);
        cylinder(THREE, group, w * 0.08, w * 0.08, 0.02, [0, top - 0.01, 0], chrome(THREE), 16);
        cylinder(THREE, group, w * 0.1, w * 0.12, h * 0.25, [0, top - h * 0.55, 0], dark(THREE), 20);
        for (let index = 0; index < 4; index += 1) {
            const blade = box(THREE, group, [w * 0.46, 0.015, w * 0.1], [Math.cos(index * Math.PI / 2) * w * 0.29, top - h * 0.6, Math.sin(index * Math.PI / 2) * w * 0.29], wood(THREE, color));
            blade.rotation.y = -index * Math.PI / 2;
            blade.rotation.x = 0.18;
        }
        sphere(THREE, group, w * 0.05, [0, top - h * 0.72, 0], glow(THREE, "#fff2d1", 1.2)).castShadow = false;
        cylinder(THREE, group, 0.002, 0.002, h * 0.25, [w * 0.08, top - h * 0.85, 0], chrome(THREE), 4).castShadow = false;
    },
    // A string of triangular pennants in the tint and white, hung between two points: stretching it adds flags.
    "banner": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const flags = Math.max(2, Math.round(w / 0.28));
        const plane = canvasPlane(THREE, group, w, h, [Math.min(4096, flags * 64), 128], (context, cw, ch) => {
            const flagW = cw / flags;
            context.strokeStyle = "#e6e8ea";
            context.lineWidth = 4;
            context.beginPath();
            context.moveTo(0, 6);
            context.lineTo(cw, 6);
            context.stroke();
            for (let index = 0; index < flags; index += 1) {
                context.fillStyle = index % 2 ? "#f4f8ff" : color;
                context.beginPath();
                context.moveTo(index * flagW + 2, 8);
                context.lineTo((index + 1) * flagW - 2, 8);
                context.lineTo(index * flagW + flagW / 2, ch - 4);
                context.closePath();
                context.fill();
            }
        }, [0, 0, 0], true);
        plane.castShadow = false;
    },
    "projector": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const top = h / 2;
        cylinder(THREE, group, w * 0.16, w * 0.16, 0.02, [0, top - 0.01, 0], chrome(THREE), 16);
        cylinder(THREE, group, 0.014, 0.014, h * 0.4, [0, top - h * 0.21, 0], chrome(THREE), 8);
        box(THREE, group, [w, h * 0.4, d], [0, top - h * 0.6, 0], standard(THREE, color, 0.45, 0.4));
        const lens = cylinder(THREE, group, h * 0.1, h * 0.12, 0.04, [w * 0.3, top - h * 0.6, d / 2 + 0.02], glow(THREE, "#dff5ff", 1.6), 14);
        lens.rotation.x = Math.PI / 2;
        lens.castShadow = false;
        for (let index = 0; index < 4; index += 1)
            box(THREE, group, [0.01, h * 0.28, d * 0.6], [-w * 0.45 + index * 0.03, top - h * 0.6, 0], dark(THREE), false);
        sphere(THREE, group, 0.008, [-w * 0.3, top - h * 0.4 - 0.005, d / 2 + 0.003], glow(THREE, "#7dff4d", 2)).castShadow = false;
    },
    "vent": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h, d], [0, 0, 0], standard(THREE, color, 0.45, 0.6), false);
        for (let index = 0; index < 6; index += 1) {
            box(THREE, group, [w * 0.86, h, 0.02], [0, -0.002, -d * 0.36 + index * d * 0.145], dark(THREE), false);
        }
    },
};
// ————————————————————————————————————————————————————————————————————————————
// Ceiling lights the model file does not draw itself
const CEILING_LIGHTS = {
    // A chain, a ring and six candle arms with bulbs in the tint.
    "chandelier": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const top = h / 2;
        const brass = standard(THREE, "#c9a24a", 0.3, 0.9);
        for (let index = 0; index < 8; index += 1) {
            const link = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), brass);
            link.position.set(0, top - 0.02 - index * 0.032, 0);
            link.rotation.y = (index % 2) * Math.PI / 2;
            link.castShadow = false;
            group.add(link);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.4, 0.015, 8, 32), brass);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, top - h * 0.55, 0);
        group.add(ring);
        sphere(THREE, group, w * 0.08, [0, top - h * 0.55, 0], brass);
        for (let index = 0; index < 6; index += 1) {
            const angle = index * Math.PI / 3;
            const x = Math.cos(angle) * w * 0.4;
            const z = Math.sin(angle) * w * 0.4;
            const arm = cylinder(THREE, group, 0.008, 0.008, w * 0.4, [x / 2, top - h * 0.55, z / 2], brass, 6);
            arm.rotation.z = Math.PI / 2;
            arm.rotation.y = -angle;
            arm.castShadow = false;
            cylinder(THREE, group, 0.014, 0.014, h * 0.18, [x, top - h * 0.45, z], standard(THREE, "#f4f0e6", 0.7), 8).castShadow = false;
            sphere(THREE, group, 0.028, [x, top - h * 0.33, z], glow(THREE, color, 2.4)).castShadow = false;
        }
    },
    // A string of bulbs on a cable that sags a little between its ends; more cable, more bulbs.
    "string": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const top = h / 2;
        const bulbs = Math.max(2, Math.round(w / 0.3));
        const cable = standard(THREE, "#111318", 0.8);
        for (let index = 0; index < bulbs; index += 1) {
            const t = bulbs === 1 ? 0.5 : index / (bulbs - 1);
            const x = -w / 2 + 0.05 + (w - 0.1) * t;
            const sag = Math.sin(t * Math.PI) * h * 0.5;
            const y = top - 0.02 - sag;
            cylinder(THREE, group, 0.006, 0.006, 0.03, [x, y - 0.015, 0], cable, 6).castShadow = false;
            sphere(THREE, group, 0.028, [x, y - 0.05, 0], glow(THREE, color, 2.2)).castShadow = false;
            if (index < bulbs - 1) {
                const nt = (index + 1) / (bulbs - 1);
                const nx = -w / 2 + 0.05 + (w - 0.1) * nt;
                const ny = top - 0.02 - Math.sin(nt * Math.PI) * h * 0.5;
                const run = cylinder(THREE, group, 0.004, 0.004, Math.hypot(nx - x, ny - y), [(x + nx) / 2, (y + ny) / 2, 0], cable, 4);
                run.rotation.z = Math.PI / 2 - Math.atan2(ny - y, nx - x);
                run.castShadow = false;
            }
        }
        for (const sign of [-1, 1])
            cylinder(THREE, group, 0.012, 0.012, 0.03, [sign * (w / 2 - 0.05), top - 0.015, 0], chrome(THREE), 8).castShadow = false;
    },
    // A ribbed paper lantern on a cord, lit from inside.
    "lantern": (THREE, group, size, color) => {
        const { width: w, height: h } = size;
        const top = h / 2;
        cylinder(THREE, group, 0.004, 0.004, h * 0.3, [0, top - h * 0.15, 0], standard(THREE, "#111318", 0.8), 4).castShadow = false;
        const shade = sphere(THREE, group, w / 2, [0, top - h * 0.3 - w / 2, 0], new THREE.MeshStandardMaterial({ color: lighten(color, 0.45), emissive: color, emissiveIntensity: 0.9, roughness: 0.8 }));
        shade.scale.set(1, 0.9, 1);
        shade.castShadow = false;
        for (let index = 0; index < 5; index += 1) {
            const rib = new THREE.Mesh(new THREE.TorusGeometry(w / 2 * Math.sin((index + 1) * Math.PI / 6) + 0.003, 0.003, 4, 24), standard(THREE, "#111318", 0.8));
            rib.rotation.x = Math.PI / 2;
            rib.position.set(0, top - h * 0.3 - w / 2 - Math.cos((index + 1) * Math.PI / 6) * w * 0.45, 0);
            rib.castShadow = false;
            group.add(rib);
        }
        cylinder(THREE, group, 0.02, 0.02, 0.03, [0, top - h * 0.3, 0], dark(THREE), 8).castShadow = false;
    },
    // A rail with spot heads angled along it: one head every 40 cm, so stretching the rail adds heads.
    "track": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        const top = h / 2;
        box(THREE, group, [w, 0.03, 0.04], [0, top - 0.015, 0], dark(THREE));
        const heads = Math.max(1, Math.round(w / 0.4));
        for (let index = 0; index < heads; index += 1) {
            const x = heads === 1 ? 0 : -w / 2 + 0.12 + (w - 0.24) * (index / (heads - 1));
            cylinder(THREE, group, 0.01, 0.01, h * 0.3, [x, top - 0.03 - h * 0.15, 0], dark(THREE), 6).castShadow = false;
            const head = cylinder(THREE, group, d * 0.32, d * 0.4, h * 0.45, [x, top - h * 0.6, d * 0.1], standard(THREE, "#2b2f38", 0.4, 0.6), 14);
            head.rotation.x = (index % 2 ? 1 : -1) * 0.5;
            const lens = cylinder(THREE, group, d * 0.3, d * 0.3, 0.01, [x, top - h * 0.6 - h * 0.22 * Math.cos(0.5), d * 0.1 + (index % 2 ? 1 : -1) * h * 0.22 * Math.sin(0.5)], glow(THREE, color, 2), 14);
            lens.rotation.x = (index % 2 ? 1 : -1) * 0.5;
            lens.castShadow = false;
        }
    },
    // A blacklight: a violet tube in a fitting, the room's UV; on a wall it hangs like a neon strip.
    "blacklight": (THREE, group, size, color) => {
        const { width: w, height: h, depth: d } = size;
        box(THREE, group, [w, h * 0.5, d], [0, h * 0.25, 0], dark(THREE));
        const tube = cylinder(THREE, group, h * 0.32, h * 0.32, w * 0.94, [0, -h * 0.15, 0], new THREE.MeshStandardMaterial({ color: lighten(color, 0.2), emissive: color, emissiveIntensity: 2.6, roughness: 0.2 }), 10);
        tube.rotation.z = Math.PI / 2;
        tube.castShadow = false;
        for (const sign of [-1, 1]) {
            const cap = cylinder(THREE, group, h * 0.36, h * 0.36, 0.03, [sign * (w * 0.47), -h * 0.15, 0], chrome(THREE), 10);
            cap.rotation.z = Math.PI / 2;
            cap.castShadow = false;
        }
    },
};
// ————————————————————————————————————————————————————————————————————————————
// Signs with the player's words that are not neon
/**
 * A cinema marquee: a dark frame with a backlit white board, the words in
 * black block letters and a row of bulbs in the tint along the top and bottom.
 */
export function buildMarquee(THREE, group, size, color, text) {
    const { width: w, height: h, depth: d } = size;
    const frame = standard(THREE, "#14161c", 0.45, 0.5);
    box(THREE, group, [w, h, d * 0.5], [0, 0, -d * 0.25], frame);
    for (const sign of [-1, 1]) {
        box(THREE, group, [w, h * 0.12, d], [0, sign * (h / 2 - h * 0.06), 0], frame);
        box(THREE, group, [d, h, d], [sign * (w / 2 - d / 2), 0, 0], frame);
    }
    const bulbs = Math.max(4, Math.round(w / 0.16));
    for (let index = 0; index < bulbs; index += 1) {
        const x = -w / 2 + 0.06 + (w - 0.12) * (index / (bulbs - 1));
        for (const sign of [-1, 1])
            sphere(THREE, group, h * 0.035, [x, sign * (h / 2 - h * 0.06), d / 2], glow(THREE, color, 2.2)).castShadow = false;
    }
    const boardW = w - d * 2;
    const boardH = h * 0.76;
    canvasPlane(THREE, group, boardW, boardH, [Math.min(4096, Math.round(320 * boardW / boardH)), 320], (context, cw, ch) => {
        context.fillStyle = "#fbf7ea";
        context.fillRect(0, 0, cw, ch);
        context.strokeStyle = "rgba(0,0,0,.08)";
        context.lineWidth = 2;
        for (let y = ch / 6; y < ch; y += ch / 6) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(cw, y);
            context.stroke();
        }
        fitText(context, text.toUpperCase(), cw, ch, "#111318");
    }, [0, 0, 0.002], false);
    box(THREE, group, [boardW, boardH, 0.01], [0, 0, -0.005], glow(THREE, "#fbf7ea", 0.9), false);
}
/**
 * A painted board on two chains from the ceiling, the words in the tint on
 * dark timber and an arrow under them: the sign that points the way.
 */
export function buildHangingSign(THREE, group, size, color, text) {
    const { width: w, height: h, depth: d } = size;
    const top = h / 2;
    const boardH = h * 0.55;
    const boardY = -h / 2 + boardH / 2;
    const chain = standard(THREE, "#8a9099", 0.3, 0.8);
    for (const sign of [-1, 1]) {
        const x = sign * (w / 2 - 0.08);
        for (let index = 0; index < 6; index += 1) {
            const link = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 10), chain);
            link.position.set(x, top - 0.02 - index * ((h - boardH - 0.04) / 5), 0);
            link.rotation.y = (index % 2) * Math.PI / 2;
            link.castShadow = false;
            group.add(link);
        }
    }
    box(THREE, group, [w, boardH, d], [0, boardY, 0], wood(THREE, "#2b1a0e"));
    for (const z of [d / 2 + 0.002, -d / 2 - 0.002]) {
        const face = canvasPlane(THREE, group, w - 0.04, boardH - 0.04, [Math.min(4096, Math.round(320 * w / boardH)), 320], (context, cw, ch) => {
            context.fillStyle = "#3b2a1c";
            context.fillRect(0, 0, cw, ch);
            context.strokeStyle = color;
            context.lineWidth = 6;
            context.strokeRect(10, 10, cw - 20, ch - 20);
            fitText(context, text.toUpperCase(), cw, ch * 0.72, color);
            context.fillStyle = color;
            context.beginPath();
            context.moveTo(cw / 2 - 26, ch * 0.86);
            context.lineTo(cw / 2 + 26, ch * 0.86);
            context.lineTo(cw / 2 + 14, ch * 0.76);
            context.moveTo(cw / 2 + 26, ch * 0.86);
            context.lineTo(cw / 2 + 14, ch * 0.96);
            context.stroke();
        }, [0, boardY, z], false);
        if (z < 0)
            face.rotation.y = Math.PI;
        face.castShadow = false;
    }
}
/** A prop builder by name, from any of the floor, wall or ceiling tables; undefined for a name nobody knows. */
export function extraPropBuilder(prop) {
    return FURNITURE[prop] ?? PROPS[prop];
}
export function extraWallBuilder(prop) {
    return WALL[prop];
}
export function ceilingPropBuilder(prop) {
    return CEILING[prop];
}
export function ceilingLightBuilder(style) {
    return CEILING_LIGHTS[style];
}
/** Every prop name these tables draw, so a test can check the catalog never names one they do not. */
export const EXTRA_PROP_NAMES = Object.freeze([...Object.keys(FURNITURE), ...Object.keys(PROPS)]);
export const EXTRA_WALL_NAMES = Object.freeze(Object.keys(WALL));
export const CEILING_PROP_NAMES = Object.freeze(Object.keys(CEILING));
export const CEILING_LIGHT_STYLES = Object.freeze(Object.keys(CEILING_LIGHTS));
