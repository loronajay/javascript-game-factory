import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

createServer((request, response) => {
  const requested = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = normalize(requested === '/' ? 'index.html' : requested.replace(/^\/+/, ''));
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Dodgeballs: http://127.0.0.1:${port}`));
