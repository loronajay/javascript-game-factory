import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const port = Number(process.argv[2] || 4174);
const host = "127.0.0.1";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  let requestedPath = path.normalize(decodeURIComponent(url.pathname));

  if (requestedPath === "\\" || requestedPath === "/" || requestedPath === ".") {
    requestedPath = "index.html";
  }

  const relativePath = requestedPath.replace(/^[/\\]+/, "");
  const fullPath = path.join(root, relativePath);

  if (!fullPath.startsWith(root)) {
    return null;
  }

  return fullPath;
}

const server = http.createServer(async (request, response) => {
  const fullPath = resolveRequestPath(request.url);

  if (!fullPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      response.writeHead(302, { Location: "index.html" });
      response.end();
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(fullPath)] || "application/octet-stream"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(fullPath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`serving http://${host}:${port}/`);
});
