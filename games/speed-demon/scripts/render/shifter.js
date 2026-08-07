// Shifter rendering — a machined gate plate viewed from above, with a weighted
// knob riding in the milled channels.
//
// Deliberately not a prompt: there are no floating arrows and no button glyphs.
// The player reads the gate the way they would read a real transmission, and the
// knob is a physical object whose position is the state.
//
// All geometry comes from ui/shifter-gate.js, which is unit-tested; this file
// only paints.

import { gearNodeId } from "../sim/gate.js";

const PLATE_EDGE = "#3a424d";
const SLOT_DARK = "#05070a";
const ENGRAVE = "#aeb8c4";

export function drawShifter(ctx, gate, layout, slots, knob, race) {
  const box = layout.box;
  const shifting = race.shift !== null;

  ctx.save();

  // Console surround
  const surround = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.height);
  surround.addColorStop(0, "#2a313a");
  surround.addColorStop(1, "#12161c");
  ctx.fillStyle = surround;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, 14);
  ctx.fill();
  ctx.strokeStyle = shifting ? "#ffb020" : PLATE_EDGE;
  ctx.lineWidth = shifting ? 3 : 2;
  ctx.stroke();

  // Brushed-metal plate inset
  const plate = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
  plate.addColorStop(0, "#4c545f");
  plate.addColorStop(0.35, "#2c333c");
  plate.addColorStop(0.7, "#454d58");
  plate.addColorStop(1, "#232931");
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.roundRect(box.x + 10, box.y + 10, box.width - 20, box.height - 20, 10);
  ctx.fill();

  // Fine brushing
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(box.x + 10, box.y + 10, box.width - 20, box.height - 20, 10);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = box.x; x < box.x + box.width; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, box.y);
    ctx.lineTo(x + 18, box.y + box.height);
    ctx.stroke();
  }
  ctx.restore();

  // Milled channels: a wide dark trough with a darker core reads as depth.
  ctx.lineCap = "round";
  for (const pass of [
    { width: 30, colour: "rgba(0,0,0,0.55)" },
    { width: 22, colour: SLOT_DARK },
  ]) {
    ctx.strokeStyle = pass.colour;
    ctx.lineWidth = pass.width;
    for (const slot of slots) {
      ctx.beginPath();
      ctx.moveTo(slot.x1, slot.y1);
      ctx.lineTo(slot.x2, slot.y2);
      ctx.stroke();
    }
  }

  // Channel lip highlight
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 24;
  ctx.globalCompositeOperation = "overlay";
  for (const slot of slots) {
    ctx.beginPath();
    ctx.moveTo(slot.x1, slot.y1 - 1);
    ctx.lineTo(slot.x2, slot.y2 - 1);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  // Engraved gear numerals, set just outside each slot end
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 19px "Segoe UI", system-ui, sans-serif';
  for (const gear of gate.gears) {
    const node = gate.nodes[gearNodeId(gear)];
    const point = layout.nodes[node.id];
    const labelY = point.y + (node.row < 0 ? -26 : 26);
    const isTarget = shifting && race.shift.toGear === gear;

    if (isTarget) {
      ctx.fillStyle = "rgba(255, 176, 32, 0.18)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 17, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(String(gear), point.x + 1, labelY + 1);
    ctx.fillStyle = isTarget ? "#ffb020" : ENGRAVE;
    ctx.fillText(String(gear), point.x, labelY);
  }

  drawKnob(ctx, knob, shifting);

  ctx.restore();
}

/** A weighted shift knob seen from above: chrome collar, domed cap, specular. */
function drawKnob(ctx, knob, shifting) {
  const r = 19;

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(knob.x + 2, knob.y + 4, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Chrome collar
  const collar = ctx.createLinearGradient(knob.x - r, knob.y - r, knob.x + r, knob.y + r);
  collar.addColorStop(0, "#d8dee6");
  collar.addColorStop(0.5, "#6f7883");
  collar.addColorStop(1, "#c3cbd4");
  ctx.fillStyle = collar;
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Dome
  const dome = ctx.createRadialGradient(knob.x - r * 0.35, knob.y - r * 0.45, r * 0.1, knob.x, knob.y, r * 0.86);
  dome.addColorStop(0, shifting ? "#5a6472" : "#454e5a");
  dome.addColorStop(0.6, "#20262e");
  dome.addColorStop(1, "#0d1116");
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, r * 0.86, 0, Math.PI * 2);
  ctx.fill();

  // Specular
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(knob.x - r * 0.3, knob.y - r * 0.38, r * 0.26, r * 0.17, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
