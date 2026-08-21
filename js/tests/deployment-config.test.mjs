import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

const repoRoot = resolve(import.meta.dirname, "..", "..");

console.log("\ndeployment-config");

test("platform-config exposes the shared api override hook", () => {
  const configScript = readFileSync(resolve(repoRoot, "js", "platform-config.mts"), "utf8");
  assert(configScript.includes("__JGF_PLATFORM_API_URL__"), "expected browser override hook");
});

test("railway config defines the platform-api service deploy contract", () => {
  const railwayConfig = readFileSync(resolve(repoRoot, "railway.json"), "utf8");
  // The platform-api service root is selected via Railway's dashboard root-directory
  // setting (there is no root package.json, so npm start only resolves under platform-api).
  // railway.json owns the build/start/healthcheck contract for that service.
  assert(railwayConfig.includes('"buildCommand"'), "expected a Railway build command");
  assert(railwayConfig.includes('"startCommand"'), "expected a Railway start command");
  assert(railwayConfig.includes("npm start"), "expected the platform-api start command");
  assert(railwayConfig.includes("/health"), "expected Railway health check path");
});

test("railway only redeploys the api for backend changes and drains in-flight requests", () => {
  const railwayConfig = JSON.parse(readFileSync(resolve(repoRoot, "railway.json"), "utf8"));
  assert(
    railwayConfig.build.watchPatterns.includes("platform-api/**"),
    "expected backend-scoped Railway watch pattern",
  );
  assert(
    railwayConfig.build.watchPatterns.includes("railway.json"),
    "expected deploy-config changes to trigger Railway",
  );
  assert(Number(railwayConfig.deploy.drainingSeconds) > 0, "expected a graceful drain window");
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
