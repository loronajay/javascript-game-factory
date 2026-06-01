#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.argv[2] ?? 4173);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".jfif", "image/jpeg"],
  [".css", "text/css; charset=utf-8"],
]);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://localhost:${port}`);
  const pathname = requestUrl.pathname === "/" ? "/dev/card-browser.html" : requestUrl.pathname;

  if (pathname === "/api/reference-cards") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(listReferenceCards(), null, 2));
    return;
  }

  if (pathname === "/api/card-files") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(listCardFiles(), null, 2));
    return;
  }

  const decodedPath = decodeURIComponent(pathname);
  const filePath = path.resolve(root, `.${decodedPath}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Card workbench: http://127.0.0.1:${port}/dev/card-browser.html`);
});

function listReferenceCards() {
  const referenceRoot = path.join(root, "reference-cards");
  if (!fs.existsSync(referenceRoot)) return [];

  const files = [];
  visit(referenceRoot);
  return files
    .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"))
    .sort((a, b) => a.localeCompare(b));

  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        return;
      }

      if (entry.isFile() && [".jpg", ".jpeg", ".png", ".jfif"].includes(path.extname(entry.name).toLowerCase())) {
        files.push(entryPath);
      }
    });
  }
}

function listCardFiles() {
  const cardsRoot = path.join(root, "cards");
  if (!fs.existsSync(cardsRoot)) return [];

  const files = [];
  visit(cardsRoot);
  return files
    .map((filePath) => path.relative(root, filePath).replaceAll(path.sep, "/"))
    .sort((a, b) => a.localeCompare(b));

  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        return;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") {
        files.push(entryPath);
      }
    });
  }
}
