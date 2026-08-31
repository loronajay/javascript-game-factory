import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Serve the factory root so the cabinet's shared identity/mobile imports still resolve.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
export function createDevServer() {
  return http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(ROOT, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
      if (!filename.startsWith(ROOT) || pathname.includes('\\') || pathname.split('/').some(segment => segment.startsWith('.'))) {
        response.writeHead(403); response.end(); return;
      }
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8766;
  createDevServer().listen(port, '127.0.0.1', () => console.log(`Illuminauts: http://127.0.0.1:${port}/games/illuminauts/`));
}
