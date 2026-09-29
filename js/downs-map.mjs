// The Downs from above (planning-docs/FARM_RIDING_PLAN.md): a small map of the
// Green, the gallop, the rings, the oval and the cross-country trail, with the
// rider as an arrow and everyone else as dots. Drawn to a canvas from the same
// description the world is built from; the course being ridden is lit up.
import { DOWNS_HALF_DEPTH, DOWNS_HALF_WIDTH, DOWNS_ZONES } from "./downs-terrain.mjs";
import { DOWNS_GATE, OVAL, XC_TRAIL, ovalPoint } from "./downs-scene.mjs";
import { findDownsCourse } from "./downs-course.mjs";
export function createDownsMap(canvas) {
    const context = canvas.getContext("2d");
    const scale = Math.min(canvas.width / (DOWNS_HALF_WIDTH * 2), canvas.height / (DOWNS_HALF_DEPTH * 2)) * 0.94;
    const px = (x) => canvas.width / 2 + x * scale;
    const pz = (z) => canvas.height / 2 + z * scale;
    function zone(rect, fill, stroke = "rgba(255,255,255,.35)") {
        if (!context)
            return;
        context.fillStyle = fill;
        context.strokeStyle = stroke;
        context.lineWidth = 1;
        context.fillRect(px(rect.minX), pz(rect.minZ), (rect.maxX - rect.minX) * scale, (rect.maxZ - rect.minZ) * scale);
        context.strokeRect(px(rect.minX), pz(rect.minZ), (rect.maxX - rect.minX) * scale, (rect.maxZ - rect.minZ) * scale);
    }
    return Object.freeze({
        draw(me, others, active) {
            if (!context)
                return;
            const course = active ? findDownsCourse(active) : null;
            const lit = (kind) => (course && course.kind === kind ? "#f2c45a" : "rgba(255,255,255,.55)");
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "rgba(72, 112, 56, .55)";
            context.fillRect(px(-DOWNS_HALF_WIDTH), pz(-DOWNS_HALF_DEPTH), DOWNS_HALF_WIDTH * 2 * scale, DOWNS_HALF_DEPTH * 2 * scale);
            zone(DOWNS_ZONES.green, "rgba(170, 164, 150, .7)");
            zone({ ...DOWNS_ZONES.gallop, minZ: -72.5, maxZ: -61.5 }, "rgba(120, 180, 90, .75)", lit("sprint"));
            zone(DOWNS_ZONES.novice, "rgba(222, 202, 150, .8)", course?.id === "novice" ? "#f2c45a" : undefined);
            zone(DOWNS_ZONES.open, "rgba(222, 202, 150, .8)", course?.id === "open" ? "#f2c45a" : undefined);
            // The oval.
            context.strokeStyle = course?.kind === "oval" ? "#f2c45a" : "rgba(170, 130, 80, .95)";
            context.lineWidth = OVAL.trackWidth * scale;
            context.beginPath();
            for (let index = 0; index <= 64; index += 1) {
                const point = ovalPoint(index / 64);
                if (index === 0)
                    context.moveTo(px(point.x), pz(point.z));
                else
                    context.lineTo(px(point.x), pz(point.z));
            }
            context.stroke();
            // The trail.
            context.strokeStyle = lit("cross-country");
            context.lineWidth = 2;
            context.setLineDash([4, 3]);
            context.beginPath();
            XC_TRAIL.forEach((point, index) => (index === 0 ? context.moveTo(px(point.x), pz(point.z)) : context.lineTo(px(point.x), pz(point.z))));
            context.stroke();
            context.setLineDash([]);
            // The gate to the square.
            context.fillStyle = "#f2c45a";
            context.fillRect(px(DOWNS_GATE.x) - 2, pz(DOWNS_GATE.z) - 4, 4, 8);
            for (const other of others) {
                context.fillStyle = other.racing ? "#ff8a6a" : "#9fd0ff";
                context.beginPath();
                context.arc(px(other.x), pz(other.z), 3, 0, Math.PI * 2);
                context.fill();
            }
            if (me) {
                const angle = me.heading;
                const fx = -Math.sin(angle);
                const fz = -Math.cos(angle);
                context.fillStyle = "#fff6cf";
                context.strokeStyle = "#1d2b1c";
                context.lineWidth = 1.5;
                context.beginPath();
                context.moveTo(px(me.x) + fx * 7, pz(me.z) + fz * 7);
                context.lineTo(px(me.x) - fx * 4 + fz * 4, pz(me.z) - fz * 4 - fx * 4);
                context.lineTo(px(me.x) - fx * 4 - fz * 4, pz(me.z) - fz * 4 + fx * 4);
                context.closePath();
                context.fill();
                context.stroke();
            }
        },
    });
}
