// Strips the `(pointer: coarse)` condition from the payload's stylesheets.
//
// The Android WebView reports `pointer: coarse` AND `any-pointer: coarse` as FALSE
// while maxTouchPoints is 5 and touch events fire (measured on a Pixel 3a). Every
// touch-only rule in the game is gated behind that media feature, so inside the
// packaged app the ENTIRE mobile responsive layer silently does nothing — 44px tap
// targets, the board's touch-action, the roster/shop/skin-picker phone layouts, the
// landscape HUD reflow.
//
// The app is always a touch device, so the condition is trivially true there and can
// simply be removed. Doing it here rather than in the shared stylesheets means:
//   - all five files are covered without rewriting ~1,700 lines of selectors,
//   - the web build keeps its media queries exactly as authored,
//   - the game keeps ONE way to express "touch only": `(pointer: coarse)`.
//
// Transformations (any other conditions in the query are preserved):
//   @media (pointer: coarse)                        -> @media all
//   @media (pointer: coarse) and (max-width: 740px) -> @media (max-width: 740px)
//   ... , (pointer: coarse) and (max-height: 540px) -> ... , (max-height: 540px)

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

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
    else if (entry.isFile() && full.endsWith(".css")) out.push(full);
  }
  return out;
}

// Rewrites one `@media <query>` prelude.
export function stripPointerCoarse(query) {
  const branches = query.split(",").map((branch) => {
    const conditions = branch
      .split(/\s+and\s+/i)
      .map((c) => c.trim())
      .filter((c) => c && !/^\(\s*pointer\s*:\s*coarse\s*\)$/i.test(c));
    // A branch that was ONLY `(pointer: coarse)` becomes unconditional.
    return conditions.length ? conditions.join(" and ") : "all";
  });
  // If any branch is unconditional the whole query is, so collapse it.
  return branches.includes("all") ? "all" : branches.join(", ");
}

export async function enableTouchCss(wwwDir) {
  const files = await walk(path.join(wwwDir, "games", "tactical-arena", "styles"));
  let changedFiles = 0;
  let rewritten = 0;

  for (const file of files) {
    const before = await readFile(file, "utf8");
    if (!/pointer:\s*coarse/i.test(before)) continue;

    const after = before.replace(/@media([^{]+)\{/g, (whole, query) => {
      if (!/pointer:\s*coarse/i.test(query)) return whole;
      rewritten += 1;
      return `@media ${stripPointerCoarse(query)} {`;
    });

    if (after !== before) {
      await writeFile(file, after, "utf8");
      changedFiles += 1;
    }
  }

  // Nothing may still be gated on a media feature the WebView refuses to report.
  const leftovers = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/@media([^{]+)\{/g)) {
      if (/pointer:\s*coarse/i.test(match[1])) leftovers.push(path.basename(file));
    }
  }
  if (leftovers.length) {
    throw new Error(`pointer:coarse survived in: ${[...new Set(leftovers)].join(", ")}`);
  }

  return { files: changedFiles, queries: rewritten };
}
