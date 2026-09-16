import test from 'node:test';
import assert from 'node:assert/strict';
import { getStageById, getStageSequence, listPacks } from '../js/stages/stage-registry.js';
import { courseNotes } from '../js/stages/course-helpers.js';
import { Runner } from '../js/runner.js';
import { ToolRegistry } from '../js/tools.js';
import { updateMovingHazards } from '../js/hazards.js';

// Pack 02 is the harbor pack and the one that introduces spike balls. These
// checks are about the pack as a whole; the per-leg physics lives in
// teamwork.test.mjs.

test('Pack 02 is registered as a ten-stage harbor pack', () => {
  const pack = listPacks().find((p) => p.id === 'pack_02');
  assert.ok(pack, 'pack_02 is registered');
  assert.equal(pack.biome, 'harbor');
  assert.equal(pack.stageCount, 10);
  assert.equal(pack.registeredStages, 10);
  assert.deepEqual(getStageSequence('pack_02'), Array.from({ length: 10 }, (_, i) => `pack_02_stage_${String(i + 1).padStart(2, '0')}`));
});

test('every Pack 02 course uses the new hazard and keeps its own identity', () => {
  const stages = getStageSequence('pack_02').map(getStageById);
  for (const stage of stages) {
    assert.ok(stage.movingHazards.length >= 1, `${stage.id} has no spike ball`);
    assert.equal(stage.packId, 'pack_02');
    assert.equal(stage.biome, 'harbor');
  }
  const archetypes = new Set(stages.map((s) => s.archetype));
  assert.equal(archetypes.size, stages.length, 'every course has its own archetype');
  const names = new Set(stages.map((s) => s.name));
  assert.equal(names.size, stages.length, 'every course has its own name');
  const rules = new Set(stages.map((s) => s.builderRules.ruleLabel));
  assert.ok(rules.size >= 4, 'the pack varies its build rules');
  // Every travel direction the hazard supports is used somewhere in the pack.
  const directions = new Set(stages.flatMap((s) => s.movingHazards).map((b) => (
    b.from.x === b.to.x ? 'vertical' : b.from.y === b.to.y ? 'horizontal' : 'diagonal'
  )));
  assert.deepEqual([...directions].sort(), ['diagonal', 'horizontal', 'vertical']);
});

const idle = {
  axisX: () => 0, upHeld: () => false, downHeld: () => false, jumpHeld: () => false,
  consumeJumpPressed: () => false, consumeReposition: () => false,
};

// The ballast well is a fixed rhythm once the Runner leaves the floor: three
// bounces up a column with two balls crossing it. The per-leg test proves each
// bounce alone; this proves that one launch time gets through all of them.
test('pack_02_stage_04: the ballast well has a launch window through both crossings', () => {
  const stage = getStageById('pack_02_stage_04');
  const notes = courseNotes.get(stage.id);
  const registry = new ToolRegistry(stage);
  const runner = new Runner(stage);
  const via = notes.builds.stage_04_1_well_top;
  for (const t of via.tools) assert.ok(registry.add(t.toolType, t.x, t.y, runner).valid, `${t.toolType} at ${t.x},${t.y}`);
  const top = stage.solids.find((s) => s.id === 'stage_04_1_well_top');
  const bottom = registry.springs().sort((a, b) => b.y - a.y)[0];

  const windows = [];
  for (let t0 = 0; t0 < 4; t0 += 0.1) {
    const r = new Runner(stage);
    r.x = bottom.x + 10;
    r.y = bottom.y - r.h - 60;
    r.grounded = false;
    let made = false;
    for (let tick = 0; tick < 360 && !r.dead; tick++) {
      updateMovingHazards(stage, t0 + tick / 60);
      // Hold still in the column; steer for the deck only once above its top.
      const steer = r.y + r.h < top.y - 20 && r.vy > -200 ? 1 : 0;
      r.update(1 / 60, { ...idle, axisX: () => steer }, registry);
      if (r.grounded && r.onGroundId === top.id) { made = true; break; }
    }
    if (made) windows.push(t0.toFixed(1));
  }
  assert.ok(windows.length >= 3, `Launch windows too narrow or missing: ${windows.join(', ') || 'none'}`);
  assert.ok(windows.length < 40, 'The crossings never threaten the elevator');
});
