import { consumeJustPressed } from './input.js';

// Route-memory tags. A player stamps a limited number of decals on the tiles they have stood on so a dark
// corridor can be recognised on the way back. Online, tags are relayed so the rival sees them too. This is
// deliberately not a map reveal: a tag shows nothing the suit light does not already reach, and the ledger is
// capped so the maze cannot be papered over.
export const MARKER_LIMIT = 8;
export const MARKER_KINDS = Object.freeze(['arrow', 'cross']);
export const MARKER_KEYS = Object.freeze({ KeyE: 'arrow', KeyQ: 'cross' });

const MARKER_DIRS = Object.freeze(['up', 'right', 'down', 'left']);

// `placed` is the local ledger; `remote` mirrors the rival's tags as relayed. Both share the cap and rules.
export function createMarkerState() {
  return { placed: [], remote: [], nextId: 1 };
}

function stamp(ledger, marker) {
  const sameTile = ledger.findIndex(m => m.x === marker.x && m.y === marker.y);
  let recycled = false;
  if (sameTile >= 0) ledger.splice(sameTile, 1);
  else if (ledger.length >= MARKER_LIMIT) { ledger.shift(); recycled = true; }
  ledger.push(marker);
  return recycled;
}

// yaw 0 faces -y (grid up); -π/2 faces +x (grid right). Matches getSpawnYaw and getFirstPersonIntent.
export function yawToCardinal(yaw) {
  const turn = Math.round(-yaw / (Math.PI / 2));
  return ['up', 'right', 'down', 'left'][((turn % 4) + 4) % 4];
}

export function placeMarker(state, kind) {
  if (!MARKER_KINDS.includes(kind)) return null;
  const markers = state.markers ?? (state.markers = createMarkerState());
  const { player } = state;
  const marker = { id: markers.nextId++, kind, x: player.tx, y: player.ty, dir: yawToCardinal(player.yaw) };
  const recycled = stamp(markers.placed, marker);
  // The rival sees your graffiti too — including any you left to mislead them.
  if (state.online?.enabled) state.online.outbox.push({ type: 'marker_placed', ...marker });
  const label = kind === 'arrow' ? 'Arrow tag' : 'Cross tag';
  state.message = recycled
    ? `${label} placed — oldest tag recycled (${markers.placed.length}/${MARKER_LIMIT}).`
    : `${label} placed (${markers.placed.length}/${MARKER_LIMIT}).`;
  return marker;
}

// A relayed rival tag. Validated like a pose packet: integer tile inside the map, known glyph and facing.
// It lands in the rival ledger only and is never re-relayed.
export function applyRemoteMarker(state, value) {
  if (!value || !MARKER_KINDS.includes(value.kind) || !MARKER_DIRS.includes(value.dir)) return false;
  if (!Number.isInteger(value.id) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) return false;
  if (value.x < 0 || value.y < 0 || value.x >= state.map.width || value.y >= state.map.height) return false;
  const markers = state.markers ?? (state.markers = createMarkerState());
  stamp(markers.remote, { id: value.id, kind: value.kind, x: value.x, y: value.y, dir: value.dir });
  return true;
}

// Runs on the simulation tick so a short tap is honoured exactly once. The pickup/door ledgers are untouched.
export function updateMarkerInput(state) {
  if (state.player.won) return false;
  let placed = false;
  for (const [code, kind] of Object.entries(MARKER_KEYS)) {
    if (consumeJustPressed(state.input, code) && placeMarker(state, kind)) placed = true;
  }
  return placed;
}
