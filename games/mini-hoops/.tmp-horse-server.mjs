import fs from 'node:fs';
import path from 'node:path';
const server = path.resolve('../../../factory-network-server');
const engine = path.join(server, 'games/mini-hoops/server/horse-match-engine.mjs');
const before = fs.readFileSync(engine, 'utf8');
const oldImport = 'import { normalizeSandboxPieces } from "../shared/scripts/sim/trick-shot.js";';
if (!before.includes(oldImport) || !before.includes('pieces: normalizeSandboxPieces(value.pieces)')) throw new Error('Unexpected engine source; review before editing.');
fs.writeFileSync(engine, before
  .replace(oldImport, 'import { normalizeHorsePieces } from "../shared/scripts/sim/horse.js";')
  .replace('pieces: normalizeSandboxPieces(value.pieces)', 'pieces: normalizeHorsePieces(value.pieces)'));
await import('./tools/mirror-server.mjs');
