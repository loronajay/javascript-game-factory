// Minimal dependency-free static server for the mobile harness.
//
// IMPORTANT: this serves the REPO ROOT (javascript-games/), not the game folder.
// Tactical Arena imports the shared platform modules via ../../../../js/platform/**,
// so a server rooted at games/tactical-arena/ 404s on every ranked, friends, and
// account call and the game boots into a misleading half-broken state.
//
// Supports Range requests because Chrome asks for them on <audio> media and a
// naive 200-with-full-body server makes music playback flaky.

import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// scripts -> tactical-arena -> games -> javascript-games
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

const MIME = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
  }),
);

function contentType(filePath) {
  return MIME.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function resolveRequestPath(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const resolved = path.resolve(root, `.${path.posix.normalize(decoded)}`);
  // Path-traversal guard: everything must stay inside the served root.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

async function statFile(candidate) {
  try {
    const stats = await fs.stat(candidate);
    if (stats.isDirectory()) {
      const indexPath = path.join(candidate, "index.html");
      const indexStats = await fs.stat(indexPath);
      return indexStats.isFile() ? { filePath: indexPath, stats: indexStats } : null;
    }
    return stats.isFile() ? { filePath: candidate, stats } : null;
  } catch {
    return null;
  }
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  let start = rawStart === "" ? size - Number(rawEnd) : Number(rawStart);
  let end = rawStart === "" || rawEnd === "" ? size - 1 : Number(rawEnd);
  start = Math.max(0, Math.min(start, size - 1));
  end = Math.max(start, Math.min(end, size - 1));
  return { start, end };
}

export function startDevServer({ root = REPO_ROOT, port = 0, onRequestError } = {}) {
  const servedRoot = path.resolve(root);

  const server = createServer(async (req, res) => {
    const target = resolveRequestPath(servedRoot, req.url || "/");
    const found = target ? await statFile(target) : null;

    if (!found) {
      onRequestError?.(req.url || "");
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    const { filePath, stats } = found;
    const headers = {
      "content-type": contentType(filePath),
      "accept-ranges": "bytes",
      // No caching: the whole point of this harness is that an edit is one reload away.
      "cache-control": "no-store, must-revalidate",
    };

    const range = parseRange(req.headers.range, stats.size);
    if (range) {
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${range.start}-${range.end}/${stats.size}`,
        "content-length": range.end - range.start + 1,
      });
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, "content-length": stats.size });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const actualPort = server.address().port;
      resolve({
        server,
        port: actualPort,
        origin: `http://127.0.0.1:${actualPort}`,
        root: servedRoot,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
