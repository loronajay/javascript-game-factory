// Run telemetry — the normalized end-of-run record Lovers Lost hands to the
// platform achievement service.
//
// This is the cabinet's half of the achievement contract. The game owns the
// gameplay facts (what each lane did, in what mode, how long it took); the
// platform owns whether those facts earn anything and who gets to keep it.
// Nothing here decides an achievement. The shape below is what the server's
// Lovers Lost achievement catalog normalizes and validates
// (platform-api/src/services/lovers-lost-achievement-catalog.mts).
//
// `ownedLanes` names which lanes the submitting ACCOUNT played:
//   single  → the chosen solo side
//   local   → both (one account at one keyboard is both runners)
//   online  → the local side only — the partner's lane is theirs to claim
// The server evaluates lane achievements on owned lanes only, so a partner's
// perfect run can never land on the wrong account.
//
// Pure: no DOM, no storage, no network. The runId is minted by the caller once
// per run (see createRunId) so a retried submission carries the same id.

import { sanitizeLaneStats } from './lane-stats.js';
import { RUN_DISTANCE } from './player.js';

const GAME_SLUG = 'lovers-lost';
const RUN_MODES = ['single', 'local', 'online'];

function createRunId(seed, startedAtMs) {
  const stamp = Number.isFinite(Number(startedAtMs)) ? Math.floor(Number(startedAtMs)) : 0;
  const nonce = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
  return `ll-${stamp.toString(36)}-${(seed >>> 0).toString(36)}-${nonce}`;
}

function ownedLanesForMode(mode, soloSide, onlineSide) {
  if (mode === 'single') return soloSide === 'girl' ? ['girl'] : ['boy'];
  if (mode === 'online') return onlineSide === 'girl' ? ['girl'] : ['boy'];
  return ['boy', 'girl'];
}

function buildLaneResult(player, active) {
  const finished = active && (player.state === 'finished' || player.distance >= RUN_DISTANCE);
  return {
    active,
    finished,
    finishFrame: finished && Number.isFinite(Number(player.finishFrame)) ? Math.floor(Number(player.finishFrame)) : null,
    score: active ? Math.max(0, Math.round(Number(player.score) || 0)) : 0,
    obstaclesFaced: active ? Math.max(0, Math.floor(Number(player.obstaclesFaced) || 0)) : 0,
    ...(active ? sanitizeLaneStats(player.stats) : sanitizeLaneStats(null)),
  };
}

// gs: the game state after tickFrame produced a runSummary.
// options: { runId, soloSide, onlineSide }
function buildRunResult(gs, options = {}) {
  const mode = RUN_MODES.includes(gs?.mode) ? gs.mode : 'single';
  const soloSide = mode === 'single' ? (options.soloSide === 'girl' ? 'girl' : 'boy') : null;
  const ownedLanes = ownedLanesForMode(mode, soloSide, options.onlineSide);
  // A solo run pre-finishes the partner lane so the reunion state machine still
  // works; that lane never ran, so it is inactive and reports nothing.
  const boyActive  = mode !== 'single' || soloSide === 'boy';
  const girlActive = mode !== 'single' || soloSide === 'girl';
  const summary = gs.runSummary || {};
  const lanes = { boy: buildLaneResult(gs.boy, boyActive), girl: buildLaneResult(gs.girl, girlActive) };
  // Outcome from the lanes that actually ran. The cabinet's own summary calls
  // a solo run "partial" when only the pre-finished partner lane is done,
  // because the partner lane is finished by construction; the achievement
  // contract counts active lanes only, and the server derives it the same way.
  const active = Object.values(lanes).filter(lane => lane.active);
  const finishedCount = active.filter(lane => lane.finished).length;
  const outcome = finishedCount === active.length ? 'reunion' : finishedCount > 0 ? 'partial' : 'game_over';

  return {
    gameSlug: GAME_SLUG,
    runId: typeof options.runId === 'string' && options.runId ? options.runId : createRunId(gs.seed || 0, 0),
    mode,
    soloSide,
    ownedLanes,
    outcome,
    elapsedFrames: Math.max(0, Math.floor(Number(summary.elapsedFrames ?? gs.elapsed) || 0)),
    disconnected: !!summary.disconnectNote,
    lanes,
  };
}

export { GAME_SLUG, RUN_MODES, createRunId, ownedLanesForMode, buildLaneResult, buildRunResult };
