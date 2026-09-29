const SIDE_LIST = ['boy', 'girl'];
const TICKET_GAME_SLUG = 'lovers-lost-campaign';
const TICKET_RESULT_PREFIX = 'llp';

function clonePlayer(side, start) {
  return {
    side,
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: 'right',
    finished: false,
  };
}

function createPuzzleState(stage, mode = 'solo', options = {}) {
  if (!stage) throw new Error('A puzzle stage is required');
  return {
    phase: 'playing',
    packId: stage.packId,
    stageId: stage.id,
    mode: ['local', 'online'].includes(mode) ? mode : 'solo',
    elapsedFrames: 0,
    resets: Math.max(0, Math.floor(Number(options.resets) || 0)),
    resultId: typeof options.resultId === 'string' ? options.resultId : '',
    players: {
      boy: clonePlayer('boy', stage.starts.boy),
      girl: clonePlayer('girl', stage.starts.girl),
    },
    switches: Object.fromEntries(stage.switches.map(item => [item.id, false])),
    remoteSeq: { boy: -1, girl: -1 },
  };
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerBox(player, dimensions) {
  return { x: player.x, y: player.y, w: dimensions.width, h: dimensions.height };
}

function activeGateIds(stage, state) {
  return stage.gates.filter(gate => !state.switches[gate.switchId]).map(gate => gate.id);
}

function solidsFor(stage, state, side) {
  const closed = new Set(activeGateIds(stage, state));
  return [
    ...stage.solids[side],
    ...stage.gates.filter(gate => gate.side === side && closed.has(gate.id)),
  ];
}

function moveHorizontal(player, solids, dimensions, amount) {
  if (!amount) return player;
  let x = Math.max(0, Math.min(480 - dimensions.width, player.x + amount));
  const next = { x, y: player.y, w: dimensions.width, h: dimensions.height };
  for (const solid of solids) {
    if (!intersects(next, solid)) continue;
    if (amount > 0) x = Math.min(x, solid.x - dimensions.width);
    else x = Math.max(x, solid.x + solid.w);
    next.x = x;
  }
  return { ...player, x, vx: amount };
}

function moveVertical(player, solids, dimensions, amount) {
  let y = player.y + amount;
  let vy = amount;
  let onGround = false;
  const next = { x: player.x, y, w: dimensions.width, h: dimensions.height };
  for (const solid of solids) {
    if (!intersects(next, solid)) continue;
    if (amount >= 0) {
      y = Math.min(y, solid.y - dimensions.height);
      vy = 0;
      onGround = true;
    } else {
      y = Math.max(y, solid.y + solid.h);
      vy = 0;
    }
    next.y = y;
  }
  return { ...player, y, vy, onGround };
}

function tickPlayer(stage, state, side, input = {}) {
  const source = state.players[side];
  if (source.finished) return source;
  const dimensions = stage.player;
  const solids = solidsFor(stage, state, side);
  const direction = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  let player = { ...source };
  if (input.jump && player.onGround) player = { ...player, vy: -dimensions.jumpSpeed, onGround: false };
  player = moveHorizontal(player, solids, dimensions, direction * dimensions.speed);
  const nextVy = Math.min(14, player.vy + dimensions.gravity);
  player = moveVertical({ ...player, vy: nextVy }, solids, dimensions, nextVy);
  if (direction !== 0) player.facing = direction > 0 ? 'right' : 'left';
  if (player.y > 560) return { ...clonePlayer(side, stage.starts[side]) };
  return player;
}

function switchStateFor(stage, players) {
  return Object.fromEntries(stage.switches.map(item => {
    const box = playerBox(players[item.side], stage.player);
    return [item.id, !players[item.side].finished && intersects(box, item)];
  }));
}

function finishPlayers(stage, players) {
  const next = { ...players };
  for (const side of SIDE_LIST) {
    if (next[side].finished || intersects(playerBox(next[side], stage.player), stage.exits[side])) {
      next[side] = { ...next[side], finished: true, vx: 0, vy: 0 };
    }
  }
  return next;
}

function tickPuzzleState(stage, state, input = {}, options = {}) {
  if (!stage || state.phase !== 'playing') return state;
  const activeSides = Array.isArray(options.activeSides) ? new Set(options.activeSides) : null;
  let players = {
    boy: activeSides && !activeSides.has('boy') ? state.players.boy : tickPlayer(stage, state, 'boy', input.boy),
    girl: activeSides && !activeSides.has('girl') ? state.players.girl : tickPlayer(stage, state, 'girl', input.girl),
  };
  players = finishPlayers(stage, players);
  const switches = switchStateFor(stage, players);
  const phase = SIDE_LIST.every(side => players[side].finished) ? 'complete' : 'playing';
  return { ...state, players, switches, phase, elapsedFrames: state.elapsedFrames + 1 };
}

function applyPuzzlePlayerSnapshot(state, side, snapshot) {
  if (!state || !['boy', 'girl'].includes(side) || !snapshot?.player) return state;
  const seq = Math.floor(Number(snapshot.seq));
  if (!Number.isSafeInteger(seq) || seq <= (state.remoteSeq?.[side] ?? -1)) return state;
  const source = snapshot.player;
  const current = state.players[side];
  const player = {
    ...current,
    x: Number.isFinite(source.x) ? source.x : current.x,
    y: Number.isFinite(source.y) ? source.y : current.y,
    vx: Number.isFinite(source.vx) ? source.vx : current.vx,
    vy: Number.isFinite(source.vy) ? source.vy : current.vy,
    onGround: !!source.onGround,
    facing: source.facing === 'left' ? 'left' : 'right',
    finished: !!source.finished,
  };
  return {
    ...state,
    players: { ...state.players, [side]: player },
    remoteSeq: { ...state.remoteSeq, [side]: seq },
  };
}

function resetPuzzleState(stage, state) {
  return createPuzzleState(stage, state.mode, {
    resultId: state.resultId,
    resets: state.resets + 1,
  });
}

function buildPuzzleTicketResult(stage, state) {
  if (!stage || state?.phase !== 'complete' || !state.resultId) return null;
  return {
    resultId: state.resultId,
    packId: stage.packId,
    stageId: stage.id,
    mode: state.mode === 'local' ? 'local' : 'solo',
    completed: true,
    resets: Math.max(0, Math.min(99, Math.floor(Number(state.resets) || 0))),
    durationMs: Math.max(0, Math.round((Number(state.elapsedFrames) || 0) * (1000 / 60))),
  };
}

export {
  TICKET_GAME_SLUG,
  TICKET_RESULT_PREFIX,
  createPuzzleState,
  tickPuzzleState,
  applyPuzzlePlayerSnapshot,
  resetPuzzleState,
  activeGateIds,
  buildPuzzleTicketResult,
};
