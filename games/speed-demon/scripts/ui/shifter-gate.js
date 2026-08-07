// Shifter plate geometry and knob motion — pure, no canvas.
//
// The sim's gate is pure topology (which node connects to which). This module is
// the only place that turns that topology into pixels, so the renderer stays a
// dumb consumer and the layout itself can be unit-tested.
//
// Input is discrete — one tap, one node — but the knob travels continuously
// between nodes so it reads as a physical object sliding in a milled gate rather
// than a cursor snapping between slots.

import { gearNodeId, neutralNodeId } from "../sim/gate.js";

/**
 * Positions every gate node inside `box`. The neutral rail is centred
 * vertically; gear rows sit one half-height either side of it.
 */
export function gateLayout(gate, box) {
  const padding = box.padding ?? 0;
  const innerWidth = Math.max(0, box.width - padding * 2);
  const innerHeight = Math.max(0, box.height - padding * 2);

  const columnSpacing = gate.columns > 1 ? innerWidth / (gate.columns - 1) : 0;
  const rowOffset = innerHeight / 2;
  const centreY = box.y + box.height / 2;
  const columnX = (col) => box.x + padding + col * columnSpacing;

  const nodes = {};
  for (const node of Object.values(gate.nodes)) {
    nodes[node.id] = { x: columnX(node.col), y: centreY + node.row * rowOffset };
  }

  return { nodes, columns: gate.columns, centreY, columnX, box };
}

/**
 * The channels milled into the plate: one vertical slot per gear column plus the
 * horizontal neutral rail joining them. This is what gets stroked to draw the
 * gate, and it is derived from the layout so the two can never disagree.
 */
export function gateSlots(gate, layout) {
  const slots = [];

  for (let col = 0; col < gate.columns; col += 1) {
    const inColumn = Object.values(gate.nodes).filter((node) => node.kind === "gear" && node.col === col);
    if (inColumn.length === 0) {
      continue;
    }
    const ys = inColumn.map((node) => layout.nodes[node.id].y);
    slots.push({
      kind: "gate",
      col,
      x1: layout.columnX(col),
      y1: Math.min(...ys),
      x2: layout.columnX(col),
      y2: Math.max(...ys),
    });
  }

  slots.push({
    kind: "rail",
    x1: layout.nodes[neutralNodeId(0)].x,
    y1: layout.centreY,
    x2: layout.nodes[neutralNodeId(gate.columns - 1)].x,
    y2: layout.centreY,
  });

  return slots;
}

export function createKnob(layout, nodeId) {
  const node = layout.nodes[nodeId];
  if (!node) {
    throw new Error(`No layout position for node "${nodeId}"`);
  }
  return { x: node.x, y: node.y, arrived: true };
}

/**
 * Moves the knob toward `target` at a constant speed. Clamping on arrival means
 * a long frame can never fling the knob through the gate, and redirecting
 * mid-travel simply works, because the knob only ever knows where it is now.
 */
export function stepKnob(knob, target, speed, dt) {
  const dx = target.x - knob.x;
  const dy = target.y - knob.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= 1e-6) {
    return { x: target.x, y: target.y, arrived: true };
  }

  const step = speed * dt;
  if (step >= distance) {
    return { x: target.x, y: target.y, arrived: true };
  }

  return { x: knob.x + (dx / distance) * step, y: knob.y + (dy / distance) * step, arrived: false };
}

/**
 * Where the knob wants to be for a given race state: the live attempt's node
 * while the gate is open, otherwise parked in the engaged gear.
 */
export function knobTargetFor(layout, race) {
  const nodeId = race.shift ? race.shift.node : gearNodeId(race.vehicle.gear);
  return layout.nodes[nodeId] ?? layout.nodes[gearNodeId(race.vehicle.gear)];
}
