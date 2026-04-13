import {
  ARCADE_GAME_SLUGS,
  GRID_PAGE_SIZE,
  loadArcadeCatalog,
  normalizeGameEntry,
  paginateArcadeGames,
  sortArcadeGames,
} from "./arcade-catalog.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();

    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  PASS  ${name}`);
          passed++;
        })
        .catch((error) => {
          console.log(`  FAIL  ${name}: ${error.message}`);
          failed++;
        });
    }

    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }

  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

console.log("\narcade-catalog");

await test("manifest starts with Lovers Lost", () => {
  assertEq(ARCADE_GAME_SLUGS[0], "lovers-lost");
});

await test("normalizeGameEntry derives title and href defaults", () => {
  const entry = normalizeGameEntry("signal-blast", {});

  assertEq(entry.title, "Signal Blast");
  assertEq(entry.href, "games/signal-blast/index.html");
  assertEq(entry.players, "1-2");
  assertEq(entry.status, "Prototype");
});

await test("normalizeGameEntry preserves configured metadata", () => {
  const entry = normalizeGameEntry("lovers-lost", {
    title: "Lovers Lost",
    tagline: "Reunite before the clock runs out.",
    players: "1-2 co-op",
    status: "Playable prototype",
    order: 5,
    card_classes: ["featured"],
  });

  assertEq(entry.title, "Lovers Lost");
  assertEq(entry.tagline, "Reunite before the clock runs out.");
  assertEq(entry.players, "1-2 co-op");
  assertEq(entry.status, "Playable prototype");
  assertEq(entry.order, 5);
  assertEq(entry.cardClasses.length, 1);
  assertEq(entry.cardClasses[0], "featured");
});

await test("sortArcadeGames orders by order then title", () => {
  const sorted = sortArcadeGames([
    normalizeGameEntry("zeta-run", { title: "Zeta Run", order: 20 }),
    normalizeGameEntry("alpha-dash", { title: "Alpha Dash", order: 10 }),
    normalizeGameEntry("beta-dash", { title: "Beta Dash", order: 10 }),
  ]);

  assertEq(sorted[0].title, "Alpha Dash");
  assertEq(sorted[1].title, "Beta Dash");
  assertEq(sorted[2].title, "Zeta Run");
});

await test("paginateArcadeGames keeps order and chunks by page size", () => {
  const games = Array.from({ length: GRID_PAGE_SIZE + 2 }, (_, index) =>
    normalizeGameEntry(`game-${index + 1}`, { title: `Game ${index + 1}`, order: index + 1 })
  );
  const pages = paginateArcadeGames(games, GRID_PAGE_SIZE);

  assertEq(pages.length, 2);
  assertEq(pages[0].length, GRID_PAGE_SIZE);
  assertEq(pages[1].length, 2);
  assertEq(pages[1][0].slug, `game-${GRID_PAGE_SIZE + 1}`);
});

await test("loadArcadeCatalog fetches configured game metadata", async () => {
  const requests = [];
  const fetcher = async (path) => {
    requests.push(path);
    return {
      ok: true,
      async json() {
        return {
          title: "Lovers Lost",
          tagline: "A split-screen reunion runner.",
          order: 1,
        };
      },
    };
  };

  const catalog = await loadArcadeCatalog(fetcher, ["lovers-lost"]);

  assertEq(requests[0], "games/lovers-lost/game.json");
  assertEq(catalog.length, 1);
  assertEq(catalog[0].title, "Lovers Lost");
  assertEq(catalog[0].tagline, "A split-screen reunion runner.");
});

await test("loadArcadeCatalog falls back to defaults when metadata is missing", async () => {
  const fetcher = async () => {
    throw new Error("missing");
  };

  const catalog = await loadArcadeCatalog(fetcher, ["ghost-prototype"]);

  assertEq(catalog[0].title, "Ghost Prototype");
  assertEq(catalog[0].status, "Prototype");
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
