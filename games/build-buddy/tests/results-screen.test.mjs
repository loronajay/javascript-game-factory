import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../js/app-controller.js';

function node(tag) {
  return {
    tag,
    textContent: '',
    children: [],
    setAttribute() {},
    addEventListener() {},
    append(...children) { this.children.push(...children); },
  };
}

function allText(root) {
  return [root.textContent, ...root.children.flatMap(allText)].filter(Boolean);
}

function withDocument(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: node };
  try { run(); } finally { globalThis.document = previous; }
}

const players = [
  { id: 'player_a', displayName: 'Alex' },
  { id: 'player_b', displayName: 'Blake' },
];

const result = {
  stageId: 'pack_01_stage_01',
  stageIndex: 0,
  outcome: 'clear',
  runnerPlayerId: 'player_a',
  builderPlayerId: 'player_b',
  timeClearedMs: 72400,
  runnerDeaths: 3,
  toolUseCount: 4,
  checkpointUsedForRespawn: false,
  checkpointUnusedRewardMs: 10000,
  finalStageTimeMs: 62400,
};

test('stage results render the canonical recorded statistics', () => withDocument(() => {
  const app = Object.assign(Object.create(AppController.prototype), {
    state: { stageResult: result, session: { players } },
    shellRoot: node('root'),
  });
  app.renderStageResult();
  const text = allText(app.shellRoot);

  for (const expected of [
    'Runner Alex', 'Builder Blake', 'Time cleared 01:12:40', 'Deaths 3', 'Tools used 4',
    'Checkpoint used No -00:10:00', 'Final stage time 01:02:40',
  ]) assert.ok(text.includes(expected), `missing ${expected}`);
}));

test('run results render a statistics card for every recorded stage', () => withDocument(() => {
  const failed = {
    ...result,
    stageId: 'pack_01_stage_02',
    stageIndex: 1,
    outcome: 'fail',
    failReason: 'timer',
    runnerDeaths: 2,
    toolUseCount: 7,
    timeClearedMs: null,
    finalStageTimeMs: null,
  };
  const app = Object.assign(Object.create(AppController.prototype), {
    state: {
      session: { players },
      runSummary: { clearedStages: 1, totalStages: 2, completedStages: 2, failedStages: 1, results: [result, failed] },
    },
    shellRoot: node('root'),
  });
  app.renderRunResult();
  const text = allText(app.shellRoot);

  assert.ok(text.includes('Pack 01 / Stage 01'));
  assert.ok(text.includes('Pack 01 / Stage 02'));
  assert.ok(text.includes('Deaths 3'));
  assert.ok(text.includes('Deaths 2'));
  assert.ok(text.includes('Tools used 4'));
  assert.ok(text.includes('Tools used 7'));
  assert.ok(text.includes('Reason timer'));
}));
