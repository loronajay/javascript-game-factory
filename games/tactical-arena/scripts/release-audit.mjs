import { readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIB = 1024;
const MIB = KIB * KIB;

export const DEFAULT_BUDGETS = Object.freeze({
  musicTrackBytes: 3 * MIB,
  campaignMapBytes: 2 * MIB,
  themeBackgroundBytes: 1.5 * MIB,
  unitPortraitBytes: 500 * KIB,
  unitSkinBytes: 450 * KIB,
  jsModuleBytes: 50 * KIB,
  cssFileBytes: 35 * KIB,
  totalAssetBytes: 120 * MIB,
});

const SCAN_DIRS = Object.freeze(["assets", "sounds", "src", "styles", "html"]);

export async function buildReleaseAudit({
  root = ROOT,
  topCount = 12,
  budgets = DEFAULT_BUDGETS,
} = {}) {
  const files = [];
  for (const directory of SCAN_DIRS) {
    await collectFiles(join(root, directory), root, files);
  }

  files.sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));

  const buckets = createBuckets();
  for (const file of files) {
    const bucket = classifyFile(file.path);
    buckets[bucket].count += 1;
    buckets[bucket].bytes += file.bytes;
  }

  const assetBytes = buckets.music.bytes + buckets.themeBackgrounds.bytes + buckets.campaign.bytes + buckets.unitArt.bytes + buckets.otherAssets.bytes;
  const warnings = buildWarnings(files, budgets, assetBytes);

  return {
    root,
    scannedAt: new Date().toISOString(),
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    assetBytes,
    fileCount: files.length,
    buckets,
    topFiles: files.slice(0, topCount),
    warnings,
  };
}

export function formatBytes(bytes) {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KiB`;
  return `${(bytes / MIB).toFixed(1)} MiB`;
}

export function renderAudit(audit, { warningLimit = 40 } = {}) {
  const lines = [
    "Release audit",
    `Scanned ${audit.fileCount} files (${formatBytes(audit.totalBytes)} tracked runtime weight).`,
    `Assets total: ${formatBytes(audit.assetBytes)}.`,
    "",
    "Buckets:",
  ];

  for (const [key, bucket] of Object.entries(audit.buckets)) {
    lines.push(`  ${key.padEnd(16)} ${String(bucket.count).padStart(4)} files  ${formatBytes(bucket.bytes).padStart(9)}`);
  }

  lines.push("", "Top files:");
  for (const file of audit.topFiles) {
    lines.push(`  ${formatBytes(file.bytes).padStart(9)}  ${file.path}`);
  }

  const visibleWarnings = audit.warnings.slice(0, warningLimit);
  lines.push("", `Warnings: ${audit.warnings.length}`);
  for (const warning of visibleWarnings) {
    lines.push(`  [${warning.kind}] ${formatBytes(warning.bytes)} > ${formatBytes(warning.budget)}  ${warning.path}`);
    lines.push(`      ${warning.suggestion}`);
  }
  if (audit.warnings.length > visibleWarnings.length) {
    lines.push(`  ... ${audit.warnings.length - visibleWarnings.length} more warnings. Use --all-warnings to print the full list.`);
  }

  return lines.join("\n");
}

async function collectFiles(directory, root, files) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, root, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(fullPath);
    files.push({
      path: relative(root, fullPath).replace(/\\/g, "/"),
      bytes: info.size,
    });
  }
}

function createBuckets() {
  return {
    music: { count: 0, bytes: 0 },
    themeBackgrounds: { count: 0, bytes: 0 },
    campaign: { count: 0, bytes: 0 },
    unitArt: { count: 0, bytes: 0 },
    otherAssets: { count: 0, bytes: 0 },
    source: { count: 0, bytes: 0 },
    markup: { count: 0, bytes: 0 },
  };
}

function classifyFile(path) {
  if (path.startsWith("sounds/") && path.endsWith(".mp3")) return "music";
  if (path.startsWith("assets/theme-bgs/")) return "themeBackgrounds";
  if (path === "assets/campaign-map.png") return "campaign";
  if (path.startsWith("assets/units/")) return "unitArt";
  if (path.startsWith("assets/") || path.startsWith("sounds/")) return "otherAssets";
  if (path.startsWith("html/")) return "markup";
  return "source";
}

function buildWarnings(files, budgets, assetBytes) {
  const warnings = [];

  if (assetBytes > budgets.totalAssetBytes) {
    warnings.push({
      kind: "asset-total",
      path: "assets+sounds",
      bytes: assetBytes,
      budget: budgets.totalAssetBytes,
      suggestion: "Trim package size before release; prioritize music transcodes, theme backgrounds, and high-cardinality skin PNGs.",
    });
  }

  for (const file of files) {
    const warning = warningForFile(file, budgets);
    if (warning) warnings.push(warning);
  }

  return warnings;
}

function warningForFile(file, budgets) {
  const extension = extname(file.path);
  if (file.path.startsWith("sounds/") && extension === ".mp3" && file.bytes > budgets.musicTrackBytes) {
    return {
      kind: "music-track",
      ...file,
      budget: budgets.musicTrackBytes,
      suggestion: "Export a shorter loop or lower-bitrate package track; keep masters outside the shipped game.",
    };
  }
  if (file.path === "assets/campaign-map.png" && file.bytes > budgets.campaignMapBytes) {
    return {
      kind: "campaign-map",
      ...file,
      budget: budgets.campaignMapBytes,
      suggestion: "Create a compressed runtime copy or resize to the maximum displayed map resolution.",
    };
  }
  if (file.path.startsWith("assets/theme-bgs/") && extension === ".png" && file.bytes > budgets.themeBackgroundBytes) {
    return {
      kind: "theme-background",
      ...file,
      budget: budgets.themeBackgroundBytes,
      suggestion: "Compress or convert menu backgrounds to a package-friendly format while preserving the original source art separately.",
    };
  }
  if (file.path.startsWith("assets/units/skins/") && extension === ".png" && file.bytes > budgets.unitSkinBytes) {
    return {
      kind: "unit-skin",
      ...file,
      budget: budgets.unitSkinBytes,
      suggestion: "Batch-compress skin PNGs; these dominate total package weight because there are many of them.",
    };
  }
  if (/^assets\/units\/[^/]+\.png$/.test(file.path) && file.bytes > budgets.unitPortraitBytes) {
    return {
      kind: "unit-portrait",
      ...file,
      budget: budgets.unitPortraitBytes,
      suggestion: "Compress base portraits or ship smaller runtime copies for Codex/roster views.",
    };
  }
  if (file.path.startsWith("src/") && extension === ".js" && file.bytes > budgets.jsModuleBytes) {
    return {
      kind: "large-js-module",
      ...file,
      budget: budgets.jsModuleBytes,
      suggestion: "Consider extracting a cohesive controller or catalog chunk before adding more release polish here.",
    };
  }
  if (file.path.startsWith("styles/") && extension === ".css" && file.bytes > budgets.cssFileBytes) {
    return {
      kind: "large-css-file",
      ...file,
      budget: budgets.cssFileBytes,
      suggestion: "Split feature-local styles if this file grows during final polish.",
    };
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const strict = process.argv.includes("--strict");
  const allWarnings = process.argv.includes("--all-warnings");
  const audit = await buildReleaseAudit();
  console.log(renderAudit(audit, { warningLimit: allWarnings ? Number.POSITIVE_INFINITY : 40 }));
  if (strict && audit.warnings.length > 0) process.exitCode = 1;
}
