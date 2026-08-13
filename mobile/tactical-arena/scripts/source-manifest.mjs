// What goes into the Capacitor payload, and a content fingerprint of it.
//
// Owned here rather than in build-www.mjs because two callers need the SAME answer to "which
// files are copied": the builder, which copies them, and the release preflight, which asks
// whether the payload still matches them. Importing build-www.mjs to reuse its filter would
// run a whole build as a side effect, and a second copy of the exclude list would drift.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(HERE, "..");
// mobile/tactical-arena -> mobile -> javascript-games
export const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
export const WWW = path.join(APP_ROOT, "www");
export const GAME_SRC = path.join(REPO_ROOT, "games", "tactical-arena");
export const PLATFORM_SRC = path.join(REPO_ROOT, "js", "platform");

// The fingerprint file, written into the payload by build-www.
export const SOURCE_MANIFEST = ".build-sources.json";

// Excluded from the shipped payload. `promo-material` alone is 33MB of store art
// that the game never loads at runtime.
export const GAME_EXCLUDES = new Set([
  "assets/promo-material",
  // 12.9MB of source art (UUID-named `*_removalai_preview.png` exports). An audit of
  // every src/styles/html reference found zero uses — the title mark is a pure CSS
  // gradient, not an image. Kept in the repo as source, never shipped.
  "assets/logos",
  // Balance-simulation output: raw per-match records plus the fitted analysis, read only
  // by scripts/ and the docs tests, never by anything in src/ or a page. It was worth
  // 9.2MB of a 58MB bundle — and because `sim-*.json` is gitignored, whether the shipped
  // artifact carried it depended on whether whoever cut the release happened to have run
  // `npm run sim` on that machine. Exclude it so the payload can't vary that way.
  "balance-data",
  "tests",
  "scripts",
  "platform-api",
  "node_modules",
  ".mobile-shots",
  "sandbox.html",
  "vfx-gallery.html",
  "package.json",
  "package-lock.json",
  "skills-lock.json",
  "game.json",
]);

export function makeFilter(root, excludes) {
  return (source) => {
    const rel = path.relative(root, source).split(path.sep).join("/");
    if (!rel) return true;
    // Markdown is documentation, never loaded at runtime.
    if (rel.endsWith(".md")) return false;
    // A PNG that has a WebP sibling is the authoring master, not the runtime asset —
    // the repo's convention (see the badge pipeline) is PNG source, WebP runtime, and
    // an audit found zero .png references outside badgeManifest.generated.js. Badges
    // whose WebP has not been generated yet keep their PNG, so in-progress art still
    // ships rather than turning into a broken image.
    if (rel.endsWith(".png") && existsSync(source.replace(/\.png$/i, ".webp"))) return false;
    // TypeScript sources; the browser loads the emitted .mjs siblings.
    if (rel.endsWith(".mts") || rel.endsWith(".ts")) return false;
    if (rel.includes(".test.")) return false;
    for (const excluded of excludes) {
      if (rel === excluded || rel.startsWith(`${excluded}/`)) return false;
    }
    return true;
  };
}

// Text files are hashed with line endings normalized to LF.
//
// This repo has `core.autocrlf=true`, so a checkout, pull or branch switch rewrites text files
// to CRLF and back without changing a thing that matters. Hashing raw bytes made the payload
// look stale after any of those — the same cry-wolf failure the mtime gate had, arriving by a
// different road. Binary assets are hashed as-is.
const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".json", ".css", ".html", ".htm", ".svg", ".txt", ".xml",
]);

function hashFile(rel, bytes) {
  const isText = TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase());
  const content = isText
    ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : bytes;
  return createHash("sha1").update(content).digest("hex").slice(0, 16);
}

async function hashTree(root, filter, prefix, files) {
  async function visit(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (!filter(full)) continue;
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        const rel = `${prefix}/${path.relative(root, full).split(path.sep).join("/")}`;
        files[rel] = hashFile(rel, await readFile(full));
      }
    }
  }
  await visit(root);
}

/**
 * Content fingerprint of every source file the payload is built from.
 *
 * Deliberately hashes the SOURCES on both sides rather than diffing the payload: build-www
 * rewrites audio references, un-gates touch CSS and inlines fonts, so a payload file
 * legitimately differs from the source it came from. And mtimes are useless here because
 * `npm test` regenerates the skin/badge manifests on every run without changing a byte.
 */
export async function hashSources() {
  const files = {};
  await hashTree(GAME_SRC, makeFilter(GAME_SRC, GAME_EXCLUDES), "game", files);
  await hashTree(PLATFORM_SRC, makeFilter(PLATFORM_SRC, new Set()), "platform", files);
  return { builtAt: new Date().toISOString(), files };
}
