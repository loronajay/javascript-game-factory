// Transcodes the payload's audio to AAC/.m4a and repoints the two audio catalogs.
//
// The shipped music is already 80 kbps MP3, so there is no easy win from re-encoding
// MP3 to MP3. AAC is roughly 30-40% more efficient, so 56 kbps AAC is about quality
// parity with the current 80 kbps MP3 while being ~28% smaller. The sound effects are
// uncompressed PCM WAV, which is where the proportionally largest saving is.
//
// AAC/.m4a rather than Opus/.ogg deliberately: Opus compresses better, but AAC is
// universally supported across Android, iOS, and every browser, and iOS is on the
// roadmap. Not worth trading that away for a couple of megabytes.
//
// Changing the container means changing the file extension, and every audio filename
// in this game lives in exactly two files (src/audio/sounds.js and
// src/audio/soundCatalog.js). Those are rewritten in the PAYLOAD only — the web app's
// sources are untouched. The rewrite is verified by resolving every referenced
// filename back to a real file on disk, so a missed replacement fails the build
// instead of shipping a silent game.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const CACHE_DIR = path.join(APP_ROOT, ".asset-cache");

const MUSIC_BITRATE = "56k";
// Sound effects are sub-second stings where crispness matters and the totals are
// tiny either way, so they get a generous bitrate.
const SFX_BITRATE = "128k";

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  "C:/Users/leoja/tools/ffmpeg-8.1.2-essentials_build/bin/ffmpeg.exe",
  "ffmpeg",
];

export function findFfmpeg() {
  for (const candidate of FFMPEG_CANDIDATES) {
    if (!candidate) continue;
    if (candidate === "ffmpeg" || existsSync(candidate)) return candidate;
  }
  return null;
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
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// The two modules that name audio files. Both build URLs from bare filenames.
const CATALOG_FILES = [
  "games/tactical-arena/src/audio/sounds.js",
  "games/tactical-arena/src/audio/soundCatalog.js",
];

async function repointCatalogs(wwwDir) {
  let replaced = 0;
  for (const rel of CATALOG_FILES) {
    const file = path.join(wwwDir, rel);
    if (!existsSync(file)) throw new Error(`audio catalog missing from payload: ${rel}`);
    const before = await readFile(file, "utf8");
    const after = before.replace(/\.(mp3|wav)"/g, '.m4a"');
    const hits = (before.match(/\.(mp3|wav)"/g) || []).length;
    replaced += hits;
    if (hits) await writeFile(file, after, "utf8");
  }
  if (replaced === 0) {
    throw new Error("audio catalogs contained no .mp3/.wav references — the rewrite pattern is stale");
  }
  return replaced;
}

// Proves the rewrite is coherent: every filename the catalogs now name must exist.
async function verifyCatalogs(wwwDir) {
  const soundsDir = path.join(wwwDir, "games/tactical-arena/sounds");
  const present = new Set((await walk(soundsDir)).map((f) => path.relative(soundsDir, f).split(path.sep).join("/")));
  const missing = [];

  for (const rel of CATALOG_FILES) {
    const text = await readFile(path.join(wwwDir, rel), "utf8");
    // Filenames appear as bare string literals passed to new URL(...).
    for (const match of text.matchAll(/"([A-Za-z0-9_\-/]+\.m4a)"/g)) {
      const name = match[1];
      const hit = [...present].some((p) => p === name || p.endsWith(`/${name}`));
      if (!hit) missing.push(`${path.basename(rel)} -> ${name}`);
    }
  }
  if (missing.length) {
    throw new Error(`audio rewrite left dangling references:\n  ${missing.join("\n  ")}`);
  }
  return present.size;
}

export async function optimizeAudio(wwwDir, { onProgress } = {}) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return { skipped: "ffmpeg not found", bytesBefore: 0, bytesAfter: 0 };

  await mkdir(CACHE_DIR, { recursive: true });
  const soundsDir = path.join(wwwDir, "games/tactical-arena/sounds");
  const files = (await walk(soundsDir)).filter((f) => /\.(mp3|wav)$/i.test(f));

  let bytesBefore = 0;
  let encoded = 0;
  let fromCache = 0;

  onProgress?.({ total: files.length });

  for (const file of files) {
    const info = await stat(file);
    bytesBefore += info.size;

    const isMusic = path.extname(file).toLowerCase() === ".mp3";
    const bitrate = isMusic ? MUSIC_BITRATE : SFX_BITRATE;
    const target = file.replace(/\.(mp3|wav)$/i, ".m4a");

    const key = createHash("sha1")
      .update(`${path.relative(soundsDir, file)}|${info.size}|${Math.round(info.mtimeMs)}|aac${bitrate}`)
      .digest("hex");
    const cachePath = path.join(CACHE_DIR, `${key}.m4a`);

    if (existsSync(cachePath)) {
      await copyFile(cachePath, target);
      fromCache += 1;
    } else {
      // -vn drops any embedded cover art, which would otherwise survive re-muxing.
      await run(ffmpeg, ["-y", "-v", "error", "-i", file, "-vn", "-c:a", "aac", "-b:a", bitrate, target]);
      await copyFile(target, cachePath);
      encoded += 1;
    }
    await rm(file, { force: true });
  }

  const replaced = await repointCatalogs(wwwDir);
  const soundFiles = await verifyCatalogs(wwwDir);

  let bytesAfter = 0;
  for (const file of await walk(soundsDir)) {
    bytesAfter += (await stat(file)).size;
  }

  return { count: files.length, encoded, fromCache, replaced, soundFiles, bytesBefore, bytesAfter };
}
