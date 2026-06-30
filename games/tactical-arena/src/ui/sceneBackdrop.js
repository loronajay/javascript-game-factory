// Atmospheric battle-view backdrop — presentation only, never authoritative.
// Seats the floating war-table in a living world: a moody parallax sky, a
// distant fortress silhouette on the horizon, drifting clouds + fog, slow light
// shafts, and floating embers. The static washes live in CSS (the `.bk-*`
// layers); this module builds the two pieces that want generated geometry —
// the parametric skyline and the ember field — and mounts the whole stack.
import { svgElement } from "./svgHelpers.js";

function layer(className) {
  const el = document.createElement("div");
  el.className = className;
  return el;
}

// A distant battlement skyline: a row of towers with crenellations sitting on a
// curtain wall, kept low-contrast so it reads as far-off scenery, not foreground.
function buildSkyline() {
  const host = layer("bk-fortress");
  const svg = svgElement("svg", {
    viewBox: "0 0 1200 260",
    preserveAspectRatio: "xMidYMax meet",
    class: "bk-fortress-svg"
  });

  const wallTop = 150;
  const segments = [
    { x: 60, w: 120, h: 150 },
    { x: 250, w: 90, h: 96 },
    { x: 470, w: 150, h: 190 },
    { x: 700, w: 96, h: 120 },
    { x: 880, w: 130, h: 168 },
    { x: 1050, w: 86, h: 110 }
  ];

  // Curtain wall the towers stand on.
  svg.append(svgElement("rect", { class: "bk-wall", x: 0, y: wallTop, width: 1200, height: 260 - wallTop }));

  for (const t of segments) {
    const top = 260 - t.h;
    svg.append(svgElement("rect", { class: "bk-tower", x: t.x, y: top, width: t.w, height: t.h }));
    // Crenellations along each tower cap.
    const merlon = t.w / 7;
    for (let i = 0; i < 4; i += 1) {
      svg.append(svgElement("rect", {
        class: "bk-tower",
        x: t.x + i * 2 * merlon,
        y: top - merlon * 0.9,
        width: merlon,
        height: merlon
      }));
    }
    // A lone lit window so the fortress feels inhabited.
    svg.append(svgElement("rect", {
      class: "bk-window",
      x: t.x + t.w / 2 - 4,
      y: top + t.h * 0.32,
      width: 8,
      height: 14,
      rx: 3
    }));
  }

  host.append(svg);
  return host;
}

// Floating embers/dust motes. Each gets randomized drift so the field never
// pulses in lockstep. Pure transform/opacity animation — cheap, GPU-friendly.
function buildEmbers(count) {
  const field = layer("bk-embers");
  for (let i = 0; i < count; i += 1) {
    const ember = document.createElement("span");
    ember.className = "bk-ember";
    const size = 1.4 + Math.random() * 3.2;
    ember.style.left = `${Math.random() * 100}%`;
    ember.style.bottom = `${-8 + Math.random() * 22}%`;
    ember.style.width = `${size}px`;
    ember.style.height = `${size}px`;
    ember.style.setProperty("--rise", `${10 + Math.random() * 14}s`);
    ember.style.setProperty("--sway", `${(Math.random() * 60 - 30).toFixed(0)}px`);
    ember.style.setProperty("--delay", `${-Math.random() * 16}s`);
    ember.style.setProperty("--peak", `${0.35 + Math.random() * 0.5}`);
    // A warm/cool mix so the field shimmers rather than reading as one tint.
    ember.style.setProperty("--ember", Math.random() < 0.62 ? "#f4c98a" : "#9fd2f0");
    field.append(ember);
  }
  return field;
}

export function mountSceneBackdrop(container) {
  if (!container) return;
  // This is a turn-based game with no render loop, so the only continuous GPU
  // cost is CSS animation. On phones the animated blur/blend backdrop layers and
  // the ember field are the dominant cause of jank — responsive.css strips the
  // heavy layers on a coarse pointer, and we skip the ember field at the source
  // so we never even create 28 perpetually-animating nodes there.
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const layers = [
    layer("bk-sky"),
    layer("bk-stars"),
    layer("bk-aurora"),
    buildSkyline(),
    layer("bk-clouds"),
    layer("bk-rays"),
    layer("bk-fog")
  ];
  if (!coarse) layers.push(buildEmbers(28));
  container.replaceChildren(...layers);
}
