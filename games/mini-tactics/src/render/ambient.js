import { createSvgElement } from "./svg.js";

// Ambient dust for the board stage: a sparse field of slow-drifting motes so the
// battlefield feels alive between turns instead of dead-static. Purely
// decorative — rendered once per board layout into a dedicated layer behind the
// tiles, and animated entirely in CSS (so reduced-motion's global rule stills
// them automatically). Re-rendered on board resize because mote positions are
// distributed across the live viewBox bounds.
const MOTE_COUNT = 16;

export function renderAmbient(layer, viewBox) {
  layer.replaceChildren();

  const { x, y, width, height } = viewBox;

  for (let i = 0; i < MOTE_COUNT; i += 1) {
    const mote = createSvgElement("circle", {
      class: "mote",
      cx: x + Math.random() * width,
      cy: y + Math.random() * height,
      r: 0.8 + Math.random() * 1.8,
    });

    // Spread each mote's drift cycle so the field shimmers asynchronously.
    mote.style.setProperty("--dur", `${7 + Math.random() * 7}s`);
    mote.style.setProperty("--delay", `${-Math.random() * 12}s`);
    mote.style.setProperty("--rise", `${-18 - Math.random() * 26}px`);

    layer.appendChild(mote);
  }
}
