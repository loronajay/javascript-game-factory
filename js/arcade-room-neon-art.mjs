// Drawing neon onto a 2D canvas: the shape outlines and the glowing stroke.
//
// Shared by the 3D decor model (which paints these onto a plane texture) and
// the editor's catalog thumbnails, so a card shows the very same heart, star
// or joystick that ends up on the wall. Canvas 2D only — no THREE, no DOM
// beyond the context it is handed.
/** Trace the shape's path into the context, filling the `w × h` box. Stroke it afterwards. */
export const NEON_SHAPES = Object.freeze({
    heart: (context, w, h) => {
        context.beginPath();
        context.moveTo(w / 2, h * 0.85);
        context.bezierCurveTo(w * 0.05, h * 0.5, w * 0.15, h * 0.1, w / 2, h * 0.3);
        context.bezierCurveTo(w * 0.85, h * 0.1, w * 0.95, h * 0.5, w / 2, h * 0.85);
        context.closePath();
    },
    star: (context, w, h) => {
        context.beginPath();
        for (let index = 0; index < 10; index += 1) {
            const radius = index % 2 ? w * 0.18 : w * 0.42;
            const angle = -Math.PI / 2 + index * Math.PI / 5;
            context.lineTo(w / 2 + radius * Math.cos(angle), h / 2 + radius * Math.sin(angle));
        }
        context.closePath();
    },
    bolt: (context, w, h) => {
        context.beginPath();
        context.moveTo(w * 0.62, h * 0.06);
        context.lineTo(w * 0.22, h * 0.54);
        context.lineTo(w * 0.48, h * 0.54);
        context.lineTo(w * 0.38, h * 0.94);
        context.lineTo(w * 0.78, h * 0.42);
        context.lineTo(w * 0.52, h * 0.42);
        context.closePath();
    },
    joystick: (context, w, h) => {
        context.beginPath();
        context.arc(w / 2, h * 0.22, w * 0.16, 0, Math.PI * 2);
        context.moveTo(w / 2, h * 0.38);
        context.lineTo(w / 2, h * 0.68);
        context.moveTo(w * 0.2, h * 0.68);
        context.lineTo(w * 0.8, h * 0.68);
        context.lineTo(w * 0.8, h * 0.9);
        context.lineTo(w * 0.2, h * 0.9);
        context.closePath();
    },
    ghost: (context, w, h) => {
        context.beginPath();
        context.arc(w / 2, h * 0.42, w * 0.34, Math.PI, 0);
        context.lineTo(w * 0.84, h * 0.9);
        for (let index = 0; index < 4; index += 1) {
            const x = w * 0.84 - (index + 0.5) * w * 0.17;
            context.lineTo(x, index % 2 ? h * 0.9 : h * 0.78);
        }
        context.lineTo(w * 0.16, h * 0.9);
        context.closePath();
        context.moveTo(w * 0.42, h * 0.42);
        context.arc(w * 0.38, h * 0.42, w * 0.05, 0, Math.PI * 2);
        context.moveTo(w * 0.66, h * 0.42);
        context.arc(w * 0.62, h * 0.42, w * 0.05, 0, Math.PI * 2);
    },
    circle: (context, w, h) => {
        context.beginPath();
        context.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    },
});
/** Set the context up to stroke a glowing tube of `color`. */
export function neonStroke(context, color, lineWidth) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowColor = color;
    context.shadowBlur = lineWidth * 2.2;
}
/** A glowing outline of `shape` filling the box: the tube stroked twice for glow, then a hot white core. */
export function drawNeonShape(context, w, h, shape, color, tube = Math.max(4, Math.min(w, h) * 0.035)) {
    const trace = NEON_SHAPES[shape] ?? NEON_SHAPES.circle;
    neonStroke(context, color, tube);
    trace(context, w, h);
    context.stroke();
    context.stroke();
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(255,255,255,.85)";
    context.lineWidth = tube / 3;
    trace(context, w, h);
    context.stroke();
}
function neonFontFamily(font) {
    return font === "script"
        ? { style: "italic 700 ", family: "Georgia, 'Brush Script MT', serif" }
        : { style: "900 ", family: "'Arial Black', Impact, sans-serif" };
}
/** Glowing text centred in the box, shrunk until it fits nine tenths of the width. */
export function drawNeonText(context, w, h, text, font, color) {
    const { style, family } = neonFontFamily(font);
    let fontSize = h * 0.72;
    context.font = `${style}${Math.round(fontSize)}px ${family}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    while (context.measureText(text).width > w * 0.9 && fontSize > 8) {
        fontSize -= Math.max(1, fontSize * 0.04);
        context.font = `${style}${Math.round(fontSize)}px ${family}`;
    }
    neonStroke(context, color, Math.max(3, fontSize * 0.085));
    context.strokeText(text, w / 2, h / 2);
    context.strokeText(text, w / 2, h / 2);
    context.shadowBlur = 0;
    context.fillStyle = "#ffffff";
    context.globalAlpha = 0.85;
    context.fillText(text, w / 2, h / 2);
    context.globalAlpha = 1;
}
