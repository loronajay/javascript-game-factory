// Installs the debug APK on the running device/emulator, launches it, and reports
// whether the game actually booted inside the WebView.
//
// A Capacitor app that fails to boot shows a white screen and exits 0 from every
// adb command, so "it installed" proves nothing. The real signals are:
//   - chromium console errors in logcat (a missing ES module import shows up here
//     and nowhere else)
//   - a screenshot, which is the only ground truth for what rendered
//
//   node scripts/verify-android.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const APK = path.join(APP_ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const SHOTS = path.join(APP_ROOT, ".device-shots");
const APP_ID = "com.jayarcade.tacticalarena";

const ADB = path.join(
  process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
  "platform-tools",
  "adb.exe",
);

const adb = (args, opts = {}) =>
  execFileSync(ADB, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!existsSync(APK)) {
    throw new Error(`No APK at ${APK}. Run: npm run apk`);
  }
  mkdirSync(SHOTS, { recursive: true });

  const devices = adb(["devices"]).split("\n").slice(1).filter((l) => l.includes("\tdevice"));
  if (!devices.length) throw new Error("No device/emulator attached.");
  console.log(`  device:   ${devices[0].split("\t")[0]}`);

  console.log("  installing...");
  adb(["install", "-r", "-g", APK]);

  // Clear logcat so we only read this launch, not a previous run's noise.
  adb(["logcat", "-c"]);

  console.log("  launching...");
  adb(["shell", "monkey", "-p", APP_ID, "-c", "android.intent.category.LAUNCHER", "1"]);

  // The game composes HTML fragments and boots ES modules; give it real time.
  await sleep(12000);

  const shot = path.join(SHOTS, "boot.png");
  const png = execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(shot, png);
  console.log(`  screenshot: ${shot}`);

  const log = adb(["logcat", "-d", "-v", "brief"]);
  const interesting = log
    .split("\n")
    .filter((line) => /chromium|Capacitor|AndroidRuntime|tacticalarena/i.test(line))
    .filter((line) => !/favicon/i.test(line));

  const errors = interesting.filter((line) =>
    /\bE\/|Error|Uncaught|Failed to load|net::ERR/i.test(line),
  );

  console.log(`\n  webview log lines: ${interesting.length}`);
  if (errors.length) {
    console.log(`\n  ${errors.length} error line(s):`);
    for (const line of errors.slice(0, 40)) console.log(`    ${line.trim()}`);
  } else {
    console.log("  no error lines matched.");
  }

  const running = adb(["shell", "pidof", APP_ID]).trim();
  console.log(`\n  process ${running ? `alive (pid ${running})` : "NOT RUNNING — it crashed"}`);
  if (!running) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
