import { buildHudModel } from '../../src/hud.js';
import { result } from './helpers.mjs';

const defs = {
  scout: { name: 'Scout' },
  grunt: { name: 'Grunt' },
};

const selected = [
  { type: 'scout', hp: 22, maxHp: 35, state: 'moving' },
  { type: 'scout', hp: 35, maxHp: 35, state: 'idle' },
];

const units = {
  units: [...selected, { type: 'grunt', hp: 70, maxHp: 70, state: 'idle' }],
  selectedUnits: () => selected,
  getDef: (type) => defs[type],
  resourceStockpile: () => ({ weakSteel: 4 }),
};

const model = buildHudModel({
  units,
  input: { commandState: 'move issued', pendingCommandMode: null },
  fps: 60,
  tick: 120,
});

const noSelection = buildHudModel({
  units: { ...units, selectedUnits: () => [] },
  input: { commandState: 'idle', pendingCommandMode: 'attackMove' },
  fps: 59,
  tick: 121,
});

result(
  model.selection.title === '2 Scouts'
    && model.selection.health.current === 57
    && model.selection.health.max === 70
    && model.resources.weakSteel === 4
    && model.commands.attackMove.active === false
    && noSelection.selection.empty === true
    && noSelection.commands.attackMove.active === true,
  { model, noSelection },
);
