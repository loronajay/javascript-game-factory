import { allModels } from "../scripts/assets/car-atlas.js";
import { CIRCUIT_FRAME_HEADINGS, circuitModelById } from "../scripts/circuit/assets.js";
import { circuitLiveryAtlas, circuitFrameGeometry, createCircuitLiveryCache } from "../scripts/circuit/livery-atlas.js";
import { circuitDrawBox } from "../scripts/circuit/sprite-geometry.js";

// The overview and its downloadable sheet use the same bake as the race.
export function createRosterPreview(container, selectModel) {
  const cache = createCircuitLiveryCache();
  const rows = allModels().map((model) => {
    const section = document.createElement("article");
    section.className = "roster-card";
    const heading = document.createElement("button");
    heading.textContent = model.label;
    heading.addEventListener("click", () => selectModel(model.id));
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = 228;
    const preview = document.createElement("img");
    preview.alt = `${model.label}: eight circuit headings with preview stripes`;
    section.append(heading, preview);
    container.append(section);
    const circuit = circuitModelById(model.id);
    heading.disabled = !circuit;
    return { model, circuit, canvas, preview, image: null, error: null };
  });
  let currentLivery = null;

  function draw(livery = currentLivery) {
    currentLivery = livery;
    for (const row of rows) {
      const context = row.canvas.getContext("2d");
      context.fillStyle = "#0c1319";
      context.fillRect(0, 0, 1536, 228);
      context.imageSmoothingEnabled = false;
      context.font = "14px system-ui";
      context.fillStyle = "#b6c5d6";
      if (!row.image || !livery) {
        context.fillText(row.error ?? (row.circuit ? "Loading…" : "Directional artwork unavailable"), 24, 110);
        row.preview.src = row.canvas.toDataURL();
        continue;
      }
      const atlas = circuitLiveryAtlas(cache, { image: row.image, modelId: row.model.id, livery });
      CIRCUIT_FRAME_HEADINGS.forEach((heading, frame) => {
        const box = circuitDrawBox(frame * 192 + 96, 96, 64,
          circuitFrameGeometry(cache, row.model.id, frame), 2.25);
        context.drawImage(atlas, frame * 64, 0, 64, 64, box.x, box.y, box.width, box.height);
        context.fillText(heading, frame * 192 + 20, 215);
      });
      row.preview.src = row.canvas.toDataURL();
    }
  }

  const ready = Promise.all(rows.filter((row) => row.circuit).map(async (row) => {
    try {
      const image = new Image();
      image.src = `../${row.circuit.src}`;
      await image.decode();
      row.image = image;
    } catch {
      row.error = "Atlas failed to load";
    }
  })).then(() => draw());

  async function download() {
    await ready;
    const sheet = document.createElement("canvas");
    sheet.width = 1536;
    sheet.height = 80 + rows.length * 274;
    const context = sheet.getContext("2d");
    context.fillStyle = "#080b10";
    context.fillRect(0, 0, sheet.width, sheet.height);
    context.fillStyle = "#ffffff";
    context.font = "bold 28px system-ui";
    context.fillText("Speed Demon · Full roster stripe inspection", 24, 42);
    rows.forEach((row, index) => {
      const y = 80 + index * 274;
      context.font = "bold 21px system-ui";
      context.fillText(row.model.label, 24, y + 28);
      context.drawImage(row.canvas, 0, y + 40);
    });
    const link = document.createElement("a");
    link.download = "circuit-roster-stripes.png";
    link.href = sheet.toDataURL("image/png");
    link.click();
  }
  return { draw, download, ready };
}
