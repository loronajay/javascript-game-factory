import test from "node:test";
import assert from "node:assert/strict";

import { PUCK_D_UP_AIR_HOCKEY } from "../arcade-room-cabinet.mjs";
import {
  PUCK_D_UP_PLAYFIELD,
  createPuckdUpAirHockeyTable,
} from "../arcade-room-puckd-up-model.mjs";

class Node {
  constructor(...args) {
    this.args = args;
    this.children = [];
    this.position = { set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { set: (x, y, z) => Object.assign(this.scale, { x, y, z }) };
    this.userData = {};
  }
  add(...children) { this.children.push(...children); }
}

class Shape {
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

const THREE = new Proxy({
  Group: Node,
  Mesh: Node,
  PointLight: Node,
  RectAreaLight: Node,
  Shape,
  DoubleSide: 2,
}, {
  get(target, key) {
    if (key in target) return target[key];
    return class extends Node {};
  },
});

function allNodes(root) {
  return [root, ...root.children.flatMap(allNodes)];
}

test("Puck'd Up model is a detailed physical air hockey table, not an upright cabinet", () => {
  const root = createPuckdUpAirHockeyTable(THREE, PUCK_D_UP_AIR_HOCKEY);
  const nodes = allNodes(root);
  const names = nodes.map((node) => node.name).filter(Boolean);

  assert.equal(root.userData.gameSlug, "puckd-up");
  assert.deepEqual(PUCK_D_UP_PLAYFIELD, { width: 1.08, length: 2.08, height: 0.805 });
  for (const required of [
    "playfield", "center-line", "center-circle", "goal-home", "goal-away",
    "mallet-home", "mallet-away", "puck", "scoreboard-home", "scoreboard-away",
    "coin-door", "neon-left", "neon-right",
  ]) assert.ok(names.includes(required), `missing ${required}`);
  assert.equal(names.filter((name) => name.startsWith("air-hole-")).length, 45);
  assert.equal(names.some((name) => /screen|monitor/i.test(name)), false);
  assert.ok(nodes.length >= 95, `expected a presentation-grade model, got ${nodes.length} nodes`);

  const scoreboards = nodes.filter((node) => node.name === "scoreboard-home" || node.name === "scoreboard-away");
  assert.equal(scoreboards.length, 2);
  for (const board of scoreboards) {
    assert.ok(Math.abs(board.position.x) >= 0.64, `${board.name} must live on a side rail`);
    assert.ok(Math.abs(board.position.z) <= 0.6, `${board.name} must not block a player's end approach`);
  }
});
