import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const defaultRoot = path.dirname(fileURLToPath(import.meta.url));

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function requestPath(url, root) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relativePath = pathname.replace(/^[/\\]+/, '') || 'index.html';
  const resolvedRoot = path.resolve(root);
  let resolvedPath = path.resolve(resolvedRoot, relativePath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }

  try {
    if (statSync(resolvedPath).isDirectory()) resolvedPath = path.join(resolvedPath, 'index.html');
  } catch {
    // The request handler returns 404 when the stream cannot open this path.
  }

  return resolvedPath;
}

export function startServer({ port = 4173, host = '127.0.0.1', root = defaultRoot } = {}) {
  const server = http.createServer((request, response) => {
    let filePath;
    try {
      filePath = requestPath(request.url || '/', root);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    if (!filePath) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const stream = createReadStream(filePath);
    stream.once('open', () => {
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      if (request.method === 'HEAD') { stream.destroy(); response.end(); }
      else stream.pipe(response);
    });
    stream.once('error', () => {
      if (!response.headersSent) response.writeHead(404).end('Not found');
      else response.destroy();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

function openBrowser(url) {
  const commands = {
    darwin: ['open', [url]],
    win32: ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]],
  };
  const [command, args] = commands[process.platform] || ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

async function run() {
  const shouldOpen = process.argv.includes('--open');
  let server;

  for (let port = 4173; port <= 4183; port += 1) {
    try {
      server = await startServer({ port });
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || port === 4183) throw error;
    }
  }

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  console.log(`Hotel Hide-n-Seek is ready at ${url}`);
  console.log('Keep this window open while you play. Press Ctrl+C to stop.');
  if (shouldOpen) openBrowser(url);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`Could not start the game: ${error.message}`);
    process.exitCode = 1;
  });
}
