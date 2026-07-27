// Re-encodes the payload's images through optimize-assets.py, with a persistent
// cache so only changed art is re-encoded.
//
// The shipped art is authored near-lossless (a 600x600 sprite is ~280 KB). At q90 it
// is roughly a third of that with a visible RMS difference near 2/255 and alpha
// preserved exactly. This runs on the COPY in www/, so the web app's own bytes are
// never modified.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const CACHE_DIR = path.join(APP_ROOT, ".asset-cache");

const IMAGE_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg"]);

// WebP encoder search effort. Measured on this art: method 6 costs 13.5x the time
// of method 4 for ~3% smaller files. Part of the cache key, so changing it here
// correctly invalidates every cached encode.
const ENCODE_METHOD = 4;

// Character art keeps a touch more quality than flat backgrounds, which compress
// very well and are never inspected closely.
function qualityFor(relPath) {
  const p = relPath.split(path.sep).join("/");
  if (p.includes("/theme-bgs/") || p.includes("campaign-map")) return 92;
  return 90;
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function runPython(jobs) {
  return new Promise((resolve, reject) => {
    const script = path.join(HERE, "optimize-assets.py");
    const child = spawn("python", [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`optimize-assets.py exited ${code}: ${stderr.slice(0, 400)}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`bad JSON from optimize-assets.py: ${stdout.slice(0, 200)}`));
      }
    });
    child.stdin.end(JSON.stringify({ jobs }));
  });
}

export async function optimizeImages(wwwDir, { onProgress } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });

  const files = await walk(wwwDir);
  const jobs = [];
  const cached = [];
  let bytesBefore = 0;

  for (const file of files) {
    const info = await stat(file);
    bytesBefore += info.size;
    const rel = path.relative(wwwDir, file);
    const quality = qualityFor(rel);
    // Keyed on content identity + the quality we would encode at, so bumping the
    // quality invalidates the cache automatically.
    const key = createHash("sha1")
      .update(`${rel}|${info.size}|${Math.round(info.mtimeMs)}|q${quality}|m${ENCODE_METHOD}`)
      .digest("hex");
    const cachePath = path.join(CACHE_DIR, `${key}.bin`);

    try {
      await stat(cachePath);
      cached.push({ file, cachePath });
    } catch {
      jobs.push({ src: file, dst: file, quality, method: ENCODE_METHOD, cachePath });
    }
  }

  onProgress?.({ total: files.length, toEncode: jobs.length, fromCache: cached.length });

  for (const entry of cached) {
    await copyFile(entry.cachePath, entry.file);
  }

  let failed = [];
  if (jobs.length) {
    const result = await runPython(
      jobs.map(({ src, dst, quality, method }) => ({ src, dst, quality, method })),
    );
    failed = result.failed ?? [];
    const failedSrc = new Set(failed.map((f) => f.src));
    for (const job of jobs) {
      if (failedSrc.has(job.src)) continue;
      await copyFile(job.dst, job.cachePath);
    }
  }

  let bytesAfter = 0;
  for (const file of files) {
    bytesAfter += (await stat(file)).size;
  }

  return { count: files.length, encoded: jobs.length, fromCache: cached.length, bytesBefore, bytesAfter, failed };
}

// Allow running standalone against an existing payload for measurement.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || path.join(APP_ROOT, "www");
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
  const result = await optimizeImages(target, {
    onProgress: (p) => console.log(`  images: ${p.total} (${p.toEncode} to encode, ${p.fromCache} cached)`),
  });
  console.log(`  ${mb(result.bytesBefore)} -> ${mb(result.bytesAfter)}`);
  if (result.failed.length) console.log(`  ${result.failed.length} failed`);
}
