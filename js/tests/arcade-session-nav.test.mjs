import {
  buildPrimaryAppNavMarkup,
  buildPrimaryAppNavItems,
  shouldInvalidateStoredSession,
} from "../arcade-session-nav.mjs";

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

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

console.log("\narcade-session-nav");

test("primary app nav items keep the signed-in shell destinations in one stable order", () => {
  const items = buildPrimaryAppNavItems("../");
  assertEq(items.length, 8);
  assertEq(items[0].label, "Home");
  assertEq(items[0].href, "../index.html");
  assertEq(items[1].label, "Me");
  assertEq(items[1].href, "../me/index.html");
  assertEq(items[2].label, "Arcade");
  assertEq(items[2].href, "../grid.html");
  assertEq(items[3].label, "Bulletins");
  assertEq(items[3].href, "../bulletins/index.html");
  assertEq(items[4].label, "Thoughts");
  assertEq(items[4].href, "../thoughts/index.html");
  assertEq(items[5].label, "Activity");
  assertEq(items[5].href, "../activity/index.html");
  assertEq(items[6].label, "Search");
  assertEq(items[6].href, "../search/index.html");
  assertEq(items[7].label, "Messages");
  assertEq(items[7].href, "../messages/index.html");
});

test("primary app nav markup marks the current page and includes a session mount slot", () => {
  const markup = buildPrimaryAppNavMarkup({
    basePath: "../../",
    currentPage: "messages",
    linkClass: "search-stage__portal",
    sessionNavId: "threadAuthNav",
  });

  assert(markup.includes('class="app-shell-nav"'), "expected shared shell wrapper");
  assert(markup.includes('class="app-shell-nav__tabs"'), "expected grouped tab wrapper");
  assert(markup.includes('href="../../index.html"'), "expected home link");
  assert(markup.includes('href="../../me/index.html"'), "expected me link");
  assert(markup.includes('href="../../grid.html"'), "expected arcade link");
  assert(markup.includes('href="../../search/index.html"'), "expected search link");
  assert(markup.includes('href="../../messages/index.html"'), "expected messages link");
  assert(!markup.includes('href="../../notifications/index.html"'), "expected notifications to stay out of the primary tab row");
  assert(markup.includes('aria-current="page"'), "expected current-page marker");
  assert(markup.includes('app-shell-nav__link--current'), "expected current-page styling hook");
  assert(markup.includes('id="threadAuthNav"'), "expected session-nav mount id");
  assert(markup.includes('app-shell-nav__session-slot'), "expected session slot wrapper");
});

test("only a definite authentication rejection invalidates a stored session", () => {
  assertEq(shouldInvalidateStoredSession({ ok: false, httpStatus: 401, error: "not_authenticated" }), true);
  assertEq(shouldInvalidateStoredSession({ ok: false, error: "not_authenticated" }), true);
  assertEq(shouldInvalidateStoredSession({ ok: false, httpStatus: 500, error: "internal_server_error" }), false);
  assertEq(shouldInvalidateStoredSession({ ok: false, httpStatus: 502 }), false);
  assertEq(shouldInvalidateStoredSession({ ok: false, httpStatus: 503 }), false);
  assertEq(shouldInvalidateStoredSession({ ok: false, httpStatus: 0, error: "network_error" }), false);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
