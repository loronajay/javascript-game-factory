// Paint servers for the board weather particles (boardAtmosphere.js).
//
// Every particle glow here is BAKED INTO THE FILL rather than applied as a CSS
// filter, and that is the whole performance story of the weather overlay. A
// `filter:drop-shadow()`/`filter:blur()` on an element makes the browser
// allocate an offscreen buffer, re-rasterize that element's filter region, and
// composite it back — and it has to redo that on every animation frame. With
// ~90 perpetually-animating particles on screen that was ~90 offscreen passes
// per frame, which is what made snow and rain tank the frame rate on phones and
// integrated GPUs.
//
// A gradient fill is just paint. A circle whose fill fades to transparent at its
// own edge looks the same as a small dot with a soft drop-shadow, but costs the
// rasterizer nothing extra and leaves the transform animation cheap. The
// GLOW_SPAN values say how much bigger the drawn shape is than the visible
// "core", since the outer part of the shape IS the glow falloff.
//
// The stop opacities are deliberately tuned so the board's overall brightness
// matches what the filtered version used to produce — see the wash note in
// styles/battle/board.css.

import { svgElement } from "./svgHelpers.js";

export const FLAKE_GLOW_SPAN = 3.1;
export const EMBER_GLOW_SPAN = 3;
export const DROP_GLOW_SPAN = 2.9;

function gradient(kind, id, attrs, stops) {
  const paint = svgElement(kind, { id, ...attrs });
  for (const [offset, color, opacity] of stops) {
    paint.append(svgElement("stop", { offset, "stop-color": color, "stop-opacity": opacity }));
  }
  return paint;
}

// Ids are suffixed per overlay so two overlays (or an overlay rebuilt while the
// old one is still fading) can never collide on a paint-server id.
export function createWeatherPaintServers(suffix) {
  const defs = svgElement("defs");
  defs.append(
    gradient("radialGradient", `wx-flake-${suffix}`, { cx: "50%", cy: "50%", r: "50%" }, [
      ["0%", "#ffffff", "1"],
      ["30%", "#f4fcff", ".8"],
      ["52%", "#d6f2ff", ".28"],
      ["100%", "#bfeaff", "0"]
    ]),
    gradient("radialGradient", `wx-gust-${suffix}`, { cx: "50%", cy: "50%", r: "50%" }, [
      ["0%", "#def2ff", ".28"],
      ["55%", "#def2ff", ".11"],
      ["100%", "#def2ff", "0"]
    ]),
    gradient("linearGradient", `wx-drop-${suffix}`, { x1: "0", y1: "0", x2: "1", y2: "0" }, [
      ["0%", "#78d2ff", "0"],
      ["33%", "#c8f1ff", ".62"],
      ["50%", "#ecfbff", ".82"],
      ["67%", "#c8f1ff", ".62"],
      ["100%", "#78d2ff", "0"]
    ]),
    gradient("linearGradient", `wx-drop-storm-${suffix}`, { x1: "0", y1: "0", x2: "1", y2: "0" }, [
      ["0%", "#5aa8ff", "0"],
      ["33%", "#9fd2ff", ".58"],
      ["50%", "#dcefff", ".76"],
      ["67%", "#9fd2ff", ".58"],
      ["100%", "#5aa8ff", "0"]
    ]),
    gradient("radialGradient", `wx-ember-${suffix}`, { cx: "50%", cy: "50%", r: "50%" }, [
      ["0%", "#fff0c4", "1"],
      ["28%", "#ffd487", ".9"],
      ["56%", "#ff9632", ".36"],
      ["100%", "#ff8c28", "0"]
    ]),
    // fy pulls the hot core down toward the ground, keeping the bottom-warm ramp
    // the old vertical linear gradient had while ALSO softening the column
    // horizontally — which is the job the blur() used to do.
    gradient("radialGradient", `wx-heat-${suffix}`, { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "80%" }, [
      ["0%", "#ffae4a", ".5"],
      ["42%", "#ffce78", ".27"],
      ["74%", "#ffebaf", ".1"],
      ["100%", "#ffebaf", "0"]
    ]),
    gradient("radialGradient", `wx-storm-cell-${suffix}`, { cx: "50%", cy: "50%", r: "50%" }, [
      ["0%", "#b9dcff", ".2"],
      ["58%", "#82aae6", ".1"],
      ["100%", "#6490ff", "0"]
    ])
  );
  return defs;
}
